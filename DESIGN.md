# DESIGN.md — kdocrag

## 1. 아키텍처

```
<REPO>\office-inbox\   ← 원본 투입 (hwp/hwpx/hwpml/docx/pptx*/xlsx/xls/pdf)
        │  convert_office.py  (작업 스케줄러 평일 12:30 / 수동 실행)
        │    └─ kordoc CLI 절대경로 호출, 원장(sha256), _failed 분류
        ▼
<REPO>\office-md\      ← 마크다운 산출 (본문만) + .md.meta.json 사이드카
        ▼  (수동 드래그앤드롭 or AnythingLLM 폴더 감시)
AnythingLLM Desktop
        ├─ Embedder → llama-server :8091 (bge-m3, --embedding)
        └─ LLM      → llama-server :8090 (Qwen3-4B-Instruct-2507-Q4_K_M)
```

*pptx: kordoc 미지원 포맷. pptx가 인박스에 들어오면 `_failed\unsupported\` 로 분류하고 로그에 남긴다 (M4 범위에서는 스킵 처리만, 변환기는 후속 결정).

## 2. 폴더 구조

**데이터 루트 = 저장소 루트.** (2026-08-09 개정 — 종전 `C:\Haku\kdocrag` 는 맥미니 경로 관습의
잘못된 이식이었다. §2.1 참조)

```
<REPO>\
├─ office-inbox\          # 원본 투입 (gitignore)
│   └─ _failed\
│       ├─ encrypted\     # ENCRYPTED / DRM_PROTECTED
│       ├─ unsupported\   # 지원 외 확장자 (pptx 등) + UNSUPPORTED_FORMAT
│       └─ error\         # PARSE_ERROR / NO_SECTIONS / NO_OUTPUT / TOO_SHORT 등
├─ office-md\             # 산출물 (gitignore)
│   ├─ <스템>.md              본문만
│   ├─ <스템>.md.meta.json    메타 사이드카 (§3.1)
│   └─ .ledger.json
├─ samples\               # GV-2용 실물 문서 (인간 제공, gitignore)
├─ runtime\               # llama.cpp CUDA 빌드 (gitignore)
├─ models\                # bge-m3 GGUF (gitignore)
├─ scripts\
├─ spec\
├─ logs\                  # (gitignore)
├─ Start-LocalRAG.bat / Stop-LocalRAG.bat
└─ README.md / DECISIONS.md / Log.md / EVAL.md
```

## 2.1 데이터 루트가 저장소 안에 있는 것에 대하여

실데이터(회사 문서)가 저장소 폴더 **안**에 놓이지만, CONTEXT §4 의 IP 경계는 유지된다.
`.gitignore` 가 `office-inbox/`, `office-md/`, `logs/`, `samples/*` 를 제외하므로
**커밋 대상이 되지 않는다.** 저장소 폴더에 있는 것과 저장소에 커밋되는 것은 다르다.

주의:
- 저장소를 통째로 압축·복사·클라우드 동기화하면 실데이터가 함께 나간다. 백업 시 유의할 것.
- `git init` 후에는 반드시 `git status` 로 `office-inbox/`·`office-md/` 가 안 잡히는지 확인한다.

## 3. convert_office.py 사양

- Python 3.10+ (노트북 기존 파이썬 사용. 현재 venv 없이 시스템 파이썬 절대경로 사용)
- 외부 패키지 의존 최소화: 표준 라이브러리만 (`hashlib`, `json`, `subprocess`, `pathlib`, `shutil`, `logging`)
- kordoc 호출: `subprocess.run([KORDOC_ABS_PATH, str(src), "-o", str(dst)], ...)`
  - **`npx` 사용 금지, PATH 의존 금지** — `where kordoc`으로 확인한 절대경로를 스크립트 상수 or spec/paths.md에서 로드
  - Windows에서 전역 npm 스크립트는 `kordoc.cmd` — subprocess 호출 시 `.cmd` 경로를 직접 지정
- 원장: 파일명→sha256. 동일 해시면 스킵.
- **산출 md는 순수 본문만 담는다.** 메타데이터는 front-matter가 아니라 **사이드카 파일**로 분리한다.
  (GATE-3 개정 — 근거는 아래 §3.1)
- 산출물 최소 길이 검증 (본문 50자 미만 = 실패 처리)
- 실패 분류: kordoc의 구조화 에러코드(`--format json` 활용 가능)를 읽어 `_failed\` 하위 폴더 결정
- 종료 코드: 전체 성공 0 / 일부 실패 1 (실패 목록 stdout) — 스케줄러 로그에서 판독 가능하게
- 자동 패치 후 `python -m py_compile` (ast 검증 원칙) 통과 확인

## 3.1 메타데이터 사이드카 (GATE-3 개정, 2026-08-09)

### 개정 배경

당초 사양은 산출 md 상단에 front-matter(`source`/`converted`/`sha256`)를 넣는 것이었다.

> ⚠ **정정 (2026-08-09, 사이드카 구현 후 회귀 검증에서 밝혀짐)**
> 이 개정을 처음 기록할 때 "front-matter가 RAG 답변 품질을 떨어뜨린다"를 근거로 삼았으나
> **그 인과는 틀렸다.** 사이드카로 분리한 뒤에도 문제의 질문은 동일하게 실패했고,
> 진짜 원인은 **대화 이력 프라이밍**이었다 (EVAL.md 부록 C).

**개정을 유지하는 실제 근거** (인과가 아니라 관측 사실에 기반):

1. front-matter 블록은 임베딩 시 **독립 청크로 잡힌다**. 실측에서 유사도 0.5992로 검색 결과
   2순위에 올라와, 본문 청크 하나를 topN 밖으로 밀어냈다. `sha256` 해시 문자열은
   검색·생성 어디에도 기여하지 않는 순수 잡음이다.
2. 청크 예산(topN 4)이 작을수록 손해가 크다. 잡음 청크 1개 = 가용 컨텍스트의 25% 손실.
3. 메타데이터는 원장 추적·감사에 필요하므로 버릴 수 없다.

즉 **"버그 수정"이 아니라 "임베딩 위생"** 목적의 개정이다. 답변 품질 개선은 입증되지 않았다.

### 사양

산출물 한 쌍:

```
office-md\<스템>.md            ← kordoc 마크다운 본문만. 앞뒤에 어떤 메타 블록도 붙이지 않는다.
office-md\<스템>.md.meta.json  ← 메타데이터 사이드카
```

사이드카 스키마 (**이 스키마를 임의로 변경하지 않는다**):

```json
{
  "source": "원본 파일명 (확장자 포함)",
  "converted": "ISO 8601 UTC, 초 단위 (예: 2026-08-09T05:12:33+00:00)",
  "sha256": "원본 파일의 sha256 (소문자 hex)"
}
```

- 세 필드는 종전 front-matter와 **동일한 이름·의미**다. 담는 위치만 바뀌었다.
- 인코딩 UTF-8, 개행 LF 고정 (산출물 해시 안정성 — 본문 md와 동일 원칙).
- AnythingLLM에는 `*.md`만 투입한다. `*.md.meta.json`은 **임베딩 대상이 아니다.**

## 4. llama-server 구성 (VRAM 4GB 예산)

### chat :8090 — Qwen3-4B Q4_K_M (가중치 ~2.5GB)

기본안 (전부 GPU):
```
llama-server -m <QWEN_GGUF> --port 8090 -ngl 99 -c 4096 --flash-attn ^
  --cache-type-k q8_0 --cache-type-v q8_0
```
- ctx 4096 + KV q8_0 로 4GB 안에 수렴 시도. RAG 프론트가 AnythingLLM이므로 긴 컨텍스트는 청크 수(TopK)로 제어.

OOM 폴백 순서 (이 순서로만 시도, 각 시도를 DECISIONS.md에 기록):
1. `-c 4096` → `-c 3072`
2. `-ngl 99` → `-ngl 28` (부분 오프로드, 나머지 CPU/32GB RAM)
3. 그래도 실패 시 `-ngl 0` CPU 전용 (32GB RAM으로 충분히 동작, 속도만 저하) — NO-GO 아님

### embed :8091 — bge-m3 GGUF (~1.3GB)

```
llama-server -m <BGE_M3_GGUF> --port 8091 --embedding -ngl 0 -c 2048 --pooling cls
```
- **임베딩은 CPU 고정** (`-ngl 0`) — chat과 VRAM 경합 방지. bge-m3 CPU 임베딩은 32GB RAM에서 충분히 실용적.
- bge-m3 GGUF 출처: Hugging Face 공개 GGUF (예: gpustack/bge-m3-GGUF 등) 중 Q8_0. 다운로드 전 SSD 여유 확인, 출처 URL을 DECISIONS.md에 기록.
- 차원 1024 확인이 스모크 항목.

### serve_models.ps1 / stop_models.ps1

- 두 인스턴스 기동, 포트 리스닝 대기(최대 60s 폴링) 후 `/v1/models` 응답 확인
- stop은 포트 기준 PID 조회 후 종료 (전역 `taskkill /im llama-server.exe` 금지 — LocalDesk 인스턴스 오사살 방지)

## 5. AnythingLLM 설정값 (고정)

| 항목 | 값 |
|---|---|
| LLM Provider | Generic OpenAI, Base URL `http://127.0.0.1:8090/v1`, 아무 API key 문자열 |
| Chat Model | 서버가 노출하는 모델명 그대로 (spec/paths.md에 기록) |
| Embedder | Generic OpenAI 호환 `http://127.0.0.1:8091/v1` / **폴백: Ollama(bge-m3)** |
| Text Chunk Size | 512 |
| Text Chunk Overlap | 80 |
| Vector DB | 기본 LanceDB (내장) |
| Workspace | `kdocs` 1개 |

규칙: **임베더·청크 설정 확정 → 문서 투입** 순서 고정. 설정을 나중에 바꾸면 문서 제거 후 재투입(재임베딩).

## 6. 작업 스케줄러 (register_task.ps1)

- 작업명 `kdocrag-convert`, 트리거 평일 12:30, **로그온 상태에서만 실행**
- 동작: `python.exe <abs>\convert_office.py` (작업 디렉터리 지정, 로그를 `logs\convert-YYYYMMDD.log`로 리다이렉트)
- venv 사용 시 python 절대경로는 venv 내부 것을 지정 (`command -v`류 동적 탐색 금지 원칙의 Windows 버전)

## 7. 오프라인성 검증 절차 (GV-5) — **콘텐츠 오프라인성** (GATE-2에서 재정의, 2026-08-09)

### 정의 변경 근거

당초 기준은 "전 과정 중 외부 아웃바운드 없음"(완전 무통신)이었다. M3 실측 결과 AnythingLLM은
설치·최초 부팅 단계에서 텔레메트리(`server_boot`)와 원격 모델 맵 동기화를 발신했고,
텔레메트리 차단을 적용하는 순간에도 `telemetry_disabled` 이벤트를 1회 발신했다.
기성품(A안)을 쓰는 한 이 하우스키핑 트래픽을 0으로 만들 수는 없다.

따라서 GATE-2에서 기준을 **콘텐츠 오프라인성**으로 재정의한다.

### 합격 기준 (비협상)

**문서 내용과 질의 내용이 외부로 발신되지 않을 것.**

- 합격: 문서 본문·청크 텍스트·질문/답변 문자열이 비 `127.0.0.1` 목적지로 나가지 않는다.
- **결격 사유 아님**: 앱 하우스키핑 트래픽 (부팅 이벤트, 익명 텔레메트리, 모델 맵/컨텍스트 윈도
  동기화, 업데이트 확인 등). 단 **전부 목록화하고, 차단 가능한 것은 차단한다.**

### 검증 절차

1. 변환 1회 + AnythingLLM 질의 1회를 수행하는 동안 `netstat -ano` 스냅샷을 2회 이상 뜬다.
2. llama-server(8090/8091) 프로세스에 **비 127.0.0.1 커넥션이 없음**을 확인한다.
   — 추론과 임베딩이 전부 로컬이므로, 문서 내용이 나갈 경로는 여기서 끊긴다.
3. AnythingLLM 프로세스의 외부 커넥션을 목록화하고, 각각이 하우스키핑인지 콘텐츠 발신인지
   분류한다. 콘텐츠 발신이 하나라도 있으면 **불합격**.
4. AnythingLLM 백엔드 로그에서 `TELEMETRY` 라인을 전수 수집해 이벤트명을 나열한다.
   이벤트명이 문서/질의 내용을 담지 않는 하우스키핑인지 확인한다.
5. 차단 상태를 기록한다: `DISABLE_TELEMETRY=true`, `NetworkDiscovery=false`.
   차단 불가 항목(모델 맵 동기화 등)은 "차단 옵션 없음"으로 명시한다.

### 기록된 하우스키핑 트래픽 (M3 실측)

| 항목 | 차단 여부 |
|---|---|
| `[TELEMETRY SENT] server_boot` (최초 부팅 1회) | 사후 차단됨 (발신 이력은 남음) |
| `[TELEMETRY SENT] telemetry_disabled` (차단 적용 시 1회) | 차단 동작 자체의 부산물 |
| `[ContextWindowFinder] Remote model map synced` | **차단 옵션 미발견** |
| 번들 Ollama 자동 기동 | LLM_PROVIDER를 generic-openai로 바꾼 뒤 **기동되지 않음** |

## 8. 설계 원칙 리마인드

- LangChain/LangGraph/openai SDK 금지. HTTP는 표준 라이브러리 직접 호출
- 모든 경로 절대경로. PATH/셸 자동 탐색 의존 금지
- 계획된 기능 vs 실제 동작 기능을 문서에서 명확히 구분 (fabrication 방지)
- 실패는 숨기지 않고 `_failed\` + 로그로 정직하게 노출 (kordoc의 skipped[] 철학과 동일)
