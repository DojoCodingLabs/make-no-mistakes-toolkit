---
description: Calcula el ORDEN en que se deben mergear varios PRs abiertos contra una misma base, para que cada uno siga siendo mergeable cuando le toque. Mide colisiones de archivos, conflictos latentes que solo aparecen después de que otro PR aterriza, artefactos anclados a un SHA de la base, y capacidad de la flota de CI. Accepts base branch como $ARGUMENTS.
argument-hint: "[<base-branch>] [--repo <owner/name>] [--only <pr-numbers>] [--out <path>]"
priority: 80
---

# /merge-advisor — el orden, no el estado

Hay una pila de PRs abiertos contra una misma base. Cada uno se midió verde
**contra una base que ya no existe para cuando le llega el turno**. Este comando
calcula el orden que los mantiene verdes, y no mergea nada.

## La pregunta que ningún otro comando contesta

| comando | pregunta | unidad |
|---------|----------|--------|
| `review-open-prs` | ¿cuáles PRs necesitan atención? | un PR a la vez |
| `sync-advisor` | este checkout derivó, ¿qué corro? | una rama contra su base |
| **`merge-advisor`** | **¿en qué ORDEN, para que cada uno siga válido en su turno?** | **el conjunto** |

La distinción no es contable. **«Mergeable» no es una propiedad de un PR: es una
propiedad del par (PR, base sobre la que va a aterrizar).** Un reporte por PR lee
cada fila contra la base de *hoy*, y en el instante en que el primer merge
aterriza, todas las demás filas describen una base que ya no está. Diez PRs
verdes no son diez merges.

## Modo de invocación

```bash
# Base detectada automáticamente, todos los PRs abiertos
/make-no-mistakes:merge-advisor

# Base explícita
/make-no-mistakes:merge-advisor develop

# Otro repo
/make-no-mistakes:merge-advisor --repo DojoCodingLabs/dojo-os

# Solo un subconjunto
/make-no-mistakes:merge-advisor --only 4299,4309,4242
```

## Argumentos

| Flag | Default | Comportamiento |
|------|---------|----------------|
| `<base-branch>` | detectada | Nombre pelado (`develop`), nunca `origin/develop`. Si trae el remoto, se normaliza antes de interpolar. |
| `--repo <owner/name>` | el cwd | Repo objetivo. Sin esto, se resuelve desde el remoto `origin` del directorio actual. |
| `--only <numbers>` | todos | Subconjunto separado por comas. El resto queda fuera del plan y se nombra como excluido, nunca se omite en silencio. |
| `--out <path>` | stdout | Escribe el plan a un archivo además de imprimirlo. |

## Este comando nunca actúa

Todo lo de abajo lee. Las acciones se **imprimen para que las corras vos**:
`gh pr merge`, `git merge`, `git rebase`, `git push`, y cualquier comando de
regeneración.

Una sola excepción, y se dice en voz alta cuando se usa: `git fetch origin`
corre primero. Escribe refs de seguimiento remoto y nada más. Sin eso, cada
medición sale contra una base vieja y produce un orden que era correcto ayer.

**Nunca ofrece el bypass como opción.** `--admin`, `--force`, mergear pasando
por encima de un check en rojo o que todavía no contestó, apagar un check
requerido para destrabar la cola: nada de eso es una fila de un menú. Si el orden
está bloqueado, el bloqueo es el hallazgo.

## Los siete predicados

Delega a la skill `merge-advisor`, que corre todos y reporta cada uno con el
comando que lo produjo.

| # | predicado | contesta |
|---|-----------|----------|
| 1 | Elegibilidad | ¿cuáles son candidatos siquiera? |
| 2 | Frescura del check | ¿ese verde es sobre la base actual? |
| 3 | Conflictos con la base HOY | cuáles necesitan trabajo antes que nada |
| 4 | **Colisión de archivos por pares** | **qué PRs tocan los mismos archivos** |
| 5 | **Conflictos latentes** | **qué pares chocan ENTRE SÍ, no con la base** |
| 6 | Artefactos anclados a la base | qué debe regenerar todo el resto tras un merge |
| 7 | Capacidad de la cola | cuántos pueden estar en vuelo sin ahogar CI |

Los predicados 4 y 5 son los que ninguna vista por PR puede producir, y el 5 es
el que importa: **el conflicto peligroso no es el que hoy bloquea un PR, sino el
que aparece recién cuando otro aterriza**, en un PR que ahora mismo está verde.
Es invisible para `gh pr list`, para cualquier reporte de estado, y para el
autor del PR.

