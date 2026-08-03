#!/usr/bin/env bash
# secret-generate — mint a random secret straight into the staging store, with a
# password-generator GUI, WITHOUT the value ever reaching the agent.
#
# WHY THIS IS NOT `openssl rand -base64 32`. The obvious one-liner prints the
# value on stdout. When an agent runs it, that stdout lands in the agent's
# context and in the session transcript on disk — a place the value cannot be
# recalled from. The whole reason `secret-store.sh prompt` uses an OS-native
# dialog is to keep a typed secret out of exactly those places; a generator that
# prints would hand back the property the other three commands were built to
# protect. So this script has one hard invariant:
#
#     THE GENERATED VALUE NEVER GOES TO STDOUT.
#
# It reaches two places only: the staged file (0600, on tmpfs where the platform
# has one) and a GUI window a human is looking at. stdout carries metadata —
# length, alphabet size, entropy — which is what makes a run auditable without
# making it a disclosure.
#
# Fills the one gap in the existing set:
#   secret-store.sh prompt   a human types a value      -> staged
#   secret-generate.sh       a CSPRNG makes one         -> staged   <- this
#   secret-store.sh use      one command consumes it
#   secret-store.sh clear    shred
#
# Usage:
#   secret-generate.sh                     GUI: length slider + charset toggles
#   secret-generate.sh --length 50         headless, all four classes
#   secret-generate.sh --length 64 --no-symbols
#   secret-generate.sh --status            is anything staged (never the value)
#   secret-generate.sh --fingerprint       a comparison handle (see below)
set -euo pipefail

# ---------------------------------------------------------------------------
# Staging path — MUST match secret-store.sh, or `/secret-use` cannot find what
# this stages. Mirrored rather than sourced, because that file runs a command
# dispatcher at the bottom and sourcing it would execute a subcommand.
# ---------------------------------------------------------------------------
detect_runtime_dir() {
  if [ -n "${XDG_RUNTIME_DIR:-}" ] && [ -d "$XDG_RUNTIME_DIR" ]; then
    echo "$XDG_RUNTIME_DIR"
  elif [ "$(uname -s)" = "Linux" ] && [ -d "/run/user/$(id -u)" ]; then
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

# Matches the probe form already used in this repo's Makefile. `command -v`
# writes nothing to stderr on a miss, so nothing diagnostic is discarded here —
# which is why this is the one place the plain form is right.
have() { command -v "$1" >/dev/null 2>&1; }

# ---------------------------------------------------------------------------
# Alphabets. The symbol class deliberately EXCLUDES ' " ` \ — a generated secret
# gets pasted into shell one-liners, JSON payloads and YAML, and a backtick
# inside a double-quoted shell string is command substitution. A generator that
# can emit a value its consumer cannot safely carry fails at 3am, in a way that
# looks like the consumer's bug.
# ---------------------------------------------------------------------------
A_UPPER='ABCDEFGHIJKLMNOPQRSTUVWXYZ'
A_LOWER='abcdefghijklmnopqrstuvwxyz'
A_DIGIT='0123456789'
A_SYMBOL='!#%&()*+,-./:;<=>?@[]^_{|}~'

LENGTH=32
USE_UPPER=1 USE_LOWER=1 USE_DIGIT=1 USE_SYMBOL=1
GUI=1

sha256_of_staged() {
  if   have sha256sum; then sha256sum      <"$SECRET_PATH" | cut -d' ' -f1
  elif have shasum;    then shasum -a 256  <"$SECRET_PATH" | cut -d' ' -f1
  elif have openssl;   then openssl dgst -sha256 <"$SECRET_PATH" | awk '{print $NF}'
  else echo "no SHA-256 tool found (sha256sum, shasum, openssl)." >&2; return 1
  fi
}

while [ $# -gt 0 ]; do
  case "$1" in
    --length)     LENGTH="$2"; GUI=0; shift 2 ;;
    --upper)      USE_UPPER=1;  GUI=0; shift ;;
    --lower)      USE_LOWER=1;  GUI=0; shift ;;
    --digits)     USE_DIGIT=1;  GUI=0; shift ;;
    --symbols)    USE_SYMBOL=1; GUI=0; shift ;;
    --no-symbols) USE_SYMBOL=0; GUI=0; shift ;;
    --no-gui)     GUI=0; shift ;;
    --status)
      if [ -s "$SECRET_PATH" ]; then
        echo "staged: yes  path=$SECRET_PATH  bytes=$(wc -c <"$SECRET_PATH" | tr -d ' ')"
      else
        echo "staged: no   path=$SECRET_PATH"
      fi
      exit 0 ;;
    --fingerprint)
      # A COMPARISON handle. Not encryption, and not protection: SHA-256 is
      # one-way, so this cannot be turned back into the secret, and it also
      # cannot make an exposed secret safe.
      #
      # What it buys is the one question the destinations cannot answer. A
      # secret store will not read a value back — that is the point of it — so
      # after loading the same value into two places there is no way to confirm
      # they match. Two fingerprints settle it with neither end printing
      # anything sensitive. It is the same move as an SSH key fingerprint.
      #
      # Truncated to 16 hex chars. Not for collision resistance — against a
      # CSPRNG value that is not the threat — but so that what lands in a
      # terminal, a CI log or a chat is unmistakably a HANDLE, and nobody tries
      # to paste it as a credential.
      #
      # SAFE HERE, UNSAFE ELSEWHERE, and the difference is the input. For a
      # human-chosen password the hash IS dictionary-attackable and publishing
      # it leaks; that case is exactly what a salt exists for. This is safe only
      # because the value came from a CSPRNG with the entropy printed below.
      [ -s "$SECRET_PATH" ] || { echo "no secret staged." >&2; exit 1; }
      h="$(sha256_of_staged)" || exit 1
      echo "sha256:${h:0:16}  ($(wc -c <"$SECRET_PATH" | tr -d ' ') chars staged)"
      exit 0 ;;
    -h|--help)
      sed -n '24,32p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

