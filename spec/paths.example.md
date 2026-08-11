# spec/paths.md — 환경 경로 (setup.ps1 이 자동 생성)

이 파일은 **템플릿**이다. 실제 파일은 `spec/paths.md` 이며 `setup.ps1` 이 만든다.
사용자명·설치 위치가 들어가므로 `spec/paths.md` 는 `.gitignore` 대상이다.

**모든 스크립트는 여기 값만 읽는다.** 경로를 바꿀 일이 생기면 이 파일 하나만 고치면 된다.

```
QWEN_GGUF      = <REPO>\models\Qwen3-4B-Instruct-2507-Q4_K_M.gguf
BGE_M3_GGUF    = <REPO>\models\bge-m3-q8_0.gguf
LLAMA_SERVER   = <REPO>\runtime\llama-server.exe
PYTHON         = C:\Users\<사용자명>\AppData\Local\Programs\Python\Python312\python.exe
KORDOC_CMD     = C:\Users\<사용자명>\AppData\Roaming\npm\kordoc.cmd
CHAT_MODEL_ID  = qwen3-4b
EMBED_MODEL_ID = bge-m3
NGL_CHAT       = 99
CTX_CHAT       = 6144
```

## 키 설명

| 키 | 의미 |
|---|---|
| `QWEN_GGUF` | 채팅 모델 GGUF 절대경로 |
| `BGE_M3_GGUF` | 임베딩 모델 GGUF 절대경로 |
| `LLAMA_SERVER` | `llama-server.exe` 절대경로 (`runtime\` 안) |
| `PYTHON` | `convert_office.py` 를 돌릴 파이썬 절대경로 (3.10+) |
| `KORDOC_CMD` | 전역 npm 설치된 `kordoc.cmd` 절대경로. **`npx` 금지** |
| `CHAT_MODEL_ID` | llama-server `--alias` 값. AnythingLLM 의 Chat Model 입력값 |
| `EMBED_MODEL_ID` | 임베딩 서버 `--alias` 값 |
| `NGL_CHAT` | GPU 오프로딩 레이어 수. NVIDIA/Vulkan GPU → `99`, GPU 없음 → `0` |
| `CTX_CHAT` | 채팅 컨텍스트 크기. 기본 `6144` (VRAM 부족 시 4096 → 3072) |

## 주의

- 전부 **절대경로**, 따옴표 없이 한 줄씩.
- `where` / `command -v` 류 **동적 탐색에 의존하지 않는다.** 설치 시 1회 확인해 여기 박는다.
- VRAM 이 부족해 기동이 실패하면 `NGL_CHAT` → `CTX_CHAT` 순으로 낮춘다
  (`99` → `28` → `0`, `6144` → `4096` → `3072`).
