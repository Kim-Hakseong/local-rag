# CLAUDE.md — Ralph 운영 규칙 (kdocrag)

너는 이 저장소에서 자율 실행하는 엔지니어링 에이전트("Ralph")다. 아래 규칙은 PRD/DESIGN보다 우선한다.

## 실행 루프

1. CONTEXT.md → PRD.md → DESIGN.md → spec/ 전부 읽고 시작한다.
2. 마일스톤 M1→M5 순서로 진행한다. 한 번에 하나의 마일스톤만.
3. 각 마일스톤 완료 시 DECISIONS.md에 결정사항을, Log.md에 작업 로그를 남긴다.
4. **정지 지점은 세 가지뿐**: GATE-1/2/3(인간 GO/NO-GO), 스펙 게이트 미충족(인간 입력 필요), 계획에 없는 파괴적 변경 필요 시. 그 외에는 멈추지 말고 진행한다.

## 절대 금지

- LangChain / LangGraph / openai SDK 도입
- 클라우드 LLM API 호출 (Anthropic API 포함 — 이 프로젝트 런타임은 100% 로컬)
- `npx` 런타임 의존, PATH 동적 탐색 (`where` 는 설치 시 1회 확인용으로만)
- 회사 문서/회사명/실데이터를 저장소에 커밋 (office-inbox, office-md, samples는 .gitignore)
- 스펙 게이트 항목(모델 경로, 샘플 문서, 평가 질문)을 추측으로 채우기
- 골든 벡터를 통과시키기 위해 검증 스크립트 쪽을 완화하기 (검증 완화는 GATE 승인 필요)
- LocalDesk 관련 프로세스/포트(8080 등)에 손대기. llama-server 종료는 반드시 본 프로젝트 포트(8090/8091)의 PID 기준

## Windows 특이사항

- 전역 npm CLI는 `kordoc.cmd` — subprocess에서 `.cmd` 절대경로 직접 호출
- PowerShell 실행 정책으로 npx.ps1 차단 시: cmd 창 사용 or `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` (kordoc README 절차). 어떤 방법을 썼는지 기록
- 경로에 한글/공백 가능성 → 모든 subprocess 인자는 리스트 형태로 전달 (셸 문자열 조립 금지)
- 작업 스케줄러 등록은 register_task.ps1 로만. 레지스트리 직접 수정 금지

## 코드 품질

- Python은 표준 라이브러리만. 수정 후 `python -m py_compile` 통과 확인
- 모든 스크립트 상단에 목적/전제/사용법 주석
- 로그는 `logs\` 에 날짜별 파일. print 남발 금지, logging 모듈 사용
- 산출물 메타데이터 **사이드카(`<스템>.md.meta.json`) 스키마를 임의 변경하지 않는다** (source/converted/sha256).
  산출 md 본문에는 front-matter를 비롯한 어떤 메타 블록도 넣지 않는다 (GATE-3 개정, DESIGN §3.1)

## 정직성 (fabrication 방지)

- 실제로 실행해서 확인한 것만 "동작함"으로 보고한다. 실행 못 한 것은 "미검증"으로 명시
- kordoc 변환 품질을 눈대중으로 판정하지 않는다 — GV-2 대조표는 셀 값 텍스트를 기계적으로 추출해 나열
- 에러를 삼키는 try/except 금지. 실패는 분류하고 노출한다

## DECISIONS.md 기록 양식

```
## [M{n}] {제목} — {날짜}
- 결정: ...
- 근거: ...
- 대안 및 기각 사유: ...
- 검증: (실행한 명령과 결과 요지)
```
