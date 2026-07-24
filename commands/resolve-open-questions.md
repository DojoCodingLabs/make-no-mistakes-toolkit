---
description: Barre la sesión por decisiones abiertas y preguntas enterradas en prosa, y las resuelve en batch vía AskUserQuestion con opciones + recomendación. Acepta un scope opcional como $ARGUMENTS.
argument-hint: "[scope opcional, p.ej. 'solo lo de los PRs']"
priority: 70
---

# /resolve-open-questions — decisiones pendientes → AskUserQuestion

Invocá la skill `resolve-open-questions` del plugin make-no-mistakes.

1. **Sweep**: juntá TODAS las decisiones abiertas de la sesión — preguntas del
   último reporte, ofertas de follow-up sin resolver, checkpoints HITL
   pendientes (push/PR/merge/Linear/cleanup), issues sin filar mencionados.
   Si `$ARGUMENTS` trae un scope, restringí el sweep a eso.
2. **Batch**: construí hasta 4 preguntas por llamada de `AskUserQuestion` —
   opción recomendada PRIMERA con "(Recomendado)", `header` ≤ 12 chars,
   trade-off en cada `description`, `multiSelect` cuando no son exclusivas.
   Más de 4 decisiones → segunda ronda después de ejecutar la primera.
3. **Decision log + ejecución**: tras las respuestas, emití `decisión → acción`
   por ítem y ejecutá inmediatamente sin re-preguntar. Una aprobación = una
   acción.

Anti-triggers: investigación socrática activa (prosa, no menús),
action-handoffs directos, aprobación de plan (eso va por el flujo de plan
approval de la plataforma).
