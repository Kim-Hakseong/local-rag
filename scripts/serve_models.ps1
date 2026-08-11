<#
.SYNOPSIS
  kdocrag M2 — llama-server 2인스턴스 기동 (chat :8090 / embed :8091)

.DESCRIPTION
  목적 : 로컬 RAG용 chat/embedding 서버를 띄우고 /v1/models 응답까지 확인한다.
  전제 : spec\paths.md 에 LLAMA_SERVER / QWEN_GGUF / BGE_M3_GGUF 절대경로가 기입되어 있어야 한다.
         네트워크 아웃바운드 없음. 두 인스턴스 모두 127.0.0.1 에만 바인딩한다(GV-5 오프라인성).
  주의 : LocalDesk 등 타 프로젝트 인스턴스는 건드리지 않는다. 본 스크립트는 8090/8091만 사용한다.
         이미 해당 포트가 점유돼 있으면 기동하지 않고 실패로 끝낸다.

.PARAMETER ChatOnly
  chat(8090)만 기동.

.PARAMETER EmbedOnly
  embed(8091)만 기동.

.PARAMETER NglChat
  chat 인스턴스의 -ngl 값. 기본 99 (DESIGN.md §4 기본안). OOM 폴백 시 28 / 0 순으로 조정.

.PARAMETER CtxChat
  chat 인스턴스의 -c 값. 기본 6144 (튜닝 실험 후 상향, VRAM 3,086 MiB). OOM 시 4096 → 3072.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\serve_models.ps1
  powershell -ExecutionPolicy Bypass -File scripts\serve_models.ps1 -NglChat 28 -CtxChat 3072
#>
[CmdletBinding()]
param(
  [switch]$ChatOnly,
  [switch]$EmbedOnly,
  # 미지정 시 spec\paths.md 의 NGL_CHAT / CTX_CHAT 을 쓴다 (setup.ps1 이 기록).
  # 명시하면 그 값이 우선한다 — 폴백 실험용.
  [int]$NglChat = -1,
  [int]$CtxChat = -1
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$PathsMd  = Join-Path $RepoRoot "spec\paths.md"
$LogDir   = Join-Path $RepoRoot "logs"
$Stamp    = Get-Date -Format "yyyyMMdd"

$CHAT_PORT  = 8090
$EMBED_PORT = 8091

if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Force $LogDir | Out-Null }

function Read-SpecPath([string]$Key, [string]$Default = $null) {
  if (-not (Test-Path $PathsMd)) {
    throw "spec\paths.md 가 없다. 먼저 setup.ps1 을 실행할 것."
  }
  $line = Select-String -Path $PathsMd -Pattern "^\s*$Key\s*=\s*(.+?)\s*$" | Select-Object -First 1
  if (-not $line) {
    if ($null -ne $Default) { return $Default }
    throw "spec\paths.md 에 $Key 가 없다"
  }
  $val = $line.Matches[0].Groups[1].Value.Trim()
  if ($val.StartsWith("<") -or $val.StartsWith("(")) {
    if ($null -ne $Default) { return $Default }
    throw "spec\paths.md 의 $Key 가 미기입 상태다: $val"
  }
  return $val
}

function Get-PidByPort([int]$Port) {
  $rows = netstat -ano | Select-String "LISTENING" | Select-String ":$Port\s"
  foreach ($r in $rows) {
    $f = ($r.ToString() -split '\s+') | Where-Object { $_ -ne '' }
    if ($f[1] -match ":$Port$") { return [int]$f[-1] }
  }
  return 0
}

