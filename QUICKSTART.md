# QUICKSTART — 10분 설치 가이드

한글 문서(HWP/HWPX/DOCX/XLSX/PDF)를 **인터넷 없이** 검색·질의하는 로컬 RAG 환경을 만든다.
문서 내용은 이 PC 를 벗어나지 않는다.

소요: 설치 5분 + 다운로드 5~15분(회선 속도에 따라, 약 3.9GB) + AnythingLLM 설정 3분.

---

## 0. 전제 조건

| 항목 | 요구 | 확인 방법 |
|---|---|---|
| OS | Windows 10/11 (64bit) | |
| **Node.js** | **18 이상** | `node --version` → 없으면 [nodejs.org](https://nodejs.org) LTS 설치 |
| **Python** | **3.10 이상** | `python --version` → 없으면 [python.org](https://www.python.org/downloads/) 설치 시 **"Add python.exe to PATH" 체크** |
| 디스크 | **6GB 이상 여유** | 모델 2.9GB + 런타임 1.1GB + 작업공간 |
| GPU | 없어도 됨 | NVIDIA 있으면 자동으로 CUDA 빌드를 쓴다. 없으면 Vulkan/CPU |
| RAM | 16GB 권장 | GPU 없이 CPU 로만 돌리면 8GB 로는 빠듯하다 |

> Node·Python 을 방금 설치했다면 **PowerShell 창을 새로 열어야** PATH 가 잡힌다.

---

## 1. 설치 (setup.ps1)

```powershell
git clone https://github.com/Kim-Hakseong/local-rag.git
cd local-rag
powershell -ExecutionPolicy Bypass -File setup.ps1
```

`setup.ps1` 이 하는 일:

1. 전제 점검 (Node / Python / 디스크)
2. `npm install -g kordoc` — 문서 변환기
3. **GPU 감지** → NVIDIA 면 CUDA 빌드, 아니면 Vulkan 빌드
4. llama.cpp `b10298` 런타임을 `runtime\` 에 전개
5. 모델 2개를 `models\` 에 내려받고 **sha256 대조** (이미 있고 해시가 맞으면 건너뜀)
6. `spec\paths.md` 생성 — 모든 스크립트가 읽는 단일 출처
7. **자가검증** — 서버 기동 → `/v1/models` → 임베딩 1024차원 → GV-1 라운드트립

마지막에 **`SETUP COMPLETE`** 가 나오면 성공이다. 실패하면 **몇 단계에서 왜** 실패했는지 출력된다.

- 중간에 끊겨도 다시 실행하면 이어받는다. 이미 받은 파일은 해시만 확인하고 건너뛴다.
- VRAM 이 부족해 기동이 실패하면 `spec\paths.md` 의 `NGL_CHAT` 을 `28` → `0` 으로 낮추고 다시 실행한다.

---

## 2. AnythingLLM 설치

이 저장소가 배포하지 않는 **독립 제품**이다. 직접 받아 설치한다.

1. [anythingllm.com](https://anythingllm.com) → **Download for Desktop** → Windows 설치
2. 실행 후 온보딩은 아무 값으로 넘어가도 된다 (다음 장에서 전부 다시 설정한다)

---

## 3. AnythingLLM 설정 — **이 순서를 지킬 것**

> ⚠ **임베더·청크 설정을 먼저 확정하고, 그 다음에 문서를 넣는다.**
> 순서를 어기면 이전 설정으로 만들어진 벡터와 새 설정이 섞여 검색이 조용히 망가진다.
> 이미 문서를 넣은 뒤 설정을 바꿨다면 **문서를 전부 삭제하고 다시 넣어야** 한다.

먼저 **`Start-LocalRAG.bat`** 을 더블클릭해 서버를 띄운다 (설정 화면에서 연결 테스트를 하려면 서버가 떠 있어야 한다).

### 3-1. LLM Provider (`Settings → AI Providers → LLM`)

| 항목 | 값 |
|---|---|
| Provider | **Generic OpenAI** |
| Base URL | `http://127.0.0.1:8090/v1` |
| Chat Model Name | `qwen3-4b` |
| **Token context window** | **`spec\paths.md` 의 `CTX_CHAT` 과 같은 값** |
| **Max Tokens (Token Limit)** | **`spec\paths.md` 의 `CTX_CHAT` 과 같은 값** |
| API Key | 아무 문자열 (예: `sk-local`) — 로컬 서버는 검사하지 않는다 |

`CTX_CHAT` 은 `setup.ps1` 이 **GPU VRAM 총량을 보고 자동으로 정한다.**

| VRAM | `CTX_CHAT` |
|---|---|
| 6GB 미만 (예: RTX 2050 4GB) | `6144` |
| 6GB 이상 (예: RTX 4060 8GB) | `16384` |
| NVIDIA GPU 없음 (CPU) | `4096` |

설치가 끝난 뒤 `spec\paths.md` 를 열어 실제 값을 확인하고 그 숫자를 넣으면 된다.
**서버보다 큰 값을 넣으면 긴 대화에서 잘리거나 오류가 난다.** 반드시 같은 값으로 맞출 것.

> ⚠ **ctx 가 크다고 긴 문서를 통째로 요약시키지 말 것.**
> "이 문서 전체를 요약해줘" 같은 요청은 ① 느리고(토큰 수만큼 선형으로 증가)
> ② 4B 모델에서는 앞부분에 치우친 부실한 요약이 나오기 쉽다.
> 이 시스템은 **"어디에 무엇이 적혀 있는지 찾아 답하는" 조회형 질문에 맞춰져 있다.**
> ctx 를 키운 목적은 요약이 아니라 **검색된 청크 여러 개와 대화 맥락을 함께 담기 위한 것**이다.

### 3-2. Embedder (`Settings → AI Providers → Embedder`)

| 항목 | 값 |
|---|---|
| Provider | **Generic OpenAI** |
| Base URL | `http://127.0.0.1:8091/v1` |
| Embedding Model | `bge-m3` |
| Max embedding chunk length | `2048` |
| API Key | 아무 문자열 |

### 3-3. 청킹 (`Settings → Tools → Text Splitter & Chunking`)

| 항목 | 값 |
|---|---|
| **Text Chunk Size** | **512** |
| **Text Chunk Overlap** | **80** |

### 3-4. Vector Database

기본값 **LanceDB** 그대로 둔다 (내장, 로컬 파일).

### 3-5. 워크스페이스 생성 + 채팅 설정

1. 새 워크스페이스를 만든다 — 이름 `kdocs` (아무 이름이나 가능)
2. 워크스페이스 **⚙ Settings → Chat Settings** 에서:

| 항목 | 값 | 이유 |
|---|---|---|
| Chat mode | **Query** | `Chat` 이면 문서 없이도 답을 지어낸다. `Query` 는 문서 근거가 없으면 없다고 답한다 |
| **Chat History** | **2** | **가장 중요.** 기본값 20 이면 앞선 대화가 새 검색 결과를 덮어써 정답률이 크게 떨어진다 (실측 4/7 → 7/7) |
| Document similarity threshold | `Medium (0.25)` 또는 기본값 | |
| Max context snippets | `4` | |

> `Chat History` 를 **0 으로 설정할 수는 없다.** AnythingLLM 내부에서 0 이 20 으로 되돌려진다.
> 실용 최소값이 **2** 다.

### 3-6. System Prompt (워크스페이스 ⚙ Settings → Chat Settings)

값을 답할 때 **원문을 인용하도록** 강제한다. 아래를 그대로 붙여넣는다.

```
너는 문서 조회 도우미다. 규칙:
1) 제공된 컨텍스트(문서 발췌)에 있는 내용만으로 답한다.
2) 객체 인덱스·파라미터·수치·속성을 답할 때는 반드시 컨텍스트의 해당 문장을 원문 그대로 인용한 뒤 설명한다.
3) 컨텍스트에 없는 내용은 '문서에서 확인되지 않습니다'라고 답하고, 사전지식으로 추측해 채우지 않는다.
4) 컨텍스트와 너의 사전지식이 충돌하면 무조건 컨텍스트(문서)를 따른다.
5) 표를 재구성해 제시하지 않는다. 원문 표의 해당 행만 인용한다.
```

| 규칙 | 목적 |
|---|---|
| 1 | 문서 밖 지식으로 답을 채우지 않게 한다 |
| **2** | **값·인덱스는 근거 문장을 함께 내놓게 한다** (가장 중요) |
| 3 | 모르면 모른다고 하게 한다 |
| 4 | 사전지식과 문서가 충돌할 때 **문서를 이기게** 한다 |
| 5 | 표를 재구성하다 행이 밀리는 것을 막는다 |

적용 후 실측 예 — 값 질문에 근거 문장이 따라온다:

```
- 음수 한계값 (Negative limit)은 0x607B.01 = –2048 …
  원문 인용: "■ Negative limit (0x607B.01) = –2048"
```

기본 프롬프트와 비교했을 때 **과도한 거부 등 품질 저하는 없었다** (같은 질문에 같은 성패).

---

## 4. 문서 넣고 변환하기

### 4-1. 원본을 인박스에 넣는다

```
local-rag\office-inbox\      ← 여기에 hwp / hwpx / docx / xlsx / pdf 를 넣는다
```

지원: `.hwp .hwpx .hwpml .pdf .docx .xlsx .xls`
미지원: `.pptx` (자동으로 `_failed\unsupported\` 로 분류된다)

> 웹·메일·메신저로 받은 파일이면 넣기 전에 차단 해제를 권한다 (비용 0, 부작용 없음):
> ```powershell
> Get-ChildItem office-inbox -File | Unblock-File
> ```

### 4-2. 변환

```powershell
python scripts\convert_office.py
```

- `office-md\<이름>.md` 가 생긴다. 이게 AnythingLLM 에 넣을 파일이다.
- `<이름>.md.meta.json` 도 같이 생긴다 — **이건 넣지 않는다** (원본 추적용 메타데이터).
- 같은 문서의 `.hwp` 와 `.hwpx` 를 둘 다 넣으면 `.hwpx` 만 변환한다 (중복 방지).
- 이미 변환한 파일은 건너뛴다. 원본을 수정하면 자동으로 다시 변환한다.

매일 자동 변환을 걸고 싶으면 (평일 12:30, 로그온 상태에서만):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\register_task.ps1
```

### 4-3. AnythingLLM 에 업로드

워크스페이스 → **Upload a document** → `office-md\*.md` 를 드래그앤드롭 → **Save and Embed**

문서 수만큼 임베딩이 돌고 끝나면 질의할 수 있다.

---

## 5. 질의 요령 — 3수칙

이 3가지만 지키면 정답률이 확 올라간다. 전부 실측 근거가 있다 (`EVAL.md` 부록 D).

### ① 문서에 있는 표현을 그대로 쓴다 (조회형으로 묻는다)

검색은 의미 유사도로 하지만, **고유명사·번호·항목명을 그대로 넣을수록** 정확해진다.

- 좋음: `EQ-0219 장비의 차기 교정일과 상태는?`
- 나쁨: `그 온도 챔버 언제 다시 점검해야 해?`
- **피할 것**: `이 문서 전체를 요약해줘` — 느리고, 4B 모델에서는 앞부분에 치우친 요약이 나온다.
  이 시스템의 강점은 **요약이 아니라 조회**다.

### ② 대화가 길어지면 **New Thread** 를 연다

가장 중요하다. 앞에서 "파일 목록 보여줘", "이 문서 요약해줘" 같은 **긴 답변**을 받은 뒤
사실을 물으면, 모델이 자기가 앞서 만든 부정확한 요약을 다시 읽고 **"정보가 없다"** 고 답한다.

| 상황 | 7문항 정답률 |
|---|---|
| 잡담·요약이 쌓인 긴 스레드 | **4/7** |
| Chat History 2 + 새 스레드 | **7/7** |

**주제가 바뀌면 새 스레드.** 답이 이상하면 **인용 청크(Citations)를 먼저 확인** — 거기 정답이
있는데 답변이 "없다"고 하면 이력 오염이므로 새 스레드에서 다시 물으면 해결된다.

### ③ 문서를 갱신하면 **다시 등록**한다

원본을 고쳐 다시 변환했다면, AnythingLLM 에서 **기존 문서를 제거하고 새 md 를 다시 업로드**해야
한다. 파일명이 같아도 자동으로 갱신되지 않는다.

### ④ 값을 물을 땐 인용을 요구하고, 모델 말보다 원문을 믿는다

- 값·인덱스·파라미터는 **"원문 인용해서"** 를 붙여 묻는다. 인용이 없으면 아직 믿을 단계가 아니다.
- 모델이 만들어 준 **표는 "어디를 볼지" 찾는 용도**다. 값은 인용 청크(Citations)에서 확인한다.
- 모델이 **"문서가 틀렸다"** 고 하면 **틀린 건 모델이다.** 이 시스템의 정답은 언제나 문서다.

> ⚠ **큰 문서 하나가 검색을 독점할 수 있다.** 437KB 매뉴얼 1건을 넣었더니 전체 청크의 97% 를
> 차지해, 다른 작은 문서에 대한 질문이 검색 단계에서 밀리는 것을 실측했다.
> `Max context snippets`(topN) 는 문서가 아니라 **청크** 기준이기 때문이다.
> **주제가 다른 대용량 문서는 워크스페이스를 나누는 것**이 가장 확실하다.

---

## 6. 문제 해결

| 증상 | 확인 / 조치 |
|---|---|
| **변환 실패** | `office-inbox\_failed\` 를 본다. `encrypted\`=암호 걸린 파일, `unsupported\`=미지원 확장자, `error\`=파싱 실패. 자세한 사유는 `logs\convert-YYYYMMDD.log` |
| 변환이 수 분씩 걸리다 실패 (`NO_OUTPUT`) | ① 잠시 후 그냥 다시 실행 (실측에서 저절로 정상화됨) ② `Get-ChildItem office-inbox -File \| Unblock-File` ③ `_failed\error\` 의 파일을 `office-inbox\` 로 되돌리면 재시도된다 |
| **포트 충돌** (8090/8091 이미 사용 중) | `powershell -ExecutionPolicy Bypass -File scripts\stop_models.ps1` 로 정리 후 다시 기동. **`taskkill /im llama-server.exe` 는 쓰지 말 것** — 다른 프로그램의 인스턴스까지 죽는다 |
| 서버 기동 실패 / VRAM 부족 | `spec\paths.md` 의 `NGL_CHAT` 을 `28` → `0` 으로, 그래도 안 되면 `CTX_CHAT` 을 `4096` → `3072` 로 낮춘다. 로그: `logs\chat-*.err.log` |
| AnythingLLM 이 모델을 못 찾음 | `Start-LocalRAG.bat` 으로 서버가 떠 있는지 확인. 브라우저에서 `http://127.0.0.1:8090/v1/models` 가 `qwen3-4b` 를 반환해야 정상 |
| 답변이 "정보가 없다"만 반복 | 위 **질의 요령 ②** — New Thread 를 열고 다시 물어본다. Chat History 가 2 인지도 확인 |
| 답이 느림 | GPU 없이 CPU 로 돌면 느리다. `spec\paths.md` 의 `NGL_CHAT` 이 `0` 이면 GPU 미사용 상태다 |

---

## 7. 평소 사용

| 동작 | 방법 |
|---|---|
| 시작 | **`Start-LocalRAG.bat`** 더블클릭 (서버 + AnythingLLM 자동 실행) |
| 종료 | **`Stop-LocalRAG.bat`** 더블클릭 (AnythingLLM 은 직접 닫는다) |
| 바탕화면 바로가기 | `.bat` 우클릭 → 보내기 → 바탕 화면에 바로 가기 만들기 |

더 자세한 운영 내용은 [`README.md`](README.md), 설계 근거는 [`DESIGN.md`](DESIGN.md),
평가 결과와 한계는 [`EVAL.md`](EVAL.md) 를 참고할 것.