# ---------------------------------------------------------------------------
# GUI: one length slider, four charset toggles — the shape every password
# generator uses, because it is the shape people already know.
# ---------------------------------------------------------------------------
if [ "$GUI" -eq 1 ]; then
  if ! have zenity; then
    echo "zenity not found. Re-run headless, e.g.:" >&2
    echo "  $(basename "$0") --length 40" >&2
    exit 1
  fi
  LENGTH="$(zenity --scale --title='Secret length' \
    --text='How many characters' --min-value=8 --max-value=128 \
    --value=32 --step=1)" || { echo "cancelled" >&2; exit 1; }

  sel="$(zenity --list --checklist --title='Character classes' \
    --text='Alphabet to draw from' --column='' --column='Class' \
    TRUE 'Uppercase' TRUE 'Lowercase' TRUE 'Digits' TRUE 'Symbols' \
    --separator='|')" || { echo "cancelled" >&2; exit 1; }

  case "$sel" in *Uppercase*) USE_UPPER=1 ;;  *) USE_UPPER=0 ;;  esac
  case "$sel" in *Lowercase*) USE_LOWER=1 ;;  *) USE_LOWER=0 ;;  esac
  case "$sel" in *Digits*)    USE_DIGIT=1 ;;  *) USE_DIGIT=0 ;;  esac
  case "$sel" in *Symbols*)   USE_SYMBOL=1 ;; *) USE_SYMBOL=0 ;; esac
fi

ALPHABET=''
[ "$USE_UPPER"  -eq 1 ] && ALPHABET="${ALPHABET}${A_UPPER}"
[ "$USE_LOWER"  -eq 1 ] && ALPHABET="${ALPHABET}${A_LOWER}"
[ "$USE_DIGIT"  -eq 1 ] && ALPHABET="${ALPHABET}${A_DIGIT}"
[ "$USE_SYMBOL" -eq 1 ] && ALPHABET="${ALPHABET}${A_SYMBOL}"

[ -n "$ALPHABET" ] || { echo "ERROR: every character class was unchecked — nothing to draw from." >&2; exit 1; }
case "$LENGTH" in ''|*[!0-9]*) echo "ERROR: length must be a whole number." >&2; exit 1 ;; esac
[ "$LENGTH" -ge 8 ] || { echo "ERROR: refusing to generate fewer than 8 characters." >&2; exit 1; }

