# Framework: moscow (v2 stub)

**Status**: Not yet implemented. Reserved for v2.

MoSCoW puro, sin RICE intra-bucket. Util para release planning rapido cuando el tiebreak cuantitativo no importa.

## Cuando se implementaria

- Release planning donde "tener Must resueltos" es el objetivo, no "ordenar Musts".
- Pillars chicos (<10 issues) donde RICE no aporta.
- PO que quiere simplicidad sobre cuantificacion.

## Diferencias con moscow-rice

- Sin calculo de RICE.
- Buckets mantienen orden natural (spike-derived, ALT-identifier asc).
- Output report mas corto (no Appendix A de RICE calculations).

## Status actual

Invocar `/make-no-mistakes:prioritize --framework moscow` retorna:

```
Error: framework 'moscow' not yet implemented. Use --framework moscow-rice (default) o ver docs/superpowers/specs.
```
