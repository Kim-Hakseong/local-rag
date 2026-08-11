/**
 * golden_roundtrip.mjs — 골든 벡터 GV-1 (라운드트립) 자동 검증
 *
 * 목적:
 *   고정 마크다운(표 2개 포함) → kordoc markdownToHwpx → kordoc parse → IR 표
 *   경로에서, 표 셀 값이 정규화 후 100% 일치하는지 결정론적으로 판정한다.
 *
 * 전제:
 *   - kordoc 이 전역 npm 으로 설치되어 있고, spec/paths.md 의 KORDOC_CMD 에
 *     `kordoc.cmd` 절대경로가 기록되어 있다 (M1에서 Ralph가 기록).
 *   - 네트워크 접근 없음. 외부 API 호출 없음.
 *   - PATH 동적 탐색 금지 원칙에 따라, 모듈 경로는 KORDOC_CMD 의 디렉터리에서
 *     node_modules/kordoc/dist/index.js 로 결정론적으로 유도한다.
 *
 * 사용법:
 *   node scripts\golden_roundtrip.mjs
 *   종료 코드 0 = PASS, 1 = FAIL, 2 = 실행 전제 불충족(설정/경로 문제)
 *
 * 산출물:
 *   logs\gv1\roundtrip.hwpx      중간 산출 HWPX
 *   logs\gv1\roundtrip.out.md    parse 결과 마크다운
 *   logs\gv1\gv1-report.json     기계 판독용 대조 결과
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const FIXTURE = join(SCRIPT_DIR, "gv1_fixture.md");
const PATHS_MD = join(REPO_ROOT, "spec", "paths.md");
const OUT_DIR = join(REPO_ROOT, "logs", "gv1");

/** spec/paths.md 에서 `KEY = VALUE` 한 줄 형식을 읽는다. 미기입(<...>)은 null. */
function readSpecPath(key) {
  const text = readFileSync(PATHS_MD, "utf8");
  const re = new RegExp(`^\\s*${key}\\s*=\\s*(.+?)\\s*$`, "m");
  const m = text.match(re);
  if (!m) return null;
  const value = m[1].trim();
  if (value.startsWith("<") || value.startsWith("(")) return null; // 플레이스홀더
  return value;
}

/** kordoc.cmd 절대경로 → 전역 node_modules 내 ESM 진입점 file:// URL */
function kordocModuleUrl(kordocCmd) {
  const npmDir = dirname(kordocCmd);
  const entry = join(npmDir, "node_modules", "kordoc", "dist", "index.js");
  return pathToFileURL(entry).href;
}

/**
 * 정규화: NFC + 앞뒤 공백 제거 + 연속 공백/개행을 단일 공백으로.
 * 표 셀 값 비교는 "텍스트 동일성"이 기준이므로 서식/공백 변형만 흡수한다.
 */
