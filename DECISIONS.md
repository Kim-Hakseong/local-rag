# DECISIONS.md

(Ralph가 기록. 양식은 CLAUDE.md 참조)

## [M1] kordoc 전역 설치 및 절대경로 확정 — 2026-08-09

- 결정: `npm install -g kordoc` 로 kordoc **4.7.2** 를 전역 설치하고,
  `KORDOC_CMD = <USER>\AppData\Roaming\npm\kordoc.cmd` 를 spec/paths.md 에 기록했다.
- 근거: CONTEXT.md §3-1 (변환기 = kordoc, 재논의 금지). DESIGN.md §3 의 "npx 금지 / PATH 의존 금지"
  원칙에 따라 subprocess 는 `.cmd` 절대경로를 직접 호출한다.
- 대안 및 기각 사유:
  - `npx kordoc` — CLAUDE.md 절대 금지 항목(런타임 npx 의존). 기각.
  - 프로젝트 로컬(devDependency) 설치 — 이 저장소는 npm 프로젝트가 아니고(package.json 없음),
    작업 스케줄러가 호출할 경로가 저장소 위치에 묶이면 이식성이 떨어진다. 전역 설치 유지.
- 검증:
  - `npm install -g kordoc` → `added 179 packages in 33s` (deprecated 경고 1건: boolean@3.2.0, 기능 영향 없음)
  - `where kordoc` → `<USER>\AppData\Roaming\npm\kordoc` / `...\kordoc.cmd`
  - `npm list -g kordoc --depth=0` → `kordoc@4.7.2`
  - `& "<USER>\AppData\Roaming\npm\kordoc.cmd" --version` → `4.7.2` (절대경로 subprocess 호출 성공)

## [M1] PowerShell 실행 정책 우회 불필요 — 2026-08-09

- 결정: kordoc README 의 cmd 우회 절차를 **적용하지 않았다**. 실행 정책 변경도 하지 않았다.
- 근거: `Get-ExecutionPolicy -List` 결과 CurrentUser=RemoteSigned, Process=Bypass 로
  `kordoc.cmd` 직접 호출이 차단되지 않는다. 실제 호출이 성공했으므로 우회 조치가 불필요하다.
- 대안 및 기각 사유: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` — 이미 RemoteSigned 이며
  회사 노트북 정책을 불필요하게 건드릴 이유가 없다. 기각.
- 검증: `& $cmd --version` → `4.7.2`, `& $cmd <hwpx> -o <md>` → exit 0, 1118 bytes 산출.

## [M1] GV-1 라운드트립 골든 벡터 — PASS — 2026-08-09

- 결정: `scripts\golden_roundtrip.mjs` + 고정 입력 `scripts\gv1_fixture.md` 로 GV-1 을 자동화했다.
  판정 기준은 **표 셀 값 100% 일치**(NFC 정규화 + 연속 공백 축약 + trim 후 문자열 동일).
- 근거: PRD.md §4 GV-1. 정규화 범위를 공백·유니코드 정규형에 한정해, 셀 텍스트 자체의 손실은
  절대 흡수하지 않도록 했다(검증 완화 금지 원칙).
- 대안 및 기각 사유:
  - 마크다운 문자열 전체 diff — 표 밖 서식(빈 줄 개수 등) 차이로 오탐이 나고, GV-1 이 검증하려는
    "표 셀 값 보존"과 무관한 실패를 만든다. 기각. 단, 산출 마크다운 전문은 로그로 보존한다.
  - kordoc 모듈 경로 하드코딩 — spec/paths.md 의 KORDOC_CMD 디렉터리에서
    `node_modules/kordoc/dist/index.js` 로 결정론적 유도. PATH 탐색 없음.
- 검증:
  - `node scripts\golden_roundtrip.mjs` → exit **0**
  - `kordoc 4.7.2 / hwpx 49052 bytes / fileType=hwpx`
  - `표 2 → 2, 셀 36 → 36`, 불일치 0건, 파서 경고 0건
  - 리포트: `logs\gv1\gv1-report.json` (`verdict: "PASS"`)

## [M1] GV-1 결정성의 범위 — 2026-08-09

- 결정: GV-1 의 결정성은 **파싱 결과(마크다운/IR) 수준**에서 성립하며, 중간 산출 HWPX 바이트는
  실행마다 달라진다. 이를 결함이 아닌 관측 사실로 기록하고, 판정 기준에 HWPX 바이트 해시를 넣지 않는다.
- 근거: 2회 연속 실행 결과
  - `roundtrip.out.md` sha256 동일 (`F813724D…59C6`) → 라운드트립 결과 결정론적
  - `roundtrip.hwpx` sha256 상이 (`7A774…791F` vs `FAA7F…F48F`) → HWPX(ZIP) 내부 타임스탬프 등
    생성 시각 의존 필드로 추정. **원인을 코드 수준에서 확인하지는 않았다 (미검증 추정).**
- 대안 및 기각 사유: HWPX 바이트 해시를 골든 기준값으로 고정 — 생성 시각 의존 필드 때문에 항상 실패한다.
  기각.
- 검증: 위 해시 비교 2회 실행, 두 실행 모두 exit 0.

## [M1] GV-2 / GV-3 실행기 선작성 — 2026-08-09

- 결정: `scripts\golden_samples.mjs` 를 미리 작성했다. 샘플이 투입되면 즉시
  `logs\gv2\GV2_cell_table.md` (셀 값 1:1 대조표) 와 `gv2-report.json` 을 생성한다.
  파싱 실패 문서는 kordoc 의 구조화 에러코드(`ENCRYPTED` 등)로 분류해 나열한다(GV-3).
- 근거: CLAUDE.md 정직성 규칙 — "kordoc 변환 품질을 눈대중으로 판정하지 않는다. 셀 값 텍스트를
  기계적으로 추출해 나열". 스크립트는 판정을 하지 않고 추출만 한다. 판정은 GATE-1 의 인간 몫.
- 대안 및 기각 사유: 샘플 없이 임의 문서를 만들어 GV-2 를 "통과"시키기 — 스펙 게이트를 추측으로
  채우는 행위. 절대 금지. 기각.
- 검증: 현재 `samples\` 가 비어 있어 `node scripts\golden_samples.mjs` → exit **2**,
  `[GV-2] BLOCKED: samples\ 에 문서가 없다` 로 정상 차단됨을 확인. **GV-2/GV-3 자체는 미검증(미실행).**

## [M1] 기존 인프라 비간섭 확인 — 2026-08-09

- 결정: 포트 8080 리스닝(PID 13356) 및 실행 중인 `llama-server`(PID 32344)는 **건드리지 않았다**.
- 근거: CONTEXT.md §5 / CLAUDE.md — LocalDesk 소유 자원 추정. 본 프로젝트는 8090/8091 만 사용.
- 검증: `netstat -ano` 로 8090/8091 미사용 확인. M1 작업 중 프로세스 종료 명령을 실행한 적 없음.
- **정정(같은 날 후속 확인)**: 이 항목을 처음 쓸 때 PID 32344(llama-server)를 포트 8080 과
  묶어 적었으나, `Win32_Process` 확인 결과 **32344 는 포트 8081** 이다
  (`--port 8081 -c 16384 --jinja --device Vulkan0`). 포트 8080(PID 13356)은 **별개 프로세스이며
  정체 미확인**이다. 어느 쪽 소유자가 LocalDesk 인지는 여전히 확인하지 않았다.

## [M1] samples\ 요건 매핑 및 #3/#4 미확보 스킵 — 2026-08-09

- 결정: 인간이 투입한 3개 파일을 spec/samples_README.md 요건에 다음과 같이 매핑하고,
  요건 #3(구버전 HWP)·#4(배포용/열람제한 HWP)는 **미확보 스킵**으로 확정한다.

  | 요건 | 파일 | 매핑 |
  |---|---|---|
  | #1 HWP 5.x, 표 3개 이상 | `2025년+기준+운수업조사+및+기업활동조사+실시.hwp` | **충족** (표 7개 — 3개 이상) |
  | #2 HWPX | `2025년+기준+운수업조사+및+기업활동조사+실시.hwpx` (#1과 동일 문서 쌍) | 충족 |
  | #2 보조 | `(붙임1)겉표지 있는 보고서(계획서) 서식_보고서 작성 서식 안내.hwpx` | 충족 (표 9개) |
  | #3 구버전 HWP | — | **미확보 스킵** (인간 조달 시도 → 404) |
  | #4 배포용 HWP | — | **미확보 스킵** (인간 조달 시도 → 뷰어 전용) |
  | #5 암호 HWP | — | 미확보 → 대체안 승인 (아래 GV-3 항목) |

- 근거: PRD.md §4 GV-2 / spec/samples_README.md. 요건 #1의 "표 3개 이상"은 추측이 아니라
  실제 파싱 결과(표 7개)로 확인했다. 따라서 **부분 충족이 아니라 완전 충족**이며,
  GATE-1 진행에 추가 샘플이 필수는 아니다.
- 대안 및 기각 사유: 표 개수 미달 시 추가 샘플 요청을 준비했으나 미달이 아니므로 불필요.
- 검증: `node scripts\golden_samples.mjs` → exit 0, 3개 전부 파싱 성공.
  `logs\gv2\gv2-report.json` 의 `tableCount` = 9 / 7 / 7.

### 미확보로 인해 **검증되지 않은** 경로 (정직성 기록)

- HWP 3.x 등 레거시 포맷 경로: **미검증**
- 배포용(열람제한) HWP 의 순수 JS 복호화: **미검증**
- 실제 암호화된 HWP 의 복호화: **미검증** (플래그 분류만 검증 — GV-3 항목 참조)
- PDF / DOCX / XLSX / XLS 경로: 샘플 없음 — **미검증**

## [M1] GV-2 실물 문서 변환 — 파싱 3/3 성공 — 2026-08-09

- 결정: GV-2 대조표를 `logs\gv2\GV2_cell_table.md` 로 생성했다. 셀 값은 kordoc IR
  (`table.cells[r][c].text`)에서 기계적으로 추출한 원문이며 Ralph의 품질 판정은 넣지 않았다.
- 근거: CLAUDE.md 정직성 규칙(눈대중 판정 금지). 최종 판정은 GATE-1 의 인간 몫.
- 검증:

  | 파일 | fileType | 페이지/섹션 | md 길이 | 표 | 셀 | warnings |
  |---|---|---|---|---|---|---|
  | (붙임1)겉표지…서식.hwpx | hwpx | 1 | 1,340자 | 9 | 43 | 0건 |
  | 2025년…실시.hwp | hwp | 2 | 1,594자 | 7 | 26 | 0건 |
  | 2025년…실시.hwpx | hwpx | 2 | 1,630자 | 7 | 26 | 0건 |

  파서 warnings 총 0건, 예외(throw) 0건.

## [M1] 크로스 포맷 대조 (.hwp ↔ .hwpx) — 불일치 원인 규명 — 2026-08-09

- 결정: 동일 문서 쌍의 파싱 결과 차이 7건을 전수 분석해 **원인을 확정**했다.
  결론: **kordoc 의 변환 오류는 0건**이다. 차이는 (a) 원본 자체의 차이 1건,
  (b) 강조 마커 방출 방식 차이 6건으로 전부 설명된다.
- 근거 / 검증:
  - 정규화 후 문자 유사도 **98.820%** (LCS 1,591자), 표 셀 26/26 동일 구조, 셀 불일치 1건
  - **(a) 원본 차이 1건** — "응답 부담"(hwp) vs "응답부담"(hwpx). 원본 바이트를 직접 확인:
    - hwpx `Contents/section0.xml` 원문: `기업체의 응답부담 경감을` (공백 없음)
    - hwp CFB `BodyText/Section0` 을 inflateRaw 후 UTF-16LE 디코드:
      `... C751 B2F5 0020 BD80 B2F4 ...` = `응답` + `U+0020` + `부담` (공백 있음)
    - → **두 파일은 동일 내용의 서로 다른 판본이다. 파서 문제가 아니다.**
  - **(b) 강조 마커 6건** — 텍스트 내용은 동일하고 `**` 유무만 다르다. IR 확인 결과:
    - HWP5 경로: `block.style.bold = true` (블록 단위 스타일, 9개 블록)
    - HWPX 경로: `block.spans[].bold = true` (run-span, 9개 블록)
    - kordoc 의 마크다운 방출은 `spans` 에만 `**` 를 붙이고 `style.bold` 에는 붙이지 않는다.
      → 볼드는 **양쪽 다 검출**되지만 마크다운 표기는 HWPX 경로에서만 나온다.
  - **강조 마커(`**`)를 제거하고 재비교**: 양쪽 40줄, 불일치 **1줄** (= 위 (a) 한 건뿐).
- 대안 및 기각 사유: 유사도 98.8%를 "손실"로 보고하고 끝내기 — 원인 미규명 보고는
  GATE-1 판정을 오도한다. 기각하고 원본 바이트까지 파고들었다.
- RAG 영향 평가: 볼드 마커 유무는 검색 품질에 실질 영향이 거의 없다(청킹 시 마크업은 노이즈에 가까움).
  단 **HWP5 경로에서는 헤딩성 강조가 마크다운에 드러나지 않으므로** AnythingLLM 청킹이
  구조 힌트를 덜 받는다는 점은 M3에서 인지하고 있어야 한다.

## [M1] 한글 깨짐 검사 + 마크다운 방출 단계 무경고 소실 발견 — 2026-08-09

- 결정: 치환문자(U+FFFD)·PUA·단독 호환자모·제어문자를 **마크다운 출력과 IR 양쪽**에서 스캔한다.
  당초 마크다운만 스캔했으나 IR 대비 차이가 발견되어 검사 범위를 확장했다.
- 검증 결과:
  - 3개 파일 전부 마크다운 기준 U+FFFD 0 / PUA 0 / 단독자모 0 / 제어문자 0 — **한글 깨짐 없음**
  - 단, `(붙임1)…서식.hwpx` 의 IR 에는 **PUA `U+F03DA` 3개**(한컴 문자표 키캡 기호 `󰏚`)가 존재하는데
    마크다운 출력에서는 **0개**다. 즉 방출 단계에서 3자가 소실된다.
  - 이 소실에 대해 kordoc 은 **warning 을 남기지 않는다** (warnings 0건).
  - 문맥 예: `4. 보고서 도형체계 및 기호사용 / 가. 󰏚 : 문자표 - 키캡 사용`
    → 마크다운에서는 `가. : 문자표 - 키캡 사용`
- 평가: RAG 관점에서 PUA 문자는 임베딩 노이즈이므로 **제거 자체는 유리**하다. 결함으로 보지 않는다.
  다만 "무경고 소실"이라는 사실은 기록해 둔다 — 기호가 의미를 갖는 문서(체크박스 양식 등)에서
  정보 손실로 이어질 수 있다.
- 대안 및 기각 사유: PUA 보존 옵션을 켜기 — kordoc 4.7.2 CLI 옵션에 해당 항목이 없다.
  M1 범위에서 kordoc 동작을 변경하지 않는다.

## [M1] GV-3 대체안 (인간 승인) — 실패 분류 검증 — 2026-08-09

- 결정: 요건 #5(비밀번호 HWP) 미확보에 대해 **인간이 대체안을 승인**했다.
  요건 #1 HWP 를 복사·변조한 픽스처 6종으로 "깨끗한 실패"를 검증한다.
  생성기: `scripts\make_gv3_fixture.mjs` (결정론적, 재현 가능).
  산출물은 실물 문서 파생 바이너리이므로 `.gitignore` 처리했다 (`scripts/gv3/`).
- 훼손 방법 (전부 원본 `2025년…실시.hwp`, sha256 `2900868d…4ee77` 기준):

  | 변종 | 훼손 위치 | 훼손 내용 | 의도 |
  |---|---|---|---|
  | A `corrupt-header-sig.hwp` | 0x00–0x07 | CFB 시그니처 `D0CF11E0A1B11AE1` → `00`×8 | 포맷 판별 실패 |
  | B `corrupt-fat.hwp` | 0x200–0x3FF | `FF`×512 | 첫 섹터 파괴 (대조군) |
  | C `corrupt-sector-shift.hwp` | 0x1E–0x21 | sector shift `09000600` → `FFFFFFFF` | 섹터 크기 정의 파괴 |
  | D `corrupt-dir-sector.hwp` | 0x30–0x33 | first directory sector `02000000` → `FFFFFFFF` | 디렉터리 진입점 파괴 |
  | E `flag-encrypted.hwp` | CFB `FileHeader` +36 | flags `0x00000001` → `0x00000003` (bit1 암호 설정) | ENCRYPTED 분류 경로 |
  | F `flag-distribution.hwp` | CFB `FileHeader` +36 | flags `0x00000001` → `0x00000005` (bit2 배포용) | 배포용 분류 경로 |

- 검증 (`node scripts\golden_samples.mjs --dir scripts\gv3 --out logs\gv3` → exit 1, 성공 1 / 실패 5):

  | 변종 | 결과 | 에러코드 | 메시지 |
  |---|---|---|---|
  | A | 실패 | `UNSUPPORTED_FORMAT` | 지원하지 않는 파일 형식입니다. |
  | B | **성공** | — | 아래 기각 사유 참조 |
  | C | 실패 | `PARSE_ERROR` | CFB 컨테이너 파싱 실패 (strict 및 lenient 모두) |
  | D | 실패 | `PARSE_ERROR` | FileHeader 스트림 없음 |
  | E | 실패 | **`ENCRYPTED`** | 암호로 보호된 HWP 문서입니다. password 옵션에 열기 암호를 지정하세요. |
  | F | 실패 | `NO_SECTIONS` | 섹션 스트림을 찾을 수 없습니다 |

  **모든 실패가 예외(throw) 없이 구조화 에러코드로 반환됐다 — "깨끗한 실패" 조건 충족.**
  특히 E 에서 미확보 샘플의 목표 코드였던 `ENCRYPTED` 를 실제로 재현했다.

- 대안 및 기각 사유:
  - 변종 B 만으로 끝내기 — B 는 **훼손이 무효**였다. 파싱이 성공했고 산출 마크다운이 원본과
    sha256 완전 동일(`e67ec084…fbf10`)했다. 해당 바이트가 이 문서에서 load-bearing 이 아니라는 뜻이며,
    kordoc 의 복구 능력을 입증한 것이 **아니다**. 이를 "손상 CFB 복구 성공"으로 보고하는 것은
    fabrication 이므로, 실제 필수 필드를 때리는 C·D 를 추가했다.
  - 무작위 바이트 훼손 — 재현 불가·원인 불명. 기각. 훼손 위치를 CFB 스펙상 의미 있는 필드로 고정.

### GV-3 의 한계 (반드시 인지)

1. **E/F 는 플래그만 켠 것이고 본문이 실제로 암호화·배포용 인코딩된 것이 아니다.**
   따라서 kordoc 의 **판정·분류 경로**는 검증됐지만 **실제 복호화 동작은 검증되지 않았다**.
   F 가 `DRM_PROTECTED` 가 아니라 `NO_SECTIONS` 를 반환한 것도 이 한계 때문으로 보이며
   (원인은 코드로 확인하지 않은 **추정**), 실제 배포용 문서의 처리 결과를 대표하지 않는다.
2. **PRD.md GV-3 의 `_failed\` 이동 부분은 아직 검증되지 않았다.** convert_office.py 가
   M4 산출물이기 때문이다. 현재 검증된 것은 그 분류의 **입력이 되는 에러코드 계약**뿐이다.
   `_failed\encrypted\` · `_failed\error\` 실제 이동은 M4에서 검증한다.

## [M1] spec/paths.md 스펙 게이트 — 여전히 미충족 — 2026-08-09

- 결정: `QWEN_GGUF` / `LLAMA_SERVER` / `PYTHON` 세 항목이 **플레이스홀더 그대로**임을 확인했다.
  Ralph는 이를 자동으로 채우지 않았다. **M2 는 여전히 차단 상태다.**
- 근거: CLAUDE.md 절대 금지 — "스펙 게이트 항목을 추측으로 채우기". 디스크에서 후보를 찾아
  제시하는 것과, 게이트 필드를 대신 채우는 것은 다르다.
- 검증 (후보를 실제로 실행/확인함, 결과는 spec/paths.md 하단에 기록):
  - `<USER>\office-fork-llm\Qwen3-4B-Instruct-2507-Q4_K_M.gguf` 존재, 2,497,281,120 B (2.326 GB)
  - `<USER>\office-fork-llm\llama-server.exe` 존재, `--version` → `version: 10298 (15586e2d7)`,
    `built with Clang 20.1.8 for Windows x86_64`
  - `<USER>\AppData\Local\Programs\Python\Python312\python.exe` 존재, Python 3.12.10

### M2 계획에 영향을 주는 관측 사실

1. **llama.cpp 빌드가 Vulkan 백엔드다** — 폴더에 `ggml-vulkan.dll`(49.9 MB)만 있고 CUDA DLL 이 없다.
   DESIGN.md §4의 `--flash-attn`, `--cache-type-k/v q8_0` 이 Vulkan 경로에서 지원되는지는 **미검증**.
   M2 스모크에서 확인하고, 미지원이면 DESIGN §4 폴백 순서와 별개로 해당 플래그만 제거한다(기록 필수).
2. **CONTEXT.md §5 의 포트 가정 수정 필요** — 실행 중인 llama-server 는 8080 이 아니라 **8081** 이다.
   `llama-server.exe -m Qwen3-4B-Instruct-2507-Q4_K_M.gguf --port 8081 -c 16384 --jinja --device Vulkan0` (PID 32344)
   본 프로젝트의 8090/8091 과 포트 충돌은 없으나 **동일 GPU VRAM 을 점유 중**이라 M2 기동 전 종료가 필요하다.
3. 포트 8080(PID 13356)은 별개 프로세스이며 **정체 미확인**. 건드리지 않았다.

## [M1] bge-m3 GGUF 다운로드 후보 조사 (다운로드 미실행) — 2026-08-09

- 결정: M2용 bge-m3 GGUF Q8_0 후보 2종을 조사해 아래에 고정 기록한다.
  **다운로드는 실행하지 않았다** — 인간의 GATE-1 "GO" 이후로 미룬다.
  1순위는 `ggml-org/bge-m3-Q8_0-GGUF` 로 한다.
- 근거: `ggml-org` 는 llama.cpp 상류 조직 계정이라 런타임(llama-server)과의 정합성 신뢰도가 가장 높다.
  둘 다 MIT 라이선스, 게이팅(접근 승인 요구) 없음.
- 후보:

  | 순위 | 저장소 | 파일 | 크기(B) | sha256 (HF LFS OID) | 라이선스 | 최종수정 |
  |---|---|---|---|---|---|---|
  | 1 | `ggml-org/bge-m3-Q8_0-GGUF` | `bge-m3-q8_0.gguf` | 634,553,760 | `aa473d51f451a22f0fcf39ba3330c14bed38a385712b1113440f69df4047a173` | MIT | 2025-10-12 |
  | 2 | `gpustack/bge-m3-GGUF` | `bge-m3-Q8_0.gguf` | 634,553,760 | `950f4a8e5e19477a6d3c26d2f162233c20002c601f75e4b002e3239997821167` | MIT | 2024-10-31 |

  참고 — `gpustack` 저장소의 다른 양자화: FP16 1,157,671,200 B / Q6_K 499,415,104 B /
  Q5_K_M 467,662,912 B / Q4_K_M 437,778,496 B.

- 관측: 두 Q8_0 파일은 **크기가 정확히 같지만 sha256 이 다르다**. 변환 시점·메타데이터 차이로
  추정하며 **원인은 확인하지 않았다(미검증 추정)**. 어느 쪽을 받든 위 표의 해당 sha256 과 대조할 것.
- DESIGN.md 보정: DESIGN §4 는 bge-m3 GGUF 를 "~1.3GB" 로 적었으나 **Q8_0 실제 크기는 605 MiB**
  (634,553,760 B)다. FP16 이 1.08 GiB 이므로 1.3GB 추정은 과대했다. SSD 여유 61.6 GB 이라 영향 없음.
- 미검증: **임베딩 차원 1024 는 아직 확인하지 않았다.** BAAI/bge-m3 문서상 dense 차원이 1024 이나,
  실제 확인은 PRD M2 스모크(`/v1/embeddings` 응답 길이)에서 한다. GV-4(임베딩 결정성)도 M2 이후.
- 다운로드 URL (GO 이후 사용):
  - `https://huggingface.co/ggml-org/bge-m3-Q8_0-GGUF/resolve/main/bge-m3-q8_0.gguf`
  - `https://huggingface.co/gpustack/bge-m3-GGUF/resolve/main/bge-m3-Q8_0.gguf`

