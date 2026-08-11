<#
.SYNOPSIS
  kdocrag 원클릭 환경 구축 — 클론 직후 한 번만 실행한다.

.DESCRIPTION
  하는 일 (순서대로):
    1) 전제 점검   — Node 18+, Python 3.10+, 디스크 여유 6GB+
    2) kordoc 설치 — npm install -g kordoc, 절대경로 확인
    3) GPU 감지    — nvidia-smi 성공 → CUDA 빌드 / 실패 → Vulkan 빌드
    4) 런타임 전개 — llama.cpp b10298 공식 릴리스 zip → runtime\
    5) 모델 다운로드 — models\ 에 Qwen3-4B(2.3GB) + bge-m3(605MB), sha256 대조
    6) spec\paths.md 생성
    7) 자가검증   — llama-server --version, 두 포트 기동 스모크, GV-1 라운드트립

  전부 통과하면 "SETUP COMPLETE" 를 출력한다. 실패하면 어느 단계인지 명시하고 멈춘다.

  네트워크: GitHub(릴리스) / Hugging Face(모델) / npm(kordoc) 에서만 내려받는다.
  설치가 끝나면 이 프로젝트는 외부 통신 없이 동작한다.

.PARAMETER SkipModels
  모델 다운로드를 건너뛴다 (이미 models\ 에 파일이 있고 해시가 맞을 때 자동 스킵되므로
  보통 필요 없다). 해시 검증은 그대로 수행한다.

.PARAMETER SkipVerify
  마지막 자가검증(7단계)을 건너뛴다. 디버깅용.

.PARAMETER Force
  runtime\ 이 이미 있어도 다시 내려받아 덮어쓴다.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File setup.ps1
