<#
.SYNOPSIS
  kdocrag M2 — llama-server 종료 (8090 / 8091 만)

.DESCRIPTION
  목적 : 본 프로젝트가 띄운 chat(8090) / embed(8091) 인스턴스만 종료한다.
  전제 : 없음. 포트가 비어 있으면 아무것도 하지 않는다.

  절대 금지 (CLAUDE.md):
    - 전역 `taskkill /im llama-server.exe` — LocalDesk 등 타 인스턴스 오사살.
    - pid 파일 신뢰 — 실측 근거 있음: office-fork-llm\server.pid 가 1524 였으나
      실제 실행 PID 는 32344 였다 (stale). 반드시 포트 -> PID 조회로만 특정한다.
    - 8080 등 본 프로젝트 외 포트 조작.

  안전장치: 포트에서 찾은 PID 의 이미지 경로가 spec\paths.md 의 LLAMA_SERVER 와
  일치할 때만 종료한다. 불일치 시 경고만 남기고 건너뛴다.

.PARAMETER Force
  이미지 경로 검사에 실패해도 종료 (기본 off). 남용 금지.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\stop_models.ps1
#>
[CmdletBinding()]
param([switch]$Force)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$PathsMd  = Join-Path $RepoRoot "spec\paths.md"
$PORTS    = @(8090, 8091)

function Read-SpecPath([string]$Key) {
  $line = Select-String -Path $PathsMd -Pattern "^\s*$Key\s*=\s*(.+?)\s*$" | Select-Object -First 1
  if (-not $line) { return $null }
  $val = $line.Matches[0].Groups[1].Value.Trim()
  if ($val.StartsWith("<") -or $val.StartsWith("(")) { return $null }
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

$expectedExe = Read-SpecPath "LLAMA_SERVER"
if ($expectedExe) { Write-Host "[stop] 기대 이미지 경로: $expectedExe" }
else { Write-Host "[stop] LLAMA_SERVER 미기입 — 이미지 경로 검사를 건너뛴다" -ForegroundColor Yellow }

$stopped = 0
foreach ($port in $PORTS) {
  $procId = Get-PidByPort $port
  if ($procId -eq 0) { Write-Host "[stop] 포트 $port : 리스닝 없음 — 건너뜀"; continue }

  $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$procId" -ErrorAction SilentlyContinue
  if (-not $proc) { Write-Host "[stop] 포트 $port : PID $procId 프로세스 조회 실패 — 건너뜀" -ForegroundColor Yellow; continue }

  Write-Host "[stop] 포트 $port -> PID $procId ($($proc.Name))"
  Write-Host "       경로: $($proc.ExecutablePath)"

  if ($expectedExe -and ($proc.ExecutablePath -ne $expectedExe)) {
    if (-not $Force) {
      Write-Host "       !! 이미지 경로 불일치 — 종료하지 않는다 (-Force 로만 강제)" -ForegroundColor Red
      continue
    }
    Write-Host "       !! 경로 불일치이나 -Force 지정됨 — 종료 진행" -ForegroundColor Yellow
  }

  try {
    Stop-Process -Id $procId -Force -ErrorAction Stop
    Write-Host "       종료됨" -ForegroundColor Green
    $stopped++
  } catch {
    Write-Host "       종료 실패: $($_.Exception.Message)" -ForegroundColor Red
  }
}

Start-Sleep -Seconds 2
foreach ($port in $PORTS) {
  $procId = Get-PidByPort $port
  if ($procId -eq 0) { Write-Host "[stop] 확인: 포트 $port 해제됨" }
  else { Write-Host "[stop] 확인: 포트 $port 여전히 PID $procId 점유 중" -ForegroundColor Red }
}
Write-Host "[stop] 종료한 프로세스 수: $stopped"
