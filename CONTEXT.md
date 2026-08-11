# CONTEXT.md — kdocrag (한글문서 로컬 RAG, Windows)

## 1. 프로젝트 한 줄 정의

회사 노트북(Windows)에서 HWP/HWPX/DOCX/PPTX/XLSX/PDF 등 한국형 문서를 **kordoc**으로 마크다운 변환하고,
**AnythingLLM + 로컬 llama.cpp(Qwen3-4B)** 로 완전 오프라인 RAG 질의응답을 구축한다.

## 2. 하드웨어 / 환경

| 항목 | 값 |
|---|---|
| 장비 | HP ProBook 460 G11 |
| OS | Windows 11 |
| RAM | 32GB |
| GPU | RTX 2050 (**VRAM 4GB** — 오프로딩 계획의 핵심 제약) |
| SSD 여유 | 약 61GB (대용량 모델 추가 다운로드 최소화) |
| 기존 자산 | llama.cpp(llama-server) 사용 경험 있음 (LocalDesk 프로젝트에서 사용 중), `Qwen3-4B-Instruct-2507-Q4_K_M.gguf` 다운로드 완료 |

## 3. 이미 내려진 결정 (재논의 금지)

1. **변환기 = kordoc** (github.com/chrisryugj/kordoc, MIT, npm).
   - 근거: HWP3/5·HWPX·HWPML·PDF·XLS(X)·DOCX 전 포맷 단일 CLI, 자체 벤치(표 정확일치 100%/1,421표), 배포용 HWP 순수 JS 복호화, 손상 CFB 복구.
   - Python 파서(hwp-hwpx-parser, pyhwp, markitdown)는 **사용하지 않는다**. kordoc이 전부 대체.
2. **RAG 프론트 = AnythingLLM Desktop (Windows)**.
   - 검증된 기성품으로 청킹·인용·워크스페이스 UX 기준선을 확보하는 것이 목적 (A안).
3. **LLM = 로컬 llama-server + Qwen3-4B-Instruct-2507-Q4_K_M.gguf** (이미 보유).
4. **임베더 = bge-m3** (한국어 검색 품질의 승부처. AnythingLLM 내장 임베더 사용 금지).
5. **클라우드 API 호출 없음.** 완전 로컬. (아키텍처 불변 원칙)
6. **LangChain/LangGraph/openai SDK 금지.** 필요한 HTTP 호출은 전부 직접 fetch/requests.

## 4. IP / 보안 경계 (절대 원칙)

- 이 저장소(스크립트·스펙·설정)는 **범용 개인 도구**다. 회사 문서, 회사 코드, 회사명이 들어간 샘플을 **저장소에 커밋하지 않는다**.
- 실제 문서는 저장소 안 `office-inbox\` 에만 존재하며 `.gitignore` 대상이다 (2026-08-09 경로 이전).
- 모든 처리 로컬 완결 — 문서 내용이 네트워크로 나가는 경로가 없어야 함 (검증 항목에 포함).

## 5. 기존 인프라와의 충돌 주의

- LocalDesk가 같은 노트북에서 llama-server를 사용한다. **포트 충돌 방지**를 위해 본 프로젝트는:
  - chat: `127.0.0.1:8090`
  - embedding: `127.0.0.1:8091`
  을 사용한다. 8080 등 LocalDesk 예약 포트는 건드리지 않는다.
- VRAM 4GB를 LocalDesk와 동시 사용할 수 없다. **동시 구동은 지원 범위 밖** — 본 프로젝트 사용 시 LocalDesk의 llama-server는 내린다는 전제.

## 6. 용어

- **인박스 패턴**: `office-inbox\` 에 원본 투입 → 변환 → `office-md\` 산출, 실패는 `office-inbox\_failed\` 로 분류.
- **원장(ledger)**: 파일별 sha256을 기록해 변경 없는 파일의 재변환을 방지하는 JSON.
- **골든 벡터**: 결정론적으로 검증 가능한 변환/검색 기준값. 통과 없이는 다음 마일스톤 진행 불가.
