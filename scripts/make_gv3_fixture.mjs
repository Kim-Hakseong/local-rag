/**
 * make_gv3_fixture.mjs — GV-3 대체 픽스처 생성기 (인간 승인된 대체안)
 *
 * 배경:
 *   GV-3 의 원래 입력은 "비밀번호 걸린 HWP"(spec/samples_README.md #5)이나 미확보다.
 *   인간이 대체안을 승인했다: 정상 HWP 를 복사해 **헤더 바이트를 의도적으로 훼손**한
 *   파일로 "깨끗한 실패"(구조화 에러코드 + 무크래시)를 검증한다.
 *
 * 훼손 방법 (결정론적, 재현 가능):
 *   variant A `corrupt-header-sig.hwp`
 *     - 오프셋 0x00–0x07 (CFB/OLE2 시그니처 D0 CF 11 E0 A1 B1 1A E1) → 0x00 8바이트로 덮어씀
 *     - 목적: 포맷 판별 단계 실패 → UNSUPPORTED_FORMAT / CORRUPTED 계열 코드 확인
 *   variant B `corrupt-fat.hwp`
 *     - 시그니처는 유지. 오프셋 0x200–0x3FF (첫 섹터) → 0xFF 512바이트
 *     - 관측 결과: **훼손이 무효** — 파싱 성공, 산출 마크다운이 원본과 sha256 동일.
 *       해당 바이트가 이 문서에서 load-bearing 이 아니었다는 뜻. 대조군으로 남겨둔다.
 *   variant C `corrupt-sector-shift.hwp`
 *     - 시그니처 유지. 오프셋 0x1E–0x21 (sector shift / mini sector shift) → 0xFF 4바이트
 *     - CFB 섹터 크기 정의가 깨지므로 구조 해석 자체가 불가능해야 한다
 *   variant D `corrupt-dir-sector.hwp`
 *     - 시그니처 유지. 오프셋 0x30–0x33 (first directory sector location) → 0xFF 4바이트
 *     - 디렉터리 엔트리 시작 위치 상실 → 스트림 탐색 불가해야 한다
 *   variant E `flag-encrypted.hwp`
 *     - CFB 내부 `FileHeader` 스트림의 flags DWORD(오프셋 36) **bit1(암호 설정)** 을 켠 뒤
 *       CFB 를 재작성. 미확보인 "비밀번호 걸린 HWP"(#5)의 **분류 경로**를 직접 자극한다.
 *     - **한계(반드시 인지)**: 본문이 실제로 암호화된 것은 아니고 플래그만 켠 것이다.
 *       따라서 이 픽스처는 kordoc 의 ENCRYPTED **판정·분류**를 검증하며,
 *       실제 복호화 동작은 검증하지 않는다.
 *   variant F `flag-distribution.hwp`
 *     - 같은 방식으로 flags **bit2(배포용 문서)** 를 켠다. 배포용 분류 경로 관찰용.
 *
 * 주의:
 *   산출물은 실물 문서 파생 바이너리이므로 저장소에 커밋하지 않는다 (.gitignore: scripts/gv3/).
 *
 * 사용법:
 *   node scripts\make_gv3_fixture.mjs
 *   종료 코드 0 = 생성 성공, 2 = 원본 없음
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const PATHS_MD = join(REPO_ROOT, "spec", "paths.md");
const SRC = join(REPO_ROOT, "samples", "2025년+기준+운수업조사+및+기업활동조사+실시.hwp");
const OUT_DIR = join(SCRIPT_DIR, "gv3");

const sha = (b) => createHash("sha256").update(b).digest("hex");

/** kordoc 의 고정 의존성 cfb(1.2.2)를 KORDOC_CMD 기준 절대경로로 로드 (PATH 탐색 없음) */
async function loadCfb() {
  const text = readFileSync(PATHS_MD, "utf8");
  const m = text.match(/^\s*KORDOC_CMD\s*=\s*(.+?)\s*$/m);
  if (!m || m[1].startsWith("<") || m[1].startsWith("(")) {
    throw new Error("spec/paths.md 의 KORDOC_CMD 미기입");
  }
  const entry = join(dirname(m[1].trim()), "node_modules", "kordoc", "node_modules", "cfb", "cfb.js");
  if (!existsSync(entry)) throw new Error(`cfb 모듈을 찾을 수 없음: ${entry}`);
  return (await import(pathToFileURL(entry).href)).default;
}

