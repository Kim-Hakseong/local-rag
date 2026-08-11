# kdocrag — 한글문서 로컬 RAG (Windows)

HWP/HWPX/DOCX/XLSX/PDF 문서를 **kordoc**으로 마크다운 변환하고,
**AnythingLLM + 로컬 llama.cpp**로 완전 오프라인 질의응답을 한다.
클라우드 API 호출 없음. 문서 내용은 로컬을 벗어나지 않는다.

## 처음이라면 → **[QUICKSTART.md](QUICKSTART.md)** (10분 설치 가이드)

```powershell
git clone https://github.com/Kim-Hakseong/local-rag.git
cd local-rag
powershell -ExecutionPolicy Bypass -File setup.ps1
```

`setup.ps1` 이 kordoc 설치 · GPU 감지 · llama.cpp 런타임 전개 · 모델 다운로드(해시 검증) ·
`spec/paths.md` 생성 · 자가검증까지 한 번에 한다. 그다음 AnythingLLM 을 설치하고
[QUICKSTART 3장](QUICKSTART.md#3-anythingllm-설정--이-순서를-지킬-것)의 설정값을 넣으면 끝이다.

---

- 설계 근거: `CONTEXT.md` / `PRD.md` / `DESIGN.md`
- 결정 이력: `DECISIONS.md` · 작업 로그: `Log.md` · 평가 결과: `EVAL.md`
- 경로 설정: `spec/paths.md` (`setup.ps1` 이 생성 — 모든 스크립트의 단일 출처)

이 문서(README)는 **일상 운영·튜닝 근거**를 다룬다. 설치는 QUICKSTART 를 볼 것.

---

## 1. 일상 사용 절차

### 1-1. 서버 기동 / 종료

**평소에는 더블클릭 두 개면 된다:**

| 파일 | 동작 |
|---|---|
| **`Start-LocalRAG.bat`** | 8090/8091이 이미 떠 있으면 건너뛰고, 아니면 서버 기동 → `/health` 확인 → AnythingLLM 실행 |
| **`Stop-LocalRAG.bat`** | 8090/8091만 종료. **AnythingLLM은 닫지 않는다** (직접 닫을 것) |

바탕화면 바로가기 만들기: 탐색기에서 `Start-LocalRAG.bat`(또는 `Stop-LocalRAG.bat`)를 **오른쪽 클릭 → 보내기 → 바탕 화면에 바로 가기 만들기**. (Win11에서 메뉴가 안 보이면 오른쪽 클릭 후 `Shift+F10` 또는 "추가 옵션 표시")

수동으로 하려면:

```powershell
# 기동 (chat :8090 + embed :8091)
powershell -ExecutionPolicy Bypass -File scripts\serve_models.ps1

# 종료 — 반드시 이 스크립트로만
powershell -ExecutionPolicy Bypass -File scripts\stop_models.ps1
```

> `.bat` 두 개는 **ASCII 전용**으로 작성돼 있다. cmd.exe가 `.bat` 안의 멀티바이트 문자를
> 잘못 파싱해 실행이 깨지기 때문이다(2026-08-09 실측, UTF-8·UTF-8 BOM 모두 실패).
> 그래서 배치 메시지만 영문이고, 설명은 이 README에 둔다.

- 기동 후 두 서버가 `/health` = ok 가 될 때까지 스크립트가 기다린다 (최대 180초).
  chat 은 모델 로딩에 약 6초 걸린다.
- **`taskkill /im llama-server.exe` 를 절대 쓰지 말 것.** 다른 프로젝트 인스턴스까지 죽는다.
  `stop_models.ps1` 은 포트(8090/8091) → PID → 이미지 경로 대조를 거쳐 우리 것만 종료한다.
- GPU VRAM 이 4GB 뿐이다. **다른 llama-server(예: 8081)가 떠 있으면 먼저 내려야** chat 이 GPU 에 올라간다.
- AnythingLLM 은 별도로 실행한다: `%LOCALAPPDATA%\Programs\AnythingLLM\AnythingLLM.exe`

### 1-2. 문서 넣는 곳

**저장소 폴더 안에 있다** (`<REPO>\`):

```
office-inbox\      ← 원본을 여기에 넣는다
office-md\         ← 변환 결과가 여기 나온다
    <스템>.md                본문만 (AnythingLLM 에 넣는 것은 이것)
    <스템>.md.meta.json      메타데이터 사이드카 (source/converted/sha256, 임베딩하지 않음)
```

> 실데이터가 저장소 폴더 안에 있지만 `.gitignore` 가 `office-inbox/`·`office-md/`·`logs/` 를
> 제외하므로 **커밋되지 않는다.** 다만 저장소를 통째로 압축·클라우드 동기화하면 함께 나가므로
> 백업 시 주의할 것.

지원 확장자: `.hwp .hwpx .hwpml .pdf .docx .xlsx .xls`
(`.pptx` 는 kordoc 미지원 → `_failed\unsupported\` 로 분류된다)

변환은 **평일 12:30 자동 실행**되며, 즉시 돌리려면:

```powershell
# spec\paths.md 의 PYTHON 값을 쓰면 된다 (setup.ps1 이 기록해 둔다)
python scripts\convert_office.py
```

- 같은 문서의 `.hwp` 와 `.hwpx` 를 함께 넣으면 **`.hwpx` 만 변환**한다 (중복 임베딩 방지).
- 이미 변환한 파일은 sha256 이 같으면 건너뛴다. 파일을 수정하면 자동으로 재변환된다.

#### 인터넷에서 받은 파일: 투입 전 차단 해제 (예방 조치)

웹/메일/채팅에서 받은 파일에는 Windows 가 MotW(`Zone.Identifier`) 표시를 붙인다.
인박스에 넣기 전에 한 줄로 털어내면 좋다:

```powershell
Get-ChildItem office-inbox -File | Unblock-File
```

> **근거 수준을 정확히 밝힌다**: 2026-08-09 에 DOCX·XLSX 2건이 `NO_OUTPUT` 으로 실패했고
> Unblock 이후 정상화됐지만, **MotW 를 다시 붙여 실험한 결과 그대로 성공**했다.
> 즉 **MotW 가 원인이라는 인과는 확인되지 않았다** (DECISIONS "[결함-후속] NO_OUTPUT 2건 해소").
> 이 항목은 **비용이 0에 가깝고 부작용이 없어 넣는 예방 조치**이지 검증된 해결책이 아니다.

#### 변환이 비정상적으로 오래 걸리거나 `NO_OUTPUT` 으로 실패하면

같은 증상(kordoc 이 수십 초~수 분 뒤 빈 출력, 종료코드 0)이 재발할 수 있다. 확인 순서:

1. **잠시 후 그냥 다시 돌려본다.** 실측에서 동일 파일이 4회 실패 후 저절로 0.7초로 정상화됐다.
2. `logs\convert-YYYYMMDD.log` 에서 `code=NO_OUTPUT` 인지 확인 (다른 실패와 구분됨).
3. 실패 파일은 `office-inbox\_failed\error\` 에 있다. **인박스로 되돌리면 재시도된다**
   (원장이 실패 상태를 기억하므로 자동으로 다시 변환을 시도한다).
4. 계속 실패하면 백신 실시간 검사 예외 경로에 두고 시도해 볼 것 — **미검증 후보다.**

### 1-3. AnythingLLM 에 넣기

`office-md\*.md` 를 AnythingLLM 워크스페이스 **`kdocs`** 에 드래그앤드롭 → `Save and Embed`.

- **`*.md` 만 투입한다.** 같은 폴더의 `*.md.meta.json`(메타데이터 사이드카)은 **임베딩 대상이 아니다.**
- 산출 md 에는 front-matter 가 없다. 메타데이터는 사이드카로 분리돼 있어
  임베딩에 잡음 청크가 생기지 않는다 (DESIGN §3.1).

### 1-3-1. 질의 요령 — **대화가 길어지면 새 스레드를 열 것**

가장 중요한 운영 수칙이다. 실측 근거가 있다 (`EVAL.md` 부록 D):

| 상황 | 실전 7문항 점수 |
|---|---|
| 잡담·문서요약이 앞에 쌓인 긴 스레드 (`openAiHistory 20`) | **4/7** |
| **`openAiHistory 2` 로 조정 후** | **7/7** |

- 원인은 검색이 아니다. **정답은 항상 인용 청크에 들어 있었다.**
  모델이 앞선 대화에서 자기가 만든 부정확한 요약을 다시 읽고 그쪽을 믿어버린다.
- 현재 워크스페이스는 **`openAiHistory = 2`** 로 설정돼 있다(직전 1턴만 참고).
  이 값을 올리면 위 실패가 되살아난다.
- 그래도 **주제가 바뀌면 새 스레드를 여는 편이 안전하다.** 특히 앞에서 "파일 목록 보여줘",
  "이 문서 요약해줘" 같은 긴 답변을 받았다면 반드시 새로 열 것.
- 답이 이상하면 **인용 청크를 먼저 확인한다.** 청크에 정답이 있는데 답변이 "없다"고 하면
  이력 오염이다 — 새 스레드에서 다시 물으면 해결된다.

> `openAiHistory` 를 **0 으로 설정할 수는 없다.** AnythingLLM 백엔드가 `openAiHistory||20`
> 으로 처리해 0 이 20 으로 폴백된다. 최소 실용값이 2 다.

### 1-3-2. 값·인덱스를 물을 때의 3수칙

워크스페이스 System Prompt 에 "값을 답할 땐 원문을 인용하라"는 규칙을 걸어뒀다
(설정값은 QUICKSTART 3-5). 그 위에서 지킬 것:

1. **값·인덱스·파라미터는 "원문 인용해서" 라고 붙여 묻는다.**
   그러면 `원문 인용: "■ Negative limit (0x607B.01) = –2048"` 처럼 근거 문장을 함께 준다.
   인용이 없으면 그 값은 아직 믿을 단계가 아니다.
2. **모델이 만들어 준 표는 "어디를 볼지" 찾는 용도다. 값 자체는 원문에서 확인한다.**
   재구성한 표는 행이 밀리거나 열이 섞일 수 있다. 인용 청크(Citations)를 펼쳐 원본 행을 본다.
3. **모델이 "문서가 틀렸다 / 실제로는 이렇다"고 하면, 틀린 건 모델이다.**
   이 시스템의 정답은 언제나 문서다. 사전지식과 문서가 충돌하면 문서가 이긴다 —
   System Prompt 규칙 4번이 그것이고, 그래도 모델이 우기면 그 답을 버린다.

### 1-3-3. 문서를 많이 넣으면 생기는 일 (실측)

**큰 문서 하나가 검색을 독점할 수 있다.** 실측 사례:

| 상황 | 결과 |
|---|---|
| 문서 5건 / 29 벡터 | 평가 7/7 |
| 여기에 **437KB 매뉴얼 1건 추가** → 1,160 벡터 (그 문서가 **97%**) | 작은 문서들의 질문이 **검색 자체에서 밀림** — 인용 4개가 전부 큰 문서에서 나옴 |

`topN 4` 는 문서가 아니라 **청크** 기준이라, 청크를 1,100개 가진 문서가 상위 4개를 다 가져간다.
대응 (실사용 판단):

- **주제가 다른 대용량 문서는 워크스페이스를 나눈다.** 가장 확실하다.
- 질문에 문서를 특정하는 단어를 넣는다 (`교정장비 관리대장에서 EQ-0219 …`).
- 그래도 안 되면 해당 문서를 잠시 워크스페이스에서 빼고 묻는다.

### 1-4. 실패 확인하는 곳

| 확인 대상 | 위치 |
|---|---|
| 변환 로그 (날짜별) | `logs\convert-YYYYMMDD.log` |
| 스케줄러 실행 로그 | `logs\task-convert-YYYYMMDD.log` |
| 실패 파일 (암호) | `office-inbox\_failed\encrypted\` |
| 실패 파일 (미지원 포맷) | `..._failed\unsupported\` |
| 실패 파일 (파싱 오류) | `..._failed\error\` |
| 파일별 처리 이력 | `office-md\.ledger.json` |
| llama-server 로그 | `logs\chat-YYYYMMDD.err.log` / `logs\embed-YYYYMMDD.err.log` |

`convert_office.py` 종료 코드: **0** = 전건 성공/스킵, **1** = 1건 이상 실패(목록이 stdout 에 출력),
**2** = 실행 전제 불충족(경로 미기입 등).

### 1-4-1. 현재 확정 설정 (변경 시 EVAL.md 부록 D 재측정 필요)

| 항목 | 값 | 비고 |
|---|---|---|
| topN | 4 | 실험상 8로 올려도 효과 없음 |
| similarityThreshold | 0.25 | 0.15로 낮춰도 효과 없음 |
| vectorSearchMode | default | rerank는 동점인데 생성 속도 1/3 |
| **openAiHistory** | **2** | **가장 중요.** 20이면 실전 4/7, 2면 7/7 |
| chunk size / overlap | 512 / 80 | |
| chat ctx (`-c`) | 6144 | VRAM 3,086 MiB (여유 880 MiB) |

### 1-5. 재임베딩이 필요한 경우

아래를 바꾸면 **기존 벡터가 무효**가 된다. 워크스페이스에서 문서를 전부 제거하고 다시 투입해야 한다.

- 임베딩 모델 변경 (`bge-m3` → 다른 모델)
- **Text Chunk Size / Overlap 변경** (현재 512 / 80)
- Embedding Max Chunk Length 변경 (현재 2048)
- Vector DB 변경 (현재 LanceDB)

**순서 원칙: 임베더·청크 설정 확정 → 그 다음에 문서 투입.** 순서를 어기면 조용히 섞인다.

LLM 쪽 변경(chat 모델, 토큰 한도, topN, similarity threshold)은 **재임베딩이 필요 없다.**

---

## 2. 스케줄 자동 실행 확인 방법 (월요일 12:30)

작업명 `kdocrag-convert` — 평일 12:30, **로그온 상태에서만** 실행된다(회사 노트북이라 무인 실행을 가정하지 않는다).
자동 발화가 실제로 일어났는지는 다음 순서로 확인한다.

1. **12:30 이후 로그 파일이 생겼는지 본다** — `logs\convert-YYYYMMDD.log` (YYYYMMDD = 그날 날짜).
   파일 안에서 기대할 라인:
   ```
   2026-08-10 12:30:0X,XXX INFO    convert_office 시작 root=<REPO> dry_run=False ...
   2026-08-10 12:30:0X,XXX INFO    완료: 변환 N / 원장스킵 N / 쌍스킵 N / 실패 N
   ```
   **`시작` 줄의 시각이 12:30 대**면 스케줄러가 발화한 것이다(수동 실행과 구분되는 유일한 근거).
2. **스케줄러가 본 결과를 확인한다**:
   ```powershell
   Get-ScheduledTaskInfo -TaskName "kdocrag-convert" | Select-Object LastRunTime, LastTaskResult, NextRunTime
   ```
   - `LastRunTime` 이 월요일 12:30 대 → 발화 확인
   - `LastTaskResult` **0** = 전건 성공/스킵, **1** = 일부 실패, **2** = 전제 불충족
3. **stdout(실패 목록)은 별도 파일에 있다** — `logs\task-convert-YYYYMMDD.log`.
   실패가 있으면 여기에 `실패 목록:` 과 파일명이 남는다.
4. 발화하지 않았다면 확인할 것: 12:30에 **로그온 상태였는지**(잠금 화면은 로그온 상태로 간주),
   절전/최대 절전 상태는 아니었는지. `State` 가 `Ready` 인지도 확인:
   ```powershell
   Get-ScheduledTask -TaskName "kdocrag-convert" | Select-Object State
   ```

> 현재까지 **수동 트리거(`Start-ScheduledTask`)로만 검증**됐다. 실제 12:30 자동 발화는 미관측이며
> 위 절차로 인간이 확인한다.

---

## 3. HP 15-fc1061AU 이식 시 변경점

이 저장소는 장비 의존 값을 전부 `spec/paths.md` 에 모아뒀다. 이식 시 바뀌는 것은 **런타임과 오프로딩뿐**이다.

| 항목 | HP ProBook 460 G11 (현재) | HP 15-fc1061AU |
|---|---|---|
| GPU | NVIDIA RTX 2050 (VRAM 4GB) | AMD Radeon 통합 그래픽 |
| **llama.cpp 런타임** | **CUDA 12.4 빌드** (`runtime\`) | **Vulkan 빌드로 교체** (`llama-bXXXXX-bin-win-vulkan-x64.zip`) |
| **chat 오프로딩** | `-ngl 99` (전부 GPU) | **`-ngl 0`** (CPU 전용) |
| embed 오프로딩 | `-ngl 0` (원래 CPU 고정) | 그대로 `-ngl 0` |
| 포트 | 8090 / 8091 | **동일** |
| alias | `qwen3-4b` / `bge-m3` | **동일** |
| AnythingLLM 설정 | 청크 512/80, Generic OpenAI, LanceDB | **전부 동일** |
| 모델 파일 | Qwen3-4B Q4_K_M / bge-m3 Q8_0 | **동일** |

### 이식 절차

1. llama.cpp **Vulkan 빌드**를 받아 `runtime\` 에 전개한다 (CUDA 빌드 파일은 지우거나 별도 폴더로).
   같은 릴리스의 `llama-<태그>-bin-win-vulkan-x64.zip` 을 쓴다. cudart zip 은 불필요.
2. `spec/paths.md` 의 `QWEN_GGUF` / `BGE_M3_GGUF` / `PYTHON` / `KORDOC_CMD` 를 새 장비 경로로 고친다.
3. `scripts\serve_models.ps1` 을 **`-NglChat 0`** 으로 실행한다:
   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\serve_models.ps1 -NglChat 0
   ```
   기본값(99)을 쓰려면 스크립트의 `$NglChat` 기본값을 0으로 바꾼다.
4. `--flash-attn on` / `--cache-type-k/v q8_0` 가 Vulkan·CPU 경로에서 문제가 되면
   해당 플래그만 제거한다. **제거했으면 DECISIONS.md 에 기록할 것.**
5. AnythingLLM 은 재설치 후 `DECISIONS.md`의 "[M3] AnythingLLM 설정 확정값" 표대로 다시 설정한다.
   설정 순서(임베더·청크 → 문서 투입)를 지킬 것.
6. `node scripts\golden_roundtrip.mjs` (GV-1) → PASS 확인이 이식 성공의 최소 기준이다.

**성능 기대치**: 현재 장비(CUDA, `-ngl 99`)에서 **평균 30.05 tok/s**.
CPU 전용(`-ngl 0`)은 이보다 크게 느려진다. 기준선 재측정:
```powershell
powershell -ExecutionPolicy Bypass -File scripts\bench_tokps.ps1
```

---

## 4. 스크립트 목록

| 스크립트 | 용도 |
|---|---|
| **`Start-LocalRAG.bat`** | (루트) 더블클릭 기동 — 서버 + AnythingLLM |
| **`Stop-LocalRAG.bat`** | (루트) 더블클릭 종료 — 8090/8091만 |
| `scripts\convert_office.py` | 인박스 → 마크다운 변환 (원장·실패 분류) |
| `scripts\serve_models.ps1` | llama-server 2인스턴스 기동 |
| `scripts\stop_models.ps1` | 8090/8091 만 안전 종료 |
| `scripts\register_task.ps1` | 작업 스케줄러 등록 (`-RunNow` / `-Unregister`) |
| `scripts\golden_roundtrip.mjs` | GV-1 라운드트립 골든 벡터 |
| `scripts\golden_samples.mjs` | GV-2/GV-3 셀 값 대조표 생성 |
| `scripts\gv2_crosscheck.mjs` | 크로스 포맷 대조 + 한글 깨짐 검사 |
| `scripts\make_gv3_fixture.mjs` | GV-3 실패 분류 픽스처 생성 |
| `scripts\gv4_embedding.mjs` | GV-4 임베딩 결정성 + 차원 확인 |
| `scripts\gv5_offline_check.ps1` | GV-5 콘텐츠 오프라인성 측정 |
| `scripts\bench_tokps.ps1` | 생성 속도 기준선 측정 |
| `scripts\anythingllm_query.mjs` | 워크스페이스 질의 + 인용 청크 덤프 |

**`.ps1` 은 반드시 UTF-8 BOM 으로 저장할 것.** BOM 이 없으면 PowerShell 5.1 이 ANSI 로 읽어
한글이 깨지고 파서 오류가 난다.

---

## 5. 알려진 제약

- **VRAM 4GB** — 다른 llama-server 와 동시 구동 불가. LocalDesk 등을 먼저 내려야 한다.
- **PPTX 미지원** — kordoc 이 처리하지 않는다. `_failed\unsupported\` 로 분류만 된다.
- **OCR 비범위** — 스캔 PDF 는 처리하지 않는다.
- **같은 표 안의 유사한 행을 첫 질문에서 구분하지 못할 수 있다** — 4B 모델의 생성 한계.
  검색은 정상이므로 인용 청크에는 정답이 있다 (`EVAL.md` 부록 C).
- 평가는 **문서 2건 규모**에서만 수행됐다. 대량 문서 환경의 정확도는 미검증.
- 무이력 기준 평가 점수는 **4/5** (환각 0). 자세한 근거는 `EVAL.md` 부록 C.

---

## 6. 라이선스 및 서드파티 고지

이 저장소의 스크립트·문서는 **MIT License** (Copyright © 2026 Kim-Hakseong) 로 배포한다.
전문은 [`LICENSE`](LICENSE) 참조.

이 프로젝트는 아래 소프트웨어·모델을 **직접 포함하지 않고, 설치 시점에 각 배포처에서 내려받아**
사용한다. 각각의 라이선스는 해당 배포처를 따른다.

| 구성요소 | 역할 | 라이선스 | 출처 |
|---|---|---|---|
| **kordoc** | HWP/HWPX/DOCX/XLSX/PDF → 마크다운 변환 | MIT | [github.com/chrisryugj/kordoc](https://github.com/chrisryugj/kordoc) (npm `kordoc`) |
| **llama.cpp** (`llama-server`) | 로컬 LLM·임베딩 추론 서버 | MIT | [github.com/ggml-org/llama.cpp](https://github.com/ggml-org/llama.cpp) — 릴리스 `b10298` 바이너리 사용 |
| **AnythingLLM Desktop** | RAG 프론트엔드 (채팅·청킹·인용 UI) | 별도 제품 | [anythingllm.com](https://anythingllm.com) — **이 저장소가 배포하지 않는다.** 사용자가 직접 설치하는 독립 애플리케이션이며 라이선스·약관은 Mintplex Labs 를 따른다 |
| **Qwen3-4B-Instruct-2507** (Q4_K_M GGUF) | 채팅 모델 | Apache-2.0 | [huggingface.co/Qwen/Qwen3-4B-Instruct-2507](https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507) · GGUF: [Qwen3-4B-Instruct-2507-GGUF](https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507-GGUF) |
| **BGE-M3** (Q8_0 GGUF) | 임베딩 모델 (1024차원) | MIT | [huggingface.co/BAAI/bge-m3](https://huggingface.co/BAAI/bge-m3) · GGUF: [ggml-org/bge-m3-Q8_0-GGUF](https://huggingface.co/ggml-org/bge-m3-Q8_0-GGUF) |

- `setup.ps1` 이 위 자산을 내려받아 `runtime\` 과 `models\` 에 놓는다. 두 폴더는 `.gitignore` 대상이라
  저장소에는 포함되지 않는다.
- 모델 가중치의 사용 조건(상업적 이용 등)은 **각 모델 카드의 라이선스를 직접 확인할 것.**
  이 저장소는 모델을 재배포하지 않으며, 링크와 무결성 해시만 제공한다.
