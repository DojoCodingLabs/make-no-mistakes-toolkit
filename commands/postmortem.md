---
description: >
  Compose a post-incident report (postmortem) in the house style — evidence
  verified against logs/DB before writing, blameless, with the mandatory
  sections Causa Raíz, La Buena Noticia and Plan de Mitigación en marcha.
  Produces a Slack-ready message (Spanish, mrkdwn, no Unicode bullets) for the
  incident thread, adapted to the audience (technical channel vs. non-technical
  stakeholder). Accepts the incident description or a Slack thread URL as
  $ARGUMENTS; gathers missing facts from the session context before drafting.
  NEVER posts automatically — always presents the draft for user confirmation.
---

# /postmortem

Compose a **postmortem** for the incident given in `$ARGUMENTS` (a description,
a Slack thread URL to reply into, or empty — in which case use the most recent
incident discussed in the session).

Reference exemplar of the house style: the AORUS/Wayland postmortem thread
(#C0B7Y2BM8KH, 2026-06-05) — TL;DR up front, evidence cited from primary
sources, an explicit "Qué NO fue" section, a numbered causal chain, and
follow-up corrections posted in the same thread when later findings invalidate
earlier claims.

## Principles (non-negotiable)

1. **Evidence before prose.** Every claim in Causa Raíz must be verifiable
   from a primary source gathered THIS session (logs, DB queries, backups,
   run URLs, config diffs). If a claim is inference, label it as inference —
   the reference thread's correction ("la etiqueta CPU/IO era inferencia, no
   dato") exists because this rule was broken once.
2. **Blameless, con ownership.** Name the trigger honestly (including when it
   was us — "nuestro deploy", never "un proceso automático misterioso"), but
   frame causes as system gaps, not personal fault.
3. **Audiencia primero.** If the thread includes non-technical stakeholders,
   translate: no jargon without a one-clause explanation, impact in terms of
   THEIR work ("tu menú", "tus bloques"), file paths only when actionable.
4. **Se corrige en el mismo thread.** If later evidence invalidates a claim,
   the follow-up correction goes in the same thread, marked as such.

## Structure of the draft

Produce a Slack-ready message (Spanish, mrkdwn: `*bold*`, `-` bullets, no
Unicode bullets/emojis — status emojis go by NAME, accents intact) with these
sections — the middle three are MANDATORY:

1. **Título** — `*Post-mortem: <qué pasó, en una frase> — y <qué se recuperó/aprendió>*`
2. **Resumen** — arranca con `*En resumen:*` (nunca "TL;DR"), 2-3 frases:
   trigger con ownership, qué sobrevivió, qué sigue. **Mencionar al afectado**
   (`<@user>`) dentro del resumen — el postmortem le habla a esa persona.
3. **Qué pasó (hora de <zona del lector>)** — timeline como **lista numerada**
   (no guiones), con el **evento gatillo en negrita** (`*Domingo 10:41pm:*`).
4. **Qué NO fue** — bullets `-`. Descarta las hipótesis que la gente ya está
   rumiando (evita que el thread siga especulando). Omit only if none.
5. **Causa Raíz** *(obligatoria)* — cadena causal **numerada**, cada eslabón
   con su evidencia. Precisión técnica en los nombres ("re-despliegue desde
   GitHub Actions", no "un proceso").
6. **La Buena Noticia (todo verificado, no esperanzas)** *(obligatoria)* —
   header con un **emoji celebratorio del workspace** (p. ej. `:partyclaude:`);
   bullets `-` con qué sobrevivió / se recuperó / ya protege al usuario.
7. **Plan de Mitigación en marcha** *(obligatoria)* — **lista numerada** con
   el estado como PREFIJO de cada ítem, usando nombres de emoji:
   `:white_check_mark:` hecho · `:arrows_counterclockwise:` en curso ·
   `:hourglass_flowing_sand:` pendiente (con dueño). Links a PRs/issues.
8. **Cierre** — compromiso de update en el mismo thread ("Te actualizo por
   acá cuando…") + `cc.` con menciones a los stakeholders. NO prometer calls
   por default — solo si el contexto lo pide.

### Ownership calibrado (del exemplar corregido por el PO)

Ni exagerar ni minimizar lo que se sabía: si sabíamos X pero no Y, decirlo
con ese matiz exacto ("sí sabíamos que staging era tu lienzo PERO no teníamos
claridad sobre cómo hacías los cambios — error de proceso, nuestro"). La
sobre-confesión ("no sabíamos nada") es tan imprecisa como la evasión.

## Flow

1. **Gather**: pull the incident facts from the current session (diffs, run
   URLs, Linear issues, timestamps). If a Slack thread URL was provided, read
   it (`slack_read_thread`) to match tone and answer the questions actually
   asked in it. If facts are missing, verify them NOW (read-only) — do not
   draft around gaps.
2. **Draft** the message per the structure above.
3. **Present** the draft to the user for confirmation — per house rules the
   user pastes it (Slack Connect channels) or approves posting. NEVER post
   without confirmation.
4. **Offer** the structural follow-ups: postmortem issue in Linear if the
   mitigation plan spawned new work, and a `docs/` runbook when the failure
   mode is likely to recur.
