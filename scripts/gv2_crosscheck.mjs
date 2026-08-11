/**
 * gv2_crosscheck.mjs — GV-2 보조 검증: 크로스 포맷 대조 + 텍스트 건전성 검사
 *
 * 목적:
 *   (A) 동일 문서의 .hwp / .hwpx 쌍을 각각 파싱해, 정규화 후 텍스트 유사도를 측정하고
 *       불일치 구간의 **원문을 양쪽 다 병기**한다. (요약·생략 없이 전량)
 *   (B) samples\ 전 문서에 대해 한글 깨짐 신호를 스캔한다:
 *       - U+FFFD 치환문자
 *       - PUA(사용자 영역) 문자: BMP U+E000–U+F8FF, Plane15/16 보조 PUA
 *       - 단독 호환 자모(U+3131–U+318E) — 조합 실패 흔적
 *       - 제어문자(탭/개행 제외)
 *       스캔 대상은 **마크다운 출력과 IR blocks 양쪽**이다. 둘의 결과가 다르면
 *       kordoc 의 마크다운 방출 단계에서 문자가 소실된 것이므로 별도로 보고한다.
 *
 * 전제:
 *   - spec/paths.md 의 KORDOC_CMD 기입 완료
 *   - 네트워크 접근 없음
 *
 * 사용법:
 *   node scripts\gv2_crosscheck.mjs
 *   종료 코드 0 = 실행 성공(불일치 존재해도 0 — 판정은 인간), 2 = 전제 불충족
 *
 * 산출물:
 *   logs\gv2\GV2_crosscheck.md    인간 검토용 리포트 (GATE-1 제출물)
 *   logs\gv2\gv2-crosscheck.json  기계 판독용 결과
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve, basename, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const PATHS_MD = join(REPO_ROOT, "spec", "paths.md");
const SAMPLES_DIR = join(REPO_ROOT, "samples");
const OUT_DIR = join(REPO_ROOT, "logs", "gv2");

function readSpecPath(key) {
  const text = readFileSync(PATHS_MD, "utf8");
  const m = text.match(new RegExp(`^\\s*${key}\\s*=\\s*(.+?)\\s*$`, "m"));
  if (!m) return null;
  const v = m[1].trim();
  return v.startsWith("<") || v.startsWith("(") ? null : v;
}

function kordocModuleUrl(cmd) {
  return pathToFileURL(join(dirname(cmd), "node_modules", "kordoc", "dist", "index.js")).href;
}

/** 비교용 정규화: NFC + NBSP→공백 + 연속 공백 축약 + trim */
function norm(s) {
  return String(s ?? "")
    .normalize("NFC")
    .replace(/[\u00A0\u2000-\u200B\u3000]/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/** 문자 단위 LCS 길이 (Hirschberg 불필요 — 문서 길이 수천자 수준) */
function lcsLength(a, b) {
  const n = a.length, m = b.length;
  if (n === 0 || m === 0) return 0;
  let prev = new Int32Array(m + 1);
  let cur = new Int32Array(m + 1);
  for (let i = 1; i <= n; i++) {
    const ai = a.charCodeAt(i - 1);
    for (let j = 1; j <= m; j++) {
      cur[j] = ai === b.charCodeAt(j - 1)
        ? prev[j - 1] + 1
        : (prev[j] >= cur[j - 1] ? prev[j] : cur[j - 1]);
    }
    const t = prev; prev = cur; cur = t;
    cur.fill(0);
  }
  return prev[m];
}

/** 줄 단위 LCS 기반 diff — 삭제/추가 쌍을 구간으로 묶어 반환 */
function lineDiff(aLines, bLines) {
  const n = aLines.length, m = bLines.length;
  const dp = [];
  for (let i = 0; i <= n; i++) dp.push(new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = aLines[i] === bLines[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (aLines[i] === bLines[j]) { ops.push({ op: "=", a: aLines[i], b: bLines[j] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ op: "-", a: aLines[i] }); i++; }
    else { ops.push({ op: "+", b: bLines[j] }); j++; }
  }
  while (i < n) ops.push({ op: "-", a: aLines[i++] });
  while (j < m) ops.push({ op: "+", b: bLines[j++] });

  // 연속된 -/+ 를 하나의 불일치 구간으로 묶는다
  const hunks = [];
  let cur = null;
  for (const o of ops) {
    if (o.op === "=") { if (cur) { hunks.push(cur); cur = null; } continue; }
    if (!cur) cur = { removed: [], added: [] };
    if (o.op === "-") cur.removed.push(o.a); else cur.added.push(o.b);
  }
  if (cur) hunks.push(cur);
  return hunks;
}

const PUA_BMP = /[\uE000-\uF8FF]/gu;
const PUA_SUP = /[\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}]/gu;
const REPLACEMENT = /\uFFFD/gu;
const LONE_JAMO = /[\u3131-\u318E]/gu;
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu;

function scanHealth(text) {
  const hit = (re) => {
    const out = [];
    for (const m of text.matchAll(re)) {
      const cp = m[0].codePointAt(0).toString(16).toUpperCase().padStart(4, "0");
      const idx = m.index;
      out.push({
        char: m[0],
        codepoint: `U+${cp}`,
        context: text.slice(Math.max(0, idx - 25), idx + 25).replace(/\r?\n/g, "⏎"),
      });
    }
    return out;
  };
  return {
    replacement: hit(REPLACEMENT),
    puaBmp: hit(PUA_BMP),
    puaSupplementary: hit(PUA_SUP),
    loneJamo: hit(LONE_JAMO),
    control: hit(CONTROL),
  };
}

function summarizeHits(hits) {
  const byCp = new Map();
  for (const h of hits) {
    const e = byCp.get(h.codepoint) ?? { codepoint: h.codepoint, char: h.char, count: 0, samples: [] };
    e.count++;
    if (e.samples.length < 3) e.samples.push(h.context);
    byCp.set(h.codepoint, e);
  }
  return [...byCp.values()].sort((a, b) => b.count - a.count);
}

/** IR blocks 의 모든 텍스트(문단·표 셀·중첩 블록)를 원문 순서대로 이어붙인다 */
function irText(blocks, acc = { s: "" }) {
  for (const b of blocks ?? []) {
    if (b.text) acc.s += b.text + "\n";
    if (b.table) {
      if (b.table.caption) acc.s += b.table.caption + "\n";
      for (const row of b.table.cells) {
        for (const c of row) {
          acc.s += c.text + "\n";
          if (c.blocks) irText(c.blocks, acc);
        }
      }
    }
    if (b.children) irText(b.children, acc);
  }
  return acc.s;
}

async function parseFile(parse, filePath) {
  const buf = readFileSync(filePath);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return parse(ab, { filePath });
}

async function main() {
  const kordocCmd = readSpecPath("KORDOC_CMD");
  if (!kordocCmd) { console.error("[XCHK] SETUP FAIL: KORDOC_CMD 미기입"); return 2; }
  const { parse, VERSION } = await import(kordocModuleUrl(kordocCmd));

  mkdirSync(OUT_DIR, { recursive: true });

  const files = readdirSync(SAMPLES_DIR)
    .filter((f) => !f.startsWith("."))
    .map((f) => join(SAMPLES_DIR, f))
    .filter((p) => statSync(p).isFile());
  if (files.length === 0) { console.error("[XCHK] BLOCKED: samples\\ 비어 있음"); return 2; }

  const parsed = new Map();
  for (const f of files) {
    const r = await parseFile(parse, f);
    parsed.set(f, r);
  }

  const doc = [];
  const json = { kordocVersion: VERSION, health: [], crossFormat: [] };

  doc.push("# GV-2 보조 검증 — 크로스 포맷 대조 + 텍스트 건전성 (GATE-1 제출물)", "");
  doc.push(`- kordoc ${VERSION}`, "");

  // ── (B) 텍스트 건전성 ────────────────────────────────────────────
  doc.push("## A. 한글 깨짐 검사 (치환문자 / PUA / 단독자모 / 제어문자)", "");
  doc.push("스캔 대상: `md` = kordoc 마크다운 출력(RAG 투입 대상), `ir` = IR blocks 원문.", "");
  doc.push("| 파일 | 대상 | U+FFFD | PUA(BMP) | PUA(보조면) | 단독 호환자모 | 제어문자 |");
  doc.push("| --- | --- | --- | --- | --- | --- | --- |");
  const healthDetail = [];
  const emitLoss = [];
  for (const f of files) {
    const r = parsed.get(f);
    const name = basename(f);
    if (!r.success) {
      doc.push(`| ${name} | - | (파싱 실패) | - | - | - | - |`);
      continue;
    }
    const scans = { md: scanHealth(r.markdown), ir: scanHealth(irText(r.blocks)) };
    const entry = { file: name, md: {}, ir: {} };
    for (const [target, h] of Object.entries(scans)) {
      const counts = {
        replacement: h.replacement.length,
        puaBmp: h.puaBmp.length,
        puaSupplementary: h.puaSupplementary.length,
        loneJamo: h.loneJamo.length,
        control: h.control.length,
      };
      entry[target] = counts;
      doc.push(`| ${name} | \`${target}\` | ${counts.replacement} | ${counts.puaBmp} | ${counts.puaSupplementary} | ${counts.loneJamo} | ${counts.control} |`);
    }
    json.health.push(entry);

    // IR 에는 있으나 마크다운에는 없는 문자 = 방출 단계 소실
    for (const key of ["replacement", "puaBmp", "puaSupplementary", "loneJamo", "control"]) {
      const lost = entry.ir[key] - entry.md[key];
      if (lost > 0) {
        emitLoss.push({ file: name, kind: key, lost, samples: summarizeHits(scans.ir[key]) });
      }
    }

    for (const [target, h] of Object.entries(scans)) {
      const anyHit = [...h.replacement, ...h.puaBmp, ...h.puaSupplementary, ...h.loneJamo, ...h.control];
      if (!anyHit.length) continue;
      healthDetail.push(`### ${name} — \`${target}\` 검출 상세`, "");
      for (const [label, arr] of Object.entries(h)) {
        if (!arr.length) continue;
        healthDetail.push(`**${label}** (${arr.length}건)`, "");
        healthDetail.push("| 코드포인트 | 문자 | 건수 | 문맥(앞뒤 25자) |");
        healthDetail.push("| --- | --- | --- | --- |");
        for (const s of summarizeHits(arr)) {
          healthDetail.push(`| \`${s.codepoint}\` | ${s.char} | ${s.count} | ${s.samples.map((c) => `\`${c.replace(/\|/g, "\\|")}\``).join("<br>")} |`);
        }
        healthDetail.push("");
      }
    }
  }
  doc.push("");
  json.emitLoss = emitLoss;
  if (emitLoss.length) {
    doc.push("### ⚠ 마크다운 방출 단계 문자 소실 (IR에는 존재, md에는 부재)", "");
    doc.push("| 파일 | 종류 | 소실 개수 | 코드포인트 / 문맥 |");
    doc.push("| --- | --- | --- | --- |");
    for (const e of emitLoss) {
      const detail = e.samples.map((s) => `\`${s.codepoint}\`(${s.count}건) \`${s.samples[0]?.replace(/\|/g, "\\|") ?? ""}\``).join("<br>");
      doc.push(`| ${e.file} | ${e.kind} | ${e.lost} | ${detail} |`);
    }
    doc.push("");
    doc.push("이 소실에 대해 kordoc 은 warning 을 남기지 않는다 (섹션 C 참조). RAG 품질 관점에서는 PUA 잡음 제거가 유리할 수 있으나, **무경고 소실**이라는 사실 자체는 기록해 둔다.", "");
  } else {
    doc.push("_마크다운 방출 단계 문자 소실 없음._", "");
  }
  if (healthDetail.length) doc.push(...healthDetail);
  else doc.push("_검출 0건 — 상세 없음._", "");

  // ── (A) 크로스 포맷 대조 ──────────────────────────────────────────
  doc.push("## B. 크로스 포맷 대조 (.hwp ↔ .hwpx 동일 문서 쌍)", "");
  const stems = new Map();
  for (const f of files) {
    const stem = basename(f, extname(f));
    if (!stems.has(stem)) stems.set(stem, []);
    stems.get(stem).push(f);
  }
  const pairs = [...stems.values()].filter((g) => g.length >= 2);
  if (pairs.length === 0) {
    doc.push("_동일 파일명 쌍(.hwp/.hwpx) 없음 — 대조 대상 없음._", "");
  }

  for (const group of pairs) {
    const hwp = group.find((f) => extname(f).toLowerCase() === ".hwp");
    const hwpx = group.find((f) => extname(f).toLowerCase() === ".hwpx");
    if (!hwp || !hwpx) continue;
    const ra = parsed.get(hwp), rb = parsed.get(hwpx);
    doc.push(`### ${basename(hwp, ".hwp")}`, "");
    if (!ra.success || !rb.success) {
      doc.push(`- 한쪽 파싱 실패 — 대조 불가 (hwp: ${ra.success}, hwpx: ${rb.success})`, "");
      continue;
    }

    const na = norm(ra.markdown), nb = norm(rb.markdown);
    const lcs = lcsLength(na, nb);
    const sim = (2 * lcs) / (na.length + nb.length);

    const aLines = ra.markdown.split(/\r?\n/).map(norm).filter((l) => l.length > 0);
    const bLines = rb.markdown.split(/\r?\n/).map(norm).filter((l) => l.length > 0);
    const hunks = lineDiff(aLines, bLines);

    // 표 셀 단위 대조
    const cellsOf = (r) => {
      const out = [];
      const walk = (blocks) => {
        for (const b of blocks ?? []) {
          if (b.type === "table" && b.table) {
            b.table.cells.forEach((row, ri) => row.forEach((c, ci) => {
              out.push({ r: ri + 1, c: ci + 1, text: norm(c.text) });
              if (c.blocks) walk(c.blocks);
            }));
          }
          if (b.children) walk(b.children);
        }
      };
      walk(r.blocks);
      return out;
    };
    const ca = cellsOf(ra), cb = cellsOf(rb);
    const cellDiffs = [];
    const n = Math.min(ca.length, cb.length);
    for (let i = 0; i < n; i++) {
      if (ca[i].text !== cb[i].text) {
        cellDiffs.push({ index: i + 1, pos: `${ca[i].r}행 ${ca[i].c}열`, hwp: ca[i].text, hwpx: cb[i].text });
      }
    }

    const entry = {
      stem: basename(hwp, ".hwp"),
      hwpChars: ra.markdown.length,
      hwpxChars: rb.markdown.length,
      normalizedHwpChars: na.length,
      normalizedHwpxChars: nb.length,
      lcs,
      similarity: sim,
      identicalAfterNormalization: na === nb,
      lineHunks: hunks.length,
      cellCountHwp: ca.length,
      cellCountHwpx: cb.length,
      cellDiffs,
    };
    json.crossFormat.push(entry);

    doc.push("| 항목 | .hwp | .hwpx |");
    doc.push("| --- | --- | --- |");
    doc.push(`| 마크다운 원문 길이 | ${ra.markdown.length}자 | ${rb.markdown.length}자 |`);
    doc.push(`| 정규화 후 길이 | ${na.length}자 | ${nb.length}자 |`);
    doc.push(`| 표 셀 개수 | ${ca.length} | ${cb.length} |`);
    doc.push("");
    doc.push(`- **정규화 후 문자 유사도(2·LCS/(|a|+|b|))**: **${(sim * 100).toFixed(3)}%** (LCS ${lcs}자)`);
    doc.push(`- 정규화 후 완전 일치: **${na === nb ? "예" : "아니오"}**`);
    doc.push(`- 불일치 구간(줄 단위): **${hunks.length}건**, 표 셀 불일치: **${cellDiffs.length}건**`);
    doc.push("");

    if (cellDiffs.length) {
      doc.push("#### 표 셀 불일치 — 원문 병기", "");
      doc.push("| # | 위치 | .hwp 원문 | .hwpx 원문 |");
      doc.push("| --- | --- | --- | --- |");
      for (const d of cellDiffs) {
        doc.push(`| ${d.index} | ${d.pos} | ${d.hwp.replace(/\|/g, "\\|")} | ${d.hwpx.replace(/\|/g, "\\|")} |`);
      }
      doc.push("");
    }

    if (hunks.length) {
      doc.push("#### 줄 단위 불일치 구간 — 원문 병기 (전량)", "");
      hunks.forEach((h, i) => {
        doc.push(`**구간 ${i + 1}**`, "");
        doc.push("```diff");
        for (const l of h.removed) doc.push(`- [hwp ] ${l}`);
        for (const l of h.added) doc.push(`+ [hwpx] ${l}`);
        doc.push("```", "");
      });
    } else {
      doc.push("_줄 단위 불일치 없음._", "");
    }
  }

  // ── 파서 warnings 전문 ────────────────────────────────────────────
  doc.push("## C. 파서 warnings 전문", "");
  for (const f of files) {
    const r = parsed.get(f);
    const name = basename(f);
    if (!r.success) { doc.push(`- **${name}**: 파싱 실패 code=\`${r.code}\` — ${r.error}`); continue; }
    const ws = r.warnings ?? [];
    if (ws.length === 0) { doc.push(`- **${name}**: warnings 0건`); continue; }
    doc.push(`- **${name}**: warnings ${ws.length}건`);
    for (const w of ws) doc.push(`  - \`${w.code}\`${w.page != null ? ` (p.${w.page})` : ""} — ${w.message}`);
  }
  doc.push("");

  writeFileSync(join(OUT_DIR, "GV2_crosscheck.md"), doc.join("\n"), "utf8");
  writeFileSync(join(OUT_DIR, "gv2-crosscheck.json"), JSON.stringify(json, null, 2), "utf8");
  console.log("[XCHK] logs\\gv2\\GV2_crosscheck.md 생성");
  for (const c of json.crossFormat) {
    console.log(`[XCHK] ${c.stem}: 유사도 ${(c.similarity * 100).toFixed(3)}% / 줄 불일치 ${c.lineHunks} / 셀 불일치 ${c.cellDiffs.length}`);
  }
  for (const h of json.health) {
    console.log(`[XCHK] ${h.file}`);
    console.log(`         md: FFFD ${h.md.replacement} / PUA ${h.md.puaBmp}+${h.md.puaSupplementary} / 자모 ${h.md.loneJamo} / 제어 ${h.md.control}`);
    console.log(`         ir: FFFD ${h.ir.replacement} / PUA ${h.ir.puaBmp}+${h.ir.puaSupplementary} / 자모 ${h.ir.loneJamo} / 제어 ${h.ir.control}`);
  }
  for (const e of json.emitLoss) {
    console.log(`[XCHK] 방출 소실: ${e.file} ${e.kind} ${e.lost}자`);
  }
  return 0;
}

main().then((c) => process.exit(c), (e) => { console.error(e?.stack ?? String(e)); process.exit(1); });