---

## [GATE-1] GO 판정 — 합격 근거 — 2026-08-09

- 결정: 인간이 GATE-1 **GO** 판정. M1 종료, M2 착수.
- 합격 근거 (인간 확인 사항):
  1. **셀 값 대조**: §3·§4 대조표의 셀 값을 인간이 원문(게시판 원본)과 교차 확인했다.
  2. **크로스 포맷 98.820%**: 수치 자체가 아니라 **불일치 7건 전수 규명 결과**로 판정했다.
     원본 자체 차이 1건(hwp/hwpx 판본 상이, 바이트 수준 확인) + 강조 마커 방출 차이 6건.
     **파서 오류 0건**이므로 합격 처리.
  3. GV-1 PASS, GV-3 대체안으로 실패 분류 5/5 구조화 코드 확인.
- 미해결 이월 (M3~M5에서 다룸): `_failed\` 실제 이동 미검증(M4), 실제 암호/배포용 HWP 복호화 미검증,
  구버전 HWP·PDF·DOCX·XLSX 경로 미검증(샘플 없음).

## [M4-요구사항] 동일 문서 hwp/hwpx 쌍은 hwpx 우선 변환 — 2026-08-09

- 결정: 인박스에 **같은 문서의 .hwp 와 .hwpx 가 함께 들어오면 .hwpx 를 변환하고 .hwp 는 건너뛴다.**
  판정 기준은 확장자를 뺀 파일명(stem) 동일. 건너뛴 파일은 로그에 `SKIPPED_DUPLICATE_PAIR` 로 남긴다.
  **이 규칙을 M4 convert_office.py 요구사항에 추가한다.**
- 근거: M1 크로스 포맷 대조 실측 — HWPX 경로는 볼드를 `spans` 로 내보내 마크다운에 `**` 가 실리지만,
  HWP5 경로는 `style.bold` 로만 검출돼 마크다운에 강조가 드러나지 않는다(9개 블록에서 확인).
  RAG 청킹 시 구조 힌트가 더 많은 쪽이 유리하므로 hwpx 를 우선한다.
- 대안 및 기각 사유:
  - 둘 다 변환 — 동일 내용이 2벌 임베딩되어 검색 결과가 중복되고 인용 근거가 흐려진다. 기각.
  - hwp 우선 — 강조 정보가 적은 쪽을 택할 이유가 없다. 기각.
- 검증: 규칙 자체는 **M4에서 구현·검증 예정 — 현재 미구현**. 근거가 되는 볼드 방출 차이만 M1에서 실측했다.

## [정정] CONTEXT.md §5 포트 전제 — 2026-08-09

- 결정: CONTEXT.md §5 의 **"8080 등 LocalDesk 예약 포트" 전제를 삭제한다.**
- 근거 (실측):
  - 포트 8080 = `ApplicationWebServer.exe` (PID 13356) — **llama 계열과 무관**한 별개 프로세스.
  - LocalDesk 계열 llama-server 는 **8081** 이었다
    (`--port 8081 -c 16384 --jinja --device Vulkan0`, PID 32344).
  - 다만 그 8081 인스턴스의 부모는 `bash.exe scripts/bootstrap_llm.sh` 였으므로,
    **LocalDesk 앱이 직접 띄운 것은 아니다**. LocalDesk 는 Electron 앱이며
    `AppData\Roaming\LocalDesk`(프로필) + `AppData\Local\LocalDesk\llm`(모델 캐시)만 갖고
    실행 파일을 포함하지 않는다.
- 유지되는 원칙: 본 프로젝트는 8090/8091 만 사용하고, 8080 은 **어떤 경우에도 건드리지 않는다.**
- 검증: `netstat -ano` + `Win32_Process` 조회. M2 작업 전후 8080/PID 13356 동일하게 유지됨을 확인.

## [M2] stop_models.ps1 — pid 파일 금지, 포트→PID 조회만 — 2026-08-09

- 결정: `stop_models.ps1` 은 **pid 파일을 읽지 않는다.** 포트(8090/8091) → PID → 이미지 경로 대조 →
  일치할 때만 종료. 불일치 시 종료하지 않고 경고만 남긴다(`-Force` 로만 강제).
- 근거 (stale pid 실증): `<USER>\office-fork-llm\server.pid` 의 값은 **1524** 였으나
  실제 실행 중이던 PID 는 **32344** 였다. pid 파일을 믿었으면 무관한 프로세스를 죽였을 것이다.
- 대안 및 기각 사유: `taskkill /im llama-server.exe` — LocalDesk/타 프로젝트 인스턴스까지 죽인다.
  CLAUDE.md 절대 금지. 기각.
- 검증: 실제 왕복 실행함.
  - `stop_models.ps1` → 8090(PID 2364)·8091(PID 19412) 이미지 경로 대조 통과 후 종료,
    두 포트 해제 확인, **8080/PID 13356 은 변동 없음**.
  - `serve_models.ps1` → 재기동 성공(PID 18424 / 32736), GV-4 재실행 PASS.

## [M2] 런타임 소유권 확보 — CUDA 12.4 빌드 도입 — 2026-08-09

- 결정: llama.cpp 공식 릴리스 **b10298** 의 `llama-b10298-bin-win-cuda-12.4-x64.zip` +
  `cudart-llama-bin-win-cuda-12.4-x64.zip` 을 받아
  `<REPO>\runtime\` 에 전개했다. LLAMA_SERVER 를 이 사본으로 확정.
- 근거: 타 프로젝트(office-fork-llm) 폴더에 런타임을 의존하면 그쪽 정리·업데이트에 깨진다.
  본 프로젝트가 런타임을 소유해야 재현성이 확보된다. GPU 가 NVIDIA RTX 2050 이므로 CUDA 빌드 채택.
- 대안 및 기각 사유: 기존 Vulkan 빌드 공유 — 실행 파일 공유 자체는 무해하나 소유권/재현성 문제가 남는다.
  **CUDA 초기화 실패 시 폴백 대상으로만 유지**했고, 실제로는 폴백이 불필요했다.
- 검증:
  - 다운로드 크기 정확 일치: 250,457,449 B / 391,443,627 B (릴리스 메타데이터 대조)
  - `runtime\llama-server.exe --version` → `version: 10298 (15586e2d7)`
  - `--list-devices` → `CUDA0: NVIDIA GeForce RTX 2050 (4095 MiB, 3308 MiB free)`
  - `runtime\` 에 `ggml-vulkan*` 없음 → GPU 백엔드 CUDA 단독. `ggml-cuda.dll` 512 MB,
    `cublasLt64_12.dll` 452 MB 등 포함, 총 55 파일 1,104.8 MB
  - **CUDA 초기화 실패 없음 → Vulkan 폴백 미발동.**

## [M2] QWEN_GGUF 를 독립 폴더 사본으로 확정 — 2026-08-09

- 결정: 인간이 처음 확정한 `AppData\Local\LocalDesk\llm\...` 대신
  `<USER>\office-fork-llm\Qwen3-4B-Instruct-2507-Q4_K_M.gguf` 로 변경 확정(인간 지시).
- 근거: 두 파일이 **sha256 동일**함을 전량 해시로 검증했으므로 모델 자체는 차이가 없다.
  `3605803B982CB64AEAD44F6C1B2AE36E3ACDB41D8E46C8A94C6533BC4C67E597` (양쪽 동일, 2,497,281,120 B)
  LocalDesk 소유 폴더를 런타임 경로로 물면 LocalDesk 재설치·정리 시 깨지므로 독립 사본이 안전하다.
- 대안 및 기각 사유: LocalDesk 사본 참조 — 읽기 전용이라 원칙 위배는 아니나 수명이 LocalDesk 에 종속된다. 기각.
- 검증: 해시 대조 12.4s, 양쪽 동일. 확정 경로로 chat 서버 기동 성공.

## [M2] bge-m3 다운로드 및 무결성 확인 — 2026-08-09

- 결정: `ggml-org/bge-m3-Q8_0-GGUF` 의 `bge-m3-q8_0.gguf` 를
  `<REPO>\models\` 에 저장. BGE_M3_GGUF 로 확정.
- 검증:
  - 크기 634,553,760 B (기대치 일치)
  - sha256 `aa473d51f451a22f0fcf39ba3330c14bed38a385712b1113440f69df4047a173`
    → **사전 조사 기대값과 완전 일치**. 정지·보고 조건 미발동.

## [M2] 8081 인스턴스 종료 — 2026-08-09

- 결정: 포트 8081 을 점유하던 llama-server(PID 32344)만 종료했다. 재기동 없음 확인.
- 절차 (지시대로 수행): 포트 8081 → PID 32344 조회 → 이미지 경로가
  `<USER>\office-fork-llm\llama-server.exe` 임을 **확인 후** 그 PID 만 `Stop-Process`.
- 검증:
  - 30초간 5초 간격 6회 관찰 → llama-server 프로세스 0개, 8081 LISTENING 0 유지. **재기동 없음.**
  - 부모 `bash.exe`(PID 29236)는 관찰 시점에 **이미 종료된 상태**였다(고아 프로세스였음).
    따라서 스크립트 소유자 확인이 필요한 재기동 상황은 발생하지 않았다.
  - 8080(PID 13356)은 종료 전후 동일 — 건드리지 않았다.

## [M2] 스모크 결과 — 전 항목 통과, OOM 폴백 불필요 — 2026-08-09

- 결정: DESIGN.md §4 **기본안 그대로** 기동에 성공했다. OOM 폴백 순서(ctx 3072 → ngl 28 → ngl 0)를
  발동할 필요가 없었다.
- 검증:

  | 항목 | 결과 |
  |---|---|
  | chat `/v1/models` | `<USER>\office-fork-llm\Qwen3-4B-Instruct-2507-Q4_K_M.gguf` (n_ctx 4096, n_embd 2560, Q4_K-Medium, 4.02B params) |
  | chat 한국어 응답 | "대한민국의 수도는 서울이다. 서울의 대표적인 강은 한강이다." (정확, finish=stop) |
  | chat VRAM | 단독 2,845 MiB / embed 동시 2,926 MiB (총 4,096 중, 여유 1,040 MiB) |
  | embed `/v1/models` | `...\models\bge-m3-q8_0.gguf` |
  | **임베딩 차원** | **1024** — 기대치 일치 |
  | **GV-4** | **PASS** — 동일 문자열 2회 코사인 **정확히 1.0** (|1−cos| = 0.0), 벡터 **비트 단위 완전 동일** |
  | GV-4 위양성 방지 | 다른 한국어 문장 간 코사인 0.325165 → 상수 벡터 아님을 별도 확인 |
  | 생성 속도 | **평균 30.05 tok/s** (3회: 30.23 / 30.18 / 29.73, 재시도 0) |

- GV-4 판정 강화: PRD 는 "동일 문자열 2회 코사인 1.0" 만 요구하지만, 임베딩이 상수 벡터여도
  이 조건은 통과한다. 그래서 **서로 다른 문장 간 코사인이 1.0 이 아님**을 추가 조건으로 넣었다.
  검증 완화가 아니라 강화이므로 GATE 승인 불필요.
- 미검증: `--flash-attn on` / `--cache-type-k/v q8_0` 가 **품질에 미치는 영향은 측정하지 않았다.**
  기동·응답이 정상임만 확인했다. GV-5(오프라인성)도 아직 미실행 — M3 이후.

## [M2] 스크립트 인코딩 규칙 — .ps1 은 UTF-8 BOM 필수 — 2026-08-09

- 결정: 이 저장소의 모든 `.ps1` 은 **UTF-8 BOM** 으로 저장한다.
- 근거: Windows PowerShell 5.1 은 BOM 없는 `.ps1` 을 시스템 ANSI 코드페이지로 읽는다.
  한글 주석·문자열이 깨져 **파서 오류**로 실행 자체가 실패했다(`bench_tokps.ps1` 실측).
- 검증: BOM 재저장 후 `[Parser]::ParseFile` 구문 검사 3개 파일 전부 OK, 실행 정상.

## [M2] bench_tokps.ps1 버그 — PowerShell 변수 대소문자 비구분 — 2026-08-09

- 결정: 벤치 스크립트에서 응답의 prompt 토큰 수를 담던 `$prompt` 를 `$promptTokens` 로 개명했다.
- 근거: **PowerShell 변수는 대소문자를 구분하지 않는다.** 고정 프롬프트 문자열 `$PROMPT` 가
  `$prompt = $r.usage.prompt_tokens` 로 **정수 84 에 덮어씌워져**, 2회차부터 요청 본문의
  `content` 가 숫자가 되어 서버가 HTTP 400
  (`Expected 'content' to be a string or an array`)을 반환했다.
- 진단 경위 (정직성 기록): 처음에는 "재현되지 않는 일시적 오류"로 보였다. 인라인 테스트는
  루프마다 `$PROMPT` 를 재정의해서 통과했고, 스크립트만 2회차부터 실패했기 때문이다.
  **원인 미상 상태로 재시도 로직을 넣은 것은 잘못된 대응이었고**, 실패 본문을 추적해
  변수 충돌을 찾아낸 뒤에야 진짜 원인이 드러났다.
- 재시도 로직은 유지하되 **오류를 삼키지 않도록** 재시도 횟수·마지막 오류를 결과 JSON 에 기록한다.
  수정 후 실측에서는 재시도 0회.
- 검증: 수정 후 3회 연속 성공, `Retries` 컬럼 전부 0.

---

## [M3] 모델 alias 도입 — 2026-08-09

- 결정: chat 에 `--alias qwen3-4b`, embed 에 `--alias bge-m3` 를 추가하고
  `CHAT_MODEL_ID=qwen3-4b`, `EMBED_MODEL_ID=bge-m3` 로 갱신했다 (인간 지시).
- 근거: alias 미지정 시 `/v1/models` 가 GGUF 절대경로 전체를 id 로 노출한다.
  AnythingLLM 의 Chat Model 입력값이 되므로 짧고 안정적인 식별자가 낫다.
- 검증: 재기동 후 `/v1/models` → `qwen3-4b` / `bge-m3`. `serve_models.ps1` 에 반영.

## [M3] AnythingLLM Desktop 설치 — 2026-08-09

- 결정: 공식 CDN 인스톨러로 사용자 공간에 설치했다 (인간 승인).
- 검증:
  - 다운로드 `https://cdn.anythingllm.com/latest/AnythingLLMDesktop.exe`
    394,525,080 B, sha256 `11478D5701163E84387550F30497526C88D4A483EDEE7475F0810529FFA03944`
  - **Authenticode 서명 Valid** — `CN=Mintplex Labs Inc, O=Mintplex Labs Inc, L=Anaheim, S=California, C=US`
  - 무인 설치 `/S` → 버전 **1.15.0-r2**
  - 프로그램: `<USER>\AppData\Local\Programs\AnythingLLM`
  - 저장소: `<USER>\AppData\Roaming\anythingllm-desktop\storage`
  - 내부 백엔드 `127.0.0.1:3001`, collector `127.0.0.1:8888`
