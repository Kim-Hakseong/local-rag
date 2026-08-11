/**
 * golden_samples.mjs — 골든 벡터 GV-2 / GV-3 실행기
 *
 * 목적:
 *   GV-2 : samples\ 의 실물 문서를 kordoc 으로 파싱해, **표 셀 값을 기계적으로 추출**한
 *          1:1 대조표(markdown)를 생성한다. 품질 판정은 하지 않는다 — 판정은 인간(GATE-1).
 *   GV-3 : 파싱 실패 문서의 구조화 에러코드(ENCRYPTED / DRM_PROTECTED / CORRUPTED ...)를
 *          분류해 나열한다. "깨끗한 실패"가 합격 조건이므로 실패도 정직하게 노출한다.
 *
 * 전제:
 *   - spec/paths.md 의 KORDOC_CMD 기입 완료 (M1)
 *   - samples\ 에 인간이 실물 문서를 투입 (spec/samples_README.md 기준). 없으면 종료코드 2.
 *   - 네트워크 접근 없음. 문서 내용은 logs\gv2\ 에만 기록되며 logs\ 는 .gitignore 대상.
 *
 * 사용법:
 *   node scripts\golden_samples.mjs                       (기본: samples\ → logs\gv2\)
 *   node scripts\golden_samples.mjs --dir <입력> --out <출력>   (GV-3 픽스처 등 다른 대상)
 *   종료 코드 0 = 전 문서 파싱 성공, 1 = 일부 파싱 실패(GV-3 대상 포함), 2 = 전제 불충족
 *
 * 산출물:
 *   <출력>\GV2_cell_table.md   인간 대조용 셀 값 표 (GATE-1 제출물)
 *   <출력>\gv2-report.json     기계 판독용 결과
 *   <출력>\<파일명>.md         문서별 변환 마크다운 전문
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve, extname, basename } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const PATHS_MD = join(REPO_ROOT, "spec", "paths.md");

/** `--dir <path>` / `--out <path>` 인자 (미지정 시 기본값). 셸 문자열 조립 없이 argv 리스트로만 처리. */
function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? resolve(process.argv[i + 1]) : null;
}
const SAMPLES_DIR = argValue("--dir") ?? join(REPO_ROOT, "samples");
const OUT_DIR = argValue("--out") ?? join(REPO_ROOT, "logs", "gv2");

const SUPPORTED_EXT = new Set([
  ".hwp", ".hwpx", ".hwpml", ".pdf", ".docx", ".xlsx", ".xls",
]);

function readSpecPath(key) {
  const text = readFileSync(PATHS_MD, "utf8");
  const m = text.match(new RegExp(`^\\s*${key}\\s*=\\s*(.+?)\\s*$`, "m"));
  if (!m) return null;
  const value = m[1].trim();
  if (value.startsWith("<") || value.startsWith("(")) return null;
  return value;
}

function kordocModuleUrl(kordocCmd) {
  const entry = join(dirname(kordocCmd), "node_modules", "kordoc", "dist", "index.js");
  return pathToFileURL(entry).href;
}

/** 셀 값 정규화 — 대조표 가독성용. 개행은 ⏎ 로 가시화하고 파이프는 이스케이프. */
function cellForTable(s) {
  const v = String(s ?? "").normalize("NFC").replace(/ /g, " ");
  return v.replace(/\r?\n/g, " ⏎ ").replace(/\|/g, "\\|").trim();
}

function sha256File(p) {
  return createHash("sha256").update(readFileSync(p)).digest("hex");
}

/** IR blocks 를 순회하며 중첩 표까지 등장 순서대로 수집 */
function collectTables(blocks, acc = []) {
  for (const b of blocks ?? []) {
    if (b.type === "table" && b.table) {
      acc.push(b.table);
      for (const row of b.table.cells) {
        for (const cell of row) {
          if (cell.blocks) collectTables(cell.blocks, acc);
        }
      }
    }
    if (b.children) collectTables(b.children, acc);
  }
  return acc;
}

function renderCellTable(fileName, tables) {
  const lines = [];
  if (tables.length === 0) {
    lines.push("_표 없음 — 이 문서에서 추출된 표가 0개다._", "");
    return lines;
  }
  tables.forEach((t, ti) => {
    lines.push(`#### 표 ${ti + 1} — ${t.rows}행 × ${t.cols}열${t.caption ? ` (캡션: ${cellForTable(t.caption)})` : ""}`);
    lines.push("");
    lines.push("| 행 | 열 | 셀 값 | span(행×열) |");
    lines.push("| --- | --- | --- | --- |");
    t.cells.forEach((row, r) => {
      row.forEach((c, ci) => {
        const span = `${c.rowSpan ?? 1}×${c.colSpan ?? 1}`;
        lines.push(`| ${r + 1} | ${ci + 1} | ${cellForTable(c.text)} | ${span} |`);
      });
    });
    lines.push("");
  });
  return lines;
}