entropy_bits() {
  # `bc -l` prints a `.` decimal separator regardless of locale, while printf in
  # a comma-decimal locale rejects it — so LC_ALL=C on the printf, not on bc.
  LC_ALL=C printf '%.0f' "$(echo "$1 * l($2) / l(2)" | bc -l)"
}

# ---------------------------------------------------------------------------
# Generation. REJECTION SAMPLING, not `byte % n`.
#
# 256 is not a multiple of most alphabet sizes, so `% n` makes the first
# `256 mod n` symbols come up more often than the rest — for a 89-symbol
# alphabet, 78 of them at ~1.35x. Small, real, and avoidable for the price of a
# loop: any byte at or above the largest multiple of |A| under 256 is DISCARDED
# and redrawn.
#
# /dev/urandom, never $RANDOM. Bash's $RANDOM is a 15-bit generator seeded from
# pid and time — reproducible by anyone who knows roughly when it ran.
# /dev/urandom is the kernel CSPRNG and takes no seed from userspace.
# ---------------------------------------------------------------------------
generate() {
  local alphabet="$1" want="$2"
  local n=${#alphabet} limit out='' b
  limit=$(( 256 - (256 % n) ))
  while [ "${#out}" -lt "$want" ]; do
    b=$(od -An -N1 -tu1 </dev/urandom | tr -d ' \n')
    [ "$b" -ge "$limit" ] && continue
    out="${out}${alphabet:$(( b % n )):1}"
  done
  printf '%s' "$out"
}

umask 077
mkdir -p "$(dirname "$SECRET_PATH")"

while :; do
  # Written STRAIGHT to the staged file. The value is never assigned to a
  # variable at this scope, so no later line in this script can print it by
  # accident — the invariant is enforced by structure, not by discipline.
  generate "$ALPHABET" "$LENGTH" >"$SECRET_PATH"
  chmod 600 "$SECRET_PATH"

  bytes=$(wc -c <"$SECRET_PATH" | tr -d ' ')
  if [ "$bytes" -eq 0 ]; then
    # The same control `secret-store.sh prompt` applies to typed input. An empty
    # staged secret is indistinguishable from a good one to every consumer
    # downstream, and it is exactly how an empty value reaches a secret store
    # and then reads as configured.
    echo "ERROR: generated an empty value — refusing to stage it." >&2
    rm -f "$SECRET_PATH"
    exit 1
  fi

  [ "$GUI" -eq 1 ] || break

  # Shown to the HUMAN, in a field they can select and copy. Only zenity's STDOUT
  # is dropped, and its stderr still reaches the terminal: what the user may have
  # edited in the box is not what gets staged, and silently staging an edit would
  # be a second, invisible source of truth. Cancel means regenerate.
  if zenity --entry --title='Generated secret' \
       --text="$bytes chars · alphabet of ${#ALPHABET} · ~$(entropy_bits "$bytes" "${#ALPHABET}") bits of entropy

Already staged. Copy it if you need it somewhere else." \
       --entry-text="$(cat "$SECRET_PATH")" \
       --ok-label='Keep' --cancel-label='Regenerate' >/dev/null; then
    break
  fi
done

# ---------------------------------------------------------------------------
# stdout: metadata ONLY. Re-read from the file rather than carrying a variable,
# so there stays exactly one place the value lives.
# ---------------------------------------------------------------------------
bytes=$(wc -c <"$SECRET_PATH" | tr -d ' ')
echo "staged   $SECRET_PATH"
echo "length   $bytes characters"
echo "alphabet ${#ALPHABET} symbols (upper=$USE_UPPER lower=$USE_LOWER digits=$USE_DIGIT symbols=$USE_SYMBOL)"
echo "entropy  ~$(entropy_bits "$bytes" "${#ALPHABET}") bits"
echo
echo "Consume it with:  /secret-use ENVVAR -- <command>"
echo "Compare it with:  $(basename "$0") --fingerprint"
echo "Wipe it with:     /secret-clear"
