---
description: Wipe the staged secret using shred -u (Linux), rm -P (macOS), or random-overwrite-then-delete (Windows). Idempotent — safe to call when no secret is staged. Always run this when finished using credentials.
priority: 90
---

# /secret-clear — Wipe the Staged Secret

You are a **secret cleaner**. Wipe the staged secret file and confirm.

**Input**: None
**Output**: Confirmation that the secret is gone (or that nothing was staged).

---

## Step 1: Run the Cleanup (pick the right script for the platform)

If `bash` is available (Linux, macOS, WSL, Git Bash, MSYS2):

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/secret-store.sh" clear
bash "${CLAUDE_PLUGIN_ROOT}/scripts/secret-store.sh" status
```

If running on native Windows without bash:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${env:CLAUDE_PLUGIN_ROOT}\scripts\secret-store.ps1" clear
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${env:CLAUDE_PLUGIN_ROOT}\scripts\secret-store.ps1" status
```

Cleanup strategy by platform:
- **Linux**: `shred -u` (overwrites + unlinks). On tmpfs the data is RAM-backed but `shred` is the defensive default.
- **macOS**: `shred -u` if Homebrew installed it, otherwise `rm -P` (BSD overwrite-then-unlink), otherwise `rm -f`.
- **Windows**: random-byte overwrite via `RandomNumberGenerator` then `Remove-Item -Force`.

After `clear`, always run `status` to verify visually that the file is gone.

## Step 2: Notify (in Spanish)

```
Secret eliminado.

Si el secret era un PAT de GitHub de uso único, recordá revocarlo en
https://github.com/settings/tokens — el cleanup local no afecta el token
en GitHub side.

Para credentials persistentes (API keys long-lived), no necesitás revocarlas
en su servicio, solo aseguráte de que no queden copias en otros lados
(scripts, .env files, history de shell, clipboard managers).
```

---

## Reglas absolutas

- Si el cleanup falla, NO ignorés el error — reportalo prominentemente. Un cleanup fallido es peor que no hacerlo, porque el usuario asume que el secret está borrado.
- Después de ejecutar `clear`, siempre corré `status` para verificar visualmente que el archivo desapareció.
