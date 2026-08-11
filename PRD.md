# PRD.md — kdocrag

## 1. 목표 / 산출물 / 품질 기준

- **목표**: 한글(HWP 계열) 포함 오피스 문서를 로컬에서 마크다운으로 변환하고, AnythingLLM에서 한국어 질의 시 정확한 근거 인용과 함께 답변을 받는다.
- **산출물**:
  1. `scripts\convert_office.py` — kordoc CLI 얇은 래퍼 (원장 관리 + 실패 분류)
  2. `scripts\serve_models.ps1` / `stop_models.ps1` — llama-server 2인스턴스 기동/종료
  3. `scripts\register_task.ps1` — Windows 작업 스케줄러 등록 (일 1회 변환)
  4. `scripts\golden_roundtrip.mjs` — 골든 벡터 GV-1 자동 검증
  5. AnythingLLM 설정 완료 상태 + 설정값 기록 (`DECISIONS.md`)
  6. `EVAL.md` — M5 RAG 품질 평가 결과 리포트
- **품질 기준**: 아래 골든 벡터 전부 통과 + 각 GO/NO-GO 게이트 인간 승인.

## 2. 비범위 (Non-goals)

- OCR (이미지 기반 PDF는 `needsOcr` 신호만 기록하고 스킵)
- DRM 배포용 문서의 한컴 COM 폴백 (한컴오피스 설치 여부 불확실 — 순수 JS 복호화 범위까지만)
- LocalDesk와의 동시 구동, 멀티유저, 웹 배포
- corpus.db(맥미니) 연동 — 별도 후속 프로젝트

## 3. 마일스톤

### M1 — kordoc 설치 + 변환 검증
- Node 18+ 확인, `npm install -g kordoc`, **절대경로 확인** (`where kordoc` 결과를 DECISIONS.md에 기록)
- PowerShell 실행 정책 이슈 발생 시 kordoc README의 cmd 우회 절차 적용
- 골든 벡터 **GV-1, GV-2, GV-3** 실행 (아래 §4)
- **[GATE-1: GO/NO-GO]** GV-2 실물 문서 변환 결과를 인간이 검수. 표 셀 값 대조표를 Ralph가 생성해 제시할 것.

### M2 — 로컬 모델 서빙
- llama-server 2인스턴스:
  - chat :8090 = Qwen3-4B-Instruct-2507-Q4_K_M.gguf (경로는 spec/paths.md 참조 — 인간 기입)
  - embed :8091 = bge-m3 GGUF (`--embedding`), 신규 다운로드 (~1.3GB, SSD 여유 확인 후)
- 스모크: `/v1/models`, `/v1/chat/completions` 한국어 응답, `/v1/embeddings` 1024차원 벡터 반환 확인
- VRAM 4GB 예산: DESIGN.md §4의 오프로딩 계획 준수. OOM 시 계획된 폴백 순서로만 조정하고 시도 결과를 DECISIONS.md에 기록

### M3 — AnythingLLM 설치/설정
- AnythingLLM Desktop 설치
- LLM Provider: Generic OpenAI → `http://127.0.0.1:8090/v1`
- Embedder: OpenAI 호환(Generic) → `http://127.0.0.1:8091/v1` — **연결 실패 시 폴백: Ollama for Windows 설치 + `ollama pull bge-m3`** (폴백 발동 여부는 GATE-2에서 보고)
- Text Chunk Size **512**, Overlap **80**
- 임베더/청크 설정 확정 **후에** office-md 문서 투입 (설정 변경 시 전체 재임베딩 필수 — 순서 위반 금지)
- **[GATE-2: GO/NO-GO]** 한국어 스모크 질문 1개로 인용 청크가 실제 근거인지 인간 확인

### M4 — 파이프라인 자동화
- `convert_office.py` 완성 (원장 sha256, `_failed\` 분류, 로그)
- 작업 스케줄러 등록 (평일 12:30, 사용자 로그온 시에만 — 회사 노트북이므로 야간 무인 실행 가정 금지)
- 인박스에 신규 파일 3개 투입 → 스케줄 수동 트리거 → office-md 산출 확인

### M5 — RAG 품질 평가
- 한국어 평가 질문 5개 (spec/eval_questions.md — 인간이 실물 문서 기반으로 작성)
- 각 질문에 대해: 답변 정확성 / 인용 청크의 근거성 / 환각 여부 3항목 기록 → `EVAL.md`
- **[GATE-3: 최종 감사]** EVAL.md 검토 + DECISIONS.md 전체 감사

## 4. 골든 벡터 (비협상)

| ID | 내용 | 판정 방법 | 자동화 |
|---|---|---|---|
| GV-1 | 라운드트립: 고정 마크다운(표 2개 포함) → `markdownToHwpx` → `parse` → 마크다운 | 정규화 후 표 셀 값 100% 일치 | `golden_roundtrip.mjs` (결정론) |
| GV-2 | 실물 문서 변환: `samples\` 의 인간 제공 문서 5종 | 표 셀 값 1:1 대조표를 Ralph가 생성, 인간이 원본 대조 승인 | 반자동 (GATE-1) |
| GV-3 | 실패 분류: 암호화 HWP 1개 투입 | `_failed\` 이동 + 에러코드(`ENCRYPTED` 등) 로그 기록 | 자동 |
| GV-4 | 임베딩 결정성: 동일 문자열 2회 임베딩 | 코사인 유사도 = 1.0 (±1e-6) | 자동 |
| GV-5 | 오프라인성: 변환~질의 전 과정 중 외부 아웃바운드 없음 | 리소스 모니터/netstat 확인, 절차와 결과 기록 | 반자동 |

## 5. 스펙 게이트

- `spec/paths.md` — Qwen GGUF 실제 경로, llama-server 실행파일 경로: **인간이 기입해야 M2 시작 가능**
- `samples\` — 실물 문서 5종: **인간이 넣어야 GV-2 실행 가능** (spec/samples_README.md 참조)
- `spec/eval_questions.md` — **인간이 작성해야 M5 시작 가능**

인간 입력이 없으면 Ralph는 해당 마일스톤에서 정지하고 필요 항목을 명시적으로 요청한다. 추측으로 채우지 않는다.
