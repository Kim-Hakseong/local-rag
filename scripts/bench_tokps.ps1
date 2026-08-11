<#
.SYNOPSIS
  kdocrag M2 — chat(:8090) 생성 속도 실측 (tok/s 기준선)

.DESCRIPTION
  목적 : 고정 한국어 프롬프트로 N회 생성해 tok/s 평균을 낸다.
         다른 노트북(HP 15 등)과 비교할 기준선을 만드는 것이 목적이므로
         프롬프트·샘플링 파라미터를 고정한다.
  전제 : chat 서버가 127.0.0.1:8090 에서 이미 떠 있어야 한다 (serve_models.ps1).
         네트워크 아웃바운드 없음.
  측정 : llama-server 가 반환하는 timings(predicted_per_second)를 1순위로 쓰고,
         없으면 벽시계 시간 기반으로 계산한다. 어느 쪽을 썼는지 출력에 표기한다.

.PARAMETER Runs
  반복 횟수. 기본 3.

.PARAMETER MaxTokens
  1회당 생성 토큰 상한. 기본 256.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\bench_tokps.ps1
#>
[CmdletBinding()]
param(
  [int]$Runs = 3,
  [int]$MaxTokens = 256,
  [int]$Port = 8090
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [Text.Encoding]::UTF8

$RepoRoot = Split-Path -Parent $PSScriptRoot
$LogDir   = Join-Path $RepoRoot "logs"
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Force $LogDir | Out-Null }

# 고정 프롬프트 — 변경 시 기준선이 무효가 되므로 DECISIONS.md 에 사유를 남길 것.
$PROMPT = @"
당신은 한국어 문서 검색 도우미다. 아래 주제에 대해 한국어로 상세히 설명하라.
주제: 사내 문서를 로컬 환경에서만 처리하는 검색 시스템의 장점과 한계.
형식: 번호 매긴 항목 5개, 각 항목 두 문장.
"@

$results = @()

for ($i = 1; $i -le $Runs; $i++) {
  $body = @{
    messages    = @(@{ role = "user"; content = $PROMPT })
    temperature = 0
    seed        = 42
    max_tokens  = $MaxTokens
    stream      = $false
  } | ConvertTo-Json -Depth 5

  # 재시도: 2026-08-09 실측 중 동일 본문으로 1회 HTTP 400
  # ("Expected 'content' to be a string or an array")이 발생했으나 이후 6회 재현되지 않았다.
  # 원인 미확정. 오류를 삼키지 않기 위해 재시도 횟수와 에러 본문을 결과에 기록한다.
  $attempt = 0; $retries = 0; $lastErr = $null; $r = $null; $sw = $null
  while ($attempt -lt 3 -and $null -eq $r) {
    $attempt++
    try {
      $sw = [Diagnostics.Stopwatch]::StartNew()
      $r  = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/v1/chat/completions" -Method Post `
              -Body ([Text.Encoding]::UTF8.GetBytes($body)) `
              -ContentType "application/json; charset=utf-8" -TimeoutSec 600
      $sw.Stop()
    } catch {
      if ($sw) { $sw.Stop() }
      $retries++
      $lastErr = $_.Exception.Message
      Write-Host "[bench] run $i 시도 $attempt 실패: $lastErr" -ForegroundColor Yellow
      Start-Sleep -Seconds 2
    }
  }
  if ($null -eq $r) { throw "run $i : 3회 시도 모두 실패. 마지막 오류: $lastErr" }

  # 주의: PowerShell 변수는 대소문자를 구분하지 않는다. 여기서 $prompt 를 쓰면
  # 고정 프롬프트 $PROMPT 를 정수로 덮어써서 2회차부터 HTTP 400 이 난다 (실측 확인).
  $completion   = $r.usage.completion_tokens
  $promptTokens = $r.usage.prompt_tokens
  $wall         = $sw.Elapsed.TotalSeconds

  $src = "wallclock"
  $tps = if ($wall -gt 0) { $completion / $wall } else { 0 }
  if ($r.timings -and $r.timings.predicted_per_second) {
    $tps = [double]$r.timings.predicted_per_second
    $src = "server-timings"
  }
  $ppTps = $null
  if ($r.timings -and $r.timings.prompt_per_second) { $ppTps = [double]$r.timings.prompt_per_second }

  $results += [pscustomobject]@{
    Run           = $i
    PromptTokens  = $promptTokens
    GenTokens     = $completion
    WallSec       = [math]::Round($wall, 3)
    GenTokPerSec  = [math]::Round($tps, 2)
    PromptTokPerSec = if ($ppTps) { [math]::Round($ppTps, 2) } else { $null }
    Source        = $src
    FinishReason  = $r.choices[0].finish_reason
    Retries       = $retries
    LastError     = $lastErr
  }
  Write-Host ("[bench] run {0}/{1}: {2} tok / {3:N2}s = {4:N2} tok/s ({5})" -f $i, $Runs, $completion, $wall, $tps, $src)
}

Write-Host ""
$results | Format-Table -AutoSize

$avg = ($results | Measure-Object GenTokPerSec -Average).Average
$min = ($results | Measure-Object GenTokPerSec -Minimum).Minimum
$max = ($results | Measure-Object GenTokPerSec -Maximum).Maximum
Write-Host ("[bench] 생성 속도 평균 {0:N2} tok/s (min {1:N2} / max {2:N2}), {3}회" -f $avg, $min, $max, $Runs) -ForegroundColor Green

$outFile = Join-Path $LogDir ("bench-tokps-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".json")
@{
  runs        = $Runs
  maxTokens   = $MaxTokens
  port        = $Port
  avgTokPerSec = [math]::Round($avg, 2)
  minTokPerSec = [math]::Round($min, 2)
  maxTokPerSec = [math]::Round($max, 2)
  detail      = $results
} | ConvertTo-Json -Depth 5 | Out-File -FilePath $outFile -Encoding utf8
Write-Host "[bench] 기록: $outFile"