#>
[CmdletBinding()]
param(
  [switch]$SkipModels,
  [switch]$SkipVerify,
  [switch]$Force
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [Text.Encoding]::UTF8

$REPO   = $PSScriptRoot
$RUNTIME = Join-Path $REPO "runtime"
$MODELS  = Join-Path $REPO "models"
$DL      = Join-Path $REPO "logs\dl"
$SPEC    = Join-Path $REPO "spec"

# ── 고정 상수 ────────────────────────────────────────────────────────────
# llama.cpp 는 공식 릴리스 b10298 로 고정한다. 이 프로젝트의 모든 검증(GV-1~GV-5,
# 평가 7/7)이 이 버전에서 이뤄졌다. 올리려면 재검증할 것.
$LLAMA_TAG = "b10298"
$LLAMA_BASE = "https://github.com/ggml-org/llama.cpp/releases/download/$LLAMA_TAG"

$ASSET_CUDA   = @{ name = "llama-$LLAMA_TAG-bin-win-cuda-12.4-x64.zip"; size = 250457449 }
$ASSET_CUDART = @{ name = "cudart-llama-bin-win-cuda-12.4-x64.zip";     size = 391443627 }
$ASSET_VULKAN = @{ name = "llama-$LLAMA_TAG-bin-win-vulkan-x64.zip";    size = 34108466  }

# 모델 — sha256 은 실측 확정값. 다운로드 후 반드시 대조한다.
#   Qwen: 공식 Qwen 계정은 GGUF 를 배포하지 않는다(HTTP 401). unsloth 배포본을 쓰며,
#         이 해시는 본 프로젝트가 M2~M6 내내 검증에 사용한 파일과 동일함을 확인했다.
$MODEL_QWEN = @{
  file   = "Qwen3-4B-Instruct-2507-Q4_K_M.gguf"
  url    = "https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF/resolve/main/Qwen3-4B-Instruct-2507-Q4_K_M.gguf"
  size   = 2497281120
  sha256 = "3605803b982cb64aead44f6c1b2ae36e3acdb41d8e46c8a94c6533bc4c67e597"
}
$MODEL_BGE = @{
  file   = "bge-m3-q8_0.gguf"
  url    = "https://huggingface.co/ggml-org/bge-m3-Q8_0-GGUF/resolve/main/bge-m3-q8_0.gguf"
  size   = 634553760
  sha256 = "aa473d51f451a22f0fcf39ba3330c14bed38a385712b1113440f69df4047a173"
}

$MIN_FREE_GB = 6

# ── 출력 도우미 ──────────────────────────────────────────────────────────
$script:StepNo = 0
function Step([string]$title) {
  $script:StepNo++
  Write-Host ""
  Write-Host ("=" * 64) -ForegroundColor Cyan
  Write-Host (" [{0}/7] {1}" -f $script:StepNo, $title) -ForegroundColor Cyan
  Write-Host ("=" * 64) -ForegroundColor Cyan
}
function Ok([string]$m)   { Write-Host "  [OK]   $m" -ForegroundColor Green }
function Info([string]$m) { Write-Host "  ...    $m" }
function Warn([string]$m) { Write-Host "  [!]    $m" -ForegroundColor Yellow }
function Die([string]$stage, [string]$m, [string[]]$hints) {
  Write-Host ""
  Write-Host ("=" * 64) -ForegroundColor Red
  Write-Host " SETUP FAILED — 단계 $stage" -ForegroundColor Red
  Write-Host ("=" * 64) -ForegroundColor Red
  Write-Host "  $m" -ForegroundColor Red
  if ($hints) { Write-Host ""; foreach ($h in $hints) { Write-Host "  → $h" -ForegroundColor Yellow } }
  Write-Host ""
  exit 1
}

function Get-Sha256([string]$path) { (Get-FileHash $path -Algorithm SHA256).Hash.ToLower() }

<#
  파일 하나를 내려받는다.
    - 이미 있고 크기·해시가 맞으면 건너뛴다.
    - 크기가 다르면 불완전 파일로 보고 지우고 다시 받는다 (curl --continue-at 로 이어받기 시도).
    - 받은 뒤 크기·해시를 대조하고 틀리면 실패로 끝낸다.
#>
function Get-Asset {
  param(
    [string]$Url, [string]$Dest, [long]$ExpectSize,
    [string]$ExpectSha = $null, [string]$Label
  )
  if (Test-Path $Dest) {
    $len = (Get-Item $Dest).Length
    if ($len -eq $ExpectSize) {
      if ($ExpectSha) {
        Info "$Label 이미 있음 — 해시 확인 중 (크기 $([math]::Round($len/1MB,1)) MB)"
        if ((Get-Sha256 $Dest) -eq $ExpectSha) { Ok "$Label 검증 통과 (다운로드 생략)"; return }
        Warn "$Label 해시 불일치 — 다시 받는다"
        Remove-Item $Dest -Force
      } else { Ok "$Label 이미 있음 (크기 일치, 다운로드 생략)"; return }
    } else {
      Warn "$Label 불완전 파일 감지 ($len / $ExpectSize B) — 이어받기 시도"
    }
  }

  $mb = [math]::Round($ExpectSize / 1MB, 1)
  Info "$Label 다운로드 시작 ($mb MB) — 진행률이 표시된다"
  # curl.exe: -C - 이어받기, -# 진행 막대, --fail HTTP 오류 시 실패
  & curl.exe -L --fail -C - -# -o $Dest $Url
  if ($LASTEXITCODE -ne 0) {
    # 이어받기가 안 되는 서버가 있다 (416 등) — 지우고 처음부터 한 번 더
    Warn "이어받기 실패 (curl exit=$LASTEXITCODE) — 처음부터 다시 받는다"
    if (Test-Path $Dest) { Remove-Item $Dest -Force }
    & curl.exe -L --fail -# -o $Dest $Url
    if ($LASTEXITCODE -ne 0) { Die "다운로드" "$Label 내려받기 실패 (curl exit=$LASTEXITCODE)" @("네트워크/프록시를 확인하세요", "URL: $Url") }
  }

  $len = (Get-Item $Dest).Length
  if ($len -ne $ExpectSize) { Die "다운로드" "$Label 크기 불일치: $len B (기대 $ExpectSize B)" @("파일이 잘렸을 수 있습니다. setup.ps1 을 다시 실행하세요.") }
  if ($ExpectSha) {
    Info "$Label sha256 대조 중..."
    $got = Get-Sha256 $Dest
    if ($got -ne $ExpectSha) {
      Die "무결성 검증" "$Label sha256 불일치`n     기대: $ExpectSha`n     실제: $got" @("파일이 손상됐거나 배포처가 바뀌었습니다.", "$Dest 를 지우고 다시 실행하세요.")
    }
  }
  Ok "$Label 완료 및 검증 통과"
}

Write-Host ""
Write-Host "  kdocrag setup — 한글문서 로컬 RAG 환경 구축" -ForegroundColor White
Write-Host "  저장소: $REPO"

# ═══ 1. 전제 점검 ════════════════════════════════════════════════════════
Step "전제 점검 (Node / Python / 디스크)"

$nodeV = $null
try { $nodeV = (& node --version 2>$null).Trim() } catch { }
if (-not $nodeV) {
  Die "1-전제점검" "Node.js 가 없습니다." @("https://nodejs.org 에서 LTS 를 설치하세요 (18 이상).", "설치 후 새 PowerShell 창에서 setup.ps1 을 다시 실행하세요.")
}
$nodeMajor = [int]($nodeV -replace '^v(\d+)\..*$', '$1')
if ($nodeMajor -lt 18) { Die "1-전제점검" "Node $nodeV — 18 이상이 필요합니다." @("https://nodejs.org 에서 LTS 로 업그레이드하세요.") }
Ok "Node $nodeV"

$pyExe = $null
foreach ($cand in @("python", "py")) {
  # cmd 로 감싼다 — 네이티브 exe 의 stderr 를 PowerShell 스트림으로 끌어오면
  # NativeCommandError 가 발생할 수 있다 (7-1 주석 참조).
  $v = (& cmd /c "$cand --version 2>&1") -join ""
  if ($v -match "Python (\d+)\.(\d+)") {
    if ([int]$Matches[1] -ge 3 -and [int]$Matches[2] -ge 10) {
      $exe = (& cmd /c "$cand -c `"import sys; print(sys.executable)`" 2>nul") -join ""
      if ($exe -and (Test-Path $exe.Trim())) {
        $pyExe = $exe.Trim()
        Ok "Python $($Matches[1]).$($Matches[2]) — $pyExe"
        break
      }
    } else {
      Warn "$cand → Python $($Matches[1]).$($Matches[2]) (3.10 미만, 건너뜀)"
    }
  }
}
if (-not $pyExe) {
  Die "1-전제점검" "Python 3.10 이상을 찾지 못했습니다." @("https://www.python.org/downloads/ 에서 설치하세요.", "설치 시 'Add python.exe to PATH' 를 반드시 체크하세요.")
}

$drive = (Get-Item $REPO).PSDrive
$freeGB = [math]::Round($drive.Free / 1GB, 1)
if ($freeGB -lt $MIN_FREE_GB) {
  Die "1-전제점검" "디스크 여유 ${freeGB} GB — 최소 ${MIN_FREE_GB} GB 가 필요합니다." @("모델 2.9GB + 런타임 1.1GB + 작업 공간이 필요합니다.")
}
Ok "디스크 여유 ${freeGB} GB (드라이브 $($drive.Name):)"

# ═══ 2. kordoc 설치 ══════════════════════════════════════════════════════
Step "kordoc 설치 (문서 → 마크다운 변환기)"

$kordocCmd = $null
$whereOut = & cmd /c "where kordoc" 2>$null
if ($LASTEXITCODE -eq 0) { $kordocCmd = ($whereOut | Where-Object { $_ -like "*.cmd" } | Select-Object -First 1) }

if ($kordocCmd -and (Test-Path $kordocCmd)) {
  $ver = (& cmd /c "`"$kordocCmd`" --version" 2>$null | Select-Object -First 1)
  Ok "kordoc 이미 설치됨 (v$ver) — $kordocCmd"
} else {
  Info "npm install -g kordoc (1분 내외)"
  & cmd /c "npm install -g kordoc" 2>&1 | ForEach-Object { if ($_ -match "added|updated|error|ERR") { Write-Host "        $_" } }
  $whereOut = & cmd /c "where kordoc" 2>$null
  if ($LASTEXITCODE -ne 0) { Die "2-kordoc" "설치 후에도 kordoc 을 찾을 수 없습니다." @("PowerShell 을 새로 열고 다시 실행하세요 (PATH 갱신 필요).", "수동 확인: npm install -g kordoc") }
  $kordocCmd = ($whereOut | Where-Object { $_ -like "*.cmd" } | Select-Object -First 1)
  if (-not $kordocCmd) { Die "2-kordoc" "kordoc.cmd 절대경로를 찾지 못했습니다." @("where kordoc 결과: $($whereOut -join ', ')") }
  $ver = (& cmd /c "`"$kordocCmd`" --version" 2>$null | Select-Object -First 1)
  Ok "kordoc v$ver 설치 완료 — $kordocCmd"
}

# ═══ 3. GPU 감지 ═════════════════════════════════════════════════════════
Step "GPU 감지 (런타임 종류 결정)"

$gpuKind = "none"; $gpuName = ""; $vramMiB = 0
$smi = "$env:SystemRoot\System32\nvidia-smi.exe"
if (Test-Path $smi) {
  try {
    $q = & cmd /c "`"$smi`" --query-gpu=name,memory.total --format=csv,noheader 2>nul"
    $first = ($q | Where-Object { $_ } | Select-Object -First 1)
    if ($first) {
      $gpuKind = "cuda"; $gpuName = $first.Trim()
      # "NVIDIA GeForce RTX 2050, 4096 MiB" 형태에서 총 VRAM 을 뽑는다
      if ($gpuName -match "(\d+)\s*MiB") { $vramMiB = [int]$Matches[1] }
    }
  } catch { }
}
if ($gpuKind -eq "none") {
  # NVIDIA 가 아니면 Vulkan 빌드를 쓴다 (AMD/Intel 내장 포함). GPU 가 아예 없어도
  # Vulkan 빌드는 CPU 로 동작하므로 안전한 기본값이다.
  $vid = Get-CimInstance Win32_VideoController -ErrorAction SilentlyContinue | Select-Object -First 1
  $gpuKind = "vulkan"; $gpuName = if ($vid) { $vid.Name } else { "(미검출)" }
  Ok "NVIDIA 미검출 → Vulkan 빌드 사용 — $gpuName"
} else {
  Ok "NVIDIA 검출 → CUDA 빌드 사용 — $gpuName"
}
$nglDefault = if ($gpuKind -eq "cuda") { 99 } else { 99 }   # Vulkan 도 일단 99 시도, 실패 시 폴백 안내

<#
  ── CTX_CHAT 자동 프로파일 (VRAM 기반) ────────────────────────────────────

  산정 근거 (RTX 2050 4GB 실측에서 뽑은 계수):

    모델 가중치 (Qwen3-4B Q4_K_M)      약 2,381 MiB — ctx 와 무관한 고정값
    KV 캐시 + 연산 버퍼 (--cache-type-k/v q8_0)
        ctx 4096 → 전체 2,851 MiB  ⇒ 모델 외 약  470 MiB
        ctx 6144 → 전체 3,086 MiB  ⇒ 모델 외 약  705 MiB
        차이 235 MiB / 2,048 토큰  ⇒ **약 0.115 MiB/토큰**

  이 계수로 추정한 전체 VRAM 소요:

    ctx  4096 →  2,381 + 470   ≈ 2.9 GB
    ctx  6144 →  2,381 + 705   ≈ 3.1 GB   ← 4GB 카드의 실용 상한
    ctx 16384 →  2,381 + 1,880 ≈ 4.3 GB   ← 6GB 이상에서만 안전

  그래서:
    - VRAM 6GB 미만  → 6144  (4GB 카드에서 실측 통과한 값. 여유 약 0.9GB)
    - VRAM 6GB 이상  → 16384 (4.3GB 소요 + 여유. 긴 문서·다중 청크에 유리)
    - GPU 없음(CPU)  → 4096  (RAM 은 넉넉하나 ctx 가 클수록 프롬프트 평가가
                              선형으로 느려진다. CPU 에서는 응답성이 우선)

  추정이므로 여유를 크게 잡았다. 기동이 OOM 으로 실패하면
  spec\paths.md 의 CTX_CHAT 을 한 단계 낮추고(16384 → 6144 → 4096 → 3072)
  그래도 안 되면 NGL_CHAT 을 28 → 0 으로 내린다.
#>
if ($gpuKind -eq "cuda" -and $vramMiB -ge 6144) {
  $ctxDefault = 16384
  Ok "VRAM $vramMiB MiB (6GB 이상) → CTX_CHAT $ctxDefault"
} elseif ($gpuKind -eq "cuda") {
  $ctxDefault = 6144
  $vramLabel = if ($vramMiB -gt 0) { "$vramMiB MiB" } else { "총량 미확인" }
  Ok "VRAM $vramLabel (6GB 미만) → CTX_CHAT $ctxDefault"
} else {
  $ctxDefault = 4096
  Ok "NVIDIA GPU 없음 → CTX_CHAT $ctxDefault (CPU 응답성 우선)"
}

# ═══ 4. 런타임 전개 ══════════════════════════════════════════════════════
Step "llama.cpp 런타임 전개 ($LLAMA_TAG / $gpuKind)"

New-Item -ItemType Directory -Force $DL | Out-Null
$serverExe = Join-Path $RUNTIME "llama-server.exe"

if ((Test-Path $serverExe) -and -not $Force) {
  Ok "runtime\ 이미 있음 (다시 받으려면 -Force)"
} else {
  New-Item -ItemType Directory -Force $RUNTIME | Out-Null
  if ($gpuKind -eq "cuda") {
    $a1 = Join-Path $DL $ASSET_CUDA.name
    $a2 = Join-Path $DL $ASSET_CUDART.name
    Get-Asset -Url "$LLAMA_BASE/$($ASSET_CUDA.name)"   -Dest $a1 -ExpectSize $ASSET_CUDA.size   -Label "llama.cpp CUDA 빌드"
    Get-Asset -Url "$LLAMA_BASE/$($ASSET_CUDART.name)" -Dest $a2 -ExpectSize $ASSET_CUDART.size -Label "CUDA 런타임(cudart)"
    Info "압축 해제 중..."
    Expand-Archive -Path $a1 -DestinationPath $RUNTIME -Force
    Expand-Archive -Path $a2 -DestinationPath $RUNTIME -Force
  } else {
    $a1 = Join-Path $DL $ASSET_VULKAN.name
    Get-Asset -Url "$LLAMA_BASE/$($ASSET_VULKAN.name)" -Dest $a1 -ExpectSize $ASSET_VULKAN.size -Label "llama.cpp Vulkan 빌드"
    Info "압축 해제 중..."
    Expand-Archive -Path $a1 -DestinationPath $RUNTIME -Force
  }
  if (-not (Test-Path $serverExe)) { Die "4-런타임" "전개 후에도 llama-server.exe 가 없습니다." @("$RUNTIME 을 지우고 다시 실행하세요.") }
  $files = @(Get-ChildItem $RUNTIME -Recurse -File)
  Ok "runtime\ 전개 완료 — $($files.Count) 파일, $([math]::Round(($files | Measure-Object Length -Sum).Sum/1MB,1)) MB"
}

# ═══ 5. 모델 다운로드 ════════════════════════════════════════════════════
Step "모델 다운로드 (Qwen3-4B 2.3GB + bge-m3 605MB)"

New-Item -ItemType Directory -Force $MODELS | Out-Null
$qwenPath = Join-Path $MODELS $MODEL_QWEN.file
$bgePath  = Join-Path $MODELS $MODEL_BGE.file

if ($SkipModels -and (Test-Path $qwenPath) -and (Test-Path $bgePath)) {
  Info "-SkipModels 지정 — 해시 검증만 수행"
  if ((Get-Sha256 $qwenPath) -ne $MODEL_QWEN.sha256) { Die "5-모델" "Qwen sha256 불일치" @("$qwenPath 를 지우고 -SkipModels 없이 다시 실행하세요.") }
  Ok "Qwen 해시 검증 통과"
  if ((Get-Sha256 $bgePath) -ne $MODEL_BGE.sha256) { Die "5-모델" "bge-m3 sha256 불일치" @("$bgePath 를 지우고 -SkipModels 없이 다시 실행하세요.") }
  Ok "bge-m3 해시 검증 통과"
} else {
  Get-Asset -Url $MODEL_QWEN.url -Dest $qwenPath -ExpectSize $MODEL_QWEN.size -ExpectSha $MODEL_QWEN.sha256 -Label "Qwen3-4B-Instruct-2507 Q4_K_M"
  Get-Asset -Url $MODEL_BGE.url  -Dest $bgePath  -ExpectSize $MODEL_BGE.size  -ExpectSha $MODEL_BGE.sha256  -Label "bge-m3 Q8_0"
}

# ═══ 6. spec\paths.md 생성 ═══════════════════════════════════════════════
Step "spec\paths.md 생성"

New-Item -ItemType Directory -Force $SPEC | Out-Null
$pathsFile = Join-Path $SPEC "paths.md"

$lines = @(
  "# spec/paths.md — setup.ps1 이 생성 ($(Get-Date -Format 'yyyy-MM-dd HH:mm'))"
  ""
  "모든 스크립트가 읽는 단일 출처. 경로를 바꾸려면 여기만 고친다."
  "이 파일은 개인 경로를 담으므로 .gitignore 대상이다."
  ""
  '```'
  "QWEN_GGUF      = $qwenPath"
  "BGE_M3_GGUF    = $bgePath"
  "LLAMA_SERVER   = $serverExe"
  "PYTHON         = $pyExe"
  "KORDOC_CMD     = $kordocCmd"
  "CHAT_MODEL_ID  = qwen3-4b"
  "EMBED_MODEL_ID = bge-m3"
  "NGL_CHAT       = $nglDefault"
  "CTX_CHAT       = $ctxDefault"
  '```'
  ""
  "## 감지 결과"
  ""
  "| 항목 | 값 |"
  "|---|---|"
  "| GPU | $gpuName |"
  "| VRAM | $(if ($vramMiB -gt 0) { "$vramMiB MiB" } else { '미확인 (NVIDIA 아님 또는 조회 실패)' }) |"
  "| 런타임 | llama.cpp $LLAMA_TAG ($gpuKind 빌드) |"
  "| Node | $nodeV |"
  ""
  "``CTX_CHAT`` 은 VRAM 총량으로 자동 산정했다 (6GB 미만 → 6144 / 6GB 이상 → 16384 / GPU 없음 → 4096)."
  "산정 근거는 setup.ps1 의 3단계 주석 참조 — 모델 2,381 MiB + 약 0.115 MiB/토큰(KV q8_0) 실측 계수."
  ""
  "**AnythingLLM 의 Token context window 에도 이 ``CTX_CHAT`` 값을 그대로 넣을 것.**"
  ""
  "기동이 OOM 으로 실패하면 ``CTX_CHAT`` 을 한 단계 낮추고(16384 → 6144 → 4096 → 3072),"
  "그래도 안 되면 ``NGL_CHAT`` 을 ``28`` → ``0`` 으로 내린다."
)

if (Test-Path $pathsFile) {
  Write-Host ""
  Write-Host "  spec\paths.md 가 이미 있습니다." -ForegroundColor Yellow
  Write-Host "  덮어쓰시겠습니까? 기존 값은 사라집니다. [Y/N] " -ForegroundColor Yellow -NoNewline
  $ans = Read-Host
  if ($ans -notmatch '^[Yy]') { Info "기존 paths.md 유지"; }
  else { [System.IO.File]::WriteAllLines($pathsFile, $lines, (New-Object System.Text.UTF8Encoding($false))); Ok "paths.md 덮어씀" }
} else {
  [System.IO.File]::WriteAllLines($pathsFile, $lines, (New-Object System.Text.UTF8Encoding($false)))
  Ok "paths.md 생성 완료"
}
Write-Host ""
Write-Host "  ── 기록된 값 ──" -ForegroundColor DarkGray
Get-Content $pathsFile -Encoding UTF8 | Select-String -Pattern "^\w+\s+=" | ForEach-Object { Write-Host "    $($_.Line)" -ForegroundColor DarkGray }

# ═══ 7. 자가검증 ═════════════════════════════════════════════════════════
Step "자가검증 (버전 / 서버 기동 / GV-1 라운드트립)"

if ($SkipVerify) { Warn "-SkipVerify 지정 — 자가검증을 건너뜁니다"; }
else {
  # 7-1. llama-server --version
  # 주의: llama-server 는 버전을 stderr 로 낸다. PowerShell 5.1 에서 네이티브 exe 의
  # stderr 를 `2>&1` 로 받으면 각 줄이 ErrorRecord 로 감싸여 NativeCommandError 가 되고,
  # $ErrorActionPreference='Stop' 과 만나 스크립트가 죽는다. cmd 가 리다이렉션을
  # 처리하도록 감싸서 이 함정을 피한다.
  $sv = (& cmd /c "`"$serverExe`" --version 2>&1") -join " "
  if ($sv -notmatch "version:\s*(\d+)") { Die "7-자가검증" "llama-server --version 응답이 이상합니다: $sv" @("runtime\ 을 지우고 setup.ps1 -Force 로 다시 실행하세요.") }
  Ok "llama-server $($Matches[0])"

  # 7-2. 서버 기동 스모크
  Info "서버 기동 스모크 (chat 8090 + embed 8091) — 20초 내외"
  # 자식 PowerShell 로 띄운다. 여기서도 stderr 를 PowerShell 스트림으로 끌어오지 않는다.
  & cmd /c "powershell -NoProfile -ExecutionPolicy Bypass -File `"$(Join-Path $REPO 'scripts\serve_models.ps1')`" >nul 2>&1"
  if ($LASTEXITCODE -ne 0) {
    Die "7-자가검증" "서버 기동에 실패했습니다." @(
      "logs\chat-*.err.log 와 logs\embed-*.err.log 를 확인하세요.",
      "VRAM 부족이면 spec\paths.md 의 NGL_CHAT 을 28 또는 0 으로 낮추고 다시 실행하세요.",
      "다른 llama-server 가 8090/8091 을 쓰고 있으면 먼저 종료하세요."
    )
  }
  Ok "chat 8090 / embed 8091 기동"

  # /v1/models
  foreach ($p in @(8090, 8091)) {
    try {
      $m = Invoke-RestMethod "http://127.0.0.1:$p/v1/models" -TimeoutSec 30
      Ok "포트 $p /v1/models → $(($m.data | ForEach-Object { $_.id }) -join ', ')"
    } catch { Die "7-자가검증" "포트 $p 의 /v1/models 응답 실패: $($_.Exception.Message)" @("logs\ 의 서버 로그를 확인하세요.") }
  }

  # 임베딩 차원 1024
  try {
    $body = @{ input = "차원 확인"; model = "bge-m3" } | ConvertTo-Json
    $e = Invoke-RestMethod "http://127.0.0.1:8091/v1/embeddings" -Method Post -Body ([Text.Encoding]::UTF8.GetBytes($body)) -ContentType "application/json" -TimeoutSec 60
    $dim = $e.data[0].embedding.Count
    if ($dim -ne 1024) { Die "7-자가검증" "임베딩 차원이 $dim 입니다 (기대 1024)." @("bge-m3 모델 파일을 확인하세요.") }
    Ok "임베딩 차원 $dim"
  } catch { Die "7-자가검증" "임베딩 호출 실패: $($_.Exception.Message)" @("logs\embed-*.err.log 를 확인하세요.") }

  # 7-3. GV-1 라운드트립 (kordoc 변환 정확성 골든 벡터)
  Info "GV-1 라운드트립 실행 (kordoc 표 셀 값 100% 일치 검증)"
  $gv1 = & cmd /c "node `"$(Join-Path $REPO 'scripts\golden_roundtrip.mjs')`" 2>&1"
  $gv1 | ForEach-Object { Write-Host "        $_" }
  if ($LASTEXITCODE -ne 0) { Die "7-자가검증" "GV-1 라운드트립 실패 (exit=$LASTEXITCODE)" @("logs\gv1\gv1-report.json 을 확인하세요.") }
  Ok "GV-1 PASS"
}

# ═══ 완료 ════════════════════════════════════════════════════════════════
Write-Host ""
Write-Host ("=" * 64) -ForegroundColor Green
Write-Host "  SETUP COMPLETE" -ForegroundColor Green
Write-Host ("=" * 64) -ForegroundColor Green
Write-Host ""
Write-Host "  다음 순서로 진행하세요:" -ForegroundColor White
Write-Host "    1. AnythingLLM Desktop 설치 + 설정  →  QUICKSTART.md 2~3장"
Write-Host "    2. office-inbox\ 에 문서를 넣고 변환  →  QUICKSTART.md 4장"
Write-Host "    3. 평소 실행은 Start-LocalRAG.bat 더블클릭"
Write-Host ""
if (-not $SkipVerify) {
  Write-Host "  지금 서버가 떠 있습니다. 끄려면: Stop-LocalRAG.bat" -ForegroundColor DarkGray
  Write-Host ""
}
exit 0
