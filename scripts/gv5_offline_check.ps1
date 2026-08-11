<#
.SYNOPSIS
  kdocrag — 골든 벡터 GV-5 (콘텐츠 오프라인성) 측정

.DESCRIPTION
  기준 (GATE-2에서 재정의, DESIGN.md §7):
    합격 = **문서 내용과 질의 내용이 외부로 발신되지 않을 것.**
    앱 하우스키핑 트래픽(부팅 이벤트, 모델 맵 동기화 등)은 결격 사유가 아니며,
    목록화하고 차단 가능한 것은 차단한다.

  측정 방법:
    1. 변환 1회 + AnythingLLM 질의 1회를 수행하는 동안 커넥션 스냅샷을 반복 수집한다.
    2. llama-server(8090/8091) 프로세스의 **비 127.0.0.1 커넥션 부재**를 확인한다.
       추론·임베딩이 전부 로컬이므로 문서 내용이 나갈 경로는 여기서 끊긴다.
    3. AnythingLLM 프로세스의 외부 커넥션을 전부 목록화한다(원격 IP/포트 포함).
    4. AnythingLLM 백엔드 로그의 TELEMETRY 라인을 전수 수집해 이벤트명을 나열한다.

  전제: llama-server 8090/8091 및 AnythingLLM 이 구동 중이어야 한다.
        판정(합격/불합격)은 인간이 한다 — 이 스크립트는 사실만 수집한다.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\gv5_offline_check.ps1
#>
[CmdletBinding()]
param([int]$SampleSeconds = 45)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [Text.Encoding]::UTF8

$RepoRoot = Split-Path -Parent $PSScriptRoot
$OutDir   = Join-Path $RepoRoot "logs\gv5"
if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Force $OutDir | Out-Null }

function Get-TargetPids {
  $map = @{}
  foreach ($port in @(8090, 8091)) {
    $rows = netstat -ano | Select-String "LISTENING" | Select-String ":$port\s"
    foreach ($r in $rows) {
      $f = ($r.ToString() -split '\s+') | Where-Object { $_ -ne '' }
      if ($f[1] -match ":$port$") { $map["llama-$port"] = [int]$f[-1] }
    }
  }
  $i = 0
  foreach ($p in @(Get-Process -Name AnythingLLM -ErrorAction SilentlyContinue)) {
    $map["anythingllm-$i"] = $p.Id; $i++
  }
  return $map
}

function Get-Connections($pidMap) {
  $wanted = @{}
  foreach ($kv in $pidMap.GetEnumerator()) { $wanted[$kv.Value] = $kv.Key }
  $result = @()
  foreach ($line in (netstat -ano)) {
    $f = ($line -split '\s+') | Where-Object { $_ -ne '' }
    if ($f.Count -lt 4) { continue }
    if ($f[0] -notmatch '^TCP|^UDP') { continue }
    $procId = 0
    if (-not [int]::TryParse($f[-1], [ref]$procId)) { continue }
    if (-not $wanted.ContainsKey($procId)) { continue }
    $remote = $f[2]
    $state = if ($f.Count -ge 5) { $f[3] } else { "" }
    $result += [pscustomobject]@{
      Label = $wanted[$procId]; ProcessId = $procId
      Local = $f[1]; Remote = $remote; State = $state
    }
  }
  return $result
}

function Is-Local([string]$endpoint) {
  return ($endpoint -match '^127\.0\.0\.1:' -or $endpoint -match '^\[::1\]:' -or
          $endpoint -match '^0\.0\.0\.0:'   -or $endpoint -match '^\[::\]:')
}

$pidMap = Get-TargetPids
Write-Host "=== 관측 대상 프로세스 ==="
$pidMap.GetEnumerator() | Sort-Object Name | ForEach-Object { Write-Host ("  {0,-18} PID {1}" -f $_.Key, $_.Value) }
if (-not ($pidMap.Keys | Where-Object { $_ -like "llama-*" })) {
  throw "llama-server(8090/8091)가 떠 있지 않다. serve_models.ps1 로 기동할 것."
}

Write-Host ""
Write-Host "=== $SampleSeconds 초 동안 커넥션 샘플링 (3초 간격) ==="
Write-Host "    이 시간 동안 변환 1회 + 질의 1회를 수행할 것 (별도 실행)"

$all = @()
$sw = [Diagnostics.Stopwatch]::StartNew()
$samples = 0
while ($sw.Elapsed.TotalSeconds -lt $SampleSeconds) {
  $all += Get-Connections $pidMap
  $samples++
  Start-Sleep -Seconds 3
}
$sw.Stop()
Write-Host "    샘플 $samples 회 수집"

$external = $all | Where-Object { -not (Is-Local $_.Remote) -and $_.Remote -ne '*:*' }
$llamaExternal = $external | Where-Object { $_.Label -like "llama-*" }
$appExternal   = $external | Where-Object { $_.Label -like "anythingllm-*" }

Write-Host ""
Write-Host "=== 결과 1: llama-server 외부 커넥션 (문서·질의 내용 발신 경로) ==="
if ($llamaExternal.Count -eq 0) {
  Write-Host "  없음 — 추론/임베딩이 전부 로컬. 문서 내용 외부 발신 경로 없음." -ForegroundColor Green
} else {
  Write-Host "  !! $($llamaExternal.Count) 건 발견 — 불합격 후보" -ForegroundColor Red
  $llamaExternal | Sort-Object Remote -Unique | Format-Table -AutoSize
}

Write-Host ""
Write-Host "=== 결과 2: AnythingLLM 외부 커넥션 (하우스키핑 여부 인간 판정) ==="
if ($appExternal.Count -eq 0) {
  Write-Host "  없음"
} else {
  $appExternal | Sort-Object Remote -Unique | Select-Object Label, ProcessId, Remote, State | Format-Table -AutoSize
}

Write-Host ""
Write-Host "=== 결과 3: AnythingLLM 텔레메트리 로그 전수 ==="
$logFile = Join-Path $env:APPDATA "anythingllm-desktop\storage\logs\backend-$(Get-Date -Format 'yyyy-MM-dd').log"
$telemetry = @()
if (Test-Path $logFile) {
  $telemetry = Select-String -Path $logFile -Pattern "TELEMETRY" | ForEach-Object { $_.Line -replace '\\u001b\[\d+m','' }
  if ($telemetry.Count -eq 0) { Write-Host "  TELEMETRY 라인 없음" }
  else { $telemetry | ForEach-Object { Write-Host "  $_" } }
} else {
  Write-Host "  로그 파일 없음: $logFile"
}

$report = @{
  sampledSeconds       = $SampleSeconds
  sampleCount          = $samples
  watchedProcesses     = $pidMap
  llamaExternalCount   = $llamaExternal.Count
  llamaExternal        = @($llamaExternal | Sort-Object Remote -Unique)
  appExternalCount     = $appExternal.Count
  appExternal          = @($appExternal | Sort-Object Remote -Unique)
  telemetryLines       = @($telemetry)
  criterion            = "콘텐츠 오프라인성: 문서/질의 내용이 외부로 발신되지 않을 것 (DESIGN.md §7)"
  note                 = "판정은 인간이 한다. 이 스크립트는 사실만 수집한다."
}
$outFile = Join-Path $OutDir ("gv5-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".json")
$report | ConvertTo-Json -Depth 6 | Out-File $outFile -Encoding utf8
Write-Host ""
Write-Host "[GV-5] 기록: $outFile"
