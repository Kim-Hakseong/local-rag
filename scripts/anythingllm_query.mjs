/**
 * anythingllm_query.mjs — AnythingLLM 워크스페이스에 질의하고 답변 + 인용 청크를 덤프한다
 *
 * 목적:
 *   M3 스모크 / M5 평가에서 "답변 전문"과 "인용된 청크 원문"을 기계적으로 뽑아
 *   인용이 실제 근거인지 인간이 판정할 수 있게 한다. Ralph 는 요약하지 않는다.
 *
 * 전제:
 *   - AnythingLLM Desktop 이 실행 중이고 내부 백엔드가 127.0.0.1:3001 에서 응답해야 한다.
 *   - 워크스페이스가 존재하고 문서가 임베딩돼 있어야 한다.
 *   - 데스크톱 단일 사용자 모드라 인증 헤더가 필요 없다 (/api/setup-complete 의 RequiresAuth=false).
 *   - 표준 라이브러리(fetch)만 사용. openai SDK / LangChain 미사용.
 *
 * 사용법:
 *   node scripts\anythingllm_query.mjs --workspace kdocs --message "질문" [--mode query|chat] [--out 파일]
 *   종료 코드 0 = 응답 수신, 1 = 오류
 *
 * 참고:
 *   AnythingLLM 데스크톱에는 비스트리밍 chat 엔드포인트가 없다 (stream-chat SSE 만 존재).
 *   따라서 SSE 를 직접 파싱한다.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const BASE = "http://127.0.0.1:3001";

function arg(flag, fallback = null) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}

const workspace = arg("--workspace", "kdocs");
const message = arg("--message");
const mode = arg("--mode", "query");
const outPath = arg("--out");

if (!message) {
  console.error("사용법: node scripts\\anythingllm_query.mjs --workspace kdocs --message \"질문\"");
  process.exit(1);
}

async function streamChat() {
  const res = await fetch(`${BASE}/api/workspace/${workspace}/stream-chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, mode, attachments: [] }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}: ${await res.text()}`);

  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let sources = [];
  let error = null;
  let chatId = null;
  const events = [];

  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    // SSE 이벤트는 빈 줄로 구분된다
    let sep;
    while ((sep = buffer.indexOf("\n\n")) >= 0) {
      const raw = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      for (const line of raw.split(/\r?\n/)) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        let obj;
        try { obj = JSON.parse(payload); } catch { continue; }
        events.push(obj);
        if (obj.textResponse) text += obj.textResponse;
        if (Array.isArray(obj.sources) && obj.sources.length) sources = obj.sources;
        if (obj.error) error = obj.error;
        if (obj.id) chatId = obj.id;
      }
    }
  }
  return { text, sources, error, chatId, eventCount: events.length };
}

const started = process.hrtime.bigint();
let result;
try {
  result = await streamChat();
} catch (err) {
  console.error(`[query] 실패: ${err.message}`);
  process.exit(1);
}
const elapsedSec = Number(process.hrtime.bigint() - started) / 1e9;

console.log("=".repeat(72));
console.log(`질문   : ${message}`);
console.log(`워크스페이스: ${workspace} / mode=${mode} / ${elapsedSec.toFixed(1)}s / SSE 이벤트 ${result.eventCount}개`);
console.log("=".repeat(72));
console.log("[답변 전문]");
console.log(result.text || "(빈 응답)");
console.log();
console.log(`[인용 청크: ${result.sources.length}개]`);
if (result.sources.length === 0) {
  console.log("(인용 없음)");
} else {
  result.sources.forEach((s, i) => {
    console.log("-".repeat(72));
    console.log(`#${i + 1} title=${s.title ?? "?"}`);
    console.log(`    score(유사도)=${s.score ?? "?"}  _distance=${s._distance ?? "?"}  chunkId=${s.id ?? "?"}`);
    console.log(`    docpath=${s.docpath ?? "?"}`);
    console.log("    --- 청크 원문 (전문, 생략 없음) ---");
    console.log((s.text ?? "").split("\n").map((l) => "    " + l).join("\n"));
  });
}
if (result.error) console.log(`\n[error] ${result.error}`);

const outFile = outPath
  ? resolve(outPath)
  : join(REPO_ROOT, "logs", "anythingllm", `query-${Date.now().toString(36)}.json`);
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify({
  workspace, mode, message,
  elapsedSec: Number(elapsedSec.toFixed(2)),
  answer: result.text,
  sourceCount: result.sources.length,
  sources: result.sources,
  error: result.error,
}, null, 2), "utf8");
console.log(`\n[query] 기록: ${outFile}`);
