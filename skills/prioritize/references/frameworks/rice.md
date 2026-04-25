# Framework: rice (v2 stub)

**Status**: Not yet implemented. Reserved for v2.

RICE puro sin MoSCoW bucket-ing. Util cuando no hay vision declarada (spike PIBER+IDCF) pero si hay backlog y ganas de ordenar por impacto/esfuerzo.

## Cuando se implementaria

- Cuando un pillar aun no tiene sub-spike PIBER+IDCF (pre-vision stage).
- Cuando el product manager quiere contrastar un ranking RICE puro con el moscow-rice hybrid (sanity check).

## Planned formula

```
RICE = (Reach × Impact × Confidence) / Effort
```

Sin el filtro MoSCoW, TODOS los issues reciben ranking. El output es un single sorted list en vez de 4 buckets.

## Diferencias con moscow-rice (v1)

- `Effort` usa T-shirt sizes (same as v1).
- `Impact` no depende de thesis matching -> usa escala 1-10 libre estimada por el PM.
- `Confidence` no usa audit (si existe, podria opcionalmente).
- Output: single sorted list descendente por score.

## Status actual

Invocar `/make-no-mistakes:prioritize --framework rice` retorna:

```
Error: framework 'rice' not yet implemented. Use --framework moscow-rice (default) o ver docs/superpowers/specs para roadmap.
```

Ver `./moscow-rice.md` para la implementacion activa.
