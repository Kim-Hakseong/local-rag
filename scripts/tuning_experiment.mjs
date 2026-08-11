/**
 * tuning_experiment.mjs — 검색/생성 튜닝 조건별 효과 측정 (일회성 실험 도구)
 *
 * 배경:
 *   실전 7문항 평가에서 3문항이 "정보 없음"으로 실패했다. 진단 결과
 *   **검색은 정상**(정답 청크가 topN 4 안, 유사도 0.60~0.67)이었고,
 *   실패는 **긴 대화 이력이 있을 때만** 재현됐다. ctx 초과도 아니다(truncated=0).
 *   따라서 이 실험은 "긴 이력"을 고정 부하로 두고 각 설정의 효과를 측정한다.
 *
 * 방법:
 *   조건마다 (1) 워크스페이스 설정 적용 → (2) 새 스레드 생성 후 워밍업 5턴으로
 *   이력을 쌓고 → (3) 실패 3문항을 질의한다. 채점은 정답 문자열 포함 여부로 기계 판정.
 *   각 조건이 끝나면 스레드를 삭제한다.
 *
 * 전제: AnythingLLM 127.0.0.1:3001, chat 8090, embed 8091 구동 중.
 *
 * 사용법:
 *   node scripts\tuning_experiment.mjs
 *   결과: logs\anythingllm\tuning-experiment.json + 콘솔 표
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const B = "http://127.0.0.1:3001";
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(REPO, "logs", "anythingllm");

/** 이력을 쌓기 위한 워밍업 — 실전 실패 스레드의 도입부를 재현한다 */
const WARMUP = [
  "안녕 너가 뭘 할 수 있지?",
  "문서를 검색하는데 내가 저장소에 md 파일들로 RAG 시켜둔 것으로 답변을 만들어가자",
  "우선 현재 그 목록들에 대해 말해줘",
  "교정장비_관리대장_2026.md 내용에 대해 말해줘",
  "계측장비 정기점검의 점검 책임자 이름과 내선번호는?",
];

/** 실패 3문항 + 기계 채점 키워드 (정답 문자열) */
const QUESTIONS = [
  { id: "Q2", q: "정기점검에서 부적합 판정된 장비와 조치 내용은?", must: ["EQ-0352"] },
  { id: "Q4", q: "EQ-0219 장비의 차기 교정일과 상태는?", must: ["2026-10-15"] },
  { id: "Q5", q: "전원품질 시험에서 차단 지연의 기준값과 허용 편차는?", must: ["42"] },
];

/** 조건: base 는 실전 실패 재현 조건. 나머지는 변수 하나씩만 바꾼다. */
const CONDITIONS = [
  { name: "base (재현)",      settings: { topN: 4, similarityThreshold: 0.25, openAiHistory: 20, vectorSearchMode: "default" } },
  { name: "a) topN 8",        settings: { topN: 8, similarityThreshold: 0.25, openAiHistory: 20, vectorSearchMode: "default" } },
  { name: "b) thr 0.15",      settings: { topN: 4, similarityThreshold: 0.15, openAiHistory: 20, vectorSearchMode: "default" } },
  { name: "c) rerank",        settings: { topN: 4, similarityThreshold: 0.25, openAiHistory: 20, vectorSearchMode: "rerank" } },
  { name: "d) history 2",     settings: { topN: 4, similarityThreshold: 0.25, openAiHistory: 2,  vectorSearchMode: "default" } },
  { name: "d2) history 0",    settings: { topN: 4, similarityThreshold: 0.25, openAiHistory: 0,  vectorSearchMode: "default" } },
];

async function applySettings(s) {
  const r = await fetch(`${B}/api/workspace/kdocs/update`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s),
  });
  const j = await r.json();
  const w = j.workspace ?? {};
  return { topN: w.topN, threshold: w.similarityThreshold, history: w.openAiHistory, mode: w.vectorSearchMode };
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
        } catch { /* SSE 조각 — 다음 청크에서 이어진다 */ }
      }
    }
  }
  return { text: text.trim(), sources };
}

const results = [];

for (const cond of CONDITIONS) {
  const applied = await applySettings(cond.settings);
  console.log(`\n=== ${cond.name} — topN=${applied.topN} thr=${applied.threshold} history=${applied.history} mode=${applied.mode} ===`);

  const slug = await newThread(`exp-${cond.name}`);
  let warmChars = 0;
  for (const w of WARMUP) {
    const r = await ask(slug, w);
    warmChars += w.length + r.text.length;
  }
  console.log(`  워밍업 5턴 누적 ${warmChars}자`);

  const per = [];
  for (const item of QUESTIONS) {
    const r = await ask(slug, item.q);
    const chunkText = r.sources.map((s) => s.text || "").join("\n");
    const inChunk = item.must.every((k) => chunkText.includes(k));
    const inAnswer = item.must.every((k) => r.text.includes(k));
    per.push({ id: item.id, inChunk, inAnswer, sources: r.sources.length, answer: r.text.slice(0, 200) });
    console.log(`  ${item.id}: 청크에 정답=${inChunk ? "O" : "X"} / 답변에 정답=${inAnswer ? "O" : "X"} (인용 ${r.sources.length}개)`);
  }
  await fetch(`${B}/api/workspace/kdocs/thread/${slug}`, { method: "DELETE" });

  const score = per.filter((p) => p.inAnswer).length;
  console.log(`  >> ${cond.name} : ${score}/3 정답`);
  results.push({ condition: cond.name, applied, warmChars, score, detail: per });
}

// 원복
await applySettings({ topN: 4, similarityThreshold: 0.25, openAiHistory: 20, vectorSearchMode: "default" });

console.log("\n================ 요약 ================");
for (const r of results) console.log(`${r.condition.padEnd(16)} ${r.score}/3`);

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "tuning-experiment.json"), JSON.stringify(results, null, 2), "utf8");
console.log(`\n기록: ${join(OUT, "tuning-experiment.json")}`);
