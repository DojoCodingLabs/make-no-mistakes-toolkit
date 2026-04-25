---
description: Aplica MoSCoW + RICE-adaptado a los issues de un pillar, justificando cada veredicto contra el sub-spike PIBER+IDCF y el vision audit mas reciente. Accepts pillar-slug como $ARGUMENTS.
argument-hint: "<pillar-slug> [--framework <name>] [--no-audit] [--target <description|labels|both>] [--dry-run] [--out <path>] [--issue-ids <ids>]"
priority: 85
---

# /prioritize -- MoSCoW + RICE traceable to product vision

Ejecuta priorizacion de issues de un pillar contra su sub-spike PIBER+IDCF, enriquecida por el vision audit mas reciente del pillar cuando existe.

## Frameworks base

- **MoSCoW** (bucket assignment): Must / Should / Could / Won't + Unclassified + Decompose-required. Deterministico via reglas del sub-spike (ver `references/scoring-rules.md`).
- **RICE-adaptado** (intra-bucket ranking): `(Reach × Impact × Confidence) / Size`. `Size` usa T-shirt labels en vez de weeks (compatible con convencion `spike-recommend` y regla `no time estimates`).

v1 implementa solo `moscow-rice`. Otros frameworks (`rice`, `moscow`, `ice`, `wsjf`, `kano`) tienen stubs en `references/frameworks/` y retornan "not yet implemented".

## Modo de invocacion

```bash
# Default: dry-run false, genera report + aplica mutations a description
/make-no-mistakes:prioritize pathways

# Primer sweep, sin audit aunque exista
/make-no-mistakes:prioritize agent-doji --no-audit

# Solo reportar sin mutaciones
/make-no-mistakes:prioritize community --dry-run

# Subset de issues
/make-no-mistakes:prioritize launchpad --issue-ids ALT-123,ALT-124

# Override output path
/make-no-mistakes:prioritize hackathons --out /tmp/priority-hackathons.md
```

## Parsing de argumentos

1. **Primer argumento** (`<pillar-slug>`) -- requerido:
   - Debe matchear una clave en `linear-setup.json` -> `pillars.<slug>`.
   - Si no existe, entrar a modo interactivo (ver "Modo sin config" mas abajo).

2. **Flags**:

| Flag | Default | Comportamiento |
|------|---------|----------------|
| `--framework <name>` | `moscow-rice` | v1 solo implementa `moscow-rice`. Otros retornan error claro referenciando el stub. |
| `--no-audit` | off | No cargar vision audit aunque exista. Confidence usa default 0.8. |
| `--codebase <path>` | desde config | Override del codebase resuelto por `pillars.<slug>.codebase`. |
| `--target <mode>` | `description` | `description`, `labels`, o `both`. v1 soporta `description`. `labels`/`both` validan primero que existan. |
| `--dry-run` | off | No tocar Linear. Report titulo = "Proposed mutations (dry-run, not applied)". |
| `--out <path>` | auto | Default: `<codebase>/audits/<pillar>/priority-<YYYY-MM-DD>.md`. Si path empieza con `~/`, expandir. |
| `--issue-ids <ids>` | off | Subset coma-separado. Resto del project queda intacto en el snapshot. |

## Convencion de output (default)

El report vive **dentro del repo del pillar**, junto al vision audit:

```
<codebase-root>/audits/<pillar-slug>/priority-<YYYY-MM-DD>.md
```

Coexiste con los snapshots anteriores -- NO se sobreescribe. Git version-controla el historial; `ls -t audits/<pillar>/priority-*.md | head -1` da el mas reciente.

## Flujo del comando

Delega a la skill `prioritize`. La skill se encarga de:

1. **Config resolution**: parsear `linear-setup.json` y extraer `pillars.<slug>.{project, spike, codebase}`.
2. **Fetch paralelo**: 3 subagents en background para issues del project, sub-spike IDCF, y vision audit mas reciente.
3. **MoSCoW bucket assignment**: aplicar tabla deterministica de `references/scoring-rules.md`. Fallback a LLM para UNCLASSIFIED (ver `references/prompts/llm-fallback-bucket.md`).
4. **RICE intra-bucket**: cuando un bucket tiene >3 issues, calcular `(R × I × C) / S` por issue y rankear desc.
5. **Composicion de artifacts**:
   - Priority report markdown -> `<codebase>/audits/<pillar>/priority-<YYYY-MM-DD>.md`
   - Description-footer por issue con delimiters HTML (idempotente) -- solo si `--dry-run=false`.
   - Comment snapshot en el sub-spike del pillar -- solo si `--dry-run=false`.

Ver `${CLAUDE_PLUGIN_ROOT}/skills/prioritize/SKILL.md` para detalle.

## Regla de idioma

Report en **espanol**. Nombres de frameworks (MoSCoW, RICE, PIBER, IDCF) y nombres propios quedan en original.

## Regla de evidencia

Cada veredicto en el report cita:
- La regla del sub-spike que matcheo (thesis #, feature tier, anti-pattern).
- El estado en el audit (OK/PARTIAL/MISSING/DRIFT/VIOLATION).
- El breakdown completo de RICE (R, I, C, S) cuando aplique.

Nunca afirmar "Must" sin cita. Nunca afirmar "Won't" sin razon explicita.

## Modo sin config

Si el `pillar-slug` no existe en `linear-setup.json`, preguntar:

1. "Cual es el project Linear del pillar?" (autocompletar con `mcp__linear-server__list_projects`)
2. "Cual es el sub-spike PIBER+IDCF del pillar? (Linear issue ID)"
3. "Cual es el path al codebase del pillar?"
4. "Guardar esta config en `linear-setup.json` para proximas corridas? (yes/no)"

Si yes -> escribir `pillars.<slug>` al archivo. Si no -> proceder una vez, pedir de nuevo el proximo run.

## Modo sin argumentos

Si el usuario invoca `/prioritize` sin args, preguntar:

1. "Cual es el pillar a priorizar?" (listar pillars conocidos del `linear-setup.json`)
2. El resto del flow procede como si el arg hubiera sido pasado.

## Dog-fooding

Este comando fue creado dogfooded para DojoOS. Los primeros runs validados fueron:

- `pathways` -> `dojo-os/audits/pathways/priority-2026-04-21.md`
- `agent-doji` -> `dojo-agent-openclaw-plugin/audits/agent-doji/priority-2026-04-21.md`

Ambos complementan los vision audits generados por `/business-model-toolkit:product-vision-audit` en la misma convencion de path.

## Chain posicion

El comando encaja en la cadena del toolkit:

```
product-vision-audit -> prioritize -> spike-recommend -> implement
   (business-model)    (this one)     (make-no-mistakes)  (make-no-mistakes)
```

Un usuario tipico:
1. Corre `product-vision-audit pathways` -> genera `audits/pathways/vision-audit-2026-04-17.md`.
2. Corre `prioritize pathways` -> genera `audits/pathways/priority-2026-04-21.md` + mutations.
3. Toma el top-3 Must del priority report y corre `spike-recommend ALT-XXX` para cada uno -> genera issue-brief bilingual.
4. Corre `implement ALT-XXX` -> ejecuta el issue con discipline (worktree, reviewers, CI).

## Requisitos

- `mcp__linear-server` configurado y autenticado en el workspace del pillar.
- `linear-setup.json` en la raiz del cwd, con `pillars.<slug>` para el pillar target (o entrar a modo interactivo para crearlo).
- Codebase del pillar debe existir en el path declarado.
- Opcional: vision audit en `<codebase>/audits/<pillar>/vision-audit-*.md` para enriquecer Confidence.