/** FileHeader flags DWORD(오프셋 36)의 특정 비트를 켜서 CFB 재작성 */
function withFileHeaderFlag(CFB, srcBuffer, bit, label) {
  const cfb = CFB.read(srcBuffer, { type: "buffer" });
  let before = null, after = null;
  cfb.FullPaths.forEach((p, i) => {
    if (!/FileHeader/i.test(p)) return;
    const f = cfb.FileIndex[i];
    const b = Buffer.from(f.content);
    before = b.readUInt32LE(36);
    b.writeUInt32LE(before | (1 << bit), 36);
    after = b.readUInt32LE(36);
    f.content = b;
  });
  if (before === null) throw new Error("FileHeader 스트림을 찾지 못함");
  const out = Buffer.from(CFB.write(cfb, { type: "buffer" }));
  console.log(`       flags 0x${before.toString(16).padStart(8, "0")} -> 0x${after.toString(16).padStart(8, "0")} (bit${bit} ${label})  sha256=${sha(out)}`);
  return out;
}

if (!existsSync(SRC)) {
  console.error(`[GV-3] 원본 없음: ${SRC}`);
  process.exit(2);
}

const original = readFileSync(SRC);
mkdirSync(OUT_DIR, { recursive: true });
console.log(`[GV-3] 원본 ${original.length} bytes, sha256=${sha(original)}`);

// variant A — CFB 시그니처 파괴
const a = Buffer.from(original);
const sigBefore = a.subarray(0, 8).toString("hex").toUpperCase();
a.fill(0x00, 0x00, 0x08);
const pathA = join(OUT_DIR, "corrupt-header-sig.hwp");
writeFileSync(pathA, a);
console.log(`[GV-3] A: ${pathA}`);
console.log(`       0x00-0x07: ${sigBefore} -> ${a.subarray(0, 8).toString("hex").toUpperCase()}  sha256=${sha(a)}`);

// variant B — 시그니처 유지, 첫 섹터 파괴 (대조군: 이 문서에서는 무효 훼손)
const b = Buffer.from(original);
b.fill(0xff, 0x200, 0x400);
const pathB = join(OUT_DIR, "corrupt-fat.hwp");
writeFileSync(pathB, b);
console.log(`[GV-3] B: ${pathB}`);
console.log(`       0x200-0x3FF -> FF x512  sha256=${sha(b)}`);

// variant C — CFB 헤더의 섹터 크기 정의 파괴
const c = Buffer.from(original);
const cBefore = c.subarray(0x1e, 0x22).toString("hex").toUpperCase();
c.fill(0xff, 0x1e, 0x22);
const pathC = join(OUT_DIR, "corrupt-sector-shift.hwp");
writeFileSync(pathC, c);
console.log(`[GV-3] C: ${pathC}`);
console.log(`       0x1E-0x21: ${cBefore} -> FFFFFFFF  sha256=${sha(c)}`);

// variant D — CFB 헤더의 디렉터리 시작 섹터 파괴
const d = Buffer.from(original);
const dBefore = d.subarray(0x30, 0x34).toString("hex").toUpperCase();
d.fill(0xff, 0x30, 0x34);
const pathD = join(OUT_DIR, "corrupt-dir-sector.hwp");
writeFileSync(pathD, d);
console.log(`[GV-3] D: ${pathD}`);
console.log(`       0x30-0x33: ${dBefore} -> FFFFFFFF  sha256=${sha(d)}`);

// variant E/F — FileHeader flags 비트 조작 (암호 설정 / 배포용)
const CFB = await loadCfb();
const pathE = join(OUT_DIR, "flag-encrypted.hwp");
console.log(`[GV-3] E: ${pathE}`);
writeFileSync(pathE, withFileHeaderFlag(CFB, original, 1, "암호 설정"));

const pathF = join(OUT_DIR, "flag-distribution.hwp");
console.log(`[GV-3] F: ${pathF}`);
writeFileSync(pathF, withFileHeaderFlag(CFB, original, 2, "배포용 문서"));
