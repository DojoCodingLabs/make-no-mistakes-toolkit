---
description: Run a single command with the staged secret loaded as an environment variable. Format ENVVAR -- command. The secret is NOT auto-deleted — call /secret-clear when done. Accepts arguments as $ARGUMENTS.
priority: 90
---

# /secret-use — Run a Command with the Staged Secret as ENV var

You are a **secret consumer**. The user has staged a secret via `/secret-input` and wants to run **one** command with that secret loaded as an environment variable. The env var lives only inside the consuming command's process and dies when it exits.

**Input**: `$ARGUMENTS` of the form `ENVVAR -- command [args...]`
**Output**: stdout/stderr of the consumed command (the secret never appears).

---

## Step 1: Validate `$ARGUMENTS`

The argument string MUST contain the literal `--` separator, with an env var name before it and at least one command token after it.

If `$ARGUMENTS` is empty, lacks `--`, or has no command after `--`, show usage and stop:

```
Usage: /secret-use ENVVAR -- command [args...]

Ejemplos:
  /secret-use GH_TOKEN -- gh api user
  /secret-use GH_TOKEN -- gh api orgs/chimeranext/members --jq '.[].login'
  /secret-use OPENAI_API_KEY -- bash -c 'curl -H "Authorization: Bearer $OPENAI_API_KEY" https://api.openai.com/v1/models'
```

Note: shell features like pipes, redirects, or env-var expansion in the consumed command require wrapping in a shell call because the helper does `exec env VAR=val "$@"` (bash) or `& $cmd args` (PowerShell) — neither spawns an intermediate shell. Wrap with `bash -c '...'` or `powershell -Command '...'` as appropriate.

## Step 2: Run (pick the right script for the platform)

If `bash` is available (Linux, macOS, WSL, Git Bash, MSYS2):

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/secret-store.sh" use $ARGUMENTS
```

If running on native Windows without bash:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${env:CLAUDE_PLUGIN_ROOT}\scripts\secret-store.ps1" use $ARGUMENTS
```

Both scripts will:
1. Validate the env var name (uppercase + underscore + digits only)
2. Verify the staged file exists and has correct ACL/permissions (refuses if not)
3. Set the env var in the script's process, then exec/invoke the command — the env var lives in that command's process only

The PowerShell variant uses `[Environment]::SetEnvironmentVariable($var, $val, 'Process')` then `& $cmd` with a `finally` block to unset; functionally equivalent to bash's `exec env VAR=val "$@"`.

## Step 3: Relay Output

The user sees the command's stdout/stderr directly. If the command fails:
- Report the error literally
- **Do NOT** retry with the secret passed differently (e.g., as an argument)
- **Do NOT** print or reconstruct the command with the secret expanded
- Suggest verifying the staged secret with `/secret-clear` + `/secret-input` if auth fails

## Step 4: Remind About Cleanup

After the command finishes (success or failure), if this is the last expected use of the secret, remind the user:

```
Recordá: /secret-clear cuando termines. El secret sigue staged hasta que lo borres explícitamente o cierres sesión de usuario.
```

---

## Reglas absolutas

- **NUNCA** muestres el comando con la variable expandida. Si el comando es `gh api -H "Authorization: Bearer $GH_TOKEN" ...`, **NO** lo recompongás con el valor real al reportar errores.
- Si el output del comando incluye accidentalmente el secret (ej: error logs que ecoan headers, stack traces que muestran env), pasá el output al usuario tal cual pero **no lo cites en resúmenes** ni lo guardés en archivos.
- No persistás el secret en otra parte. El único lugar autorizado de almacenamiento es `<runtime-dir>/mnm-secret` (Linux: `$XDG_RUNTIME_DIR`, macOS: `$TMPDIR`, Windows: `$env:TEMP`).
- Si el usuario te pide "guardalo en otro lado para usar después", respondé que el patrón correcto es re-correr `/secret-input` cada vez que se necesita.
