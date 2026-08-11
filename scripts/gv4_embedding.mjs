/**
 * gv4_embedding.mjs — 골든 벡터 GV-4 (임베딩 결정성) + 차원 확인
 *
 * 목적:
 *   1) embed 서버(:8091)가 반환하는 임베딩 차원이 1024 인지 확인 (PRD M2 스모크 항목)
 *   2) GV-4: 동일 문자열을 2회 임베딩했을 때 코사인 유사도 = 1.0 (±1e-6)
 *   3) 보조: 서로 다른 한국어 문장 간 유사도가 1.0 이 아님을 확인
 *      (모든 벡터가 같아서 1.0 이 나오는 위양성 방지 — 이게 없으면 GV-4 는 무의미하다)
 *
 * 전제:
 *   - scripts\serve_models.ps1 로 embed 서버가 127.0.0.1:8091 에 떠 있어야 한다.
 *   - 표준 라이브러리만 사용. openai SDK / LangChain 미사용 (CLAUDE.md 금지 항목).
 *   - 네트워크는 127.0.0.1 루프백만.
 *
 * 사용법:
 *   node scripts\gv4_embedding.mjs
 *   종료 코드 0 = PASS, 1 = FAIL, 2 = 전제 불충족(서버 미기동 등)
 *
 * 산출물:
 *   logs\gv4\gv4-report.json
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const OUT_DIR = join(REPO_ROOT, "logs", "gv4");

const ENDPOINT = "http://127.0.0.1:8091/v1/embeddings";
const EXPECTED_DIM = 1024;
const TOLERANCE = 1e-6;

const SAME_TEXT = "국가데이터처는 8월 6일부터 8월 27일까지 전국 약 3만1천개 기업체를 대상으로 운수업조사를 실시한다.";
const OTHER_TEXT = "보고서 편집 여백은 좌우 18mm, 위아래 12.7mm로 설정한다.";

async function embed(input) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input, model: "bge-m3" }),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${await res.text()}`);
  }
  const json = await res.json();
  if (!json.data || !json.data[0] || !Array.isArray(json.data[0].embedding)) {
    throw new Error(`예상치 못한 응답 형태: ${JSON.stringify(json).slice(0, 300)}`);
  }
  return json.data[0].embedding;
}

function cosine(a, b) {
  if (a.length !== b.length) throw new Error(`차원 불일치: ${a.length} vs ${b.length}`);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** 부동소수 완전 동일 여부 (코사인 반올림에 가려지는 미세 차이를 잡는다) */
function exactlyEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  let v1, v2, vOther;
  try {
    v1 = await embed(SAME_TEXT);
    v2 = await embed(SAME_TEXT);
    vOther = await embed(OTHER_TEXT);
  } catch (err) {
    console.error(`[GV-4] SETUP FAIL: embed 서버(:8091) 호출 실패 — ${err.message}`);
    console.error("        scripts\\serve_models.ps1 -EmbedOnly 로 기동했는지 확인할 것.");
    return 2;
  }

  const dim = v1.length;
  const simSame = cosine(v1, v2);
  const simOther = cosine(v1, vOther);
  const identical = exactlyEqual(v1, v2);

  const dimOk = dim === EXPECTED_DIM;
  const determinismOk = Math.abs(simSame - 1.0) <= TOLERANCE;
  // 위양성 방지: 다른 문장이 1.0 이면 임베딩이 사실상 상수라는 뜻이므로 실패로 본다.
  const discriminationOk = Math.abs(simOther - 1.0) > TOLERANCE;

  const pass = dimOk && determinismOk && discriminationOk;

  const report = {
    verdict: pass ? "PASS" : "FAIL",
    endpoint: ENDPOINT,
    dimension: dim,
    expectedDimension: EXPECTED_DIM,
    dimensionOk: dimOk,
    cosineSameText: simSame,
    cosineDeltaFromOne: Math.abs(simSame - 1.0),
    tolerance: TOLERANCE,
    determinismOk,
    bitwiseIdentical: identical,
    cosineDifferentText: simOther,
    discriminationOk,
    sampleTextSame: SAME_TEXT,
    sampleTextOther: OTHER_TEXT,
    firstFiveDims: v1.slice(0, 5),
  };
  writeFileSync(join(OUT_DIR, "gv4-report.json"), JSON.stringify(report, null, 2), "utf8");

  console.log(`[GV-4] 차원: ${dim} (기대 ${EXPECTED_DIM}) → ${dimOk ? "OK" : "FAIL"}`);
  console.log(`[GV-4] 동일 문자열 코사인: ${simSame} (|1-cos| = ${Math.abs(simSame - 1.0).toExponential(3)}) → ${determinismOk ? "OK" : "FAIL"}`);
  console.log(`[GV-4] 벡터 비트 단위 완전 동일: ${identical}`);
  console.log(`[GV-4] 다른 문장 코사인: ${simOther.toFixed(6)} → ${discriminationOk ? "OK (상수 벡터 아님)" : "FAIL (임베딩이 문장을 구분하지 못함)"}`);
  console.log(`[GV-4] ${pass ? "PASS" : "FAIL"}`);
  return pass ? 0 : 1;
}

main().then((c) => process.exit(c), (e) => { console.error(e?.stack ?? String(e)); process.exit(1); });
