---
description: Explica algo en dos capas — primero en prosa, luego con detalle técnico — cierra con un insight no obvio, actionables rankeados y AskUserQuestion. Acepta el tema como $ARGUMENTS.
argument-hint: "[qué explicar, p.ej. 'por qué falla el poller' o 'src/lib/ratchet.ts']"
priority: 70
---

# /explain — dos capas, un insight, y una decisión

Explicá `$ARGUMENTS` en el formato de abajo. Si `$ARGUMENTS` viene vacío,
explicá lo último que se discutió en la sesión.

## Paso -1 — Resolvé el idioma

Leé `make-no-mistakes.config.json` en la raíz del proyecto (ver
`make-no-mistakes.config.example.json`). Si existe, usá su `language`; si no
existe o no trae la clave, **español**. Respetá `diacritics` — nunca sustituyas
un carácter acentuado por su equivalente ASCII.

El idioma gobierna **solo la prosa que te habla a vos**. Los identificadores,
el código, los mensajes de commit, los títulos y cuerpos de PR y los issues de
Linear siguen la convención del repo destino, que casi siempre es inglés. Un
comando que escribe en GitHub o en Linear no traduce esa salida porque esta
clave esté puesta.

## Paso 0 — Leé el artefacto ANTES de escribir una sola línea

**No se explica lo que no se verificó.** La prosa fluida sobre un mecanismo se
lee como comprensión, así que este formato es *especialmente* bueno para
esconder que no leíste el archivo. Abrí el código, la config, el log o el issue
que vas a explicar. Si es una afirmación sobre una rama, leé el **ref**, no el
working tree.

Si no podés verificar algo, decilo en el lugar donde iría — "esto no lo
verifiqué" es parte de la explicación, no una falla de ella.

## Paso 1 — La capa de prosa

Cero jerga, cero rutas de archivo, cero nombres de función. 2-5 oraciones.

**La regla que decide si esta capa vale:** la prosa NO es la capa técnica con
palabras más simples. Contesta **otra pregunta**. La prosa contesta *"qué está
pasando y por qué importa"*; la técnica contesta *"dónde exactamente y cómo"*.
Si tu párrafo de prosa es el resumen del bloque técnico, borralo — es
redundante y el lector lo va a saltar, que es como estas explicaciones mueren.

Prueba rápida: si alguien que no toca este código puede repetir tu prosa y
tomar una decisión correcta con ella, sirve.

## Paso 2 — La capa técnica

Ahora sí: rutas con `archivo:línea`, nombres reales, el snippet mínimo que
prueba lo que dijiste, tablas cuando hay un antes/después o una comparación.

Citá lo que **medíste**, no lo que recordás. Un número sin el comando que lo
produjo es una opinión con formato de dato.

## Paso 3 — El insight

```
★ Insight ─────────────────────────────────────
[2-3 puntos]
─────────────────────────────────────────────────
```

**Se gana el lugar solo si dice algo que el lector NO podía derivar de las dos
capas de arriba.** Sirve una consecuencia no obvia, un reencuadre, una
corrección a lo que vos mismo asumías, un costo escondido, o por qué el arreglo
evidente es el equivocado.

Si resume, **borralo**. Un insight que recapitula entrena al lector a saltarse
el bloque, y entonces deja de servir cuando de verdad tenés uno.

## Paso 4 — Actionables

Lista corta, **rankeada por valor / costo**, cada uno con:

- qué se hace,
- qué cuesta (tiempo, riesgo, radio de impacto),
- qué queda sin resolver si se elige eso.

Nada de "considerar X". Un actionable es algo que alguien puede empezar hoy.
Incluí explícitamente el **no hacer nada** cuando sea defendible, con su costo.

## Paso 5 — AskUserQuestion

Convertí los actionables en decisiones, con el mismo contrato que
`/resolve-open-questions`:

- hasta **4 preguntas** por llamada,
- opción recomendada **primera**, con `(Recomendado)`,
- `header` ≤ 12 chars,
- el **trade-off** en cada `description` — no repitas la etiqueta,
- `multiSelect` cuando las opciones no son exclusivas.

Después de las respuestas: emití `decisión → acción` por ítem y **ejecutá sin
volver a preguntar**. Una aprobación = una acción.

Si de verdad no queda ninguna decisión abierta —la explicación era puramente
informativa— decilo en una línea y **no llames a AskUserQuestion**. Un menú
inventado para cumplir el formato es peor que no tenerlo.

## Anti-triggers

- **Investigación socrática activa** — ahí va prosa continua, no un formato con
  encabezados.
- **Una pregunta de una línea** ("¿cuál es el puerto?") — contestala y ya.
  Envolverla en cinco pasos es ruido.
- **Un plan de ejecución** — eso es `/spec-recommend` o el flujo de plan
  approval, no una explicación.
- **Un recap de sesión** — eso es `/summarize`.
