<#
.SYNOPSIS
  kdocrag M4 — Windows 작업 스케줄러에 일일 변환 작업 등록

.DESCRIPTION
  목적 : convert_office.py 를 평일 12:30 에 자동 실행하도록 등록한다.
  전제 : spec\paths.md 에 PYTHON 절대경로가 기입돼 있어야 한다.

  설계 근거 (DESIGN.md §6 / CONTEXT.md):
    - 회사 노트북이므로 **야간 무인 실행을 가정하지 않는다.** 평일 12:30, 로그온 상태에서만.
    - venv 를 쓰지 않고 spec\paths.md 의 PYTHON 절대경로를 그대로 쓴다.
      `where`/`command -v` 류 동적 탐색 금지 (CLAUDE.md).
    - 작업 스케줄러 등록은 이 스크립트로만. **레지스트리 직접 수정 금지.**
    - 데이터 루트는 convert_office.py 의 DEFAULT_ROOT(= 저장소 루트)를 따른다.
      작업 디렉터리도 저장소 루트라 별도 --root 인자를 넘기지 않는다 (2026-08-09 경로 이전).

  로그 : convert_office.py 가 스스로 logs\convert-YYYYMMDD.log 에 기록한다.
         추가로 스케줄러 실행의 stdout/stderr 를 logs\task-convert-YYYYMMDD.log 에 남긴다
         (실패 목록이 stdout 으로 나오므로 스케줄러 로그에서 판독 가능해야 한다).

.PARAMETER Unregister
  등록된 작업을 제거한다.

.PARAMETER RunNow
  등록 후 즉시 1회 수동 트리거하고 결과를 보고한다.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\register_task.ps1
  powershell -ExecutionPolicy Bypass -File scripts\register_task.ps1 -RunNow
  powershell -ExecutionPolicy Bypass -File scripts\register_task.ps1 -Unregister
#>
[CmdletBinding()]
param(
  [switch]$Unregister,
  [switch]$RunNow
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [Text.Encoding]::UTF8

$TASK_NAME = "kdocrag-convert"
$RepoRoot  = Split-Path -Parent $PSScriptRoot
$PathsMd   = Join-Path $RepoRoot "spec\paths.md"
$Script    = Join-Path $RepoRoot "scripts\convert_office.py"
$LogDir    = Join-Path $RepoRoot "logs"

function Read-SpecPath([string]$Key) {
  $line = Select-String -Path $PathsMd -Pattern "^\s*$Key\s*=\s*(.+?)\s*$" | Select-Object -First 1
  if (-not $line) { throw "spec\paths.md 에 $Key 가 없다" }
  $val = $line.Matches[0].Groups[1].Value.Trim()
  if ($val.StartsWith("<") -or $val.StartsWith("(")) { throw "spec\paths.md 의 $Key 가 미기입 상태다: $val" }
  return $val
}

if ($Unregister) {
  $existing = Get-ScheduledTask -TaskName $TASK_NAME -ErrorAction SilentlyContinue
  if (-not $existing) { Write-Host "[task] '$TASK_NAME' 등록돼 있지 않다 — 할 일 없음"; exit 0 }
  Unregister-ScheduledTask -TaskName $TASK_NAME -Confirm:$false
  Write-Host "[task] '$TASK_NAME' 제거됨" -ForegroundColor Green
  exit 0
}

# ── 전제 확인 ────────────────────────────────────────────────────────────
$Python = Read-SpecPath "PYTHON"
if (-not (Test-Path $Python)) { throw "PYTHON 경로에 파일이 없다: $Python" }
if (-not (Test-Path $Script)) { throw "convert_office.py 가 없다: $Script" }
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Force $LogDir | Out-Null }

Write-Host "[task] PYTHON = $Python"
Write-Host "[task] SCRIPT = $Script"

# ── 액션 ─────────────────────────────────────────────────────────────────
# stdout(실패 목록)까지 스케줄러 로그로 남기기 위해 cmd 래퍼를 쓴다.
# 경로에 공백이 있어도 견디도록 각 경로를 따옴표로 감싼다.
$taskLog = Join-Path $LogDir "task-convert-%DATE:~0,4%%DATE:~5,2%%DATE:~8,2%.log"
$cmdLine = '/c ""{0}" "{1}" >> "{2}" 2>&1"' -f $Python, $Script, $taskLog

$action = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\cmd.exe" `
            -Argument $cmdLine -WorkingDirectory $RepoRoot

# ── 트리거: 평일 12:30 ───────────────────────────────────────────────────
$trigger = New-ScheduledTaskTrigger -Weekly `
             -DaysOfWeek Monday, Tuesday, Wednesday, Thursday, Friday `
             -At "12:30"

# ── 원칙: 로그온 상태에서만 실행 ─────────────────────────────────────────
# LogonType Interactive = 사용자가 로그온해 있을 때만 동작 (암호 저장 없음).
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" `
               -LogonType Interactive -RunLevel Limited

$settings = New-ScheduledTaskSettingsSet `
              -AllowStartIfOnBatteries `
              -DontStopIfGoingOnBatteries `
              -StartWhenAvailable `
              -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
              -MultipleInstances IgnoreNew

$existing = Get-ScheduledTask -TaskName $TASK_NAME -ErrorAction SilentlyContinue
if ($existing) {
  Write-Host "[task] 기존 '$TASK_NAME' 발견 — 갱신한다" -ForegroundColor Yellow
  Unregister-ScheduledTask -TaskName $TASK_NAME -Confirm:$false
}

Register-ScheduledTask -TaskName $TASK_NAME -Action $action -Trigger $trigger `
  -Principal $principal -Settings $settings `
  -Description "kdocrag: office-inbox 문서를 kordoc 으로 마크다운 변환 (평일 12:30, 로그온 시에만)" | Out-Null

Write-Host "[task] '$TASK_NAME' 등록 완료" -ForegroundColor Green

$t = Get-ScheduledTask -TaskName $TASK_NAME
Write-Host ""
Write-Host "=== 등록 내용 ==="
Write-Host "State        : $($t.State)"
Write-Host "Execute      : $($t.Actions[0].Execute)"
Write-Host "Arguments    : $($t.Actions[0].Arguments)"
Write-Host "WorkingDir   : $($t.Actions[0].WorkingDirectory)"
Write-Host "Trigger      : $($t.Triggers[0].StartBoundary) / $($t.Triggers[0].DaysOfWeek)"
Write-Host "LogonType    : $($t.Principal.LogonType)  UserId: $($t.Principal.UserId)"

if ($RunNow) {
  Write-Host ""
  Write-Host "[task] 수동 트리거 실행..."
  Start-ScheduledTask -TaskName $TASK_NAME
  $sw = [Diagnostics.Stopwatch]::StartNew()
  while ($sw.Elapsed.TotalSeconds -lt 300) {
    Start-Sleep -Seconds 3
    $info = Get-ScheduledTask -TaskName $TASK_NAME
    if ($info.State -ne "Running") { break }
  }
  $sw.Stop()
  $res = Get-ScheduledTaskInfo -TaskName $TASK_NAME
  Write-Host "[task] 완료 $([math]::Round($sw.Elapsed.TotalSeconds,1))s"
  Write-Host "       LastRunTime  : $($res.LastRunTime)"
  Write-Host "       LastTaskResult: $($res.LastTaskResult)  (0=전건성공 / 1=일부실패 / 2=전제불충족)"
}
