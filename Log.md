# Log.md

(Ralph 작업 로그)

## 2026-08-09 — M1 시작

### 환경 점검

| 항목 | 값 | 판정 |
|---|---|---|
| Node | v22.14.0 | OK (18+) |
| npm | 10.9.2 | OK |
| Python | 3.12.10 (`<USER>\AppData\Local\Programs\Python\Python312\python.exe`) | OK (3.10+) |
| SSD 여유 (C:) | 61.6 GB | OK |
| ExecutionPolicy | CurrentUser=RemoteSigned / Process=Bypass | OK (우회 불필요) |
| git | 2.49.0.windows.1 | OK |
| `spec/paths.md` | 미기입 (플레이스홀더) | **스펙 게이트 미충족** |
| `samples\` | 비어 있음 | **스펙 게이트 미충족** |
| `spec/eval_questions.md` | 템플릿만 | **스펙 게이트 미충족** |
| `C:\Haku\kdocrag` | 미존재 | M4에서 생성 예정 |
| 포트 8080 | LISTENING (PID 13356) | LocalDesk 추정 — 비간섭 |
| 포트 8090 / 8091 | 미사용 | OK |
| llama-server | PID 32344 실행 중 | LocalDesk 추정 — 비간섭 |

### 작업 내역

1. `npm install -g kordoc` → kordoc **4.7.2** 설치 (179 packages, 33s).
2. `where kordoc` → `<USER>\AppData\Roaming\npm\kordoc.cmd` 를 `spec/paths.md` 의
   `KORDOC_CMD` 에 기록.
3. `scripts\gv1_fixture.md` 작성 — 표 2개(4열×4행, 4열×4행) + 서술 문단 2개를 포함한 고정 입력.
4. `scripts\golden_roundtrip.mjs` 작성 — markdownToHwpx → parse → IR 표 셀 값 대조.
5. **GV-1 실행 → PASS** (exit 0). 표 2→2, 셀 36→36, 불일치 0, 경고 0.
6. GV-1 결정성 확인: 2회 실행에서 `roundtrip.out.md` sha256 동일, `roundtrip.hwpx` 는 상이
   (생성 시각 의존 필드 추정 — 코드 확인은 안 함).
7. kordoc CLI 절대경로 호출 스모크: `& kordoc.cmd <hwpx> -o <md>` → exit 0, 1118 bytes 산출.
8. `scripts\golden_samples.mjs` 작성 (GV-2/GV-3 실행기). 현재 `samples\` 가 비어 exit 2 로 차단됨.

### 상태

- **완료**: kordoc 설치 + 절대경로 기록 + CLI 스모크 + GV-1(PASS)
- **차단**: GV-2 / GV-3 — `samples\` 실물 문서 미투입 (인간 입력 필요)
- **차단**: GATE-1 — GV-2 대조표를 제시할 수 없어 인간 검수 불가
- **미착수**: M2~M5

### 미검증 항목 (정직성 기록)

- GV-2 (실물 문서 변환): 샘플 없음 — **실행 안 함**
- GV-3 (암호화 HWP 실패 분류): 샘플 없음 — **실행 안 함**. 스크립트 경로만 작성됨
- GV-4 / GV-5: M2 이후 범위 — 미착수
- HWP 5.x / 구버전 HWP / PDF / DOCX 등 **실제 문서 포맷 변환은 단 한 건도 검증되지 않았다**.
  현재까지 검증된 것은 kordoc 이 스스로 생성한 HWPX 의 라운드트립뿐이다.

---

## 2026-08-09 (2차) — 샘플 투입 후 GV-2 / GV-3 실행

### 입력

`samples\` 3개 (인간 투입):

| 파일 | 크기 | sha256 (앞 12자) |
|---|---|---|
| `2025년+기준+운수업조사+및+기업활동조사+실시.hwp` | 1,903,616 B | `2900868df2a2` |
| `2025년+기준+운수업조사+및+기업활동조사+실시.hwpx` | 1,909,281 B | `c2531f1b7208` |
| `(붙임1)겉표지 있는 보고서(계획서) 서식_보고서 작성 서식 안내.hwpx` | 27,431 B | `f139c0cbc7f8` |

요건 #3(구버전 HWP)·#4(배포용 HWP)는 인간 조달 실패 → **미확보 스킵** 확정.

### 작업 내역

1. `golden_samples.mjs` 에 `--dir` / `--out` 인자 추가 (GV-3 픽스처를 별도 폴더에서 돌리기 위함).
2. **GV-2 실행** → exit 0. 3개 전부 파싱 성공, 표 9/7/7개, warnings 0건.
   요건 #1 문서의 표가 **7개**로 "3개 이상" 요건 충족 확인 (부분 충족 아님).
3. `gv2_crosscheck.mjs` 신규 작성 — 크로스 포맷 대조 + 한글 깨짐 검사.
4. 크로스 포맷 대조: 정규화 후 유사도 **98.820%**, 불일치 7구간.
   전수 규명 결과 → 원본 자체 차이 1건 + 강조 마커 방출 차이 6건. **kordoc 변환 오류 0건.**
   - hwpx XML 원문과 hwp CFB 스트림(inflateRaw + UTF-16LE)을 **직접 디코드해** 원본 차이 확정.
   - `**` 제거 후 재비교 → 40줄 중 불일치 1줄(원본 차이 그 한 건).
5. 한글 깨짐 검사: 마크다운 기준 3개 파일 전부 U+FFFD/PUA/단독자모/제어문자 **0건**.
   IR 대비 스캔에서 `(붙임1)…서식.hwpx` 의 PUA `U+F03DA` 3자가 마크다운 방출 시 **무경고 소실** 발견.
6. **GV-3 대체 픽스처 6종 생성** (`make_gv3_fixture.mjs`) 후 실행 → exit 1 (성공 1/실패 5).
   `UNSUPPORTED_FORMAT` / `PARSE_ERROR`×2 / `ENCRYPTED` / `NO_SECTIONS` — 전부 구조화 코드, throw 0건.
   변종 B(첫 섹터 훼손)는 **무효 훼손**이어서 파싱 성공, 산출물이 원본과 sha256 동일 → 대조군으로 기록.
7. `scripts/gv3/` 를 `.gitignore` 에 추가 (실물 문서 파생 바이너리).
8. `spec/paths.md` 검증 → **QWEN_GGUF / LLAMA_SERVER / PYTHON 미기입 확인**. 자동 기입하지 않음.
   디스크 탐색으로 후보 3종을 찾아 존재·크기·`--version` 확인 후 paths.md 하단에 기록.
9. bge-m3 GGUF 후보 2종 조사 (크기·sha256·라이선스). **다운로드 미실행** — GO 이후.

### 상태

- **완료**: GV-1(PASS) / GV-2(파싱 3/3) / GV-3 대체안(분류 5/5 구조화 코드)
- **정지**: GATE-1 인간 판정 대기
- **차단**: M2 — `spec/paths.md` 3개 항목 미기입
- **미착수**: M3~M5

### 이번 회차 미검증 항목

- `_failed\` 실제 이동 (M4 convert_office.py 산출물) — 에러코드 계약만 검증됨
- 실제 암호화/배포용 HWP 복호화 — 플래그 분류만 검증
- 구버전 HWP / PDF / DOCX / XLSX 경로 — 샘플 없음
- bge-m3 임베딩 차원 1024 — M2 스모크 대상
- Vulkan 빌드에서 `--flash-attn`, `--cache-type-k/v q8_0` 지원 여부 — M2 스모크 대상

---

## 2026-08-09 (3차) — GATE-1 GO / M2 로컬 모델 서빙

### 인간 판정

**GATE-1 GO.** paths.md 3개 항목 인간 확정 (QWEN_GGUF 는 LocalDesk 사본과 sha256 동일 검증을 근거로
독립 폴더 사본으로 변경).

### 작업 내역

1. **paths.md 확정 기입** — QWEN_GGUF / LLAMA_SERVER / PYTHON. 이후 BGE_M3_GGUF /
   CHAT_MODEL_ID / EMBED_MODEL_ID 를 실측값으로 채움.
2. **런타임 소유권 확보** — llama.cpp b10298 `win-cuda-12.4-x64` + `cudart` 다운로드
   (250,457,449 B / 391,443,627 B, 크기 정확 일치) → `runtime\` 전개 (55 파일, 1,104.8 MB).
   `--version` → `10298 (15586e2d7)`. `--list-devices` → `CUDA0: RTX 2050`.
   **CUDA 초기화 성공 → Vulkan 폴백 미발동.**
3. **bge-m3 다운로드** — `models\bge-m3-q8_0.gguf` 634,553,760 B,
   sha256 `aa473d51…a173` **기대값 일치**.
4. **8081 종료** — PID 32344, 이미지 경로 확인 후 해당 PID만 종료.
   30초 관찰(5초×6) 재기동 없음. 부모 bash(29236)는 이미 종료 상태(고아 프로세스).
   **8080/PID 13356 무변동.**
5. **serve_models.ps1 / stop_models.ps1 / bench_tokps.ps1 / gv4_embedding.mjs 작성.**
6. **스모크 전 항목 통과** — chat 8090 은 DESIGN §4 **기본안 그대로** 기동 성공(OOM 폴백 불필요).
   한국어 응답 정확. embed 8091 차원 **1024**. **GV-4 PASS** (코사인 정확히 1.0, 비트 단위 동일).
7. **tok/s 실측** — 평균 **30.05 tok/s** (30.23 / 30.18 / 29.73, 재시도 0).
8. **stop→serve 왕복 실증** — 두 스크립트 실제 동작 확인, 재기동 후 GV-4 재실행 PASS.

### 도중 발견·수정한 문제 3건

| # | 문제 | 원인 | 조치 |
|---|---|---|---|
| 1 | `.ps1` 파서 오류 | PowerShell 5.1 이 BOM 없는 파일을 ANSI 로 읽어 한글 깨짐 | 전 `.ps1` **UTF-8 BOM** 재저장 + 구문 검사 |
| 2 | `/v1/models` 503 | 포트가 모델 로딩 완료 전에 열림 | `serve_models.ps1` 에 `/health` 폴링(최대 180s) 추가 |
| 3 | 벤치 2회차부터 HTTP 400 | **PS 변수 대소문자 비구분** — `$prompt` 대입이 `$PROMPT` 를 정수로 덮어씀 | `$promptTokens` 로 개명. 재시도 로직은 유지하되 재시도 횟수·오류를 결과에 기록 |

> #3은 처음에 "일시적 오류"로 오판하고 재시도부터 넣은 것이 잘못이었다. 실패 본문을 추적한 뒤에야
> 진짜 원인이 드러났다. 원인 미상 상태의 재시도는 오류 은폐가 될 수 있음을 기록해 둔다.

### 현재 상태

- chat `127.0.0.1:8090` (PID 18424), embed `127.0.0.1:8091` (PID 32736) **구동 중**
- VRAM 2,926 / 4,096 MiB (여유 1,040 MiB)
- **정지**: GATE-2 앞. M3(AnythingLLM) 미착수.

### M2 미검증 항목

- **GV-5 오프라인성** — 미실행 (M3 이후). 다만 두 서버 모두 `--host 127.0.0.1` 바인딩은 확인됨
- `--flash-attn on` / KV q8_0 의 **품질 영향** — 미측정 (기동·응답 정상만 확인)
- AnythingLLM 설치·연동 — 전부 미착수
- M4 hwpx 우선 규칙 — 요구사항으로 기록만, **미구현**

---

## 2026-08-09 (4차) — M3 AnythingLLM 설치/설정

### 인간 결정

설치 승인 / 임베더는 PRD대로 Generic OpenAI 우선 / 모델 alias 도입.

### 작업 내역

1. **alias 적용** — `--alias qwen3-4b`, `--alias bge-m3` 로 재기동.
   `/v1/models` → `qwen3-4b` / `bge-m3`. `serve_models.ps1` + `paths.md` 갱신.
2. **AnythingLLM 설치** — 공식 CDN 인스톨러 394,525,080 B,
   sha256 `11478D57…3944`, **Authenticode 서명 Valid (Mintplex Labs Inc)**.
   `/S` 무인 설치 → **1.15.0-r2**. 내부 백엔드 `127.0.0.1:3001`.
3. **설정 확정** (임베더·청크 → 문서 순서 엄수) — LLM `generic-openai`/8090/`qwen3-4b`,
   임베더 `generic-openai`/8091/`bge-m3`, **청크 512/80**, LanceDB, 워크스페이스 `kdocs`.
4. **텔레메트리 차단** — `DisableTelemetry=true`, `NetworkDiscovery=false` 후 재시작.
5. **문서 투입 2건** (hwpx 변환본 + 붙임1 서식. **hwp 변환본 제외 = hwpx 우선 규칙 첫 적용**)
   → 임베딩 3.3s, **9 벡터**. splitter 로그에 `chunkSize:512, chunkOverlap:80` 확인.
6. **스모크 질의 통과** — 답변·인용 모두 기대 근거와 일치.
7. `scripts\anythingllm_query.mjs` 신규 (SSE 파싱 질의기, M5 평가 재사용).

### 도중 발견한 문제 4건

| # | 문제 | 원인 | 조치 |
|---|---|---|---|
| 1 | 인스톨러 `-Wait` 10분 타임아웃 | 설치 후 앱 자동 실행 프로세스를 대기한 것으로 **추정**(미확인) | 설치는 정상 완료. 상태 확인으로 진행 |
| 2 | `update-env` 500 | `EmbeddingModelMaxChunkLength` 를 **정수**로 전송 (`n[c].includes is not a function`) | 문자열 `"2048"` 로 전송 |
| 3 | **청크 설정이 조용히 무시됨** | `update-env` 가 200 + `newValues:{}` 를 주지만 저장 안 함 (SQLite 바이트 검색으로 확인) | 실제 경로 `POST /api/admin/system-preferences` + snake_case 키 |
| 4 | 스모크가 **에이전트로 라우팅** | 신규 워크스페이스 기본 `chatMode=automatic` | `chatMode=query` 로 고정 (검색 튜닝 노브는 미변경) |

> #3은 API가 성공을 반환하면서 아무 일도 안 한 사례다. 응답만 믿었으면 **청크 512/80이 적용되지
> 않은 채 문서를 투입**했을 것이다. DB를 직접 확인해서 잡았다.

### 현재 상태

- llama-server chat 8090 / embed 8091 구동 중
- AnythingLLM 1.15.0-r2 구동 중, 워크스페이스 `kdocs`, 9 벡터
- **정지**: GATE-2 인간 판정 대기. M4 미착수.

### M3 미검증·미해결 항목

- **GV-5 오프라인성 — "완전 무통신" 주장 불가.** 최초 부팅 시 텔레메트리 `server_boot` 가
  **실제 발신**됐고, 차단 적용 시에도 `telemetry_disabled` 이벤트가 1회 발신됐다.
  `[ContextWindowFinder] Remote model map synced` 원격 동기화의 차단 옵션은 **찾지 못함**
- 앱이 **번들 Ollama(`llm.exe`)를 11434 에 자동 기동** — 사용하지 않으나 프로세스는 상주. 미조치
- `GenericOpenAiEmbeddingMaxConcurrentChunks=500` 기본값 유지 — **대량 문서에서의 동작 미검증**
- 답변 품질은 **질의 1건**만 확인. 다양성·환각 내성은 M5 평가 대상

---

## 2026-08-09 (5차) — M4 파이프라인 자동화 + M5 RAG 평가

### 인간 결정 (GATE-2 GO)

스모크 인용 합격 / `chatMode=query` 수용 / GV-5를 **콘텐츠 오프라인성**으로 재정의 /
번들 Ollama는 설정 있으면 끄고 없으면 기록만.

### M4 작업 내역

1. **DESIGN.md §7 재작성** — GV-5 기준을 "완전 무통신" → "콘텐츠 오프라인성"으로 교체.
   합격 기준·검증 절차·기록된 하우스키핑 트래픽 표를 명시.
2. **번들 Ollama**: 비활성화 설정 키를 찾지 못했으나, `LLM_PROVIDER=generic-openai` 로
   바꾼 뒤로는 **아예 기동되지 않음**을 실측 확인 (프로세스 0건, 11434 미리스닝).
3. **`convert_office.py` 구현** — 표준 라이브러리만, kordoc `.cmd` 절대경로 + 인자 리스트,
   `--format json`. hwpx 우선 규칙 / GV-3 에러코드 매핑 / 원장 sha256 / front-matter /
   본문 50자 미만 실패 / 날짜별 로그 / 종료코드 0·1·2. `py_compile` 통과.
4. **파이프라인 실증** — 1회차: 변환 2 / 쌍스킵 1 / `_failed\encrypted\` 1 / `_failed\unsupported\` 1,
   종료코드 1. 2회차: 전건 스킵, 종료코드 0. **원장 동작 확인.**
5. **산출물 개행 LF 고정** — `write_text` 의 CRLF 변환으로 산출 해시가 불안정했다.
   수정 후 GV-2 산출물과 **본문 바이트 완전 동일** 확인.
6. **`register_task.ps1`** — `kdocrag-convert`, 평일 12:30(DaysOfWeek 62), LogonType Interactive,
   PYTHON 절대경로. 등록 후 수동 트리거 + **신규 파일 투입 재트리거로 실제 변환까지 실증**.

### M5 작업 내역

7. `spec/eval_questions.md` 5문항 확인(인간 작성 완료) → 평가 실행.
8. **5문항 전부 실행 → 5/5 합격, 환각 0, 인용 근거성 5/5.** `EVAL.md` 작성.
9. **GV-5 측정** — `gv5_offline_check.ps1` 작성 후 변환+질의 중 45초/15회 샘플링.
   **llama-server 외부 커넥션 0건.**

### 도중 발생한 문제 2건

| # | 문제 | 원인 | 조치 |
|---|---|---|---|
| 1 | 평가 1차 시도 전건 `fetch failed` | AnythingLLM 프로세스가 종료돼 있었음 (원인 미확인, 내가 종료한 것 아님) | 재기동 → 워크스페이스/벡터 상태 그대로 복원 확인 후 재실행 |
| 2 | office-md 본문이 GV-2 산출물보다 김 | Python 텍스트 모드가 `\n`→`\r\n` 변환 | `newline=""` 로 LF 고정, 재생성 후 바이트 동일 확인 |

### 현재 상태

- llama-server 8090/8091, AnythingLLM 1.15.0-r2 구동 중
- 작업 스케줄러 `kdocrag-convert` 등록됨 (State Ready)
- **정지**: GATE-3(최종 감사) 대기. 산출물 `EVAL.md` 완료.

### 미검증·미해결 (GATE-3 감사 대상)

- **GV-5의 TLS 페이로드 미확인** — AnythingLLM의 `anythingllm.com:443` 커넥션 내용은 추정
- 문서 **2건 규모** 평가 — 실사용 규모 검색 정확도 미검증
- **HWP 5.x 산출물로는 RAG 평가 안 함** (hwpx 우선 규칙 때문)
- PDF/DOCX/XLSX/구버전 HWP — 변환조차 미검증 (샘플 없음)
- 실제 암호화/배포용 HWP 복호화 — 플래그 분류만 검증
- 스케줄러 **실제 12:30 자동 발화는 미관측** (수동 트리거로만 검증)
- `C:\Haku\kdocrag` 에 테스트 잔여물(`신규투입테스트`, `gv5테스트`) 존재

---

## 2026-08-09 (6차) — GATE-3 조건부 GO / 잔여 작업 및 종결

### 인간 판정

GATE-3 **조건부 GO**. M1~M5 전 마일스톤 합격. 미검증 9건을
즉시 해소(#2·#3·#6·#9) / 실사용 해소(#1·#7·#8) / 수용 리스크(#4·#5)로 처분.

### 잔여 작업 결과

1. **#2 hwp 단독 검증** — 가설 **기각**. hwp와 hwpx는 동일 조건에서 동일하게 동작했다.
   대신 **front-matter가 Q1을 3/3 실패시키는 신규 결함**을 발견했다.
   임시 워크스페이스 2개 생성 → 통제 비교 → **전부 제거** (`kdocs` 9벡터 무변동).
2. **#3 포맷 스모크** — PDF/DOCX/XLSX **3/3 변환 성공**, 깨짐 0, 경고 0.
   출처 URL은 DECISIONS.md 기록. RAG 미투입.
3. **#9 잔여물 삭제** — 14건 삭제 + 원장 6건 정리. 아래 목록.
4. **#6 스케줄러 확인 절차** — README §2에 로그 경로·기대 라인·`LastTaskResult` 해석으로 문서화.
5. **README.md 신규 작성** — 일상 사용 절차 + HP 15 이식 변경점.

### 삭제한 테스트 잔여물 (14건)

```
C:\Haku\kdocrag\office-inbox\신규투입테스트.hwpx
C:\Haku\kdocrag\office-inbox\gv5테스트.hwpx
C:\Haku\kdocrag\office-inbox\hwp단독검증_운수업조사.hwp
C:\Haku\kdocrag\office-inbox\포맷스모크_docx.docx
C:\Haku\kdocrag\office-inbox\포맷스모크_pdf.pdf
C:\Haku\kdocrag\office-inbox\포맷스모크_xlsx.xlsx
C:\Haku\kdocrag\office-md\신규투입테스트.md
C:\Haku\kdocrag\office-md\gv5테스트.md
C:\Haku\kdocrag\office-md\hwp단독검증_운수업조사.md
C:\Haku\kdocrag\office-md\포맷스모크_docx.md
C:\Haku\kdocrag\office-md\포맷스모크_pdf.md
C:\Haku\kdocrag\office-md\포맷스모크_xlsx.md
C:\Haku\kdocrag\office-inbox\_failed\encrypted\flag-encrypted.hwp
C:\Haku\kdocrag\office-inbox\_failed\unsupported\테스트발표자료.pptx
```

원장에서 제거한 항목 6건: `신규투입테스트.hwpx`, `gv5테스트.hwpx`, `hwp단독검증_운수업조사.hwp`,
`포맷스모크_docx.docx`, `포맷스모크_pdf.pdf`, `포맷스모크_xlsx.xlsx`

**보존한 것**: 실물 샘플 파생 정상 산출물 (운수업조사 hwp/hwpx, 붙임1 + md 2건) — 작동 상태 보존 목적.

### 도중 발생한 문제 1건

| 문제 | 원인 | 조치 |
|---|---|---|
| 정리 후 파이프라인이 `Unexpected UTF-8 BOM` 으로 중단 | 내가 PowerShell `Out-File -Encoding utf8` 로 원장을 저장해 **BOM이 붙음** | BOM 제거 + `load_ledger` 를 `utf-8-sig` 로 보강 |

> 스크립트가 **원장 파손을 조용히 삼키지 않고 중단한 것은 설계대로**다. 내가 만든 오염을 스크립트가 잡아냈다.

### 최종 상태

- `office-inbox` 3건 / `office-md` 2건 + 원장 / `_failed` 0건
- 파이프라인 재실행: 변환 0 / 원장스킵 2 / 쌍스킵 1 / 실패 0, **종료코드 0**
- `kdocs` 워크스페이스 9벡터 무변동, 임시 워크스페이스 0개
- 프로젝트 **종결**

### 종결 시점의 미해결 사항

- **front-matter 검색 오염** — 해결책 4안 제시, 인간 결정 대기 (README에 회피책만 기재)
- 수용 리스크 2건 (#4 실제 암호/배포용 HWP 복호화, #5 GV-5 TLS 페이로드)
- 실사용 해소 3건 (#1 대량 문서 정확도, #7 요약·추론형 질의, #8 대량 임베딩 안정성)
- 한글 PDF/DOCX/XLSX, 구버전 HWP(3.x) 변환 미검증

---

## 2026-08-09 (7차) — 사이드카 분리 채택 및 프로젝트 마감

### 인간 결정

front-matter 문제에 대해 **사이드카 분리(A안) 채택**.

### 작업 내역

1. **DESIGN §3 개정 + §3.1 신설** — 산출 md 는 본문만, 메타는 `<스템>.md.meta.json`.
2. **CLAUDE.md 개정** — "front-matter 스키마 불변" → "사이드카 스키마 불변".
3. **`convert_office.py` 수정** — front-matter 제거, 사이드카 생성. 원장 로직 무변경. `py_compile` 통과.
4. **재생성** — 기존 md 삭제 → 원장의 "산출물 부재" 경로로 자연 재변환 (exit 0).
   front-matter 부재 확인, 사이드카 2건 생성, **GV-2 산출물과 바이트 완전 동일** 달성.
5. **회귀 확인 → 예상과 반대 결과.** 사이드카 분리본으로도 Q1 이 3/3 실패했다.

### 중대 정정 — 부록 A 결론 철회

회귀 실패를 추적한 결과 **부록 A 의 인과 결론이 틀렸음**이 드러났다.

- 성공/실패 두 조건의 **인용 청크 본문이 완전히 동일**했다. 차이는 파일명·타임스탬프뿐.
- 남은 변수는 **대화 이력**이었다. `kdocs` 안에 **새 스레드**를 만들어(벡터·설정 동일, 이력만 0)
  Q1 을 물었더니 **3/3 실패**. 같은 워크스페이스에서 이력 유무만으로 결과가 갈렸다.
- **진짜 원인 = 대화 이력 프라이밍.** front-matter 도 hwp/hwpx 도 아니었다.

**방법론 오류**: 부록 A 는 `kdocs`(이력 있음)와 임시 워크스페이스(이력 없음)를 비교하며
이력을 통제하지 않았다. "단일 변수 비교"라고 적었지만 변수가 둘이었다.

### 무이력 재측정 — 진짜 점수 4/5

질문마다 전용 새 스레드로 재측정: Q1 **오답**, Q2·Q3·Q4 정답, Q5 환각 없음.
**4/5, 환각 0, 인용 근거성 5/5.** 기록: `logs/anythingllm/nohistory-eval.json`

드러난 실제 한계: **같은 표 안의 유사한 행을 대화 맥락 없이 구분하지 못한다** (생성 단계 한계).

### 문서 정정

- `EVAL.md` — 부록 C 신설(철회 + 재측정), 앞부분 정정문 2차 수정, §5 갱신
- `DESIGN.md §3.1` — 개정 근거를 "버그 수정"에서 "임베딩 위생"으로 교체
- `convert_office.py` 주석 — 동일 취지로 수정
- `README.md` — 사이드카 안내 추가, 회피책 문단을 **실제 한계 안내**로 교체
- `DECISIONS.md` — 사이드카 채택 + 중대 정정 + 점수 정정 3건 기록

### 사이드카는 유지 (근거 교체)

인과는 뒤집혔지만 front-matter 블록이 독립 청크로 잡혀 유사도 0.5992 로 2순위에 오른 것은
실측 사실이다. 본문 청크 하나가 topN 밖으로 밀렸다. **임베딩 위생 목적으로는 타당**하나
**답변 품질 개선 효과는 입증되지 않았다.**

### 최종 상태

- `office-inbox` 3건 / `office-md` md 2건 + 사이드카 2건 + 원장 / `_failed` 0건
- 워크스페이스 `kdocs` 단독, **9 벡터**, 임시 워크스페이스·스레드 전부 삭제
- 파이프라인 exit 0, `py_compile` 통과, 스케줄러 `kdocrag-convert` Ready
- **DECISIONS 결정 49건**

**M1~M5 종료 — 2026-08-09.** GATE-1/2/3 통과. (이후 8차에서 운영 진입점 추가)

---

## 2026-08-09 (8차) — 운영 진입점 (더블클릭 실행)

### 인간 지시

`Start-LocalRAG.bat` / `Stop-LocalRAG.bat` 생성 + 바탕화면 바로가기.

### 작업 내역

1. **`Start-LocalRAG.bat`** (루트) — 8090/8091 리스닝이면 서버 기동 **건너뜀** →
   두 포트 `/health` 확인 → AnythingLLM 실행(이미 실행 중이면 건너뜀). 창은 `pause` 로 유지.
2. **`Stop-LocalRAG.bat`** (루트) — `stop_models.ps1` 만 호출.
   **AnythingLLM 은 종료하지 않는다.** 타 프로젝트 llama-server(8081 등)도 건드리지 않는다.
3. **바탕화면 `.lnk` 2개** — `WScript.Shell` COM 으로 생성(탐색기 GUI 대신 스크립트라 재현 가능).
4. README §1-1 에 배치 표 + **바탕화면 바로가기 생성 절차** + ASCII 전용 사유 추가.
   §4 스크립트 목록에 배치 2건 추가.

### 도중 발견한 문제 1건 — 배치 파일은 ASCII 전용이어야 한다

한글 메시지·주석으로 작성했더니 cmd.exe 가 `.bat` 의 멀티바이트 바이트를 잘못 파싱해
`'SERVE' is not recognized as an internal or external command` 류로 **실행이 깨졌다.**

- **UTF-8(BOM 없음)과 UTF-8 BOM 둘 다 실패**했다.
- 첫 줄에 `chcp 65001` 을 둬도 소용없다 — 파서가 이미 읽은 바이트 오프셋이 어긋난다.
- CP949 저장도 가능하나 비한국어 Windows 에서 깨지므로 기각.
- → **배치 메시지는 영문, 한글 설명은 README.** 파일 상단 주석에 사유를 남겼다.

### 검증 (4개 실행 경로 전부 실제 실행)

| 경로 | 결과 |
|---|---|
| Start — 서버 구동 중 | `skipping server start` → health OK → 앱 `already running` → exit 0 |
| **Stop** | 8090(PID 1780)·8091(PID 37708) 종료 → **리스닝 0건**, llama-server 0개, **AnythingLLM 8개 생존**, 8080 무변동 |
| Start — 서버 내려간 상태 | 실제 기동(chat 24700 / embed 30444), `/v1/models` → `qwen3-4b`·`bge-m3`, **25.6초** |
| Start — 앱 종료 상태 | `launching...` → AnythingLLM 기동, 백엔드 `/api/ping` **online** |

바로가기 2개 모두 `TargetPath` 실존 `True`, `WorkingDirectory` = 저장소 루트 확인.

### 관측 사실 — 바탕화면이 OneDrive 리디렉션

바탕화면 경로가 `<USER>\OneDrive\바탕 화면` 이라 두 `.lnk` 는 OneDrive 에 동기화된다.

- `.lnk` 내용은 **로컬 경로 문자열뿐이고 문서 내용이 아니므로** IP/보안 경계(CONTEXT §4) 위반은 아니다.
- 다만 **다른 PC 에서 열면 경로가 달라 동작하지 않는다.** HP 15 이식 시 재생성 필요
  (재생성 스니펫은 DECISIONS.md 에 기록).

### 최종 상태

- 구동 중: chat 8090(PID 24700) / embed 8091(PID 30444) / AnythingLLM 3001
- 워크스페이스 `kdocs` 단독, **9 벡터**
- 스케줄러 `kdocrag-convert` **Ready** (평일 12:30, 로그온 시)
- 파이프라인 exit 0, GV-1 PASS
- 바탕화면 바로가기 2개

---

# 프로젝트 종료 — 2026-08-09

M1~M5 완료, GATE-1/2/3 통과, 운영 전환 완료. **DECISIONS 최종 51건.**

### 남은 리스크

| 구분 | 항목 |
|---|---|
| **수용** | #4 실제 암호·배포용 HWP 복호화 미검증 (실패해도 `_failed\encrypted\` 로 깨끗이 분류) |
| **수용** | #5 GV-5 TLS 페이로드 미확인 (콘텐츠 발신 경로인 llama-server 외부 커넥션 0건은 확인) |
| **신규** | 표 내 유사 행 구분 실패 — 4B 모델 **생성** 단계 한계. 검색은 정상. 대응책 미검증 |
| 실사용 해소 | #1 대량 문서 정확도 / #7 요약·추론형 질의 / #8 대량 임베딩 안정성 |
| 미검증 | 한글 PDF·DOCX·XLSX, 구버전 HWP(3.x) 변환 |

### 인간이 남겨둔 확인 1건

**월요일 12:30 스케줄러 자동 발화** — README §2 절차대로
`logs\convert-YYYYMMDD.log` 의 `시작` 줄 시각과 `Get-ScheduledTaskInfo` 의 `LastRunTime` 확인.
현재까지는 **수동 트리거로만 검증**됐다.

---

## 2026-08-09 (9차) — 데이터 루트 이전 + kordoc 결함 발견

### 인간 지시

데이터 루트를 `C:\Haku\kdocrag` → 저장소 루트로 이전.

### 작업 내역

1. `convert_office.py` `DEFAULT_ROOT = REPO_ROOT` 로 변경. `--root` 인자 유지. `py_compile` 통과.
2. 구 루트 **파일 8건 전부 이동** → 파일 0건 확인 후 `C:\Haku\kdocrag` 삭제.
3. `.gitignore` 확인 — `office-inbox/`·`office-md/`·`logs/` **이미 존재**, 추가 불필요.
4. `register_task.ps1` 재등록 + 수동 트리거.
5. DESIGN §2(+**§2.1 IP 경계 신설**)·§3, README §1-2/§1-4/§2, CONTEXT §4 경로 갱신.
   Log.md·DECISIONS.md 의 과거 `C:\Haku` 언급은 **당시 사실 기록이라 보존**.

### 예상 못 한 발견 — 인간의 실문서 2건이 변환 실패

검증 실행 중 인박스에 인간이 넣어둔 **실사용 문서 2건**(DOCX·XLSX)이 실패했다.

- 증상: kordoc 이 **30~55초 후 종료코드 0 + 빈 출력**. stderr 도 빔. json/markdown 모드 동일.
- 분리 검증: 파일명 인코딩 무관(ASCII 복사도 재현) / 공개 샘플 DOCX·XLSX 는 정상 /
  DOCX 구조는 멀쩡(표 3개, 이미지 0) / OCR 모델 캐시 생성 안 됨.
- **원인 미규명 — kordoc 측 문제로 추정.**
- 파이프라인은 정상 동작: 두 건 다 `_failed\error\` 로 분류·이동, 종료코드 1 + 실패 목록 출력.
  **문서가 조용히 사라지지 않았다.**
- 코드 개선: `NO_OUTPUT` 에러코드 신설로 "빈 출력"과 "깨진 JSON" 을 구분.

### 검증 결과

| 항목 | 결과 |
|---|---|
| convert 1회 (새 경로) | `root=...\Local-rag`, 원장스킵 3 / 쌍스킵 1 / 실패 1(실문서) |
| 실패분 격리 후 스케줄러 수동 트리거 | **LastTaskResult = 0** |
| NextRunTime | 2026-08-10 12:30:00 |

### 남은 조치 (인간 판단)

실패한 실문서 2건 — ① Word/한글로 re-save 후 재투입 ② kordoc 상류 이슈 등록
③ 해당 포맷만 우회. **어느 것도 시도하지 않았다.**

---

## 2026-08-09 (10차) — NO_OUTPUT 2건 원인 조사

### 새 정보 (인간 제공)

두 파일은 회사 문서가 아닌 **Claude 생성 가상 테스트 문서**(상류 공유 제약 없음).
**동일 kordoc 4.7.2 가 Linux 에서는 완전 변환** → 파일 정상, Windows 환경 특정 문제.

### 조사 경과

1. **MotW 확인** — 두 파일 다 `Zone.Identifier` ZoneId=3 (claude.ai 출처) + `RVContext` 보유.
2. **Unblock-File 적용 후 재변환** → docx 가 **7분 29초** 걸린 뒤 또 실패. 미해결.
3. **ADS 대조** — **성공한 PDF 도 `Zone.Identifier` 를 갖고 있었다.** 공개 샘플은 ADS 없음.
4. **파이프 vs 파일 리다이렉트** — 둘 다 성공. 무관.
5. **결정적 역실험** — docx 에 `Zone.Identifier` **재부착 후 3회** → **전부 0.7초 성공.**
   → **MotW 인과 반증.**
6. 이후 두 파일 모두 안정적으로 0.7~0.8초 성공. 파이프라인 실행 → **변환 2 / 실패 0, exit 0.**

### 결론

**해결됐으나 근본 원인은 규명하지 못했다.**

- 시간 추이: `34.7s → 45.3s → 55s → 7분29s`(전부 실패) → `0.7s`(성공, 이후 계속)
- 실패 시 공통: 종료코드 0 + stdout·stderr 완전 공백
- 배제됨: MotW / 파이프 / 파일명 인코딩 / 파일 손상 / OCR 모델 다운로드
- 유력 가설(백신 평판 검사 지연)은 `Get-MpPreference` 가 `0x800106ba` 로 실패해
  **확인도 반증도 못 함**

### 산출물 대조

| 파일 | Windows | Linux 참조 |
|---|---|---|
| DOCX | 1,174자 / 표 3개 / 행 16 / 깨짐 0 | 1,955자 / 표 3개 |
| XLSX | 3,750자 / 표 1개 / 행 42 / 깨짐 0 | 5,390자 / 40행 |

표 구조는 일치. 문자 수 차이는 **측정 기준 차이인지 실제 차이인지 확인하지 않았다.**

### 부가 관찰

Linux 로그의 `(hwpx)` 오라벨은 **Windows 에서 재현되지 않음** — `fileType` 이 `docx`/`xlsx` 로 정확.
단 `--format json` 사용 시 CLI 진행 메시지가 안 나와 라벨 문자열 직접 비교는 못 했다.

### 문서 반영

- DECISIONS: 조사 전문 + 배제한 가설 표 + 환경 정보 + 재발 시 확보할 것 3가지
- README §1-2: **인터넷 파일 Unblock 예방 조치**(근거가 인과가 아님을 명시) +
  `NO_OUTPUT` 재발 시 대응 4단계

### 최종 상태

인박스 6건 / office-md md 5건 + 사이드카 5건 / `_failed` **0건** / 파이프라인 exit 0

---

## 2026-08-09 (11차) — 검색/생성 튜닝 실험 (실전 4/7 → 7/7)

### 배경

인간이 문서 3건을 추가 임베딩(총 **29 벡터**)하고 실전 7문항으로 평가 → **4/7**.
실패 3건은 전부 "정보 없음" 응답. 인간 진단은 "검색 계층 실패".

### 진단 — 그 가설을 기각

7문항이 내 컨텍스트에 없어 **kdocs 대화 이력에서 복원**했다.

1. `topN=29`/`thr=0` 전체 랭킹 덤프 → 정답 청크가 **1위·2위·1위**. topN 4 밖으로 밀린 적 없음.
2. 설정 그대로 **새 스레드** 재질의 → **3/3 정답.** 실패 미재현.
3. 실전 스레드 도입부(워밍업 5턴 ~3,500자) 재현 → **3/3 실패 재현.** 이때도 정답은 청크에 있었음.
4. ctx 초과 아님 — `truncated = 0`, 최대 `n_tokens = 3,285` (< 4096).
5. 실패 답변이 **워밍업 때 모델 자신이 만든 부정확한 요약**을 반복. 자기 발언 > 새 근거.

→ **검색 계층이 아니라 대화 이력이 생성을 오염시킨 것.**

### 조건별 실험 (긴 이력 고정, 변수 하나씩)

| 조건 | 점수 | 비고 |
|---|---|---|
| base | 0/3 | 재현 |
| a) topN 8 | 0/3 | 효과 0 |
| b) thr 0.15 | 0/3 | 효과 0 |
| c) rerank | 1/3 | 생성 속도 28~30 → 10 t/s |
| **d) history 2** | **3/3** | 유일한 완전 해결 |
| d2) history 0 | 0/3 | **무효** — 백엔드가 `openAiHistory||20` 로 0→20 폴백 |

**모든 조건에서 정답은 항상 인용 청크 안에 있었다.**

### ctx / VRAM

topN 8 대비로 `-c 6144` 재기동: 2,851 → **3,086 MiB** (여유 880). OOM 없음, topN 6 폴백 불필요.

### 확정 및 최종 측정

`history 2` 단독과 `history 2 + rerank` 동점(3/3) → **단순한 쪽 채택**(rerank 미사용).

| 최종 조건 | 7문항 |
|---|---|
| 새 스레드 (이력 없음) | **7/7** |
| 긴 이력 (실전 조건) | **7/7** |

함정 문항 포함 환각 0. **변경된 설정은 `openAiHistory` 20→2 와 chat ctx 4096→6144 둘뿐.**

### 문서 반영

- `EVAL.md` **부록 D** 신설 (진단·조건별 표·최종 7/7·한계·다음 카드)
- `DECISIONS.md` 2건 추가 (튜닝 확정 / 행 단위 청킹 보류)
- `README.md` **§1-3-1 질의 요령**(가장 중요한 운영 수칙) + **§1-4-1 확정 설정 표**
- `serve_models.ps1` 기본 `-CtxChat` 4096 → **6144**

### 행 단위 청킹

지시대로 **구현하지 않음.** 이번 실험이 우선순위를 낮추는 근거를 제공했다 —
대량 표(40행) 문항도 `history 2` 만으로 정답. 꺼낼 조건 2가지를 DECISIONS 에 명시.

### 미검증

`history 2` 가 후속 질문 맥락 유지(대명사 참조)에 미치는 영향 / 다른 형태 이력에서의 충분성 /
rerank 가 1/3 에 그친 이유 / 확정 조합에서 ctx 4096 으로도 되는지

---

## 2026-08-09 (12차) — 서비스 중단 발견 및 복구

### 발단

11차에서 쓴 **오래된 백그라운드 태스크**(ctx 6144 재기동용)가 뒤늦게 완료 알림을 냈다.
그 출력의 마지막 줄 VRAM 이 `0 MiB used` 로 찍혀 있어 확인해 보니
**llama-server 2개와 AnythingLLM 이 전부 내려가 있었다.**

### 원인 (자기 귀책)

백그라운드 태스크가 종료되면서 그 태스크가 띄운 **자식 프로세스(llama-server)를 함께 정리**한 것으로
보인다. 서버 기동을 백그라운드 명령 안에서 수행한 **내 작업 방식이 초래한 부작용**이다.

- 튜닝 실험 결과 자체는 서버가 살아 있는 동안 측정된 값이라 **유효하다.**
- 다만 부록 D 를 쓰는 시점과 서비스가 죽은 시점이 겹쳐, 보고 당시 "구동 중"이라고 적은 것은
  결과적으로 틀렸다.

### 복구

| 항목 | 결과 |
|---|---|
| chat 8090 | PID 16276, `-c 6144` (serve_models.ps1 기본값 변경 반영 확인) |
| embed 8091 | PID 33160 |
| AnythingLLM 3001 | PID 32736 — `cmd /c start ""` 로 **부모와 분리 기동** |
| VRAM | 3,082 MiB used / 884 MiB free |
| 워크스페이스 `kdocs` | topN 4 / thr 0.25 / **openAiHistory 2** / default — **튜닝 확정값 유지됨** |
| 벡터 | 29 |

복구 후 스모크(실패했던 F4 문항) → `EQ-0219 → 2026-10-15 / 사용중` **정상**.

### 재발 방지

- 서버 기동을 **백그라운드 명령 안에서 하지 않는다.** 분리가 필요하면 `cmd /c start ""` 로 띄운다.
- 실사용에서는 바탕화면 **`Start-LocalRAG`** 바로가기를 쓰면 이 문제가 없다 —
  사람이 직접 띄운 프로세스는 에이전트 세션과 무관하게 유지된다.

### 현재 상태

세 서비스(8090 / 8091 / 3001) 정상 구동. 튜닝 확정 설정 적용 상태.
**DECISIONS 56건.** 다음 지시 대기.

---

## 2026-08-11 — M6 퍼블릭 배포

### 목표

동료(RTX 4060 노트북)가 **클론 → setup.ps1 → Start 더블클릭** 3단계로 베타테스트.

### 작업 내역

1. **사전 감사** — 개인 경로 32건을 `<USER>`/`<REPO>` 로 치환(이력 문서는 보존).
   토큰·키 실제 시크릿 0건. `.gitignore` 재작성(**`spec/paths.md`**, `__pycache__` 추가).
2. **LICENSE**(MIT, Kim-Hakseong) + README 서드파티 고지(kordoc/llama.cpp/AnythingLLM/모델).
3. **`setup.ps1`** 신규 — 7단계 원클릭 구축. 진행률·이어받기·해시대조·자가검증 포함.
4. **`QUICKSTART.md`** 신규 — 10분 가이드(AnythingLLM 설정값 표, 질의 3수칙, 문제해결).
5. **경로 통일** — `serve_models.ps1` 이 paths.md 의 NGL/CTX/alias 를 읽도록 변경.
6. **클론 실증** → 1차 실패 → 수정 → **재실증 통과(exit 0)**.
7. **배포** — `Kim-Hakseong/local-rag` 퍼블릭, `v0.1.0-beta` prerelease.

### 발견·수정한 문제 1건

| 문제 | 원인 | 조치 |
|---|---|---|
| `setup.ps1` 7단계에서 exit 1 | **PS 5.1 네이티브 stderr 함정** — llama-server 가 버전을 stderr 로 내는데 `2>&1` 로 받으면 `NativeCommandError` 발생, `ErrorActionPreference=Stop` 과 만나 중단. **exe 종료코드는 0 이었다** | 해당 호출들을 `cmd /c` 로 감싸 회피 |

> 클론 실증을 안 했으면 **동료 PC 에서 100% 실패했을 문제**다. 내 PC 에서는 이미 환경이
> 갖춰져 있어 드러나지 않았다.

### 확정 상수 (setup.ps1)

Qwen `3605803b…e597` (2,497,281,120 B, unsloth 배포본 — 공식 Qwen 계정은 GGUF 미배포/401) /
bge-m3 `aa473d51…a173` (634,553,760 B) / llama.cpp b10298 CUDA·Vulkan zip 크기.

### 결과

- 저장소: https://github.com/Kim-Hakseong/local-rag (PUBLIC, MIT, 35 파일)
- 릴리스: https://github.com/Kim-Hakseong/local-rag/releases/tag/v0.1.0-beta
- 실데이터·개인경로 유출 **0건** (원격 트리 재조회로 확인)

### 미검증

다른 PC 에서의 setup.ps1(**베타테스트가 첫 검증**) / Vulkan 분기 미실행 /
모델 실제 다운로드·이어받기 경로(기존 파일 복사로 단축)

---

## 2026-08-11 (2차) — VRAM 기반 ctx 자동 프로파일

### 작업 내역

1. `setup.ps1` 3단계에서 **nvidia-smi 로 VRAM 총량을 파싱**해 `CTX_CHAT` 자동 산정
   (6GB 미만 6144 / 6GB 이상 16384 / GPU 없음 4096). 산정 근거를 주석으로 기재 —
   모델 2,381 MiB + **약 0.115 MiB/토큰** (4096↔6144 실측 차이에서 역산).
2. `serve_models.ps1` — paths.md 의 `CTX_CHAT` 을 읽는 동작은 이미 있었고,
   파라미터 설명만 새 프로파일에 맞게 갱신. `-CtxChat` 오버라이드 유지.
3. `QUICKSTART.md` — LLM Provider 표에 **Token context window / Max Tokens** 행 추가
   ("`CTX_CHAT` 과 같은 값"), VRAM별 값 표, **긴 문서 통짜 요약 경고** 추가.
   질의 요령 ①에도 "요약 요청은 피하고 조회형으로" 명시.
4. paths.md 에 VRAM 행과 ctx 산정 안내, OOM 시 낮추는 순서 기재.

### 회귀 (RTX 2050 4GB)

paths.md 삭제 후 `setup.ps1` 재실행 → **exit 0 / 27.8초**

| 확인 항목 | 결과 |
|---|---|
| CTX_CHAT 자동 산정 | `VRAM 4096 MiB (6GB 미만) → 6144` — **기존 값 유지** |
| 실제 기동 ctx | 명령행 `-c 6144`, `/v1/models` `n_ctx=6144` |
| VRAM | 3,082 MiB used / 884 free (기존 실측과 동일) |
| 스모크 | 한국어 chat 정상, GV-4 PASS(1024차원), GV-1 PASS |

### 미검증

**6GB/8GB 카드에서 ctx 16384 가 실제로 뜨는지** — 추정 4.3GB 소요로 계산했을 뿐
해당 하드웨어가 없어 실행하지 못했다. 동료의 RTX 4060(8GB)이 첫 검증이 된다.
OOM 시 낮추는 순서를 paths.md·QUICKSTART·serve_models 도움말 세 곳에 안내했다.
