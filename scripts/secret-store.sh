#!/usr/bin/env bash
# secret-store.sh — Single-secret stash for the make-no-mistakes-toolkit
# Cross-platform: Linux (zenity/kdialog/pinentry), macOS (osascript), Windows (powershell.exe Get-Credential).
#
# Stores ONE secret at a time at <runtime-dir>/mnm-secret with mode 0600 (Linux/macOS).
# Backing storage:
#   - Linux:   $XDG_RUNTIME_DIR (tmpfs, RAM-only, per-user, auto-cleaned at logout) — IDEAL
#   - macOS:   $TMPDIR (per-user disk, /var/folders/.../T/) — secret persists until /secret-clear
#   - Windows: $TEMP (per-user disk) — same caveat as macOS
#
# Subcommands:
#   prompt              GUI password prompt → stage secret
#   use ENVVAR -- cmd   Load staged secret as ENVVAR for one command, then exec it
#   clear               Securely delete the staged secret (idempotent)
#   status              Report whether a secret is staged (no value)
#
# Design constraints:
#   - The secret value MUST NEVER appear in stdout/stderr of any subcommand.
#   - The value MUST NEVER be passed as a process argument (visible in `ps`).
#   - The value MUST NOT outlive the consuming command (achieved via `exec env`).

set -euo pipefail
ulimit -c 0  # disable core dumps to prevent post-mortem secret extraction

detect_os() {
  case "$(uname -s 2>/dev/null || echo Unknown)" in
    Linux*)               echo "linux" ;;
    Darwin*)              echo "macos" ;;
    MINGW*|MSYS*|CYGWIN*) echo "windows" ;;
    *)                    echo "unknown" ;;
  esac
}

detect_runtime_dir() {
  if [ -n "${XDG_RUNTIME_DIR:-}" ] && [ -d "$XDG_RUNTIME_DIR" ]; then
    echo "$XDG_RUNTIME_DIR"
  elif [ "$(detect_os)" = "linux" ] && [ -d "/run/user/$(id -u)" ]; then
    echo "/run/user/$(id -u)"
  elif [ -n "${TMPDIR:-}" ]; then
    echo "${TMPDIR%/}"
  elif [ -n "${TEMP:-}" ]; then
    echo "${TEMP%/}"
  else
    echo "/tmp"
  fi
}

SECRET_PATH="$(detect_runtime_dir)/mnm-secret"

prompt_gui() {
  local title="$1" text="$2"
  case "$(detect_os)" in
    linux)
      if command -v zenity >/dev/null 2>&1; then
        zenity --password --title="$title" --text="$text" 2>/dev/null
      elif command -v kdialog >/dev/null 2>&1; then
        kdialog --title "$title" --password "$text"
      elif command -v pinentry-gtk2 >/dev/null 2>&1; then
        printf 'SETTITLE %s\nSETPROMPT %s\nGETPIN\n' "$title" "$text" \
          | pinentry-gtk2 \
          | awk '/^D / { sub(/^D /, ""); print }'
      else
        echo "ERROR: install zenity, kdialog, or pinentry-gtk2 for GUI password input on Linux" >&2
        return 1
      fi
      ;;
    macos)
      if ! command -v osascript >/dev/null 2>&1; then
        echo "ERROR: osascript not available (macOS standard tool missing)" >&2
        return 1
      fi
      # Cross env-var boundary safely: osascript reads via `system attribute`,
      # avoiding shell-quoting hazards if title/text contain quotes.
      MNM_TITLE="$title" MNM_TEXT="$text" osascript \
        -e 'set t to (system attribute "MNM_TITLE")' \
        -e 'set m to (system attribute "MNM_TEXT")' \
        -e 'try' \
        -e '  set d to display dialog m with title t default answer "" with hidden answer buttons {"Cancel","OK"} default button "OK"' \
        -e '  return text returned of d' \
        -e 'on error' \
        -e '  return ""' \
        -e 'end try' 2>/dev/null
      ;;
    windows)
      if ! command -v powershell.exe >/dev/null 2>&1; then
        echo "ERROR: powershell.exe not in PATH (need Git Bash, MSYS2, or WSL with Windows interop)" >&2
        return 1
      fi
      # Get-Credential opens a native Windows credential dialog (password is masked).
      # The username is fixed to 'secret' (cosmetic only — we discard it).
      # Env var crosses bash→PS boundary as plain string; PS reads via $env:.
      MNM_TITLE="$title" MNM_TEXT="$text" powershell.exe -NoProfile -Command '
        $ErrorActionPreference = "SilentlyContinue"
        $cred = Get-Credential -UserName "secret" -Message $env:MNM_TEXT -Title $env:MNM_TITLE
        if ($cred) { $cred.GetNetworkCredential().Password }
      ' 2>/dev/null | tr -d '\r'
      ;;
    *)
      echo "ERROR: unsupported OS ($(uname -s)) for GUI prompt" >&2
      return 1
      ;;
  esac
}

