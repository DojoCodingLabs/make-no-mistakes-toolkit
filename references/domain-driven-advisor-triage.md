# Domain-Driven Advisor — Triage Decision Tree

This decision tree maps the five `AdvisorSignals` (from
[`src/audit/advisor-routing.ts`](../src/audit/advisor-routing.ts)) to
plain-language triage questions and the audit family each signal routes to. The
`domain-driven-advisor` skill uses it in Stage 2 (triage) to ask only the
questions its repo scan left ambiguous, then feeds the answers to
`recommendAudits()`.

---

## Signal → question → family

| Signal                | Plain-language question                                                | Routes to |
| --------------------- | --------------------------------------------------------------------- | --------- |
| `sharedDatabase`      | "¿Varios equipos escriben en la misma base de datos?"                 | `SCH`     |
| `feAndBackendValidate`| "¿El frontend y el backend validan los mismos datos por separado?"    | `CDC`     |
| `crossModuleImports`  | "¿Unos módulos importan código de otros equipos/dominios?"            | `DDD`     |
| `layeredArchitecture` | "¿Separás lógica de negocio de base de datos y framework?"            | `ARC`     |
| `migratingMonolith`   | "¿Estás partiendo un sistema grande / migrando un monolito?"          | `STR`     |

Each `true` answer adds its family to the recommended set.

---

## "Unsure / all"

When the user is unsure, or answers "all", **no signal is set**. Per
`recommendAudits()` semantics, an empty signal set returns the **full ordered
sweep**:

```
SCH → CDC → DDD → ARC → STR → ENF
```

This is the canonical dependency order (data → contracts → context → layers →
migration → enforcement). `ENF` (enforcement: hooks, CI guards, ownership) also
runs last whenever *any* other family is selected — it always closes a sweep.
The ordered set is computed by `recommendAudits()`; do not hand-order it here.