async function main() {
  const kordocCmd = readSpecPath("KORDOC_CMD");
  if (!kordocCmd) {
    console.error("[GV-2] SETUP FAIL: spec/paths.md 의 KORDOC_CMD 가 비어 있다.");
    return 2;
  }

  let files;
  try {
    files = readdirSync(SAMPLES_DIR)
      .filter((f) => !f.startsWith("."))
      .map((f) => join(SAMPLES_DIR, f))
      .filter((p) => statSync(p).isFile());
  } catch (err) {
    console.error(`[GV-2] SETUP FAIL: samples\\ 접근 불가 — ${err.message}`);
    return 2;
  }

  if (files.length === 0) {
    console.error("[GV-2] BLOCKED: samples\\ 에 문서가 없다. spec/samples_README.md 기준으로 인간이 투입해야 한다.");
    return 2;
  }

  let kordoc;
  try {
    kordoc = await import(kordocModuleUrl(kordocCmd));
  } catch (err) {
    console.error(`[GV-2] SETUP FAIL: kordoc 모듈 로드 실패 — ${err.message}`);
    return 2;
  }
  const { parse, VERSION } = kordoc;

  mkdirSync(OUT_DIR, { recursive: true });

  const results = [];
  const doc = [];
  doc.push("# GV-2 셀 값 대조표 (GATE-1 제출물)");
  doc.push("");
  doc.push(`- kordoc 버전: ${VERSION}`);
  doc.push(`- 대상: \`${SAMPLES_DIR}\` ${files.length}개 파일`);
  doc.push("- 셀 값은 kordoc IR(`table.cells[r][c].text`)에서 **기계적으로 추출**한 원문이다. Ralph의 품질 판정은 포함하지 않는다.");
  doc.push("- 개행은 `⏎`, 파이프는 `\\|` 로 표기.");
  doc.push("");

  for (const filePath of files) {
    const name = basename(filePath);
    const ext = extname(name).toLowerCase();
    const size = statSync(filePath).size;
    const sha = sha256File(filePath);

    const entry = { file: name, ext, bytes: size, sha256: sha };

    if (!SUPPORTED_EXT.has(ext)) {
      entry.status = "UNSUPPORTED_EXT";
      entry.note = "kordoc 미지원 확장자 — DESIGN.md §1 기준 _failed\\unsupported\\ 대상";
      results.push(entry);
      doc.push(`## ${name}`, "", `- 상태: **UNSUPPORTED_EXT** (${ext})`, "");
      console.log(`[GV-2] ${name}: UNSUPPORTED_EXT`);
      continue;
    }

    let result;
    try {
      const buf = readFileSync(filePath);
      const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      result = await parse(ab, { filePath });
    } catch (err) {
      entry.status = "THROWN";
      entry.error = err?.message ?? String(err);
      results.push(entry);
      doc.push(`## ${name}`, "", `- 상태: **THROWN** — \`${entry.error}\``, "");
      console.error(`[GV-2] ${name}: THROWN ${entry.error}`);
      continue;
    }

    if (!result.success) {
      entry.status = "PARSE_FAILED";
      entry.code = result.code ?? "(코드 없음)";
      entry.error = result.error;
      entry.fileType = result.fileType;
      results.push(entry);
      doc.push(`## ${name}`, "");
      doc.push(`- 상태: **PARSE_FAILED** / 에러코드 \`${entry.code}\` (GV-3 분류 대상)`);
      doc.push(`- 메시지: ${result.error}`);
      doc.push("");
      console.log(`[GV-2] ${name}: PARSE_FAILED code=${entry.code}`);
      continue;
    }

    const tables = collectTables(result.blocks);
    entry.status = "OK";
    entry.fileType = result.fileType;
    entry.pageCount = result.pageCount;
    entry.markdownChars = result.markdown.length;
    entry.tableCount = tables.length;
    entry.cellCount = tables.reduce((s, t) => s + t.cells.reduce((a, r) => a + r.length, 0), 0);
    entry.warnings = (result.warnings ?? []).map((w) => ({ code: w.code, message: w.message, page: w.page }));
    results.push(entry);

    writeFileSync(join(OUT_DIR, `${name}.md`), result.markdown, "utf8");

    doc.push(`## ${name}`, "");
    doc.push(`- 상태: **OK** / fileType \`${result.fileType}\` / 페이지·섹션 ${result.pageCount ?? "?"}`);
    doc.push(`- 마크다운 ${result.markdown.length}자, 표 ${tables.length}개, 셀 ${entry.cellCount}개`);
    doc.push(`- sha256: \`${sha}\``);
    if (entry.warnings.length) {
      doc.push(`- 경고 ${entry.warnings.length}건:`);
      for (const w of entry.warnings) doc.push(`  - \`${w.code}\` ${w.message}`);
    }
    doc.push(`- 변환 전문: \`${join(OUT_DIR, name + ".md")}\``);
    doc.push("");
    doc.push(...renderCellTable(name, tables));

    console.log(`[GV-2] ${name}: OK 표 ${tables.length}개 / 셀 ${entry.cellCount}개`);
  }

  writeFileSync(join(OUT_DIR, "GV2_cell_table.md"), doc.join("\n"), "utf8");
  writeFileSync(
    join(OUT_DIR, "gv2-report.json"),
    JSON.stringify({ kordocVersion: VERSION, sampleCount: files.length, results }, null, 2),
    "utf8",
  );

  const failed = results.filter((r) => r.status !== "OK");
  console.log(`[GV-2] 대조표 생성: ${join(OUT_DIR, "GV2_cell_table.md")}`);
  console.log(`[GV-2] 성공 ${results.length - failed.length} / 실패 ${failed.length}`);
  return failed.length === 0 ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error("[GV-2] UNEXPECTED ERROR");
    console.error(err?.stack ?? String(err));
    process.exit(1);
  },
);
