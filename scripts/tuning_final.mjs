/**
 * tuning_final.mjs — 최적 조합 확정 + 7문항 최종 측정 (일회성 실험 도구)
 *
 * 1차 실험 결론:
 *   topN 8 / threshold 0.15 → 효과 0. rerank → 1/3. **openAiHistory 2 → 3/3.**
 *   (openAiHistory 0 은 백엔드가 `openAiHistory||20` 로 처리해 20 으로 폴백 → 측정 불가)
 *
 * 이 스크립트가 하는 것:
 *   1) 최적 조합 후보 비교 — history2 단독 vs history2+rerank (실패 3문항)
 *   2) 확정 조합으로 **7문항 전체**를 두 조건에서 측정
 *      - 새 스레드 (이력 없음) : 기본 성능
 *      - 긴 이력 (워밍업 5턴)  : 실전 조건
 *
 * 사용법: node scripts\tuning_final.mjs
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const B = "http://127.0.0.1:3001";
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(REPO, "logs", "anythingllm");

const WARMUP = [
  "안녕 너가 뭘 할 수 있지?",
  "문서를 검색하는데 내가 저장소에 md 파일들로 RAG 시켜둔 것으로 답변을 만들어가자",
  "우선 현재 그 목록들에 대해 말해줘",
  "교정장비_관리대장_2026.md 내용에 대해 말해줘",
  "계측장비 정기점검의 점검 책임자 이름과 내선번호는?",
];

/** 실전 7문항. Q7 은 함정(문서에 없음) — "없다"고 답하면 정답 */
const SEVEN = [
  { id: "F1", q: "계측장비 정기점검의 점검 책임자 이름과 내선번호는?", must: ["배정훈", "4212"] },
  { id: "F2", q: "정기점검에서 부적합 판정된 장비와 조치 내용은?", must: ["EQ-0352"] },
  { id: "F3", q: "정기점검 보고서에서 원격 자가진단이란 무엇인가?", must: ["SCPI"] },
  { id: "F4", q: "EQ-0219 장비의 차기 교정일과 상태는?", must: ["2026-10-15"] },
  { id: "F5", q: "전원품질 시험에서 차단 지연의 기준값과 허용 편차는?", must: ["42"] },
  { id: "F6", q: "PQ-02 순간 정전 내성 시험의 합격 기준과 담당자는?", must: ["도현우"] },
  { id: "F7", q: "절연 저항계의 재교정 비용은 얼마인가?", trap: true },
];

const THREE = SEVEN.filter((x) => ["F2", "F4", "F5"].includes(x.id));

/** 함정 문항 채점: 없다고 답하면 통과. 금액을 지어내면 실패 */
function gradeTrap(text) {
  const admits = /없|확인할 수 없|명시되어 있지|포함되어 있지|찾을 수 없/.test(text);
  const fabricates = /\d[\d,]*\s*(원|만원|천원|달러|USD|KRW)/.test(text);
  return admits && !fabricates;
}

async function applySettings(s) {
  const r = await fetch(`${B}/api/workspace/kdocs/update`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s),
  });
  const w = (await r.json()).workspace ?? {};
  return { topN: w.topN, thr: w.similarityThreshold, history: w.openAiHistory, mode: w.vectorSearchMode };
}

async function newThread(name) {
  const r = await fetch(`${B}/api/workspace/kdocs/thread/new`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }),
  });
  return (await r.json()).thread.slug;
}

async function ask(slug, message) {
  const res = await fetch(`${B}/api/workspace/kdocs/thread/${slug}/stream-chat`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, mode: "query", attachments: [] }),
  });
  const dec = new TextDecoder();
  let buf = "", text = "", sources = [];
  for await (const c of res.body) {
    buf += dec.decode(c, { stream: true });
    let s;
    while ((s = buf.indexOf("\n\n")) >= 0) {
      const raw = buf.slice(0, s); buf = buf.slice(s + 2);
      for (const line of raw.split(/\r?\n/)) {
        if (!line.startsWith("data:")) continue;
        const p = line.slice(5).trim();
        if (!p || p === "[DONE]") continue;
        try {
          const o = JSON.parse(p);
          if (o.textResponse) text += o.textResponse;
          if (Array.isArray(o.sources) && o.sources.length) sources = o.sources;
        } catch { /* SSE 조각 */ }
      }
    }
  }
  return { text: text.trim(), sources };
}

function grade(item, r) {
  if (item.trap) return gradeTrap(r.text);
  return item.must.every((k) => r.text.includes(k));
}

async function runSet(label, settings, items, withWarmup) {
  const applied = await applySettings(settings);
  const slug = await newThread(label);
  let warmChars = 0;
  if (withWarmup) {
    for (const w of WARMUP) { const r = await ask(slug, w); warmChars += w.length + r.text.length; }
  }
  const detail = [];
  for (const item of items) {
    const r = await ask(slug, item.q);
    const ok = grade(item, r);
    const chunkHas = item.trap ? null
      : item.must.every((k) => r.sources.map((s) => s.text || "").join("\n").includes(k));
    detail.push({ id: item.id, ok, chunkHas, answer: r.text.slice(0, 200) });
    console.log(`    ${item.id}: ${ok ? "O" : "X"}${chunkHas === false ? " (청크에도 없음)" : ""}`);
  }
  await fetch(`${B}/api/workspace/kdocs/thread/${slug}`, { method: "DELETE" });
  const score = detail.filter((d) => d.ok).length;
  console.log(`  >> ${label}: ${score}/${items.length}  [topN=${applied.topN} thr=${applied.thr} history=${applied.history} mode=${applied.mode}${withWarmup ? `, 워밍업 ${warmChars}자` : ""}]`);
  return { label, applied, warmChars, score, total: items.length, detail };
}

const results = [];

console.log("=== 1단계: 최적 조합 후보 비교 (실패 3문항, 긴 이력 조건) ===");
results.push(await runSet("e) history2",
  { topN: 4, similarityThreshold: 0.25, openAiHistory: 2, vectorSearchMode: "default" }, THREE, true));
results.push(await runSet("f) history2+rerank",
  { topN: 4, similarityThreshold: 0.25, openAiHistory: 2, vectorSearchMode: "rerank" }, THREE, true));

const best = results[1].score > results[0].score ? results[1] : results[0];
const bestSettings = results[1].score > results[0].score
  ? { topN: 4, similarityThreshold: 0.25, openAiHistory: 2, vectorSearchMode: "rerank" }
  : { topN: 4, similarityThreshold: 0.25, openAiHistory: 2, vectorSearchMode: "default" };
console.log(`\n>>> 확정 조합: ${best.label}\n`);

console.log("=== 2단계: 7문항 전체 측정 ===");
results.push(await runSet("최종-새스레드(이력없음)", bestSettings, SEVEN, false));
results.push(await runSet("최종-긴이력(실전조건)", bestSettings, SEVEN, true));

console.log("\n================ 요약 ================");
for (const r of results) console.log(`${r.label.padEnd(26)} ${r.score}/${r.total}`);

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "tuning-final.json"), JSON.stringify({ bestSettings, results }, null, 2), "utf8");
console.log(`\n기록: ${join(OUT, "tuning-final.json")}`);