- 주의(정직성): `/S` 무인 설치를 `Start-Process -Wait` 로 걸었더니 10분 타임아웃이 났다.
  설치 자체는 정상 완료돼 있었다. 원인은 확인하지 않았다(**미검증 추정**: 설치 후
  앱 자동 실행 프로세스를 기다린 것으로 보임).

## [M3] AnythingLLM 설정 확정값 (DESIGN §5) — 2026-08-09

- 결정: 아래 값으로 고정했다. **임베더·청크 확정 → 문서 투입 순서를 지켰다.**
  설정은 데스크톱 내부 API(`127.0.0.1:3001`, 단일 사용자 모드라 인증 없음)로 적용했다.
  전체 스냅샷: `logs\anythingllm\gate2-settings-snapshot.json`

  | 항목 | 값 |
  |---|---|
  | LLM Provider | `generic-openai` |
  | LLM Base URL | `http://127.0.0.1:8090/v1` |
  | Chat Model | `qwen3-4b` |
  | Token Limit | `4096` |
  | API Key | `sk-local-kdocrag` (로컬 서버는 키 미검증, 형식상 문자열) |
  | Embedder Engine | `generic-openai` |
  | Embedder Base URL | `http://127.0.0.1:8091/v1` |
  | Embedding Model | `bge-m3` |
  | Embedding Max Chunk Length | `2048` (embed 서버 `-c 2048` 과 일치) |
  | **Text Chunk Size** | **512** |
  | **Text Chunk Overlap** | **80** |
  | Vector DB | `lancedb` |
  | Workspace | `kdocs` 1개 |
  | Workspace topN | `4` (기본값, 변경 안 함) |
  | Workspace similarityThreshold | `0.25` (기본값, 변경 안 함) |
  | Workspace vectorSearchMode | `default` (기본값) |

- **Embedder 폴백 미발동**: PRD M3 의 "Generic OpenAI 실패 시 Ollama 폴백" 조건은
  **발동하지 않았다.** Generic OpenAI → `127.0.0.1:8091` 이 정상 동작했다.
  로그 근거: `[GenericOpenAiEmbedder] Initialized bge-m3 {"baseURL":"http://127.0.0.1:8091/v1", ...}`
- 미변경으로 남긴 값: `GenericOpenAiEmbeddingMaxConcurrentChunks=500` (기본값).
  9청크 규모에서는 문제가 없었으나 **대량 문서에서의 동작은 미검증**이다.

## [M3] 워크스페이스 chatMode 를 automatic → query 로 변경 — 2026-08-09

- 결정: `kdocs` 워크스페이스의 `chatMode` 를 **`query`** 로 고정했다.
- 근거: AnythingLLM 1.15 의 신규 워크스페이스 기본값은 `automatic` 이며, 이 모드에서
  스모크 질의가 **RAG 가 아니라 에이전트 루프로 라우팅**됐다.
  응답 전문이 `@agent: Swapping over to agent chat...` 였고 **인용 청크 0개**로,
  RAG 질의가 아예 실행되지 않았다.
- 지시와의 관계 (투명성): 인간 지시 8번은 "인용이 비거나 무관하면 **설정 변경 없이** 원인만 조사"였다.
  다만 그 지시가 지목한 대상은 *청크 크기 / TopK / 유사도 임계* 같은 **검색 튜닝 노브**다.
  이번 건은 튜닝 문제가 아니라 **RAG 질의 경로 자체가 실행되지 않은 구성 문제**여서,
  지시 4번("워크스페이스 생성 및 DESIGN §5 구성")의 범위로 판단해 변경했다.
  **검색 튜닝 노브(TopK 4 / 임계 0.25 / 청크 512·80)는 일절 건드리지 않았다.**
- 검증: 변경 후 동일 질의 → 인용 4개, 근거 문서 정확. (아래 스모크 항목)

## [M3] 텔레메트리·외부 통신 차단 (GV-5 대비) — 2026-08-09

- 결정: `DisableTelemetry=true`, `NetworkDiscovery=false` 로 설정하고 앱을 재시작했다.
- **정직성 기록 — 차단 전에 이미 외부 발신이 있었다**:
  - 최초 부팅 시 `[TELEMETRY ENABLED]` 상태였고 `[TELEMETRY SENT] {"event":"server_boot", "distinctId":"d922414a-..."}` 가 실제로 발신됐다.
  - 차단을 적용하는 순간에도 `[TELEMETRY SENT] {"event":"telemetry_disabled", ...}` 가 한 번 더 발신됐다.
  - 이후 `[TELEMETRY DISABLED] Telemetry is marked as disabled - no events will send.` 로 전환됐다.
  - 별도로 `[ContextWindowFinder] Remote model map synced and cached` 라는 **원격 모델 맵 동기화**도 부팅 중 발생했다. 이 항목의 차단 옵션은 **찾지 못했다(미해결)**.
  - → **GV-5(오프라인성)를 "완전 무통신"으로 주장할 수 없다.** 최초 설치·부팅 단계에
    외부 통신이 존재했음을 명시한다. GV-5 는 M5 에서 이 사실을 전제로 재측정한다.
- 부수 사실: 앱이 **번들 Ollama 엔진(`llm.exe`)을 `127.0.0.1:11434` 에 자동 기동**한다.
  본 프로젝트는 이를 사용하지 않으나 **프로세스는 떠 있다**. 종료·비활성화는 하지 않았다
  (앱 동작에 미치는 영향 미검증).
- 검증: 재시작 후 `/api/setup-complete` → `DisableTelemetry: "true"`, `NetworkDiscovery: "false"`,
  로그에 `[TELEMETRY DISABLED]`.

## [M3] AnythingLLM 설정 API 의 함정 3건 — 2026-08-09

