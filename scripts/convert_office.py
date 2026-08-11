"""convert_office.py — kordoc CLI 얇은 래퍼 (인박스 → 마크다운)

목적
    저장소 루트의 office-inbox\\ 에 놓인 한국형 오피스 문서를 kordoc 으로 마크다운 변환해
    office-md\\ 에 산출한다. 원장(sha256)으로 재변환을 막고, 실패는 _failed\\ 하위로 분류한다.

전제
    - spec/paths.md 에 KORDOC_CMD 절대경로가 기입돼 있어야 한다 (M1에서 기록됨).
    - Python 3.10+ / **표준 라이브러리만** 사용 (CLAUDE.md).
    - kordoc 호출은 `.cmd` 절대경로 + 인자 리스트. npx 금지, PATH 동적 탐색 금지.
    - 네트워크 접근 없음.

사용법
    python scripts\\convert_office.py
    python scripts\\convert_office.py --root D:\\다른위치            # 데이터 루트를 바꾸고 싶을 때만
    python scripts\\convert_office.py --dry-run                       # 판정만, 파일 이동/변환 없음

    종료 코드: 0 = 전건 성공(또는 스킵만), 1 = 1건 이상 실패, 2 = 실행 전제 불충족

산출 (<root> 기본값 = 저장소 루트)
    <root>\\office-md\\<스템>.md              kordoc 마크다운 **본문만** (메타 블록 없음)
    <root>\\office-md\\<스템>.md.meta.json    메타데이터 사이드카 (source/converted/sha256)
    <root>\\office-md\\.ledger.json           파일별 sha256 원장
    <root>\\office-inbox\\_failed\\{encrypted,unsupported,error}\\
    <repo>\\logs\\convert-YYYYMMDD.log

설계 근거
    - 실패 분류는 kordoc 의 구조화 에러코드 계약을 따른다. 이 계약은 M1 GV-3 에서
      실측 검증했다 (ENCRYPTED / UNSUPPORTED_FORMAT / PARSE_ERROR / NO_SECTIONS).
    - hwpx 우선 규칙: 동일 스템의 .hwp 와 .hwpx 가 공존하면 .hwpx 만 변환한다.
      근거는 M1 크로스 포맷 실측 — HWP5 경로는 볼드가 마크다운에 방출되지 않아
      청킹 시 구조 힌트가 적다. DECISIONS.md "[M4-요구사항]" 항목 참조.
    - 에러를 삼키지 않는다. 모든 실패는 분류 + 로그 + 종료코드로 노출한다.
    - 메타데이터는 md 본문이 아니라 사이드카로 나간다. front-matter 를 본문에 넣으면
      RAG 임베딩에서 별도 청크로 잡혀 검색 컨텍스트를 오염시킨다 (GATE-3 실측, EVAL.md 부록 A).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

# ── 상수 ────────────────────────────────────────────────────────────────
REPO_ROOT = Path(__file__).resolve().parent.parent
PATHS_MD = REPO_ROOT / "spec" / "paths.md"
LOG_DIR = REPO_ROOT / "logs"

# 데이터 루트 = 저장소 루트. office-inbox\ / office-md\ / logs\ 가 전부 여기 아래로 모인다.
# (한때 저장소 밖 별도 경로를 썼으나 2026-08-09 에 저장소 루트로 통일했다. DECISIONS.md 참조)
# 실데이터는 .gitignore(office-inbox/, office-md/, logs/)로 커밋에서 제외된다.
DEFAULT_ROOT = REPO_ROOT

# kordoc 이 처리하는 확장자 (kordoc 4.7.2 --help 기준)
SUPPORTED_EXT = {".hwp", ".hwpx", ".hwpml", ".pdf", ".docx", ".xlsx", ".xls"}

# 본문이 이보다 짧으면 변환 실패로 본다 (DESIGN.md §3)
MIN_BODY_CHARS = 50

# kordoc 에러코드 → _failed 하위 폴더 (M1 GV-3 에서 실측 검증한 계약)
ERROR_CODE_DIR = {
    "ENCRYPTED": "encrypted",
    "DRM_PROTECTED": "encrypted",
    "UNSUPPORTED_FORMAT": "unsupported",
    "PARSE_ERROR": "error",
    "NO_SECTIONS": "error",
    "CORRUPTED": "error",
    "EMPTY_INPUT": "error",
    "DECOMPRESSION_BOMB": "error",
    "ZIP_BOMB": "error",
    "IMAGE_BASED_PDF": "error",
    "MISSING_DEPENDENCY": "error",
    "OUTPUT_TOO_LARGE": "error",
    # kordoc 이 종료코드 0 + 빈 출력을 낸 경우 (kordoc 4.7.2 일부 DOCX 에서 실측)
    "NO_OUTPUT": "error",
}
FALLBACK_FAIL_DIR = "error"

log = logging.getLogger("convert_office")


# ── 유틸 ────────────────────────────────────────────────────────────────
def read_spec_path(key: str) -> str | None:
    """spec/paths.md 의 `KEY = VALUE` 한 줄을 읽는다. 플레이스홀더는 None."""
    if not PATHS_MD.is_file():
        return None
    pattern = re.compile(rf"^\s*{re.escape(key)}\s*=\s*(.+?)\s*$", re.MULTILINE)
    match = pattern.search(PATHS_MD.read_text(encoding="utf-8"))
    if not match:
        return None
    value = match.group(1).strip()
    if value.startswith("<") or value.startswith("("):
        return None
    return value


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def setup_logging(log_dir: Path) -> Path:
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / f"convert-{datetime.now().strftime('%Y%m%d')}.log"
    log.setLevel(logging.INFO)
    log.handlers.clear()
    fmt = logging.Formatter("%(asctime)s %(levelname)-7s %(message)s")

    file_handler = logging.FileHandler(log_file, encoding="utf-8")
    file_handler.setFormatter(fmt)
    log.addHandler(file_handler)

    stream_handler = logging.StreamHandler(sys.stdout)
    stream_handler.setFormatter(fmt)
    log.addHandler(stream_handler)
    return log_file


def load_ledger(path: Path) -> dict:
    if not path.is_file():
        return {}
    try:
        # utf-8-sig: 사람이 PowerShell/메모장으로 원장을 손대면 BOM 이 붙는다.
        # BOM 허용은 인코딩 관용이지 검증 완화가 아니다 (내용 검사는 그대로).
        data = json.loads(path.read_text(encoding="utf-8-sig"))
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError as exc:
        # 원장이 깨졌으면 조용히 초기화하지 않는다 — 전건 재변환은 비싸고 원인 은폐다.
        log.error("원장 파싱 실패 (%s): %s — 이번 실행은 빈 원장으로 진행하지 않고 중단한다", path, exc)
        raise


def save_ledger(path: Path, ledger: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(ledger, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


# ── kordoc 호출 ─────────────────────────────────────────────────────────
def run_kordoc_json(kordoc_cmd: str, src: Path) -> tuple[int, dict | None, str]:
    """kordoc 을 --format json 으로 호출한다.

    반환: (종료코드, 파싱된 JSON 또는 None, stderr 원문)
    셸 문자열 조립 금지 — 인자는 리스트로 넘긴다 (경로에 한글/공백 가능).
    """
    argv = [kordoc_cmd, str(src), "--format", "json", "--silent"]
    try:
        proc = subprocess.run(
            argv,
            capture_output=True,
            timeout=600,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return 124, None, "kordoc 타임아웃 (600s)"
    except OSError as exc:
        return 126, None, f"kordoc 실행 실패: {exc}"

    stdout = proc.stdout.decode("utf-8", errors="replace")
    stderr = proc.stderr.decode("utf-8", errors="replace")

    payload = None
    if stdout.strip():
        try:
            payload = json.loads(stdout)
        except json.JSONDecodeError as exc:
            # JSON 이 아니면 파싱 실패로 노출한다. 무시하지 않는다.
            stderr = f"{stderr}\n[convert] kordoc stdout 을 JSON 으로 파싱 실패: {exc}"
    else:
        # 실측: kordoc 4.7.2 가 일부 DOCX 에서 **종료코드 0 + 완전히 빈 stdout** 을 낸다
        # (30초 이상 소요 후). 조용히 성공으로 넘기면 문서가 사라지므로 명시적으로 노출한다.
        stderr = (
            f"{stderr}\n[convert] kordoc 이 빈 출력을 반환했다 "
            f"(종료코드 {proc.returncode}, stderr {len(stderr.strip())}자)"
        )
    return proc.returncode, payload, stderr


def extract_result(payload: dict | None) -> dict:
    """kordoc --format json 산출물에서 필요한 필드만 정규화해 뽑는다.

    kordoc 은 단일 파일에도 배열로 감싸 줄 수 있어 두 형태를 모두 받는다.
    """
    if payload is None:
        # 빈 출력인지 깨진 JSON 인지는 stderr 에 이미 구분해 기록했다.
        return {"success": False, "code": "NO_OUTPUT", "error": "kordoc 이 파싱 가능한 결과를 내지 않았다"}
    node = payload
    if isinstance(payload, list):
        node = payload[0] if payload else {}
    if isinstance(node, dict) and "results" in node and isinstance(node["results"], list):
        node = node["results"][0] if node["results"] else {}
    if not isinstance(node, dict):
        return {"success": False, "code": None, "error": "kordoc 출력 형태를 해석할 수 없다"}
    return node


# ── 분류 ────────────────────────────────────────────────────────────────
def failure_dir_for(code: str | None) -> str:
    if not code:
        return FALLBACK_FAIL_DIR
    return ERROR_CODE_DIR.get(code.upper(), FALLBACK_FAIL_DIR)


def move_to_failed(src: Path, inbox: Path, subdir: str, dry_run: bool) -> Path:
    target_dir = inbox / "_failed" / subdir
    target = target_dir / src.name
    if dry_run:
        return target
    target_dir.mkdir(parents=True, exist_ok=True)
    if target.exists():
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        target = target_dir / f"{src.stem}.{stamp}{src.suffix}"
    shutil.move(str(src), str(target))
    return target


def write_sidecar(out_md: Path, src: Path, digest: str) -> Path:
    """메타데이터 사이드카(`<스템>.md.meta.json`)를 쓴다.

    스키마(source/converted/sha256)를 임의 변경하지 않는다 (DESIGN §3.1 / CLAUDE.md).

    왜 본문이 아니라 사이드카인가 (임베딩 위생):
      산출 md 에 front-matter 를 넣으면 그 블록이 RAG 임베딩에서 **독립 청크로 잡힌다.**
      실측에서 유사도 0.5992 로 검색 2순위에 올라와 본문 청크 하나를 topN 밖으로 밀어냈다.
      sha256 해시 문자열은 검색에도 생성에도 기여하지 않는 순수 잡음이다.
      메타데이터는 감사에 필요하므로 버리지 않고 본문에서 분리한다.

      주의: 이 분리가 **답변 품질을 개선한다는 근거는 없다.** 초기에 그렇게 판단했으나
      회귀 검증에서 인과가 뒤집혔다 (진짜 원인은 대화 이력 프라이밍, EVAL.md 부록 C).
    """
    meta = {
        "source": src.name,
        "converted": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "sha256": digest,
    }
    sidecar = out_md.with_name(out_md.name + ".meta.json")
    # newline="" — 본문 md 와 같은 이유로 LF 고정 (산출물 해시 안정성)
    with sidecar.open("w", encoding="utf-8", newline="") as handle:
        handle.write(json.dumps(meta, ensure_ascii=False, indent=2) + "\n")
    return sidecar


# ── hwpx 우선 규칙 ──────────────────────────────────────────────────────
def select_hwpx_over_hwp(files: list[Path]) -> tuple[list[Path], dict[Path, Path]]:
    """동일 스템의 .hwp/.hwpx 공존 시 .hwp 를 제외한다.

    반환: (처리 대상 목록, {스킵된 hwp: 우선된 hwpx})
    """
    by_stem: dict[str, dict[str, Path]] = {}
    for path in files:
        ext = path.suffix.lower()
        if ext in (".hwp", ".hwpx"):
            by_stem.setdefault(path.stem, {})[ext] = path

    skipped: dict[Path, Path] = {}
    for pair in by_stem.values():
        if ".hwp" in pair and ".hwpx" in pair:
            skipped[pair[".hwp"]] = pair[".hwpx"]

    kept = [f for f in files if f not in skipped]
    return kept, skipped


# ── 메인 ────────────────────────────────────────────────────────────────
def main() -> int:
    parser = argparse.ArgumentParser(description="kordoc 인박스 변환기")
    parser.add_argument("--root", default=str(DEFAULT_ROOT), help="작업 루트 (office-inbox/office-md 의 부모)")
    parser.add_argument("--dry-run", action="store_true", help="판정만 수행, 변환/이동 없음")
    args = parser.parse_args()

    log_file = setup_logging(LOG_DIR)

    root = Path(args.root)
    inbox = root / "office-inbox"
    outdir = root / "office-md"
    ledger_path = outdir / ".ledger.json"

    log.info("=" * 70)
    log.info("convert_office 시작 root=%s dry_run=%s log=%s", root, args.dry_run, log_file)

    kordoc_cmd = read_spec_path("KORDOC_CMD")
    if not kordoc_cmd:
        log.error("spec/paths.md 의 KORDOC_CMD 가 비어 있다. 중단.")
        return 2
    if not Path(kordoc_cmd).is_file():
        log.error("KORDOC_CMD 경로에 파일이 없다: %s", kordoc_cmd)
        return 2
    log.info("KORDOC_CMD=%s", kordoc_cmd)

    if not inbox.is_dir():
        log.error("인박스가 없다: %s", inbox)
        return 2
    outdir.mkdir(parents=True, exist_ok=True)

    ledger = load_ledger(ledger_path)

    # _failed 하위는 순회 대상에서 제외한다
    candidates = sorted(
        p for p in inbox.iterdir()
        if p.is_file() and not p.name.startswith(".")
    )
    log.info("인박스 파일 %d건", len(candidates))

    targets, hwp_skipped = select_hwpx_over_hwp(candidates)
    for hwp, hwpx in hwp_skipped.items():
        log.info("SKIPPED_DUPLICATE_PAIR %s (동일 스템 %s 우선)", hwp.name, hwpx.name)
        ledger[hwp.name] = {
            "status": "SKIPPED_DUPLICATE_PAIR",
            "sha256": sha256_file(hwp),
            "preferred": hwpx.name,
            "reason": "동일 스템의 hwpx 를 우선 변환 (hwpx 우선 규칙)",
            "at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        }

    stats = {"converted": 0, "skipped_ledger": 0, "skipped_pair": len(hwp_skipped), "failed": 0}
    failures: list[str] = []

    for src in targets:
        name = src.name
        ext = src.suffix.lower()

        # 1) 지원 외 확장자 → unsupported
        if ext not in SUPPORTED_EXT:
            log.warning("UNSUPPORTED_EXT %s (%s)", name, ext)
            moved = move_to_failed(src, inbox, "unsupported", args.dry_run)
            ledger[name] = {
                "status": "FAILED",
                "code": "UNSUPPORTED_EXT",
                "movedTo": str(moved),
                "at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            }
            stats["failed"] += 1
            failures.append(f"{name} (UNSUPPORTED_EXT)")
            continue

        # 2) 원장 스킵
        digest = sha256_file(src)
        prev = ledger.get(name)
        if prev and prev.get("sha256") == digest and prev.get("status") == "OK":
            out_md = outdir / f"{src.stem}.md"
            if out_md.is_file():
                log.info("SKIP_UNCHANGED %s (sha256 동일)", name)
                stats["skipped_ledger"] += 1
                continue
            log.info("원장에는 있으나 산출물이 없다 — 재변환: %s", name)

        # 3) 변환
        if args.dry_run:
            log.info("DRY_RUN 변환 대상: %s", name)
            continue

        code, payload, stderr = run_kordoc_json(kordoc_cmd, src)
        result = extract_result(payload)

        if not result.get("success", False):
            err_code = result.get("code")
            err_msg = result.get("error") or stderr.strip() or f"kordoc 종료코드 {code}"
            subdir = failure_dir_for(err_code)
            moved = move_to_failed(src, inbox, subdir, args.dry_run)
            log.error("FAILED %s code=%s dir=%s msg=%s", name, err_code, subdir, err_msg)
            ledger[name] = {
                "status": "FAILED",
                "code": err_code or "UNKNOWN",
                "error": err_msg,
                "sha256": digest,
                "movedTo": str(moved),
                "at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            }
            stats["failed"] += 1
            failures.append(f"{name} ({err_code or 'UNKNOWN'})")
            continue

        markdown = result.get("markdown") or ""
        if len(markdown.strip()) < MIN_BODY_CHARS:
            moved = move_to_failed(src, inbox, "error", args.dry_run)
            log.error("FAILED %s code=TOO_SHORT 본문 %d자 (< %d)", name, len(markdown.strip()), MIN_BODY_CHARS)
            ledger[name] = {
                "status": "FAILED",
                "code": "TOO_SHORT",
                "error": f"본문 {len(markdown.strip())}자 (최소 {MIN_BODY_CHARS})",
                "sha256": digest,
                "movedTo": str(moved),
                "at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            }
            stats["failed"] += 1
            failures.append(f"{name} (TOO_SHORT)")
            continue

        out_md = outdir / f"{src.stem}.md"
        # 산출 md 는 **순수 본문만** 담는다 (DESIGN §3.1). 메타는 사이드카로 나간다.
        # newline="" 로 개행 변환을 끈다. Windows 기본(텍스트 모드)은 \n → \r\n 으로 바꿔
        # 같은 입력에서 플랫폼마다 다른 바이트가 나온다. 산출물 해시를 안정시키기 위해 LF 고정.
        with out_md.open("w", encoding="utf-8", newline="") as handle:
            handle.write(markdown)
        sidecar = write_sidecar(out_md, src, digest)

        warnings = result.get("warnings") or []
        log.info(
            "OK %s -> %s (+%s) (%d자, 경고 %d건)",
            name, out_md.name, sidecar.name, len(markdown), len(warnings),
        )
        for warning in warnings:
            log.warning("  kordoc warning [%s] %s", warning.get("code"), warning.get("message"))

        ledger[name] = {
            "status": "OK",
            "sha256": digest,
            "output": out_md.name,
            "sidecar": sidecar.name,
            "markdownChars": len(markdown),
            "warnings": [w.get("code") for w in warnings],
            "at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        }
        stats["converted"] += 1

    if not args.dry_run:
        save_ledger(ledger_path, ledger)

    log.info("-" * 70)
    log.info(
        "완료: 변환 %d / 원장스킵 %d / 쌍스킵 %d / 실패 %d",
        stats["converted"], stats["skipped_ledger"], stats["skipped_pair"], stats["failed"],
    )
    if failures:
        # 스케줄러 로그에서 판독 가능하도록 stdout 에도 남긴다
        print("실패 목록:")
        for item in failures:
            print(f"  - {item}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