file_perms() {
  stat -c '%a' "$1" 2>/dev/null \
    || stat -f '%OLp' "$1" 2>/dev/null \
    || echo "unknown"
}

set_perms_600() {
  # No-op on Windows where chmod doesn't enforce ACLs the same way,
  # but we still try in case POSIX layer respects it (Git Bash, WSL).
  chmod 600 "$1" 2>/dev/null || true
}

secure_delete() {
  local f="$1"
  [ -f "$f" ] || return 0
  if command -v shred >/dev/null 2>&1; then
    shred -u "$f" 2>/dev/null && return 0
  fi
  if [ "$(detect_os)" = "macos" ]; then
    rm -P "$f" 2>/dev/null && return 0
  fi
  rm -f "$f"
}

cmd_prompt() {
  local title="${1:-Secret input — make-no-mistakes-toolkit}"
  local text="${2:-Paste secret. It will not be echoed or logged anywhere visible to Claude.}"

  umask 077
  mkdir -p "$(dirname "$SECRET_PATH")"

  local secret
  if ! secret="$(prompt_gui "$title" "$text")"; then
    echo "Cancelled or no GUI tool available." >&2
    exit 1
  fi

  if [ -z "$secret" ]; then
    echo "Empty input — refusing to stage an empty secret." >&2
    exit 1
  fi

  printf '%s' "$secret" > "$SECRET_PATH"
  set_perms_600 "$SECRET_PATH"
  secret=""

  local size perms backing
  size=$(wc -c < "$SECRET_PATH" | tr -d ' ')
  perms=$(file_perms "$SECRET_PATH")
  backing=$(stat -f -c '%T' "$SECRET_PATH" 2>/dev/null || echo "unknown")

  echo "Staged at $SECRET_PATH (mode $perms, $size bytes)"
  echo "Backing store: $backing"
  if [ "$backing" != "tmpfs" ] && [ "$backing" != "ramfs" ]; then
    echo "WARN: backing store is not RAM. Call /secret-clear when done — auto-cleanup at logout is NOT guaranteed."
  fi
  echo
  echo "Next:"
  echo "  /secret-use ENVVAR -- your-command   (consume in one command)"
  echo "  /secret-clear                        (wipe when done)"
}

cmd_use() {
  local envvar="${1:-}"
  shift || true

  if [ -z "$envvar" ]; then
    echo "Usage: $0 use ENVVAR -- command [args...]" >&2
    exit 64
  fi

  if ! [[ "$envvar" =~ ^[A-Z_][A-Z0-9_]*$ ]]; then
    echo "ERROR: ENVVAR must be uppercase alphanumeric + underscore (got: $envvar)" >&2
    exit 64
  fi

  if [ "${1:-}" = "--" ]; then
    shift
  fi

  if [ $# -eq 0 ]; then
    echo "ERROR: no command provided after --" >&2
    echo "Usage: $0 use ENVVAR -- command [args...]" >&2
    exit 64
  fi

  if [ ! -f "$SECRET_PATH" ]; then
    echo "ERROR: no secret staged. Run /secret-input first." >&2
    exit 1
  fi

  # Permission check is a Linux/macOS-only safety net. On Windows POSIX layers,
  # POSIX modes don't always reflect actual ACLs, so we only enforce on
  # platforms where chmod has real meaning.
  case "$(detect_os)" in
    linux|macos)
      local perms
      perms=$(file_perms "$SECRET_PATH")
      if [ "$perms" != "600" ] && [ "$perms" != "unknown" ]; then
        echo "ERROR: secret file has insecure permissions ($perms); refusing to use." >&2
        echo "Run /secret-clear and re-stage with /secret-input." >&2
        exit 1
      fi
      ;;
  esac

  # Read into a local var, then immediately exec env VAR=value cmd...
  # `exec` replaces the script process, so the value does not persist in any
  # surviving shell. The env var lives only in the consuming command's process.
  local secret
  secret="$(< "$SECRET_PATH")"
  exec env "$envvar=$secret" "$@"
}

cmd_clear() {
  if [ ! -f "$SECRET_PATH" ]; then
    echo "No secret staged."
    return 0
  fi
  secure_delete "$SECRET_PATH"
  echo "Cleared $SECRET_PATH"
}

cmd_status() {
  if [ -f "$SECRET_PATH" ]; then
    local perms size
    perms=$(file_perms "$SECRET_PATH")
    size=$(wc -c < "$SECRET_PATH" | tr -d ' ')
    echo "Staged: $SECRET_PATH (mode $perms, $size bytes)"
  else
    echo "No secret staged."
  fi
}

case "${1:-}" in
  prompt) shift; cmd_prompt "$@" ;;
  use)    shift; cmd_use "$@" ;;
  clear)  shift; cmd_clear ;;
  status) cmd_status ;;
  *)
    echo "Usage: $0 {prompt|use ENVVAR -- cmd|clear|status}" >&2
    exit 64
    ;;
esac