- 결정: 설정 적용 시 아래 3가지를 반드시 지킨다. `scripts\` 에 자동화 스크립트를 두지 않고
  본 문서에 절차로 남긴다(설정은 1회성이며 GUI 로도 가능).
  1. **`/api/system/update-env` 의 값은 문자열로 보낼 것.** `EmbeddingModelMaxChunkLength` 에
     정수 `2048` 을 보내면 HTTP 500 (`n[c].includes is not a function`). `"2048"` 은 정상.
  2. **청크 설정은 `update-env` 로 저장되지 않는다.** `TextSplitterChunkSize` /
     `TextSplitterChunkOverlap` 을 보내면 **HTTP 200 + `newValues: {}` 를 반환하지만 아무것도
     저장하지 않는다** (DB·.env 양쪽 확인). 조용한 무시라 성공으로 오인하기 쉽다.
     실제 경로는 **`POST /api/admin/system-preferences`** 이며 키는 snake_case
     (`text_splitter_chunk_size`, `text_splitter_chunk_overlap`).
     확인은 `GET /api/admin/system-preferences-for?labels=...`.
  3. **비스트리밍 chat 엔드포인트가 없다.** `/api/workspace/{slug}/chat` 은 404 이고
     `stream-chat`(SSE)만 존재한다. → `scripts\anythingllm_query.mjs` 로 SSE 를 직접 파싱한다.
- 검증: 2번은 SQLite 원본을 바이트 검색해 미저장을 확인한 뒤, 올바른 엔드포인트로 재적용해
  `{"text_splitter_chunk_size":"512","text_splitter_chunk_overlap":"80","max_embed_chunk_size":2048}`
  응답으로 확정했다.

## [M3] 문서 투입 — hwpx 우선 규칙 적용 — 2026-08-09

- 결정: `kdocs` 워크스페이스에 **2건**을 투입했다.
  - `2025년+기준+운수업조사+및+기업활동조사+실시.hwpx.md` (hwpx 변환본)
  - `(붙임1)겉표지 있는 보고서(계획서) 서식_보고서 작성 서식 안내.hwpx.md`
  - **`...실시.hwp.md`(hwp 변환본)는 투입하지 않았다** — 중복 임베딩 방지
    (본 문서 "[M4-요구사항] 동일 문서 hwp/hwpx 쌍은 hwpx 우선 변환" 규칙의 첫 적용).
- 지시 문구와의 차이(투명성): 인간 지시 6번은 "md 3종"이라 적었으나 같은 문장에서
  hwp 변환본 제외를 명시했다. `logs\gv2\` 의 문서 변환본은 총 3개이고 그 중 하나가 hwp 변환본이므로,
  **제외 규칙을 우선해 2건만 투입**했다. (나머지 2개 md 는 대조표·크로스체크 리포트이지 문서가 아니다.)
- 검증:
  - 업로드 2건 모두 `{"success":true}`
  - 임베딩 3.3s, **총 9 벡터** (운수업조사 5청크 + 붙임1 서식 4청크)
  - 로그: `[RecursiveSplitter] Will split with {"chunkSize":512,"chunkOverlap":80,...}` — 설정 반영 확인
  - LanceDB 네임스페이스 `kdocs.lance` 생성 확인

## [M3] GATE-2 스모크 질의 결과 — 2026-08-09

- 질의: `운수업조사 담당 부서와 담당자 전화번호는?` (mode=query, 7.9s, SSE 60 이벤트)
- 답변 전문:
  > 운수업조사의 담당 부서는 **경제통계국 산업통계과**이며, 담당자는 **손동현 사무관**입니다.
  > 전화번호는 **(042-481-3748)** 입니다.
- 인용 청크 **4개** 전부 `2025년+기준+운수업조사+및+기업활동조사+실시.hwpx.md` 출처.
  1순위 청크(유사도 **0.7181**)가 표 5 원문을 그대로 포함한다:
  `| 담당 부서 | 경제통계국 | 책임자 | 과 장 | 이현정 | (042-481-2133) |` /
  `|  | 산업통계과 | 담당자 | 사무관 | 손동현 | (042-481-3748) |`
- 판정(Ralph 관찰): 기대 근거(표 5의 산업통계과/손동현/042-481-3748)와 **일치**하며,
  답변의 모든 사실이 1순위 인용 청크 안에 존재한다. 환각 없음. 최종 판정은 GATE-2 인간 몫.
- 기록: `logs\anythingllm\gate2-smoke.json` (답변 + 인용 청크 전문 + 유사도)

---

## [GATE-2] GO 판정 — 2026-08-09

- 결정: 인간이 GATE-2 **GO**. M3 종료, M4 착수.
- 판정 내용:
  1. **스모크 인용 근거성 합격** — 표 5 원문이 1순위 청크(유사도 0.7181)에 존재, 환각 0.
  2. **`chatMode=query` 변경 수용** — 검색 튜닝이 아니라 RAG 경로 구성 결함 수정으로,
     지시 4번(워크스페이스 구성) 범위로 인정. 그대로 유지한다.
  3. **GV-5 재정의** — "완전 무통신" → **"콘텐츠 오프라인성"**.
     합격 기준은 *문서 내용·질의 내용이 외부로 발신되지 않을 것*. 앱 하우스키핑 트래픽은
     결격 사유가 아니며 목록화 + 차단 가능한 것은 차단한다. DESIGN.md §7 을 이 정의로 수정 완료.
  4. 번들 Ollama 처리 방침 확정 (아래 항목).

## [M4] 번들 Ollama — 비활성화 설정 불요, 조건부 미기동 확인 — 2026-08-09

- 결정: 별도 비활성화 설정을 넣지 않는다. **`LLM_PROVIDER=generic-openai` 로 바꾼 뒤로는
  번들 Ollama(`llm.exe`, :11434)가 아예 기동되지 않기 때문**이다.
- 근거 / 검증:
  - 앱 번들에서 `disable*ollama` / `autoStartOllama` 류 **설정 키를 찾지 못했다**.
  - 최초 부팅 시점(LLM_PROVIDER 미설정 = 기본값 `anythingllm_ollama`)에는 `llm.exe` 가
    PID 31768 로 기동해 `127.0.0.1:11434` 를 점유했다.
  - provider 변경 + 앱 재시작 후 실측: `llm.exe`/ollama 프로세스 **0건**, 11434 리스닝 **없음**.
    AnythingLLM 프로세스 8개, 3001/8888 만 리스닝.
  - → "상주 확인 후 기록만" 조건에 해당하지 않는다. **상주하지 않는다.**
- 미검증: LLM provider 를 다시 `anythingllm_ollama` 로 되돌리면 재기동될 것으로 **추정**하나
  확인하지 않았다. RAM 점유량도 상주하지 않으므로 측정하지 못했다.

## [M4] convert_office.py 구현 — 2026-08-09

- 결정: DESIGN.md §3 사양대로 구현했다. 표준 라이브러리만 사용, kordoc 은 `.cmd` 절대경로 +
  **인자 리스트**로 호출(셸 문자열 조립 없음), `--format json --silent` 로 구조화 결과를 받는다.
- 실패 분류 매핑 (M1 GV-3 에서 실측한 에러코드 계약을 그대로 코드화):

  | kordoc 코드 | 이동 위치 |
  |---|---|
  | `ENCRYPTED`, `DRM_PROTECTED` | `_failed\encrypted\` |
  | `UNSUPPORTED_FORMAT`, 지원 외 확장자(`UNSUPPORTED_EXT`) | `_failed\unsupported\` |
  | `PARSE_ERROR`, `NO_SECTIONS`, `CORRUPTED`, `EMPTY_INPUT`, 기타 | `_failed\error\` |
  | 본문 50자 미만 (`TOO_SHORT`) | `_failed\error\` |

- hwpx 우선 규칙: 동일 스템의 `.hwp`/`.hwpx` 공존 시 `.hwp` 를 변환하지 않고 원장에
  `SKIPPED_DUPLICATE_PAIR` + `preferred` + 사유를 기록한다 (파일은 이동하지 않는다 — 실패가 아니므로).
- 종료 코드: 0 = 전건 성공/스킵, 1 = 1건 이상 실패(실패 목록을 stdout 에도 출력), 2 = 전제 불충족.
- 원장 파손 시 **조용히 초기화하지 않는다** — 로그에 노출하고 예외를 올린다.
  전건 재변환은 비싸고, 무엇보다 원인 은폐다.
- 검증: `python -m py_compile` 통과. 파이프라인 실증은 아래 항목.

## [M4] 산출 마크다운 개행을 LF 로 고정 — 2026-08-09

- 결정: `out_md.open(..., newline="")` 로 개행 변환을 끄고 LF 를 유지한다.
- 근거: `Path.write_text` 는 Windows 텍스트 모드라 `\n` → `\r\n` 으로 바꾼다. 그 결과
  같은 입력에서 플랫폼마다 다른 바이트가 나와 **산출물 해시가 불안정**해진다.
  실측: office-md 본문이 GV-2 산출물보다 정확히 개행 수(70자/62자)만큼 길었고,
  개행 정규화 후에는 완전 동일했다.
- 검증: 수정 후 재생성 → CRLF 0개, GV-2 산출물과 **본문 바이트 완전 동일**(`true`).
  이로써 M3 에서 임베딩한 문서와 M4 파이프라인 산출물이 본문 기준 동일함이 확정됐다.

## [M4] 파이프라인 실증 — 2026-08-09

- 테스트 세트 (`C:\Haku\kdocrag\office-inbox\`): samples 정상 3종 + GV-3 `flag-encrypted.hwp`
  + 지원 외 확장자 더미 `테스트발표자료.pptx` = 5건.
- **1회차 결과 (기대와 정확히 일치)** — 종료코드 **1** (일부 실패, 설계대로):

  | 판정 | 대상 | 결과 |
  |---|---|---|
  | 변환 2건 | 운수업조사 hwpx, 붙임1 서식 hwpx | `office-md\*.md` 산출, front-matter 정상 |
  | 쌍 스킵 1건 | 운수업조사 **hwp** | `SKIPPED_DUPLICATE_PAIR` 원장 기록, 파일은 인박스 유지 |
  | 실패 1건 | `flag-encrypted.hwp` | `code=ENCRYPTED` → `_failed\encrypted\` |
  | 실패 1건 | `테스트발표자료.pptx` | `code=UNSUPPORTED_EXT` → `_failed\unsupported\` |

- **2회차 결과**: 인박스 3건(실패분은 이동됨) → 변환 0 / 원장스킵 2 / 쌍스킵 1 / 실패 0,
  종료코드 **0**. **원장 sha256 스킵 동작 확인.**
- front-matter 실측 예: `source: ...hwpx` / `converted: 2026-08-09T02:31:03+00:00` / `sha256: c2531f1b…`
  — 스키마(source/converted/sha256) 준수.

## [M4] 작업 스케줄러 등록 — 2026-08-09

- 결정: `register_task.ps1` 로만 등록했다. **레지스트리 직접 수정 없음.**
  작업명 `kdocrag-convert`, 트리거 평일 12:30, `LogonType Interactive`(로그온 시에만),
  `PYTHON` 은 spec\paths.md 의 절대경로(시스템 파이썬, venv 아님).
- 액션: `cmd.exe /c "python.exe convert_office.py >> logs\task-convert-YYYYMMDD.log 2>&1"`.
  cmd 래퍼를 쓴 이유는 **실패 목록이 stdout 으로 나오므로 스케줄러 로그에서 판독 가능해야** 하기 때문.
- 검증 (실제 실행함):
  - 등록 후 `Get-ScheduledTask` → State `Ready`, Trigger `2026-08-09T12:30:00+09:00`,
    DaysOfWeek `62`(= 월~금 비트마스크), LogonType `Interactive`, UserId `USER`
  - `Start-ScheduledTask` 수동 트리거 1회 → `LastTaskResult=0`
  - **신규 파일 투입 후 재트리거** → `신규투입테스트.md` 실제 산출 확인.
    스케줄러 경로가 변환까지 수행함을 실증했다(등록만 확인하고 끝내지 않았다).
- 잔여물(정직성): 실증용으로 넣은 `신규투입테스트.hwpx`, `gv5테스트.hwpx` 와 그 산출 md 가
  작업 폴더에 남아 있다. `C:\Haku\kdocrag` 는 저장소 밖이며 .gitignore 대상이라 커밋 위험은 없다.
  삭제하지 않았다(인간이 판단할 몫).

## [M5] RAG 품질 평가 — 5/5 합격 — 2026-08-09

- 결정: `spec/eval_questions.md` 의 5문항을 `chatMode=query` 로 실행하고 결과를 `EVAL.md` 에 기록했다.
  판정 3항목(답변 정확성 / 인용 근거성 / 환각 여부)을 문항별로 남겼고, 인용 청크 원문을
  요약 없이 `logs/anythingllm/eval-Q*.json` 에 보존했다.
- 결과: **5/5 합격, 환각 0건, 인용 근거성 5/5.**

  | 문항 | 유형 | 결과 | 1순위 유사도 |
  |---|---|---|---|
  | Q1 | 표 내 행 구분 (책임자 vs 담당자) | 정확 | 0.7033 |
  | Q2 | 표·본문 수치 | 정확 | 0.7616 |
  | Q3 | 본문 각주 | 정확 | 0.6066 |
  | Q4 | 문서 간 라우팅 | 정확 (인용 4/4 올바른 문서) | 0.6630 |
  | Q5 | 환각 함정 | 합격 ("구체적 날짜 명시 안 됨"을 스스로 밝힘) | 0.6442 |

- 특기: Q1 의 1순위 청크에는 책임자 행과 담당자 행이 **동시에** 들어 있었는데도 올바른 행을 골랐다.
  GATE-2 스모크(담당자 질문)에서는 같은 청크에서 반대 행을 골랐다. **표 내 행 구분 능력 확인.**
- 기록해 둘 축약 1건: Q4 답변이 원문의 "위·아래·**머리말·꼬리말**" 4개 값 중 머리말/꼬리말을
  명시하지 않았다. 질문이 좌우/위아래만 물었으므로 오답은 아니나 정보가 축약된 것은 사실이다.
- 평가 대상 문서의 동일성: 임베딩된 문서(M1 GV-2 산출물)와 M4 파이프라인 산출물(`office-md`)의
  **본문 바이트가 동일**함을 확인했으므로, 이 결과는 파이프라인 산출물에 대해서도 유효하다.

### 이 평가가 담보하지 못하는 것 (EVAL.md §5 요약)

- 문서 **2건 / 9 벡터** 규모의 결과다. 실사용 규모의 검색 정확도·topN 적정성은 **미검증**.
- **HWP 5.x 경로 산출물로는 평가하지 않았다** (hwpx 우선 규칙 적용). hwp 단독 문서의 검색 품질 별도 확인 필요.
- PDF/DOCX/XLSX/구버전 HWP 는 샘플이 없어 **변환조차 미검증**.
- 질문 5개가 전부 사실 조회형이다. 요약·비교·추론형 질의 **미평가**.

## [M5] GV-5 콘텐츠 오프라인성 측정 — 2026-08-09

- 결정: 재정의된 기준(DESIGN §7)으로 측정하고 사실만 수집했다. 판정은 GATE-3 인간 몫.
  스크립트 `scripts/gv5_offline_check.ps1`, 기록 `logs/gv5/gv5-20260809-113839.json`.
- 방법: 변환 1회 + 질의 1회를 수행하는 45초 동안 3초 간격 **15회** 커넥션 샘플링.
- 결과:
  - **llama-server(8090/8091) 외부 커넥션 0건** — 15회 샘플 전부.
    문서 본문과 질의/답변 문자열은 이 두 프로세스와 로컬 LanceDB 에서만 처리되므로,
    **콘텐츠 외부 발신 경로는 확인되지 않았다.**
  - AnythingLLM 은 `[2606:4700:20::681a:1ba]:443` 커넥션 1개를 지속 유지했다.
    이 IP 는 `anythingllm.com` / `cdn.anythingllm.com` / `hub.anythingllm.com` 의 AAAA 와 **일치**.
  - 텔레메트리 로그: 차단 이후 **새 `TELEMETRY SENT` 없음**, 재시작 시 `[TELEMETRY DISABLED]`.
- **한계 (반드시 인지)**: 위 443 커넥션의 **TLS 페이로드는 확인하지 않았다.** "하우스키핑"은
  **추정**이며 패킷 수준으로 증명하지 않았다. 완전한 증명은 방화벽으로 AnythingLLM 아웃바운드를
  차단한 뒤 동작을 확인하는 절차가 필요하며 **이번에 수행하지 않았다.**

---

## [GATE-3] 최종 감사 — 조건부 GO — 2026-08-09

- 결정: 인간이 GATE-3 **조건부 GO**. M1~M5 전 마일스톤 합격, 프로젝트 종결.
- 판정:
  1. **핵심 가설 입증** — 한글 공문서 표의 로컬 RAG 검색이 5/5로 동작.
  2. 미검증 9건을 3분류로 처분 (아래).

### 미검증 9건 처분

| # | 항목 | 처분 | 결과 |
|---|---|---|---|
| 2 | HWP 5.x 산출물 RAG 미평가 | **즉시 해소** | 완료 — 가설 기각 (아래 항목) |
| 3 | PDF/DOCX/XLSX 변환 미검증 | **즉시 해소** | 완료 — 3/3 성공 (아래 항목) |
| 6 | 스케줄러 12:30 자동 발화 미관측 | **즉시 해소** | 확인 절차를 README §2 로 문서화, 발화 확인은 인간 몫 |
| 9 | 테스트 잔여물 | **즉시 해소** | 14건 삭제 (아래 항목) |
| 1 | 문서 2건 규모 평가 | **실사용 해소** | 실제 문서를 쌓으며 관찰. 지금 인위적 대량 테스트는 비용 대비 효용 낮음 |
| 7 | 사실 조회형 질문만 평가 | **실사용 해소** | 요약·비교형 질의는 실사용에서 자연히 드러남 |
| 8 | 대량 임베딩 안정성 미검증 | **실사용 해소** | `MaxConcurrentChunks=500` 기본값. 실패 시 낮추는 것으로 대응 |
| 4 | 실제 암호/배포용 HWP 복호화 미검증 | **수용 리스크** | 샘플 확보 실패(404/뷰어 전용). 실패해도 `_failed\encrypted\` 로 **깨끗하게 분류**되므로 데이터 손실이 없다. 필요 시점에 실물로 확인 |
| 5 | GV-5 TLS 페이로드 미확인 | **수용 리스크** | 콘텐츠 발신 경로인 llama-server 외부 커넥션이 0건임은 확인됐다. AnythingLLM 의 443 커넥션 내용 증명은 방화벽 차단 실험이 필요하며 **기성품(A안) 채택의 대가로 수용**한다 |

## [GATE-3] #2 해소 — hwp 단독 경로 검증: 가설 기각 + 신규 결함 발견 — 2026-08-09

- 결정: **"HWP 5.x 경로가 hwpx보다 검색 품질이 낮다"는 가설을 기각한다.**
  동시에 **front-matter 가 답변 품질을 떨어뜨린다**는 신규 결함을 기록한다.
- 방법: 운수업조사 hwp 를 스템명 변경 사본으로 인박스에 넣어 hwp 경로로 변환.
  임시 워크스페이스 2개를 만들어 통제 비교 후 **전부 제거**(`kdocs` 9벡터 무변동 확인).
- 검증 (각 조건 2~3회 반복):

  | 워크스페이스 | 문서 | front-matter | Q1 | Q2 |
  |---|---|---|---|---|
  | `kdocs` | hwpx + 붙임1 (GV-2 산출물) | 없음 | **정답 3/3** | 정답 2/2 |
  | `tmp-hwpx-check` | hwpx + 붙임1 (office-md) | 있음 | **오답 3/3** | 정답 2/2 |
  | `tmp-hwp-check` | **hwp** (office-md) | 있음 | **오답 3/3** | 정답 2/2 |

- **결론 1 (hwp vs hwpx)**: 동일 조건(`office-md`)에서 hwp 와 hwpx 가 **동일하게 동작**했다.
  M1 에서 실측한 볼드 마커 차이는 실재하지만 **답변 품질에 영향을 주지 않았다.**
  → hwpx 우선 규칙은 **중복 임베딩 방지 목적으로만 유효**하며, "검색 품질 우월" 근거는 철회한다.
- **결론 2 (front-matter, 신규 결함)**: `kdocs` 와 `tmp-hwpx-check` 는 front-matter 유무만 다른데
  Q1 결과가 정반대로 갈렸다. 원인은 인용 청크 대조로 확정했다 —
  **양쪽 다 1순위 청크에 정답이 들어 있었고**(`이현정`, `042-481-2133` 포함, score 0.70+),
  차이는 2순위 청크였다. `office-md` 쪽 2순위가
  `---\nsource: ...\nconverted: ...\nsha256: c2531f1b7208…` 즉 **front-matter 통짜 청크**였다.
  sha256 해시 문자열 같은 무의미 토큰이 컨텍스트에 섞이면서 4B 모델이 표에서 답을 뽑지 못했다.
  **검색은 정상이고 생성이 실패했다.**
- 대안 및 기각 사유: front-matter 스키마 변경 — DESIGN §3 규정이고 CLAUDE.md 가 임의 변경을
  금지한 항목이다. **GATE 승인 없이 바꾸지 않았다.** 선택지(사이드카 분리 / 투입 직전 제거 /
  topN 상향 / 수용)를 EVAL.md 부록 A.5 에 정리했고 **Ralph 권고는 사이드카 분리 또는 전처리 제거**다.
- 한계: 질문 2개(Q1·Q2)만 비교했고 **Q2 는 세 조건 모두 정답**이었다. 즉 "표에서 특정 행을
  집어내는" 질문에서만 재현됐으며 일반화 범위는 확인하지 않았다. 온도 미고정, 통계 검정 없음.

## [GATE-3] #3 해소 — 포맷 스모크 (PDF/DOCX/XLSX) — 2026-08-09

- 결정: 공개 출처 무해 샘플로 3포맷 변환 경로를 확인했다. **RAG 에는 투입하지 않았다.**
- 샘플 출처 (전부 공개, 회사 데이터 아님):

  | 포맷 | URL | 크기 |
  |---|---|---|
  | PDF | `https://www.orimi.com/pdf-test.pdf` | 20,597 B |
  | DOCX | `https://calibre-ebook.com/downloads/demos/demo.docx` (Calibre 공식 데모) | 1,311,881 B |
  | XLSX | `https://go.microsoft.com/fwlink/?LinkID=521962` (Microsoft Financial Sample) | 83,418 B |

  참고로 `https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf` 도 받았으나 미사용.

