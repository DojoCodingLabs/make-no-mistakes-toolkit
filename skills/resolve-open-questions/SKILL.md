---
name: resolve-open-questions
description: >
  Sweeps the current session for every open question, pending decision, or
  buried "¿querés que...?" and resolves them through structured AskUserQuestion
  batches (options + recommendation) instead of prose. Use when the user asks
  to "resolve open questions", "usemos AskUserQuestion", "/resolve-open-questions",
  "qué decisiones están pendientes", or when a work session has accumulated
  multiple unanswered decision points that block execution.
  Do NOT trigger during active socratic investigation (the user wants evidence
  + recommendation in prose there), for plan-approval (use ExitPlanMode), or
  when there is exactly one trivially obvious next step.
---

# /resolve-open-questions — decisiones pendientes → AskUserQuestion

Skill que convierte el "final de reporte con preguntas enterradas en prosa" en
una ronda estructurada de decisiones. Barre la sesión, junta TODAS las
decisiones abiertas, y las resuelve con `AskUserQuestion` en batches.

## Por qué existe

El anti-patrón que esta skill mata: terminar un turno con un párrafo tipo
"¿Querés que haga A, o preferís B? También quedó pendiente C y podría filar D".
Eso obliga al usuario a redactar una respuesta multi-parte. La regla de la casa
es: **toda decisión binaria/multi-choice que sea call del usuario va por
`AskUserQuestion` con opciones + recomendación, nunca enterrada en prosa.**

## Fases

### Fase 1 — Sweep

Recolectá decisiones abiertas de TODAS estas fuentes:

1. **El último reporte/turno propio**: preguntas explícitas, ofertas de
   follow-up ("puedo hacer X si querés"), opciones mencionadas sin resolver.
2. **La sesión completa**: pedidos del usuario que quedaron a medias,
   checkpoints HITL pendientes (push / PR / merge / Linear-Done / cleanup —
   cada uno necesita aprobación por acción).
3. **Estado del repo/trackers si es relevante**: PRs abiertos esperando
   veredicto, issues sin filar que se mencionaron, worktrees/branches en limbo.

Dedupe: si dos preguntas se resuelven con la misma decisión, colapsalas en una.

### Fase 2 — Clasificar

| Tipo | Tratamiento |
|------|-------------|
| Binaria / multi-choice cerrada | `AskUserQuestion`, 2-4 opciones |
| Elección no-exclusiva ("cuáles de estos") | `AskUserQuestion` con `multiSelect: true` |
| Comparación de artefactos (mockups, snippets, configs) | `AskUserQuestion` con `preview` por opción |
| Abierta de verdad (necesita texto libre del usuario) | Formulala igual como pregunta; la opción "Other" cubre el texto libre |
| Aprobación de plan completo | NO va acá — usar el flujo de plan-approval de la plataforma |

### Fase 3 — Construir las preguntas

Reglas de construcción (obligatorias):

- **Recomendación primero**: la opción recomendada va PRIMERA con
  "(Recomendado)"/"(Recommended)" en el label, y la razón en su `description`.
- `header` ≤ 12 caracteres, distinto por pregunta.
- 2-4 opciones mutuamente exclusivas (salvo `multiSelect`). Sin opción "Other"
  manual — la plataforma la agrega sola.
- Cada `description` lleva el trade-off en 1-2 líneas, no marketing.
- Máximo 4 preguntas por llamada. Si hay más de 4 decisiones, priorizá por
  "qué bloquea ejecución ahora" y hacé una segunda ronda después de ejecutar
  la primera. No serialices de a una: batchear es el punto.
- Preguntas en el idioma de la conversación.

### Fase 4 — Decision log + ejecución

Después de las respuestas:

1. Emití un **decision log** compacto: `decisión → acción concreta` por ítem.
2. **Ejecutá inmediatamente** lo decidido, sin re-preguntar ni re-litigar.
   La respuesta del usuario ES la autorización para esa acción específica
   (una aprobación = una acción; no generalizar a acciones futuras).
3. Si una respuesta fue "Other" con texto libre, tratala como instrucción
   nueva de máxima precedencia.

## Anti-triggers

- **Modo socrático / investigación activa**: si el usuario está explorando un
  problema con vos, quiere evidencia + recomendación en prosa y una pregunta
  abierta, NO un menú. No conviertas una investigación en un wizard.
- **Action-handoffs**: "mandá el draft", "corré la query" no son decisiones —
  ejecutá.
- **Una sola pregunta obvia**: si hay exactamente una decisión y es trivial,
  una `AskUserQuestion` directa alcanza; no hace falta el ceremonial del sweep.

## Ejemplo de invocación

```
/resolve-open-questions
```

Sin argumentos: barre la sesión actual. Con argumentos opcionales:

```
/resolve-open-questions solo lo de los PRs
```

Restringe el sweep al scope descripto.