function Wait-ForPort([int]$Port, [int]$TimeoutSec = 60) {
  $sw = [Diagnostics.Stopwatch]::StartNew()
  while ($sw.Elapsed.TotalSeconds -lt $TimeoutSec) {
    if ((Get-PidByPort $Port) -ne 0) { return $true }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

function Wait-ForHealth([int]$Port, [int]$TimeoutSec = 180) {
  $sw = [Diagnostics.Stopwatch]::StartNew()
  while ($sw.Elapsed.TotalSeconds -lt $TimeoutSec) {
    try {
      $h = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 5
      if ($h.status -eq "ok") { return $true }
    } catch {
      # 로딩 중에는 503/연결거부가 정상이다. 계속 폴링한다.
    }
    Start-Sleep -Milliseconds 1000
  }
  return $false
}

function Start-LlamaServer {
  param([string]$Name, [int]$Port, [string[]]$ServerArgs, [string]$Exe)

  $existing = Get-PidByPort $Port
  if ($existing -ne 0) {
    throw "포트 $Port 이 이미 PID $existing 에 점유돼 있다. 기동 중단 (타 프로세스 오사살 방지)."
  }

  $out = Join-Path $LogDir "$Name-$Stamp.out.log"
  $err = Join-Path $LogDir "$Name-$Stamp.err.log"
  Write-Host "[serve] $Name 기동: $Exe $($ServerArgs -join ' ')"
  $p = Start-Process -FilePath $Exe -ArgumentList $ServerArgs -PassThru -WindowStyle Hidden `
        -RedirectStandardOutput $out -RedirectStandardError $err
  Write-Host "[serve] $Name 프로세스 PID $($p.Id), 로그 $out"

  if (-not (Wait-ForPort $Port 60)) {
    Write-Host "[serve] $Name 포트 $Port 리스닝 실패 (60s). 에러 로그 마지막 20줄:" -ForegroundColor Red
    if (Test-Path $err) { Get-Content $err -Tail 20 | ForEach-Object { Write-Host "    $_" } }
    throw "$Name 기동 실패"
  }
  $realPid = Get-PidByPort $Port
  Write-Host "[serve] $Name LISTENING on $Port (PID $realPid)" -ForegroundColor Green

  # 포트는 모델 로딩 완료 전에 열린다 — /health 가 ok 가 될 때까지 기다려야
  # /v1/models 가 503 을 반환하는 레이스를 피한다 (2026-08-09 실측).
  if (-not (Wait-ForHealth $Port 180)) {
    Write-Host "[serve] $Name /health 가 180s 안에 ok 가 되지 않았다. 에러 로그 마지막 20줄:" -ForegroundColor Red
    if (Test-Path $err) { Get-Content $err -Tail 20 | ForEach-Object { Write-Host "    $_" } }
    throw "$Name 모델 로딩 실패"
  }
  Write-Host "[serve] $Name /health ok" -ForegroundColor Green
  return $realPid
}

function Test-Models([int]$Port, [string]$Name) {
  try {
    $r = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/v1/models" -TimeoutSec 30
    $ids = ($r.data | ForEach-Object { $_.id }) -join ", "
    Write-Host "[serve] $Name /v1/models -> $ids" -ForegroundColor Green
    return $ids
  } catch {
    Write-Host "[serve] $Name /v1/models 실패: $($_.Exception.Message)" -ForegroundColor Red
    return $null
  }
}

# ── 경로 로드 ────────────────────────────────────────────────────────────
$LLAMA_SERVER = Read-SpecPath "LLAMA_SERVER"
if (-not (Test-Path $LLAMA_SERVER)) { throw "LLAMA_SERVER 실행 파일 없음: $LLAMA_SERVER" }

# paths.md 값이 기본. 파라미터로 넘어온 값이 있으면 그쪽이 우선.
if ($NglChat -lt 0) { $NglChat = [int](Read-SpecPath "NGL_CHAT" "99") }
if ($CtxChat -lt 0) { $CtxChat = [int](Read-SpecPath "CTX_CHAT" "6144") }
Write-Host "[serve] paths.md 기준: NGL_CHAT=$NglChat CTX_CHAT=$CtxChat"

$doChat  = -not $EmbedOnly
$doEmbed = -not $ChatOnly

if ($doChat) {
  $QWEN = Read-SpecPath "QWEN_GGUF"
  if (-not (Test-Path $QWEN)) { throw "QWEN_GGUF 없음: $QWEN" }
}
if ($doEmbed) {
  $BGE = Read-SpecPath "BGE_M3_GGUF"
  if (-not (Test-Path $BGE)) { throw "BGE_M3_GGUF 없음: $BGE" }
}

# ── 기동 ─────────────────────────────────────────────────────────────────
$result = @{}

if ($doChat) {
  # DESIGN.md §4 기본안. b10298 에서 --flash-attn 은 [on|off|auto] 를 받으므로 명시적으로 on.
  # --alias: /v1/models 가 노출하는 id 를 짧게 고정한다. 이 값이 AnythingLLM 의
  # Chat Model 입력값이 되므로 변경하면 spec\paths.md 의 CHAT_MODEL_ID 도 함께 갱신할 것.
  $chatAlias = Read-SpecPath "CHAT_MODEL_ID" "qwen3-4b"
  $chatArgs = @(
    "-m", $QWEN,
    "--alias", $chatAlias,
    "--host", "127.0.0.1",
    "--port", "$CHAT_PORT",
    "-ngl", "$NglChat",
    "-c", "$CtxChat",
    "--flash-attn", "on",
    "--cache-type-k", "q8_0",
    "--cache-type-v", "q8_0"
  )
  $result.ChatPid = Start-LlamaServer -Name "chat" -Port $CHAT_PORT -ServerArgs $chatArgs -Exe $LLAMA_SERVER
  $result.ChatModelId = Test-Models -Port $CHAT_PORT -Name "chat"
}

if ($doEmbed) {
  # 임베딩은 CPU 고정(-ngl 0) — chat 과 VRAM 경합 방지 (DESIGN.md §4)
  $embedAlias = Read-SpecPath "EMBED_MODEL_ID" "bge-m3"
  $embedArgs = @(
    "-m", $BGE,
    "--alias", $embedAlias,
    "--host", "127.0.0.1",
    "--port", "$EMBED_PORT",
    "--embedding",
    "-ngl", "0",
    "-c", "2048",
    "--pooling", "cls"
  )
  $result.EmbedPid = Start-LlamaServer -Name "embed" -Port $EMBED_PORT -ServerArgs $embedArgs -Exe $LLAMA_SERVER
  $result.EmbedModelId = Test-Models -Port $EMBED_PORT -Name "embed"
}

Write-Host ""
Write-Host "[serve] 완료. 종료는 scripts\stop_models.ps1 (포트 기준 PID 조회)." -ForegroundColor Cyan
$result | Format-Table -AutoSize