- 검증 (`convert_office.py` 로 파이프라인 그대로 통과):

  | 포맷 | 변환 | 산출 본문 | 표 | 표 행 | U+FFFD | PUA | 단독자모 | 제어문자 |
  |---|---|---|---|---|---|---|---|---|
  | PDF | **성공** | 465자 / 23줄 | 0 | 0 | 0 | 0 | 0 | 0 |
  | DOCX | **성공** | 11,658자 / 220줄 | **4** | 25 | 0 | 0 | 0 | 0 |
  | XLSX | **성공** | 98,322자 / 704줄 | **1** | **702** | 0 | 0 | 0 | 0 |

  3/3 성공, 깨짐 지표 전부 0, kordoc 경고 0건. XLSX 는 `## Sheet1` 헤딩 + 16열 표로 방출됐다.
- 한계: 세 샘플 모두 **영문**이다. **한글 PDF/DOCX/XLSX 는 여전히 미검증.**
  PDF 샘플에 표가 없어 **PDF 표 추출 능력은 검증되지 않았다.** 스캔 PDF 미시험(PRD 비범위).

## [GATE-3] #9 해소 — 테스트 잔여물 삭제 — 2026-08-09

- 결정: 인간 승인에 따라 테스트 잔여물 **14건**을 삭제하고 원장에서 **6건**을 정리했다.
  실물 샘플 파생 정상 산출물(운수업조사 hwp/hwpx, 붙임1 + 각 md)은 **작동 상태 보존을 위해 남겼다.**
- 삭제 목록 (전문은 Log.md):
  - inbox: `신규투입테스트.hwpx`, `gv5테스트.hwpx`, `hwp단독검증_운수업조사.hwp`,
    `포맷스모크_pdf.pdf`, `포맷스모크_docx.docx`, `포맷스모크_xlsx.xlsx`
  - office-md: 위 6건의 산출 md 6개
  - `_failed\encrypted\flag-encrypted.hwp`, `_failed\unsupported\테스트발표자료.pptx`
- 정리 후 `_failed` 0건, inbox 3건, office-md 2건 + 원장.
- 검증: 정리 후 파이프라인 재실행 → 변환 0 / 원장스킵 2 / 쌍스킵 1 / 실패 0, **종료코드 0**.

## [GATE-3] 원장 BOM 내성 추가 — 2026-08-09

- 결정: `load_ledger` 를 `utf-8-sig` 로 읽도록 바꿨다.
- 근거: 잔여물 정리 중 PowerShell `Out-File -Encoding utf8` 이 원장에 **BOM 을 붙였고**,
  `convert_office.py` 가 `Unexpected UTF-8 BOM` 으로 **실행을 중단**했다.
  이는 설계대로 동작한 것이다 — 원장 파손을 조용히 삼키지 않고 노출했다.
  다만 사람이 PowerShell/메모장으로 원장을 열어보는 일은 흔하므로 BOM 은 허용하는 편이 맞다.
- **이것은 검증 완화가 아니다.** 인코딩 관용일 뿐 JSON 내용 검사는 그대로다.
- 검증: BOM 제거 + `utf-8-sig` 적용 후 `py_compile` 통과, 파이프라인 재실행 종료코드 0.

## [GATE-3] 운영 전환 문서 작성 — 2026-08-09

- 결정: `README.md` 를 신규 작성했다. 포함 내용 —
  서버 기동/종료, 문서 투입 위치, 실패 확인 위치, **재임베딩이 필요한 변경 목록**,
  **월요일 12:30 자동 발화 확인 절차**(로그 경로 + 기대 라인 + `LastTaskResult` 해석),
  **HP 15-fc1061AU 이식 변경점**(runtime 을 Vulkan 빌드로 교체, `-ngl 0`, 포트·alias·설정 동일),
  스크립트 목록, 알려진 제약.
- 특기: README 1-3 에 **front-matter 오염 경고와 임시 회피책**(투입 전 front-matter 제거)을 명시했다.
  근본 해결은 인간 결정 대기 중이므로 운영 문서에는 회피책만 적었다.

---

## [종결] 메타데이터 사이드카 분리 채택 — 2026-08-09

- 결정: 인간 지시로 **사이드카 분리안(A안)을 채택**했다.
  - `DESIGN.md §3` 개정 + `§3.1 메타데이터 사이드카` 신설
  - `CLAUDE.md` 의 "front-matter 스키마 불변" → **"사이드카 스키마 불변"** 으로 개정
  - `convert_office.py`: md 는 **본문만**, 메타는 `<스템>.md.meta.json` 으로 분리. 원장 로직 무변경.
- 사이드카 스키마 (불변): `{ "source", "converted", "sha256" }` — 종전 front-matter 와 동일 필드.
  UTF-8 / LF 고정.
- 검증:
  - `py_compile` 통과.
  - 기존 md 삭제 → 재실행 시 원장의 **"산출물 부재" 경로로 자연 재변환** (변환 2 / 실패 0, exit 0).
  - 재생성 md **front-matter 부재 확인** (첫 줄이 바로 표 행).
  - 사이드카 2개 생성 확인, 내용이 스키마와 일치.
  - 재생성 md 가 GV-2 산출물과 **바이트 완전 동일**(sha256 일치) — 회귀 비교가 쉬워졌다.

## [종결] **[중대 정정]** front-matter 인과 결론 철회 — 진짜 원인은 대화 이력 프라이밍 — 2026-08-09

- 결정: GATE-3 부록 A 의 **"front-matter 가 Q1 실패의 원인"이라는 결론을 철회한다.**
  진짜 원인은 **AnythingLLM 워크스페이스에 누적된 대화 이력(`openAiHistory: 20`)의 프라이밍**이었다.
- 발견 경위: 사이드카 분리 후 회귀 검증에서 **Q1 이 그대로 3/3 실패**했다.
  front-matter 를 제거했는데 증상이 남았으므로 그것은 원인이 아니었다.
- 원인 규명 (결정적 증거 2건):
  1. **검색 컨텍스트가 동일했다.** 성공(`kdocs`)과 실패(`tmp-sidecar2`)의 인용 4개 청크
     **본문이 완전히 동일**(집합 비교 `true`). 차이는 청크 헤더의 파일명·타임스탬프뿐이었다.
  2. **이력만 분리한 통제 실험.** `kdocs` 안에 **새 스레드**를 만들면 벡터·설정은 그대로이고
     이력만 비어 있다.

     | 조건 | 벡터 | 설정 | 대화 이력 | Q1 |
     |---|---|---|---|---|
     | `kdocs` 기본 스레드 | 9 | 동일 | 누적됨 | **정답 3/3** |
     | `kdocs` 새 스레드 | 9 (동일) | 동일 | **없음** | **오답 3/3** |

     같은 워크스페이스·같은 벡터에서 **이력 유무만으로 결과가 갈렸다.**
- **부록 A 의 방법론 오류**: `kdocs`(이력 있음)와 임시 워크스페이스(이력 없음)를 비교하면서
  **이력을 통제하지 않았다.** "단일 변수 비교"라고 적었으나 실제로는 변수가 둘이었고,
  그 상태로 인과를 단정한 것이 잘못이다. 이후 이런 비교에는 **같은 워크스페이스의 새 스레드**를 쓴다.
- **사이드카 분리는 유지한다 (근거 교체).** 인과는 뒤집혔지만
  front-matter 블록이 **독립 청크로 잡혀 유사도 0.5992 로 2순위에 오른 것은 실측 사실**이고,
  본문 청크 하나를 topN 4 밖으로 밀어냈다(가용 컨텍스트의 25% 손실).
  **임베딩 위생 목적으로는 타당하나, 답변 품질 개선 효과는 입증되지 않았다.**
  DESIGN §3.1 과 코드 주석의 근거 문구를 이에 맞게 고쳤다.

## [종결] EVAL 점수 정정 — 무이력 기준 4/5 — 2026-08-09

- 결정: EVAL.md 의 "5/5 합격"은 **이력이 누적된 스레드에서 측정한 값**임을 명시하고,
  **이력 없는 첫 질문 기준 실제 점수는 4/5** 로 정정했다 (EVAL.md 부록 C).
- 재측정 (질문마다 전용 새 스레드, 이력 0, 기록 `logs/anythingllm/nohistory-eval.json`):

  | 문항 | 무이력 결과 |
  |---|---|
  | Q1 | **오답** — 1순위 청크에 `이현정 / (042-481-2133)` 이 있는데도 "확인할 수 없다"고 답함 |
  | Q2 | 정답 |
  | Q3 | 정답 |
  | Q4 | 정답 (질문 범위 내) |
  | Q5 | 환각 없음. 단 "구체적 날짜 없음"을 명시하지 않아 이력 버전보다 약함 |

  **4/5, 환각 0건, 인용 근거성 5/5 유지** (모든 답변의 근거가 검색 청크 안에 있었다).