El predicado 6 es la versión generalizada del *typecheck baseline drift*: un
archivo derivado de la base que guarda el SHA del que se derivó. Cuando la base
se mueve —y sobre todo cuando un **squash merge** la reescribe— ese ancla apunta
a un commit que ya no existe, y el artefacto se rompe en **todos los PRs
abiertos a la vez**. Un merge, N fallas, ninguna causada por el PR donde
aparecen.

La skill no hardcodea el artefacto de ningún proyecto: lo **descubre** buscando
archivos que carguen un SHA de base o un marcador de generado, y después
pregunta las dos cosas que deciden si restringe el orden — si más de un PR lo
toca, y si se regenera en vez de escribirse a mano.

## La regla de orden que sorprende

Los empates se rompen por **fragilidad, de mayor a menor — no por importancia**.

Fragilidad es *qué tan probable es que este PR deje de aplicar mientras espera*,
y se aproxima con el ancho del cambio por la distancia contra la base. El PR
grande y viejo va primero: no porque importe más, sino porque su ventana es la
más corta y cada merge que le pasa adelante se la angosta más. Mergear primero
los chiquitos y limpios *se siente* como avance, y gasta exactamente el recurso
que al grande se le está acabando.

## Salida

Un plan ordenado, en tiers. Dentro de un tier ningún par comparte archivos ni
tiene una arista latente, así que ese tier mergea en cualquier orden y —si la
capacidad da— en paralelo. Entre tiers van los checkpoints de regeneración.

Cada fila lleva la **URL completa del PR**: un `#4309` pelado no es clickeable
desde una terminal ni resoluble desde un reporte pegado.

Tres secciones más, y la tercera es la que no se puede omitir:

- los PRs que necesitan regenerar un artefacto anclado, con el comando exacto;
- la capacidad medida de la flota y el tamaño de lote que sale de ahí;
- los PRs que **no entran al orden**, con la razón. Un PR ausente del plan se lee
  como «ya resuelto».

## Modos degradados, dichos en vez de escondidos

- **Sin autenticación de `gh`** — reporta distancia y colisiones solo con git, y
  dice que los checks quedaron sin medir. No infiere verde desde un merge limpio.
- **Un head de PR que no se puede traer** (fork borrado, permisos) — ese PR es
  `unverifiable`, listado con la razón. No es «limpio».
- **Ningún artefacto anclado encontrado** — dice que la búsqueda corrió y no
  encontró nada, con el comando. El silencio se lee como «no se revisó».

## Regla de evidencia

Cada medición lleva su línea `### ref: origin/<base> @ <sha>` y el comando que
la produjo. Un orden calculado contra una base sin nombrar es una opinión.

Si el repo ya tiene un programa que contesta una de estas preguntas, la skill lo
**corre** en vez de re-derivarlo con `grep`: una segunda implementación de una
medición deriva igual que una segunda implementación de código.

Y los tres estados no se colapsan nunca. `mergeable: UNKNOWN` de GitHub significa
*«todavía no calculado»*, no *«limpio»*; leer el PR fuerza el cálculo, así que se
relee en vez de anotar la primera respuesta.

Ver `${CLAUDE_PLUGIN_ROOT}/skills/merge-advisor/SKILL.md` para el detalle de cada
predicado.

## Regla de idioma

El plan sale en **español**. Los nombres de comandos, flags, refs, rutas y
salidas de git quedan en original.

## Posición en la cadena

```
review-open-prs  ->  merge-advisor  ->  sync-advisor   ->  implement
 (qué necesita     (en qué orden)     (mi checkout       (ejecutar el
  atención)                            derivó)            siguiente issue)
```

Un uso típico: `review-open-prs` dice que hay once abiertos y cuatro en rojo;
`merge-advisor` dice que dos de los verdes chocan entre sí y que el squash del
primero desancla el baseline de los otros nueve; y recién ahí el merge se hace a
mano, en el orden impreso.

## Requisitos

- `gh` autenticado con lectura sobre el repo objetivo. Sin eso corre en modo
  degradado y lo declara.
- `git` con acceso al remoto: los heads de los PRs se traen como refs locales,
  porque los predicados 4 y 5 necesitan los commits, no los SHAs.
- Nada más. No requiere `linear-setup.json` ni ninguna config del toolkit.
