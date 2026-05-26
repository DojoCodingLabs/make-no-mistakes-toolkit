#!/usr/bin/env bash
# gemini-code-review.sh — one-shot code review on Gemini 3.5 Flash via liteLLM.
#
# Self-contained, repo-agnostic worker for the /make-no-mistakes:gemini-code-review
# command. Resolves a diff, sends it + a condensed review rubric to
# gemini-3.5-flash in a SINGLE completion through a transient liteLLM proxy, and
# prints review markdown to stdout. NO nested Claude Code agent runs on Gemini,
# so there is no tool-call-translation fragility — just one completion. An Opus
# orchestrator (the command) then curates the output against the local repo's
# CLAUDE.md rules.
#
# Usage:
#   gemini-code-review.sh                 # diff <base>...HEAD (base auto-detected)
#   gemini-code-review.sh 245             # gh pr diff 245
#   gemini-code-review.sh --uncommitted   # git diff HEAD (staged + unstaged)
#   gemini-code-review.sh my-branch       # git diff <base>...my-branch
#   gemini-code-review.sh a..b            # git diff a..b
#   [--base <branch>]                     # override auto-detected base
#
# Secret: requires GEMINI_API_KEY in the environment. Provide it WITHOUT leaking
# it into logs via this plugin's own secret helpers:
#   /secret-input                          (stage the key once)
#   /secret-use GEMINI_API_KEY -- bash <this-script> [args]
#
# Requires: litellm, jq, curl, git (+ gh for PR mode).
set -euo pipefail

PORT="${GEMINI_REVIEW_PORT:-4100}"
MODEL="gemini/gemini-3.5-flash"
BASE=""
TARGET=""

while [ $# -gt 0 ]; do
  case "$1" in
    --base) [ -z "${2:-}" ] && { echo "ERROR: --base requiere un valor." >&2; exit 1; }; BASE="$2"; shift 2 ;;
    --uncommitted) TARGET="--uncommitted"; shift ;;
    -h|--help) sed -n '2,26p' "$0"; exit 0 ;;
    *) TARGET="$1"; shift ;;
  esac
done

for bin in litellm jq curl git; do
  command -v "$bin" >/dev/null 2>&1 || { echo "ERROR: falta '$bin' en PATH." >&2; exit 1; }
done
if [ -z "${GEMINI_API_KEY:-}" ]; then
  echo "ERROR: GEMINI_API_KEY no está en el entorno." >&2
  echo "Stage it once with /secret-input, then run via:" >&2
  echo "  /secret-use GEMINI_API_KEY -- bash \"$0\" $*" >&2
  exit 1
fi

# --- auto-detect base branch (repo-agnostic) ---
if [ -z "$BASE" ]; then
  BASE="$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's@^origin/@@' || true)"
  if [ -z "$BASE" ]; then
    for b in develop main master; do
      git show-ref --verify --quiet "refs/remotes/origin/$b" && BASE="$b" && break
    done
  fi
  [ -z "$BASE" ] && BASE="main"
fi

# --- resolve diff ---
LABEL=""
if [ -z "$TARGET" ]; then
  LABEL="${BASE}...HEAD"; DIFF="$(git diff "${BASE}...HEAD")"
elif [ "$TARGET" = "--uncommitted" ]; then
  LABEL="uncommitted (git diff HEAD)"; DIFF="$(git diff HEAD)"
elif [[ "$TARGET" =~ ^[0-9]+$ ]]; then
  command -v gh >/dev/null 2>&1 || { echo "ERROR: 'gh' requerido para modo PR." >&2; exit 1; }
  LABEL="PR #${TARGET}"; DIFF="$(gh pr diff "$TARGET")"
elif [[ "$TARGET" == *..* ]]; then
  LABEL="$TARGET"; DIFF="$(git diff "$TARGET")"
else
  LABEL="${BASE}...${TARGET}"; DIFF="$(git diff "${BASE}...${TARGET}")"
