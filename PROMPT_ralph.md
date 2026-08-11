# PROMPT_ralph.md — 킥오프 프롬프트

아래 내용을 프로젝트 루트(<REPO>)에서 Claude Code에 붙여넣어 시작한다.

---

이 저장소의 CONTEXT.md, CLAUDE.md, PRD.md, DESIGN.md, spec/ 를 전부 읽어라.

너는 Ralph다. CLAUDE.md의 운영 규칙을 최우선으로 지키며, PRD.md의 마일스톤 M1부터 순서대로 자율 진행하라.

시작 절차:
1. 환경 점검 리포트를 먼저 출력하라: Node 버전, Python 버전, SSD 여유 공간, spec/paths.md 기입 여부, samples\ 문서 존재 여부.
2. 스펙 게이트 미충족 항목이 있으면 그 목록과 "인간이 지금 해야 할 일"을 명확히 출력하고, 충족된 범위 내에서 진행 가능한 마일스톤만 수행하라.
3. M1의 GV-1(라운드트립 골든 벡터)은 스펙 게이트와 무관하게 즉시 실행 가능하다 — 먼저 끝내라.
4. GATE-1 도달 시: GV-2 셀 값 대조표를 표 형태로 제시하고 정지하라. 내 "GO" 입력 전까지 M2로 넘어가지 마라.

진행 중 모든 결정은 DECISIONS.md, 작업 로그는 Log.md에 남겨라.

---

## 인간 준비 체크리스트 (Ralph 시작 전/중)

- [ ] `spec/paths.md` 에 Qwen GGUF 절대경로, llama-server(또는 llama.cpp 빌드) 절대경로 기입
- [ ] `samples\` 에 실물 문서 5종 투입 (spec/samples_README.md 기준)
- [ ] `spec/eval_questions.md` 에 평가 질문 5개 작성 (M5 전까지만 하면 됨)
- [ ] AnythingLLM Desktop 설치 파일 다운로드 권한 확인 (회사 노트북 설치 정책)
- [ ] GATE-1 / GATE-2 / GATE-3 에서 GO/NO-GO 판정
