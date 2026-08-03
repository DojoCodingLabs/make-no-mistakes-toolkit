---
description: Generate a random secret with a CSPRNG and stage it with mode 0600, via a password-generator GUI (length slider, character-class toggles, regenerate). The value never appears in the conversation log or terminal history — only its length, alphabet and entropy do. Use /secret-use to consume it and /secret-clear to wipe. Also prints a SHA-256 fingerprint so two stores can be compared without either revealing its value.
priority: 90
---

# /secret-generate — Mint a Random Secret Without Logging

You are a **secret generator**. The user needs a new random credential — a service
token, a shared secret, a database password — and it must not appear in the
conversation log, terminal history, or shell environment.

**Input**: `$ARGUMENTS`, optional. Empty means the GUI.
**Output**: metadata about what was staged. **Never the value.**

## Why this exists and `openssl rand -base64 32` does not do

The one-liner prints the value on stdout. When an agent runs it, that stdout is
in the agent's context and in the session transcript on disk — a place the value
cannot be recalled from. `/secret-input` uses an OS-native dialog for exactly
that reason: to keep a typed secret out of those places.

A generator that prints would hand back the property the other three commands
were built to protect. So this one writes straight into the same staging file
`/secret-input` uses, shows the value only in a GUI window a human is looking at,
and puts length, alphabet size and entropy on stdout — enough to audit the run,
not enough to be a disclosure.

## Step 1: Run the Script

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/secret-generate.sh" $ARGUMENTS
```

Pass `$ARGUMENTS` straight through. The forms it accepts:

| Invocation | What happens |
| -- | -- |
| *(empty)* | GUI: length slider 8–128, four character-class toggles, **Regenerate** |
| `--length 50` | headless, all four classes |
| `--length 64 --no-symbols` | headless, alphanumeric only |
| `--status` | is anything staged, and how long — never the value |
| `--fingerprint` | `sha256:<16 hex>` — a comparison handle |

The GUI needs `zenity` (Linux). Without it the script says so and names the
headless form; it does not fall back silently to a different alphabet or length.

**Windows / macOS**: the script is bash and runs under Git Bash, WSL, MSYS2 and
macOS. There is no PowerShell twin yet, so native Windows without bash has no
`/secret-generate` — say that plainly rather than suggesting a workaround, and
point at `/secret-input` with a value from the user's own password manager.

## Step 2: Report (in Spanish)

Show the script's stdout verbatim — it is already metadata-only — then say what
can be done next. Do **not** paraphrase the entropy figure or round it: it is the
number that justifies the fingerprint being safe to publish.

```
staged   /run/user/1000/mnm-secret
length   40 characters
alphabet 89 symbols (upper=1 lower=1 digits=1 symbols=1)
entropy  ~259 bits
```

Then, for a secret that has to reach two places with the same value:

```
/secret-use TOK -- bash -c 'printf "%s" "$TOK" | <command that consumes stdin>'
/secret-use TOK -- bash -c 'printf "%s" "$TOK" | <the second one>'
/secret-clear
```

Two `/secret-use` calls are correct: it does not auto-delete. `/secret-clear` is
the only thing that wipes.

## The fingerprint, and the one case where it is unsafe

`--fingerprint` prints a truncated SHA-256 of the staged value. It exists for the
question a secret store cannot answer: a store will not read a value back — that
is the point of it — so after loading the same value into two of them there is no
way to confirm they match. Two fingerprints settle it with neither end printing
anything sensitive. Same move as an SSH key fingerprint.

**It is safe here because the value came from a CSPRNG.** For a human-chosen
password the hash IS dictionary-attackable and publishing it leaks — which is
precisely the case a salt exists for. If the user asks to fingerprint a value
that `/secret-input` collected rather than one this command generated, say so
before running it.

And say what it is not: SHA-256 is a hash, not encryption. It is one-way, so a
fingerprint cannot be turned back into the secret — and equally it cannot make an
exposed secret safe. It makes values *comparable*, nothing more.

## Reglas absolutas

- **Nunca imprimas el valor generado.** Ni al reportar, ni al confirmar, ni
  "para que el usuario lo copie" — para eso está la ventana GUI, que el usuario
  ve y el log no.
- **Nunca lo pases como argumento** de otro comando. Un `argv` es legible por
  cualquier proceso vía `/proc` y queda en el trace del shell. `/secret-use` lo
  entrega por variable de entorno justamente por eso.
- **Nunca lo escribas a un archivo del proyecto**, ni siquiera temporal. El único
  lugar donde vive es el archivo staged, en tmpfs donde la plataforma tiene uno.
- **No inventes el valor vos.** Si `zenity` falta y el usuario quiere GUI, decilo
  y ofrecé la forma headless; no generes una cadena "a mano" en la conversación,
  que es exactamente el caso que este comando existe para eliminar.
- Si el usuario pide el valor explícitamente, explicá que la ventana GUI ya se lo
  mostró y que `/secret-use` lo consume sin revelarlo. Que lo pida no levanta la
  regla; el valor de la regla es que se sostiene igual.