- **드러난 실제 한계**: Qwen3-4B 가 **같은 표 안의 유사한 행(책임자/담당자)을 대화 맥락 없이
  구분하지 못한다.** 검색은 정상이므로 **생성 단계의 한계**다. 값이 하나뿐인 질문(Q2~Q4)은 문제없다.
- 대응 후보 (전부 **미검증**): 더 큰 모델, 리랭커 도입, 행 단위 청킹.
  실사용 대응: 인용 청크를 직접 확인하거나 대화를 이어가며 되묻는다. README 1-3 에 기재.
- 정리: 실험용 임시 워크스페이스(`tmp-sidecar-check`, `tmp-sidecar2`)와 `kdocs` 임시 스레드 6개를
  **전부 삭제**했다. 최종 상태 — 워크스페이스 `kdocs` 단독, **9 벡터 무변동**.

## [운영] 더블클릭 진입점 배치 파일 추가 — 2026-08-09

- 결정: 루트에 `Start-LocalRAG.bat` / `Stop-LocalRAG.bat` 를 추가했다.
  - Start: 8090/8091 리스닝이면 서버 기동 **건너뜀** → `/health` 두 포트 확인 → AnythingLLM 실행
    (이미 실행 중이면 건너뜀). 창은 `pause` 로 유지.
  - Stop: `stop_models.ps1` 만 호출. **AnythingLLM 은 종료하지 않는다.**
- **배치 파일은 ASCII 전용으로 작성한다** (중요):
  처음 한글 메시지·주석으로 작성했더니 cmd.exe 가 `.bat` 의 멀티바이트 바이트를 잘못 파싱해
  `'SERVE' is not recognized...` 류로 실행이 깨졌다. **UTF-8(BOM 없음)과 UTF-8 BOM 둘 다 실패**했다
  (`chcp 65001` 을 첫 줄에 둬도 소용없음 — 파서가 이미 읽은 바이트 오프셋이 어긋난다).
  → 배치 메시지는 영문으로 두고 한글 설명은 README 에 둔다. 파일 상단 주석에도 이 사유를 남겼다.
  대안으로 CP949 저장도 가능하나 비한국어 Windows 에서 깨지므로 기각.
- 검증 (4개 경로 전부 실제 실행):

  | 경로 | 결과 |
  |---|---|
  | Start — 서버 이미 구동 중 | `skipping server start` → health OK → 앱 `already running` → exit 0 |
  | Stop | 8090/8091 종료, **리스닝 0건**, llama-server 프로세스 0개, **AnythingLLM 8개 생존**, 8080 무변동 |
  | Start — 서버 내려간 상태 | 실제 기동(chat PID 24700 / embed PID 30444), health OK, **25.6초** |
  | Start — 앱 종료 상태 | `launching...` → AnythingLLM 기동, 백엔드 `/api/ping` online 확인 |

- README 갱신: §1-1 에 배치 표 + **바탕화면 바로가기 생성 절차**(오른쪽 클릭 → 보내기 →
  바탕 화면에 바로 가기 만들기) + ASCII 전용 사유, §4 스크립트 목록에 배치 2건 추가.

## [운영] 바탕화면 바로가기 생성 — 2026-08-09

- 결정: PowerShell `WScript.Shell` COM 으로 바탕화면에 `.lnk` 2개를 생성했다.
  탐색기 GUI 조작 대신 스크립트로 만들어 재현 가능하게 했다.
- 생성 결과 (실존 확인 완료):

  | 바로가기 | TargetPath | WorkingDirectory |
  |---|---|---|
  | `Start-LocalRAG.lnk` (1,111 B) | `...\Local-rag\Start-LocalRAG.bat` | `...\Local-rag` |
  | `Stop-LocalRAG.lnk` (1,110 B) | `...\Local-rag\Stop-LocalRAG.bat` | `...\Local-rag` |

  두 바로가기 모두 `TargetPath` 실존 `True` 확인. Description 에 용도를 한글로 기재.
- **관측 사실**: 이 PC 의 바탕화면은 **OneDrive 로 리디렉션**돼 있다
  (`<USER>\OneDrive\바탕 화면`). 따라서 두 `.lnk` 는 OneDrive 에 동기화된다.
  `.lnk` 내용은 **로컬 경로 문자열뿐이고 문서 내용이 아니므로** IP/보안 경계(CONTEXT §4) 위반은 아니다.
  다만 다른 PC 에서 이 바로가기를 열면 경로가 달라 동작하지 않는다는 점은 인지할 것.
- 재생성 방법 (다른 PC 이식 시):

  ```powershell
  $sh = New-Object -ComObject WScript.Shell
  $l = $sh.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'Start-LocalRAG.lnk'))
  $l.TargetPath = 'C:\...\Local-rag\Start-LocalRAG.bat'
  $l.WorkingDirectory = 'C:\...\Local-rag'
  $l.Save()
  ```

## [경로] 데이터 루트를 저장소 내부로 이전 — 2026-08-09