fi
if [ -z "${DIFF// }" ]; then echo "ERROR: diff vacío para '${LABEL}'." >&2; exit 2; fi
DIFF_CHARS=${#DIFF}
[ "$DIFF_CHARS" -gt 600000 ] && echo "WARN: diff grande (${DIFF_CHARS} chars) — el review puede perder profundidad." >&2

# --- rubric (repo-agnostic; the command curates against the repo's CLAUDE.md) ---
read -r -d '' RUBRIC <<'RUBRIC_EOF' || true
You are a battle-tested senior engineer doing a rigorous code review of a diff.
Review as if you will debug this at 3 AM during an incident. Read EVERY changed
line. You are given ONLY the diff — do not ask to run commands or open other
files; review what is shown and flag where you'd want to see more.

Hunt for:
- Logic: race conditions, null/undefined access without guards, missing awaits,
  off-by-one, inverted/incorrect boolean logic, wrong equality, bad type coercion.
- State/data-flow: stale closures, missing effect/memo deps, direct mutation of
  shared/immutable state, lost error context in catch blocks.
- Edge cases: empty/zero/negative, empty-string vs null vs undefined, encoding,
  timezones, large-input performance, concurrency.
- Architecture: single-responsibility violations, oversized units, missing types,
  magic numbers/strings, leftover debug logs / commented-out code, dead code.
- Tests: new logic without tests; missing error/empty/edge coverage.
- Security: secrets/keys committed or logged, privileged credentials in client
  code, unvalidated input, missing authz/ownership checks, SQL injection, XSS via
  raw/unsafe HTML injection, SSRF on server-side fetch, missing rate limiting.

Output EXACTLY this markdown:

## Gemini Code Review — {LABEL}

### Files Reviewed
| File | +/- | Risk | Notes |
|------|-----|------|-------|

### Findings
#### Critical (blocks merge)
- **[Category]** `file:line` — issue -> fix
#### Major (fix before merge)
- ...
#### Minor (recommended)
- ...

### Missing Tests / Changes
- ...

### Verdict: Approve | Request Changes | Block
| Critical | Major | Minor |
|----------|-------|-------|
| N | N | N |

If a section is empty, write "None.". Be specific with file:line; no vague advice.
RUBRIC_EOF
RUBRIC="${RUBRIC/\{LABEL\}/$LABEL}"

# --- transient liteLLM proxy (self-generated config + master key; kill only ours) ---
PROXY_LOG="$(mktemp -t gcr-proxy.XXXXXX.log)"
PROXY_CFG="$(mktemp -t gcr-config.XXXXXX.yaml)"
export LITELLM_MASTER_KEY="sk-gcr-local-$$"
cat > "$PROXY_CFG" <<CFG
model_list:
  - model_name: $MODEL
    litellm_params:
      model: $MODEL
      api_key: os.environ/GEMINI_API_KEY
general_settings:
  master_key: os.environ/LITELLM_MASTER_KEY
litellm_settings:
  drop_params: true
CFG
STARTED=false
ready() { curl -fsS "http://127.0.0.1:${PORT}/health/readiness" >/dev/null 2>&1; }
cleanup() { $STARTED && [ -n "${PID:-}" ] && kill "$PID" 2>/dev/null || true; rm -f "$PROXY_LOG" "$PROXY_CFG"; }
trap cleanup EXIT INT TERM

if ! ready; then
  echo "Levantando liteLLM proxy (gemini-3.5-flash) en 127.0.0.1:${PORT}..." >&2
  litellm --config "$PROXY_CFG" --host 127.0.0.1 --port "$PORT" >"$PROXY_LOG" 2>&1 &
  PID=$!; STARTED=true
  for _ in $(seq 1 40); do ready && break; sleep 1; done
  ready || { echo "ERROR: el proxy no arrancó. Log:" >&2; tail -8 "$PROXY_LOG" >&2; exit 4; }
fi

# --- one completion ---
# `-sS` (NOT -fsS): on an HTTP 4xx/5xx the body is captured + diagnosed below,
# instead of curl failing silently and masking the real API error (quota, bad key).
BODY="$(jq -n --arg m "$MODEL" --arg sys "$RUBRIC" \
  --arg usr "Review this diff (${LABEL}):"$'\n\n'"\`\`\`diff"$'\n'"${DIFF}"$'\n'"\`\`\`" \
  '{model:$m, messages:[{role:"system",content:$sys},{role:"user",content:$usr}]}')"
RESP="$(curl -sS "http://127.0.0.1:${PORT}/v1/chat/completions" \
  -H "Authorization: Bearer ${LITELLM_MASTER_KEY}" \
  -H "Content-Type: application/json" -d "$BODY")" \
  || { echo "ERROR: no se pudo conectar al proxy." >&2; exit 5; }

CONTENT="$(printf '%s' "$RESP" | jq -r '.choices[0].message.content // empty')"
if [ -z "$CONTENT" ]; then
  echo "ERROR: respuesta sin contenido:" >&2
  printf '%s\n' "$RESP" | jq -r '.error // .' >&2 2>/dev/null || printf '%s\n' "$RESP" >&2
  exit 6
fi

OUT="$(mktemp -t gemini-code-review.XXXXXX.md)"
printf '%s\n' "$CONTENT" | tee "$OUT"
echo "[saved: $OUT · model: gemini-3.5-flash · diff: $LABEL · ${DIFF_CHARS} chars]" >&2