function norm(s) {
  return String(s ?? "")
    .normalize("NFC")
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 입력 마크다운에서 GFM 표를 결정론적으로 추출 (구분선 행 제외) */
function extractMarkdownTables(md) {
  const tables = [];
  let cur = null;
  for (const rawLine of md.split(/\r?\n/)) {
    const line = rawLine.trim();
    const isRow = line.startsWith("|") && line.endsWith("|") && line.length > 1;
    if (!isRow) {
      if (cur) { tables.push(cur); cur = null; }
      continue;
    }
    const cells = line.slice(1, -1).split("|").map(norm);
    const isSeparator = cells.every((c) => /^:?-{1,}:?$/.test(c));
    if (isSeparator) continue;
    if (!cur) cur = [];
    cur.push(cells);
  }
  if (cur) tables.push(cur);
  return tables;
}

/** parse 결과 IR blocks 에서 표를 등장 순서대로 셀 텍스트 그리드로 추출 */
function extractIrTables(blocks) {
  const tables = [];
  for (const b of blocks) {
    if (b.type !== "table" || !b.table) continue;
    const grid = b.table.cells.map((row) => row.map((c) => norm(c.text)));
    tables.push(grid);
  }
  return tables;
}

function compareTables(expected, actual) {
  const diffs = [];
  if (expected.length !== actual.length) {
    diffs.push({
      kind: "TABLE_COUNT",
      expected: expected.length,
      actual: actual.length,
    });
  }
  const n = Math.min(expected.length, actual.length);
  for (let t = 0; t < n; t++) {
    const e = expected[t];
    const a = actual[t];
    if (e.length !== a.length) {
      diffs.push({ kind: "ROW_COUNT", table: t + 1, expected: e.length, actual: a.length });
    }
    const rows = Math.min(e.length, a.length);
    for (let r = 0; r < rows; r++) {
      if (e[r].length !== a[r].length) {
        diffs.push({
          kind: "COL_COUNT",
          table: t + 1, row: r + 1,
          expected: e[r].length, actual: a[r].length,
        });
      }
      const cols = Math.min(e[r].length, a[r].length);
      for (let c = 0; c < cols; c++) {
        if (e[r][c] !== a[r][c]) {
          diffs.push({
            kind: "CELL",
            table: t + 1, row: r + 1, col: c + 1,
            expected: e[r][c], actual: a[r][c],
          });
        }
      }
    }
  }
  return diffs;
}

function countCells(tables) {
  return tables.reduce((sum, t) => sum + t.reduce((s, r) => s + r.length, 0), 0);
}

async function main() {
  const kordocCmd = readSpecPath("KORDOC_CMD");
  if (!kordocCmd) {
    console.error("[GV-1] SETUP FAIL: spec/paths.md 의 KORDOC_CMD 가 비어 있다.");
    return 2;
  }
  const moduleUrl = kordocModuleUrl(kordocCmd);

  let kordoc;
  try {
    kordoc = await import(moduleUrl);
  } catch (err) {
    console.error(`[GV-1] SETUP FAIL: kordoc 모듈 로드 실패 (${moduleUrl})`);
    console.error(`        ${err.message}`);
    return 2;
  }
  const { markdownToHwpx, parse, VERSION } = kordoc;

  mkdirSync(OUT_DIR, { recursive: true });

  const sourceMd = readFileSync(FIXTURE, "utf8");
  const expected = extractMarkdownTables(sourceMd);

  // 1) markdown -> hwpx
  const hwpxBuf = await markdownToHwpx(sourceMd);
  const hwpxPath = join(OUT_DIR, "roundtrip.hwpx");
  writeFileSync(hwpxPath, Buffer.from(hwpxBuf));

  // 2) hwpx -> parse
  const result = await parse(hwpxBuf);
  if (!result.success) {
    console.error(`[GV-1] FAIL: parse 실패 code=${result.code} error=${result.error}`);
    writeFileSync(
      join(OUT_DIR, "gv1-report.json"),
      JSON.stringify({ verdict: "FAIL", stage: "parse", result }, null, 2),
      "utf8",
    );
    return 1;
  }
  writeFileSync(join(OUT_DIR, "roundtrip.out.md"), result.markdown, "utf8");

  const actual = extractIrTables(result.blocks);
  const diffs = compareTables(expected, actual);
  const pass = diffs.length === 0;

  const report = {
    verdict: pass ? "PASS" : "FAIL",
    kordocVersion: VERSION,
    fixture: FIXTURE,
    hwpxBytes: hwpxBuf.byteLength,
    fileType: result.fileType,
    expectedTables: expected.length,
    actualTables: actual.length,
    expectedCells: countCells(expected),
    actualCells: countCells(actual),
    warnings: result.warnings ?? [],
    diffs,
  };
  writeFileSync(join(OUT_DIR, "gv1-report.json"), JSON.stringify(report, null, 2), "utf8");

  console.log(`[GV-1] kordoc ${VERSION} / hwpx ${hwpxBuf.byteLength} bytes / fileType=${result.fileType}`);
  console.log(`[GV-1] 표 ${expected.length} → ${actual.length}, 셀 ${countCells(expected)} → ${countCells(actual)}`);
  if (result.warnings?.length) {
    for (const w of result.warnings) console.log(`[GV-1] WARN ${w.code}: ${w.message}`);
  }
  if (!pass) {
    console.error(`[GV-1] FAIL: 불일치 ${diffs.length}건`);
    for (const d of diffs.slice(0, 40)) console.error("  " + JSON.stringify(d));
    if (diffs.length > 40) console.error(`  ... 외 ${diffs.length - 40}건 (gv1-report.json 참조)`);
    return 1;
  }
  console.log("[GV-1] PASS — 표 셀 값 100% 일치");
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error("[GV-1] UNEXPECTED ERROR");
    console.error(err?.stack ?? String(err));
    process.exit(1);
  },
);
