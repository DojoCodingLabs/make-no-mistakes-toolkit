# Framework: wsjf (v2 stub)

**Status**: Not yet implemented. Reserved for v2.

WSJF = Weighted Shortest Job First. Del Scaled Agile Framework (SAFe). Privilegia "costo de retraso" -- que pasa si NO hacemos esto?

## Planned formula

```
WSJF = (User Value + Time Value + Risk Reduction) / Job Size
```

Todas las variables en escala Fibonacci (1, 2, 3, 5, 8, 13, 21).

## Cuando se implementaria

- Organizaciones que adoptan SAFe (poco probable en DojoOS pero util para clientes).
- Pillars con dependencies temporales (deadline-driven).

## Incompatibilidad parcial con DojoOS

- `Time Value` asume time pressure medible (deadlines). DojoOS tiene la regla `no time estimates`.
- Adaptacion: usar `Opportunity Window` (high/med/low) en vez de weeks.

## Status actual

Stub.