- 결정: 데이터 루트를 `C:\Haku\kdocrag` → **`<REPO>`**(저장소 루트)로
  변경했다. `office-inbox\`, `office-md\`, `logs\` 가 전부 저장소 기준이 된다.
- **경위 (왜 틀린 경로였나)**: `C:\Haku\...` 는 **맥미니 쪽 경로 관습을 이 프로젝트에 잘못 이식**한 것이다.
  DESIGN.md 초안에 그대로 적혔고 M4까지 검증 없이 따라갔다. 데이터와 코드가 분리돼 있을 이유가
  이 프로젝트에는 없었다 — 저장소가 곧 작업 루트인 편이 백업·이식·경로 추적 모두 단순하다.
- 대안 및 기각 사유:
  - `C:\Haku\kdocrag` 유지 — 근거 없는 관습. 이식 시 경로를 또 만들어야 한다. 기각.
  - `spec/paths.md` 에 DATA_ROOT 키 추가 — 키가 늘수록 이식 실수 지점이 늘어난다.
    `--root` 인자로 이미 재정의 가능하므로 불필요. 기각.
- 구현: `convert_office.py` 의 `DEFAULT_ROOT = REPO_ROOT`. `--root` 인자는 그대로 유지.
- 데이터 이전: 구 루트의 **파일 8건 전부 이동** (샘플 3, 산출 md 2 + 사이드카 2, 원장 1).
  이동 후 구 루트에 **파일 0건 / 빈 디렉터리 5개**만 남아 `C:\Haku\kdocrag` 를 삭제했다.
  (`C:\Haku` 는 kdocrag 외 항목이 없었으나 상위 폴더라 건드리지 않았다.)
- `.gitignore` 확인: `office-inbox/`, `office-md/`, `logs/` **이미 전부 존재** — 추가 작업 불필요.
  현재 `.git` 이 없어 커밋 이력 자체가 없다. `git init` 후 `git status` 로 재확인할 것.
- IP 경계 (DESIGN §2.1 신설): 실데이터가 저장소 **폴더 안**에 놓이지만 `.gitignore` 로
  **커밋 대상이 아니다.** 단 저장소를 통째로 압축·클라우드 동기화하면 함께 나가므로 백업 시 주의.
- 스케줄러: `register_task.ps1` 재실행으로 재등록. 작업 디렉터리는 원래 저장소 루트였고
  `--root` 를 넘기지 않으므로 새 기본값을 그대로 따른다.
- 문서 갱신: DESIGN §2(+§2.1 신설)·§3, README §1-2/§1-4/§2, CONTEXT §4.
  **Log.md 와 DECISIONS.md 의 과거 `C:\Haku` 언급은 당시 사실 기록이므로 고치지 않았다.**
- 검증:
  - `py_compile` 통과
  - convert 1회 실행 → `root=<REPO>`, 원장스킵 3 / 쌍스킵 1 정상
  - 스케줄러 수동 트리거 → **LastTaskResult=0**, NextRunTime `2026-08-10 12:30:00`

## [결함] kordoc 4.7.2 — 일부 DOCX/XLSX 에서 종료코드 0 + 빈 출력 — 2026-08-09

- 발견: 경로 이전 검증 중, 인간이 인박스에 넣어둔 **실사용 문서 2건**이 실패했다.
  (DOCX 10,152 B / XLSX 7,750 B — 파일명·내용은 회사 자산이므로 여기 적지 않는다.)
- 증상: kordoc 이 **30~55초 소요 후 종료코드 0 + stdout 완전히 빈 출력**. stderr 도 비어 있다.
  `--format json` / 기본 markdown 모드 **양쪽 동일**.
- 분리 검증한 것:
  - **파일명 인코딩 무관** — ASCII 이름으로 복사해도 45.3초 후 빈 출력으로 동일 재현.
  - **포맷 전반 문제 아님** — GATE-3 포맷 스모크의 공개 DOCX(1.3MB)·XLSX(83KB)는 정상 변환됐다.
  - **손상 파일 아님** — DOCX 는 정상 OOXML(엔트리 22개, document.xml 15,721자, 표 3개, 이미지 0).
  - **OCR 모델 다운로드 아님** — `~\.cache\kordoc` 이 생성되지 않았다.
  - 원인은 **미규명**. kordoc 내부에서 무언가 45초쯤 걸린 뒤 조용히 포기하는 것으로 보이나
    코드로 확인하지 않았다(**추정**).
- 파이프라인 대응 (정상 동작 확인): 두 파일 모두 `_failed\error\` 로 분류·이동됐고
  종료코드 1 + 실패 목록이 stdout 에 출력됐다. **문서가 조용히 사라지지 않았다.**
- 코드 개선: 빈 출력과 깨진 JSON 을 구분하도록 고쳤다.
  - 종전: 두 경우 모두 `code=None`, `"kordoc 출력이 JSON 이 아니다"`
  - 개선: 에러코드 **`NO_OUTPUT`** 신설(→ `_failed\error\`), stderr 에
    빈 출력인지 파싱 실패인지 구체 사유를 덧붙인다.
- **미해결 — 인간 판단 필요**: 이 두 문서는 현재 변환 불가다. 후보 대응
  ① 한/글이나 Word 로 다시 저장(re-save)해 구조를 정규화한 뒤 재투입
  ② kordoc 상류(github.com/chrisryugj/kordoc)에 재현 파일과 함께 이슈 등록
  ③ 해당 포맷만 다른 변환기로 우회
  **어느 것도 시도하지 않았다.** 회사 문서라 상류 이슈 등록 시 파일 공유 가능 여부는 인간이 판단할 사안이다.

## [결함-후속] NO_OUTPUT 2건 해소 — 다만 **인과는 규명하지 못했다** — 2026-08-09

- 상태: **해결됨.** 두 파일 모두 파이프라인에서 정상 변환된다 (총 2초, 종료코드 0).
  - DOCX → 1,174자 / 표 3개 / 표 행 16 / 깨짐 0
  - XLSX → 3,750자 / 표 1개 / 표 행 42 / 깨짐 0
  - Linux 참조값(DOCX 표 3개, XLSX 40행)과 **표 구조 일치**.
    문자 수는 다르나(Linux 1,955 / 5,390) 측정 기준 차이인지 실제 차이인지 **확인하지 않았다.**
- 새 정보(인간 제공): 두 파일은 회사 문서가 아니라 **Claude 생성 가상 테스트 문서**이며,
  **동일 kordoc 4.7.2 가 Linux 에서는 완전 변환**한다. → 파일 정상, Windows 환경 특정 문제.

### 조사 결과 — 배제한 원인들 (전부 실험으로 반증)

| 가설 | 검증 방법 | 결론 |
|---|---|---|
| **MotW(Zone.Identifier)** | 두 파일에 `ZoneId=3` 존재 확인 → `Unblock-File` 적용 | **원인 아님** |
| 〃 (대조) | **성공한 PDF 도 `Zone.Identifier` 를 갖고 있었다** | MotW 있어도 성공 |
| 〃 (역실험) | docx 에 **Zone.Identifier 재부착 후 3회 실행** | **3회 모두 0.7초 성공** — 인과 반증 |
| stdout 파이프 vs 파일 | 파일 리다이렉트 3회 / 파이프 3회 비교 | 둘 다 성공. **무관** |
| 파일명 인코딩 | ASCII 이름으로 복사해 실행 | 무관 (앞서 확인) |
| 파일 손상 | ZIP 구조 정상, 지금 완전 변환됨 | 무관 |
| OCR 모델 다운로드 | `~\.cache\kordoc` 미생성 | 무관 |

### 남은 사실 — 시간 의존성

증상은 **시간이 지나며 사라졌다.** 동일 파일·동일 명령의 소요 시간 추이:

`34.7초(실패) → 45.3초(실패) → 55초(실패) → 7분 29초(실패) → 0.7초(성공, 이후 계속)`

- 실패 시 공통: **종료코드 0 + stdout 완전 공백 + stderr 공백**.
- 성공 전환 시점은 `Unblock-File` 실행 직후 구간이나, **재부착 실험이 인과를 반증**했다.
  즉 "Unblock 했더니 고쳐졌다"는 **선후관계일 뿐 인과가 아니다.**
- 유력 가설: 백신/평판 검사(두 파일에 `RVContext` 스트림 존재)가 첫 접근 시 클라우드 조회로
  파일 읽기를 지연시키고, kordoc 이 내부적으로 조용히 포기 → 조회 결과가 캐시된 뒤 정상화.
  **검증 실패**: `Get-MpPreference` 가 `0x800106ba` 로 조회 불가(Defender 서비스 비활성 또는
  서드파티 백신 추정). **이 가설은 확인도 반증도 하지 못했다.**

### 환경 정보 (재현 시 참고)

`Windows 11 Pro build 26200` / `node v22.14.0` / `npm 10.9.2` / `kordoc 4.7.2` /
`Intel Core Ultra 7 155H`

### 부가 관찰 — 포맷 감지 라벨

인간이 전한 "Linux 로그에서 docx/xlsx 가 `(hwpx)` 로 표기됨" 건은 **Windows 에서 재현되지 않았다.**
`--format json` 의 `fileType` 필드가 각각 `docx`, `xlsx` 로 정확했다.
단 `--format json` 사용 시 CLI 진행 메시지 자체가 출력되지 않아 **라벨 문자열 직접 비교는 못 했다.**

### 코드 변경 없음

`NO_OUTPUT` 에러코드 신설(직전 항목)은 그대로 유지한다. 증상이 재발하면 같은 코드로 분류되며,
빈 출력임이 stderr 에 기록되므로 진단이 빨라진다.

### 미해결로 남기는 것

**근본 원인 미규명.** 재발 가능성을 배제할 수 없다. 재발 시 확보할 것:
① 실패 순간의 `netstat`/프로세스 CPU(대기인지 연산인지) ② 백신 실시간 검사 로그
③ 동일 파일을 다른 폴더(예: 백신 예외 경로)로 옮겨 재시도. **셋 다 이번에 하지 않았다.**

## [튜닝] 검색 설정 실험 — 원인은 검색이 아니라 대화 이력이었다 — 2026-08-09

- 배경: 인간이 문서 3건을 추가 임베딩(총 **29 벡터**)하고 실전 7문항으로 평가해 **4/7**.
  실패 3건은 오답이 아니라 전부 **"정보 없음"** 응답이었고, "검색 계층 실패"로 진단됐다.
- **결정: 그 진단을 기각한다.** 실패 원인은 **대화 이력이 생성을 오염시킨 것**이다.
- 근거 (전부 실측):
  1. `topN=29`/`threshold=0` 으로 전체 랭킹을 덤프 → 정답 청크가 **F2 1위(0.5988) /
     F4 2위(0.6673) / F5 1위(0.6536)**. **topN 4 밖으로 밀린 적이 없다.**
  2. 설정 그대로 **새 스레드**에서 재질의 → **3/3 정답.** 실패가 재현되지 않았다.
  3. 실전 스레드의 도입부(워밍업 5턴, 약 3,500자)를 재현하니 **3/3 실패 재현.**
     이때도 **정답은 인용 청크에 그대로 있었다.**
  4. ctx 초과 아님 — llama-server 로그 `truncated = 0`, 최대 `n_tokens = 3,285` (< 4096).
  5. 실패 답변이 워밍업 때 **모델 자신이 만든 부정확한 요약**("모든 장비 판정은 적합")을
     반복했다. 새 근거보다 자기 이전 발언을 신뢰한 것.
- 조건별 실험 (긴 이력 고정, 변수 하나씩, 실패 3문항):

  | 조건 | 점수 | 판정 |
  |---|---|---|
  | base (topN 4 / thr 0.25 / history 20) | 0/3 | 재현 |
  | a) topN 8 | 0/3 | **효과 0** |
  | b) threshold 0.15 | 0/3 | **효과 0** |
  | c) `vectorSearchMode: rerank` | 1/3 | 부분 효과, 생성 속도 28~30 → **10 t/s** |
  | **d) `openAiHistory` 2** | **3/3** | **유일한 완전 해결** |
  | d2) `openAiHistory` 0 | 0/3 | **무효 — 아래 참조** |

- **`openAiHistory 0` 은 설정 불가**: 백엔드가 `openAiHistory||20` 으로 처리한다.
  JS 에서 `0 || 20 = 20` 이므로 **0 이 20 으로 폴백**된다. d2 는 base 와 동일 조건이었다.
- 최적 조합 확정: `history 2` 단독과 `history 2 + rerank` 가 **동점 3/3** → **단순한 쪽 채택.**
  rerank 는 같은 점수에 생성 속도만 1/3 로 떨어뜨린다.

### 확정 설정 (변경은 2건뿐)

| 항목 | 값 | 변경 |
|---|---|---|
| `openAiHistory` | **2** | **20 → 2** |
| chat ctx | **6144** | 4096 → 6144 |
| topN / threshold / vectorSearchMode | 4 / 0.25 / default | **유지** |
| chunk size / overlap | 512 / 80 | 유지 |

- ctx / VRAM 실측: 4096 → 2,851 MiB used(1,115 free) / **6144 → 3,086 MiB used(880 free)**.
  +235 MiB, **OOM 없음** → 지시된 topN 6 폴백 불필요.
  ctx 6144 는 topN 8 실험용으로 올린 값이나, 확정 조합(topN 4)에서 4096 으로도 충분한지는
  **측정하지 않았다.** 안전 마진으로 유지한다.

### 최종 측정 — 실전 7문항 **4/7 → 7/7**

| 조건 | 점수 |
|---|---|
| 새 스레드 (이력 없음) | **7/7** |
| 긴 이력 (실전 조건, 워밍업 3,647자) | **7/7** |

함정 문항(재교정 비용, 문서에 없음)도 "없다"고 답하고 금액을 지어내지 않았다. **환각 0.**
상세 표는 EVAL.md 부록 D.

- 대안 및 기각 사유:
  - topN 상향 — 효과 0 이고 ctx 예산만 먹는다. 기각.
  - threshold 하향 — 정답 유사도가 0.60~0.67 로 임계 0.25 를 크게 웃돌아 무의미. 기각.
  - rerank 상시 활성 — 동점인데 생성 속도가 1/3. 기각(필요 시 개별 워크스페이스에서만).
- 미검증: `history 2` 가 **후속 질문의 맥락 유지**(대명사 참조 등)에 미치는 영향은 측정하지 않았다.
  실사용에서 관찰할 항목이다. 워밍업 문구가 고정 5턴이라 **다른 형태의 이력**에서도
  2 로 충분한지 미검증. rerank 가 1/3 에 그친 이유도 규명하지 않았다.

## [보류] 행 단위 청킹 — 다음 카드로만 기록 — 2026-08-09

- 결정: 지시대로 **구현하지 않는다.** 다음 카드로만 남긴다.
- 이번 실험이 **우선순위를 낮추는 근거**를 제공했다: 대량 표(교정장비 관리대장 40행)의
  F4 문항이 행 단위 청킹 없이 `history 2` 만으로 정답이 나왔다. 대량 표 문제로 보였던 것이
  실제로는 이력 오염이었다.
- **꺼낼 조건** (둘 중 하나가 관측될 때):
  1. 문서 수가 늘어 **정답 행이 실제로 topN 밖으로 밀리는** 사례 — 지금은 1~2위였다.
  2. 표 하나가 512자 청크 여러 개로 쪼개져 **행이 중간에서 잘리는** 사례.

## [M6] 퍼블릭 배포 — 2026-08-11

- 결정: 동료 베타테스트를 위해 GitHub 퍼블릭 저장소로 배포한다.
  저장소명은 제안대로 **`local-rag`** (Kim-Hakseong/local-rag), 릴리스 `v0.1.0-beta` (prerelease).
- 설치 3단계 목표 달성: `git clone` → `setup.ps1` → `Start-LocalRAG.bat`.

### 사전 감사

- 개인 경로를 플레이스홀더로 치환: `C:\Users\USER` → `<USER>`, 저장소 경로 → `<REPO>`.
  **DECISIONS/Log/EVAL 은 히스토리 가치가 있어 삭제하지 않고 경로만 치환**했다 (5개 파일, 32건).
- 토큰·키 스캔: 실제 시크릿 없음. `sk-local-kdocrag` 는 로컬 서버용 더미 문자열(키 검사 안 함).
- `.gitignore` 재작성 — **`spec/paths.md` 추가**(개인 경로 포함), `__pycache__/`, `*.pyc` 추가.
  기존 `office-inbox/`·`office-md/`·`samples/*`·`logs/`·`runtime/`·`models/`·`scripts/gv3/` 유지.
- `git status` 로 실제 추적 대상 **35개 파일**을 확인해 실데이터 0건 검증.
  푸시 후 원격 트리를 다시 조회해 재확인했다.

### 신규 산출물

| 파일 | 내용 |
|---|---|
| `setup.ps1` | 7단계 원클릭 구축 (전제점검 → kordoc → GPU감지 → 런타임 → 모델+sha256 → paths.md → 자가검증) |
| `QUICKSTART.md` | 동료용 10분 가이드 (설정값 표, 질의 3수칙, 문제해결) |
| `LICENSE` | MIT, Copyright (c) 2026 Kim-Hakseong |
| `spec/paths.example.md` | paths.md 템플릿 (실제 파일은 gitignore) |

### 모델 출처 확정 — 공식 Qwen 계정은 GGUF 를 배포하지 않는다

`Qwen/Qwen3-4B-Instruct-2507-GGUF` 는 **HTTP 401**(부재 또는 게이팅). 대신
`unsloth/Qwen3-4B-Instruct-2507-GGUF` (apache-2.0, 게이팅 없음, base_model 이 공식 Qwen)를 쓴다.

**결정적 근거**: 이 저장소의 sha256 이
`3605803b982cb64aead44f6c1b2ae36e3acdb41d8e46c8a94c6533bc4c67e597` 로,
본 프로젝트가 M2~M6 내내 검증에 사용한 파일과 **정확히 일치**한다. 즉 새로 다운로드해
해시를 산출할 필요 없이 기존 검증 자산의 해시를 그대로 상수로 박을 수 있었다.

setup.ps1 에 박은 상수:

| 자산 | 크기(B) | sha256 |
|---|---|---|
| Qwen3-4B-Instruct-2507-Q4_K_M.gguf | 2,497,281,120 | `3605803b…e597` |
| bge-m3-q8_0.gguf | 634,553,760 | `aa473d51…a173` |
| llama-b10298-bin-win-cuda-12.4-x64.zip | 250,457,449 | (크기만 검증) |
| cudart-llama-bin-win-cuda-12.4-x64.zip | 391,443,627 | (크기만 검증) |
| llama-b10298-bin-win-vulkan-x64.zip | 34,108,466 | (크기만 검증) |

GitHub 릴리스는 자산 해시를 제공하지 않아 zip 은 **크기 대조만** 한다. 모델은 HF LFS OID 로 sha256 대조.

### 경로 통일

- `serve_models.ps1` 의 `-NglChat`/`-CtxChat` 기본값을 **paths.md 의 `NGL_CHAT`/`CTX_CHAT` 에서 읽도록** 변경
  (명시 인자가 있으면 그쪽 우선 — 폴백 실험용). alias 도 `CHAT_MODEL_ID`/`EMBED_MODEL_ID` 에서 읽는다.
- 스크립트·배치의 하드코딩 절대경로 **잔재 0건** 확인.

### 클론 실증 — 1차 실패 → 원인 규명 → 재실증 통과

임시 폴더에 새로 클론해 `setup.ps1` 을 돌렸다. 모델은 기존 파일을 복사해 다운로드 시간만
단축했고 **해시 검증 경로는 그대로 통과**시켰다.

**1차 실패 (exit 1, 7단계)**: `llama-server --version` 에서 죽었다.
원인은 **PowerShell 5.1 의 네이티브 stderr 리다이렉션 함정** —
llama-server 는 버전을 stderr 로 내는데, `& $exe --version 2>&1` 로 받으면 각 줄이
`ErrorRecord` 로 감싸여 `NativeCommandError` 가 되고 `$ErrorActionPreference='Stop'` 과 만나
스크립트가 중단된다. **exe 종료코드는 0 이었는데도** 실패로 처리된 것이다.

수정: llama-server 버전 확인 / 서버 기동 / GV-1 / Python 검출을 **`cmd /c` 로 감싸** 회피.
(`register_task.ps1` 의 `2>&1` 은 cmd 명령행 문자열 안이라 안전 — 점검 완료.)

**재실증 통과**: `SETUP COMPLETE`, **종료코드 0**, 소요 25.6초(런타임·모델 기보유 상태).
1차 실행에서 다운로드 포함 전 과정은 325.3초였다.

### 릴리스

`v0.1.0-beta` (prerelease). GitHub 이 소스 zip 을 자동 제공한다(HTTP 200 확인).
릴리스 노트에 설치 3단계 / 핵심 성능(7/7, 30.05 tok/s) / **알려진 제약 3건**
(구버전 HWP 미검증, 업로드 반자동, 4B 생성 한계) 명시.

### 범위 제외 (지시대로 구현하지 않음)

AnythingLLM 설치·설정 자동화(QUICKSTART 표로 대체) / 자동 임베딩(폴더감시→API) /
다국어 README·CI·테스트 자동화.

### 미검증

- **다른 PC 에서의 setup.ps1** — 같은 노트북에서만 실증했다. 동료의 RTX 4060 노트북에서
  CUDA 빌드 감지·기동이 실제로 되는지는 **베타테스트가 첫 검증**이다.
- **Vulkan 경로** — NVIDIA 가 감지돼 CUDA 분기만 탔다. Vulkan 분기는 코드 경로만 있고 미실행.
- 모델을 **실제로 새로 다운로드하는 경로** — 기존 파일 복사로 단축했으므로
  2.3GB 다운로드·이어받기 동작은 미검증(해시 검증 로직은 통과).

## [M6-개선] VRAM 기반 CTX_CHAT 자동 프로파일 — 2026-08-11

- 결정: `setup.ps1` 이 GPU VRAM 총량을 읽어 `CTX_CHAT` 을 자동 산정해 `spec/paths.md` 에 기록한다.

  | VRAM | `CTX_CHAT` | 근거 |
  |---|---|---|
  | 6GB 미만 | **6144** | 4GB 카드에서 실측 통과한 값 (여유 약 0.9GB) |
  | 6GB 이상 | **16384** | 추정 4.3GB 소요 + 여유. 긴 문서·다중 청크에 유리 |
  | NVIDIA 없음 | **4096** | CPU 는 ctx 가 클수록 프롬프트 평가가 선형으로 느려진다. 응답성 우선 |

- **산정 근거 (RTX 2050 4GB 실측에서 뽑은 계수)** — setup.ps1 3단계 주석에 동일 내용 기재:
  - 모델 가중치(Qwen3-4B Q4_K_M) 약 **2,381 MiB** — ctx 와 무관한 고정값
  - ctx 4096 → 전체 2,851 MiB ⇒ 모델 외 약 470 MiB
  - ctx 6144 → 전체 3,086 MiB ⇒ 모델 외 약 705 MiB
  - 차이 235 MiB / 2,048 토큰 ⇒ **약 0.115 MiB/토큰** (KV q8_0 + 연산 버퍼)
  - 추정: ctx 16384 → 2,381 + 1,880 ≈ **4.3 GB** → 6GB 이상에서만 안전
- **이 값은 추정이다.** 6GB/8GB 카드에서 16384 가 실제로 뜨는지는 **미검증**이며,
  OOM 시 `16384 → 6144 → 4096 → 3072` 순으로 낮추도록 paths.md 와 문서에 안내했다.
- `serve_models.ps1` 은 이미 paths.md 의 `CTX_CHAT` 을 읽도록 되어 있었다(M6 경로 통일 시 반영).
  `-CtxChat` 인자 수동 오버라이드는 그대로 유지된다. 파라미터 설명만 새 프로파일에 맞게 갱신.
- QUICKSTART 3-1 표에 **Token context window / Max Tokens 두 행을 `CTX_CHAT` 과 같은 값**으로
  안내하고, VRAM별 값 표를 추가했다. **서버보다 큰 값을 넣으면 잘리거나 오류**라는 경고 포함.
- 함께 넣은 경고: **ctx 가 크다고 긴 문서를 통짜 요약시키지 말 것.**
  ① 토큰 수만큼 선형으로 느려지고 ② 4B 모델은 앞부분에 치우친 부실한 요약을 낸다.
  ctx 를 키운 목적은 요약이 아니라 **검색 청크 여러 개 + 대화 맥락을 함께 담기 위한 것**이다.
  질의 요령 ①에도 "이 문서 전체를 요약해줘"를 피할 것으로 명시.

### 회귀 검증 (본인 PC, RTX 2050 4GB)

paths.md 를 지우고 `setup.ps1` 재실행 → **exit 0, 27.8초**:

- `VRAM 4096 MiB (6GB 미만) → CTX_CHAT 6144` — **기존 값 유지 확인**
- 실제 기동 명령행 `--port 8090 ... -c 6144`, `/v1/models` 의 `n_ctx=6144` 일치
- VRAM 3,082 MiB used / 884 MiB free — 기존 실측과 동일
- 한국어 chat 정상, **GV-4 PASS**(차원 1024), **GV-1 PASS**

부수 정리: Qwen GGUF 를 타 프로젝트 폴더(`office-fork-llm`)에서 저장소 `models\` 로 복사해
setup.ps1 의 표준 배치와 일치시켰다. paths.md 의 `QWEN_GGUF` 도 저장소 내부 경로로 바뀌었다.

## [운영] 인용 기본값화 — System Prompt 적용 — 2026-08-11

- 결정: `kdocs` 워크스페이스 System Prompt(`openAiPrompt`)를 **문서 조회 도우미 5규칙**으로 설정했다.
  값·인덱스를 답할 때 **원문 인용을 강제**하고, 문서에 없으면 없다고 답하며,
  사전지식과 문서가 충돌하면 문서를 따르게 한다.
- 적용: `POST /api/workspace/kdocs/update` 의 `openAiPrompt` 필드.
- **저장 확인 (update-env 미저장 함정 전례 때문에 필수 절차)**:
  적용 후 `/api/workspaces` 재조회 → 저장값 **257자, 기대값과 완전 일치**,
  규칙 1~5 전부 존재 확인. 이번엔 조용한 무시가 없었다.

### 회귀 결과 — System Prompt 는 정상, 다만 **다른 문제가 드러났다**

지시한 3문항(EQ-0219 / 차단 지연 / 0x607B) 중 **2건이 "문서에서 확인되지 않습니다"** 로 나왔다.
원인을 System Prompt 로 단정하지 않고 **기본 프롬프트로 되돌린 통제군**을 함께 측정했다.

| 문항 | 기본 프롬프트(통제군) | 신규 System Prompt |
|---|---|---|
| R1 EQ-0219 | 청크에 정답 **X** / 답변 X | 청크에 정답 **X** / 답변 X |
| R2 차단 지연 | 청크에 정답 **X** / 답변 X | 청크에 정답 **X** / 답변 X |
| R3 0x607B 정의 | 청크에 정답 **O** / 답변 X | 청크에 정답 **O** / 답변 X |

**두 조건의 결과가 완전히 동일**하다 → **품질 저하는 System Prompt 탓이 아니다.**
따라서 지시된 "규칙 5번만 빼고 재시도"는 **실행하지 않았다** (제거해도 달라질 근거가 없다).

### 인용 동작은 검증됐다

검색이 정답을 가져오는 질문으로 확인한 결과, 규칙 2가 의도대로 작동한다:

```
- 음수 한계값 (Negative limit)은 0x607B.01 = –2048 …
  원문 인용: "■ Negative limit (0x607B.01) = –2048"
```

과도한 거부도 없었다. 검색이 되면 정상적으로, 인용을 붙여 답한다.

### 새로 드러난 문제 — 대용량 문서가 검색을 독점한다

인용 4개가 **전부 `EN_7000_05048` 한 문서**에서 나왔다. 원인은 청크 비율이다:

| | 크기 | 비중 |
|---|---|---|
| `EN_7000_05048 (1).md` (CANopen 매뉴얼) | 437,827 B | **97.1%** |
| 나머지 5개 문서 합계 | 13,838 B | 2.9% |

벡터 **29개 → 1,160개**로 늘었고 그 중 약 1,130개가 이 한 문서다.
`topN 4` 는 문서가 아니라 **청크** 기준이므로, 청크를 1,100개 가진 문서가 상위 4개를 다 가져간다.

이는 EVAL.md §5 에 "문서 2건/9벡터 규모의 결과이며 실사용 규모의 검색 정확도는 미검증"이라고
남겼던 한계가 **실제로 현실화된 사례**다. 예측한 위험이 그대로 나타났다.

- 대응(문서화만, 코드 변경 없음): **주제가 다른 대용량 문서는 워크스페이스를 분리**,
  질문에 문서 특정 단어 포함, 임시로 해당 문서 제외.
- **근본 대응은 하지 않았다.** 후보는 문서별 균형 검색 / 워크스페이스 분리 자동화 /
  topN 상향(부록 D 에서 효과 0 으로 확인된 바 있어 이 건에는 무효일 가능성)이며 전부 미검증이다.

### R3 의 별도 문제

R3 는 **청크에 `Position Range` 가 들어왔는데도** 모델이 "정의가 제공되지 않습니다"라고 답했다.
검색 성공 + 생성 실패이며, EVAL 부록 C·D 에서 반복 확인된 4B 모델의 추출 한계와 같은 유형이다.
두 프롬프트 모두 동일하게 실패했으므로 System Prompt 와 무관하다.

### 문서 반영

- `README.md` **§1-3-2 값·인덱스 3수칙**(인용 요구 / 표는 위치 찾기용 / 모델이 틀렸다) +
  **§1-3-3 문서를 많이 넣으면 생기는 일**(실측 표 + 대응)
- `QUICKSTART.md` **3-6 System Prompt** 절 신설 (전문 + 규칙별 목적 표 + 실측 인용 예 +
  "품질 저하 없음" 명시), 질의 요령에 **④ 인용 요구** 수칙과 대용량 문서 경고 추가

## [운영 원칙] 워크스페이스는 주제 단위로 구성한다 — 2026-08-11

- **원칙**: 워크스페이스는 **주제 단위**로 만든다. 대용량 문서(장비 매뉴얼 등)와 소형 문서
  (보고서·대장 등)를 **한 풀에 섞지 않는다.** 검색은 문서가 아니라 **청크** 단위로 상위 N개를
  고르므로, 청크 수 비대칭이 크면 큰 문서가 topN 을 독차지할 구조가 된다.
- 실측 근거: `EN_7000_05048` (437KB CANopen 매뉴얼) 한 건이 전체 청크의 **97.1%**
  (약 1,131 / 1,160)를 차지했다.

### ⚠ 직전 기록의 정정 — "독점이 R1/R2 실패 원인"은 **틀렸다**

바로 앞 항목([운영] 인용 기본값화)에서 EQ-0219·차단 지연 실패를 **"대용량 문서의 검색 독점"**
으로 진단했다. **그 인과는 틀렸다.**

워크스페이스를 열어보니 `kdocs` 에 임베딩된 문서는 **`EN_7000_05048` 단 1건**이었고,
소형 5종은 **애초에 워크스페이스에 없었다.** 즉 실패 원인은 독점이 아니라 **문서 부재**다.
(튜닝 실험 이후 어느 시점에 소형 문서들이 빠진 상태였고, 나는 그것을 확인하지 않은 채
청크 비율만 보고 독점이라 단정했다.)

- **유지되는 사실**: 매뉴얼이 청크의 97.1% 를 차지한다는 수치와, 그런 비대칭이면 독점이
  일어날 **구조적 개연성**은 그대로다. 원칙 자체는 유효하다.
- **철회하는 주장**: "실측으로 독점이 관측됐다"는 표현. 이번 실패는 독점 사례가 **아니었다.**
  진짜 독점은 소형 문서가 함께 임베딩된 상태에서 재현해야 확인되며, **아직 관측하지 못했다.**

### 재구성 결과

| 워크스페이스 | 내용 | 문서 |
|---|---|---|
| `kdocs` | 소형 업무문서 (테스트 코퍼스) | 5건 |
| `manuals` (신규) | 장비 매뉴얼 | 2건 — CANopen(05048), RS232(05052) |

- RS232 매뉴얼 `EN_7000_05052` 는 인박스에 이미 있었고 **변환도 완료된 상태**여서
  인간 투입 대기 없이 바로 업로드했다.
- 전체 벡터 1,160 → **1,363** (소형 5종 + RS232 추가분).
- 부수 발견: 소형 문서 재업로드 시 `(붙임1)` 이 **front-matter 구판(1,509자)** 으로 잡혀
  깨끗한 판본(1,340자)으로 교체했다. `custom-documents` 에 같은 제목의 구판이 남아 있어
  제목만으로 고르면 잘못 선택될 수 있다 — **캐시된 문서 내용을 확인하고 고를 것.**

### 설정 동일성 검증 (실조회)

두 워크스페이스 모두 **전 항목 기준 일치**:
`chatMode=query` / `topN=4` / `threshold=0.25` / `openAiHistory=2` /
`vectorSearchMode=default` / System Prompt **257자 동일**.
임베더는 시스템 전역 설정(bge-m3, 청크 512·80)이라 워크스페이스와 무관하게 공통이다.

### 분리 회귀

| 워크스페이스 | 질문 | 인용 출처 | 결과 |
|---|---|---|---|
| `kdocs` | EQ-0219 차기 교정일·상태 | 교정장비_관리대장_2026 | **성공** — 표 행 원문 인용 (`\| EQ-0219 \| 온도 챔버 \| … \| 2026-10-15 \| 사용중 \|`) |
| `manuals` | 0x607B 정의를 문서에서 인용 | EN_7000_05048 | **실패** — "확인되지 않습니다" |
| `manuals` | SDO Write 텔레그램 바이트 구조 | EN_7000_05052 | **성공** — 바이트별 구조를 원문 인용해 설명 |

**라우팅은 정확했다.** kdocs 질문은 관리대장에서, RS232 질문은 05052 에서만 인용이 나왔다.

단 EQ-0219 성공의 원인은 **"독점 제거"가 아니라 "없던 문서를 넣은 것"** 이다. 정직하게 기록한다.

### 0x607B 실패는 질문 표현 문제였다 (신규 실측)

추가 진단 결과, 같은 대상도 **표현에 따라 검색 결과가 갈린다**:

| 질문 | 결과 |
|---|---|
| `Position Range Limit 오브젝트는 무엇에 쓰이는가?` | **성공** — `"…the Position Range Limit (0x607B) object must be used to reduce the range of the actual values…"` 정확 인용 |
| `0x607B의 정의는?` | 실패 |
| `0x607B object의 용도를 …` | 부정확 — 같은 번호가 나오는 **예제 값**(`0x607B.01 = 0`) 청크를 잡음 |

인덱스 번호만 쓰면 그 번호가 등장하는 다른 문맥이 걸린다. **문서에 실제로 쓰인 명칭을
함께 넣어야** 원하는 청크가 온다. 이는 README 질의 요령 ①("문서에 있는 표현을 그대로")의
강한 실증 사례다.

### 문서 반영

- `README.md` **§1-3-3 워크스페이스 주제 단위 원칙**(구성표 + 분리 회귀 결과),
  **§1-3-4 질문 표현이 검색을 바꾼다**(실측 표)
- `QUICKSTART.md` 3-5 앞에 **운영 원칙 인용 블록**, 질의 요령 **⑤ 명칭 함께 쓰기** 추가

## [BB-1] 베타 버그 1호 — 미설치 환경에서 setup.ps1 2단계 사망 — 2026-08-11

- **증상**: 동료 PC 에서 `setup.ps1` 2단계(kordoc 설치)가 `NativeCommandError` 로 중단.
- **원인**: `& cmd /c "where kordoc" 2>$null` — 리다이렉션이 **PowerShell 쪽**에 있었다.
  `where` 는 대상을 **못 찾으면 stderr 를 낸다.** PS 5.1 은 네이티브 명령의 stderr 를
  PowerShell 스트림으로 받을 때 각 줄을 `ErrorRecord` 로 승격시키고,
  `$ErrorActionPreference='Stop'` 과 만나 스크립트를 죽인다.
- **왜 M6 실증에서 안 잡혔나**: 내 PC 는 kordoc 이 **이미 설치**돼 있어
  `where` 가 성공(=stderr 없음)했다. **미설치 분기를 한 번도 밟지 않았다.**
  클론 실증을 했지만 "환경이 갖춰진 PC 에서의 클론"이라 이 경로가 비어 있었다.

### 수정 — 리다이렉션을 전부 cmd 내부로

`setup.ps1` 전체를 스캔해 **PowerShell 레벨 리다이렉션 6곳을 전부 교체**했다.

| 위치 | 수정 전 | 수정 후 |
|---|---|---|
| Node 검출 | `& node --version 2>$null` | `& cmd /c "node --version 2>nul"` |
| kordoc 탐색 ×2 | `& cmd /c "where kordoc" 2>$null` | `& cmd /c "where kordoc 2>nul"` |
| kordoc 버전 ×2 | `& cmd /c "… --version" 2>$null` | `& cmd /c "… --version 2>nul"` |
| **npm install** | `& cmd /c "npm install -g kordoc" 2>&1 \| ForEach…` | `& cmd /c "npm install -g kordoc > 로그 2>&1"` 후 로그를 읽어 요약 출력 |

**`npm install` 도 같은 함정이었다.** npm 은 진행 상황·경고를 stderr 로 낸다.
`where` 만 고쳤으면 **바로 다음 줄에서 다시 죽었을 것**이다. 동료 PC 는 2단계 초입에서
멈춰서 여기까지 도달하지도 못했다.

부수 개선: 탐색·버전 조회를 `Find-KordocCmd` / `Get-KordocVersion` 함수로 묶고,
npm 실패 시 **전체 로그 경로와 프록시 힌트**를 안내하도록 했다.

### 함께 고친 결함 — 이미 떠 있는 서버를 실패로 오인

회귀 도중 발견했다. 7단계가 `serve_models.ps1` 을 무조건 호출하는데,
그 스크립트는 포트가 점유돼 있으면 **타 프로세스 오사살 방지를 위해 의도적으로 실패**한다.
그래서 **서버가 이미 정상 구동 중인 상태에서 setup 을 재실행하면 실패로 끝났다.**

수정: 7단계가 먼저 8090/8091 리스닝을 확인해, 이미 떠 있으면
**기동을 건너뛰고 응답 검증만** 수행한다.

### 회귀 — 이번엔 반드시 미설치 상태에서 시작

`npm uninstall -g kordoc` 로 **실제로 제거**하고(`where kordoc` exit=1 확인),
`spec\paths.md` 도 지운 뒤 처음부터 실행했다.

| 단계 | 결과 |
|---|---|
| 2 kordoc | `kordoc 미설치 — npm install -g kordoc` → `added 179 packages in 33s` → **v4.7.2 설치 완료** |
| 3 GPU | VRAM 4096 MiB → CTX_CHAT 6144 |
| 5 모델 | sha256 2건 검증 통과 |
| 6 paths.md | 재생성 |
| 7 자가검증 | **"이미 떠 있음 — 기동 생략하고 응답만 검증"** 분기 동작, `/v1/models` 2건, 임베딩 1024차원, **GV-1 PASS** |

**`SETUP COMPLETE` / 종료코드 0 / 48.1초.**
회귀 후 kordoc 재설치 상태 원복 확인 (`where` 성공, `--version` = 4.7.2).

## [운영 규칙] 검색 실패 진단의 1단계는 임베딩 목록 실사 — 2026-08-11

- **규칙**: 검색이 실패하면 **가장 먼저 워크스페이스의 임베딩 문서 목록을 확인한다.**
  목록 확인 없이 원인을 단정하지 않는다.
- 근거: 직전 회차에서 EQ-0219 실패를 "대용량 문서의 검색 독점"으로 진단했으나 **틀렸다.**
  워크스페이스에 그 문서가 **애초에 없었다.** 청크 비율만 보고 인과를 만들어낸 것이다.
- 진단 순서:
  1. **워크스페이스 문서 목록 실사** — 해당 문서가 임베딩돼 있는가
  2. 인용 청크 덤프 — 정답 문자열이 청크 안에 있는가 (검색 문제 vs 생성 문제 분기)
  3. 이력/설정 통제 — 새 스레드에서 재질의, 기본 설정과 대조
  4. 그 다음에야 청크 분포·튜닝을 의심한다
- 이 규칙은 BB-1 의 교훈과도 같은 뿌리다: **"밟히지 않은 경로"와 "확인하지 않은 상태"를
  가정으로 메우면 틀린 결론이 나온다.**
