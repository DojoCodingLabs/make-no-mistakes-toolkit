# Audit Report Contract

This document is the **Single Source of Truth (SSOT)** for the audit-engine report
contract. The machine-readable schema lives at
[`schemas/audit-report-schema.schema.json`](../schemas/audit-report-schema.schema.json)
(JSON Schema draft-07); this file is its human-readable companion.

> **SSOT note.** The atomic-design-toolkit ships its own `audit-report-schema.md`.
> That document is a **conformant profile** of this contract — it MUST NOT diverge
> from the field definitions, enums, or ID rules declared here. When the two
> disagree, **this file wins**.

---

## Finding-ID namespaces

Every finding carries an `id` of the form `<FAMILY>-<NNN>` where `<NNN>` is a
zero-padded 3-digit sequence (e.g. `SCH-001`). The audit-engine families are:

| Namespace | Family                                   |
| --------- | ---------------------------------------- |
| `SCH`     | Schema / data-model audits               |
| `CDC`     | Change-data-capture & data-flow audits   |
| `DDD`     | Domain-driven-design / bounded-context   |
| `ARC`     | Architecture & dependency audits         |
| `STR`     | Structure / repository-layout audits     |
| `ENF`     | Enforcement (hooks, CI guards, ownership)|

### Reserved: `E###` (atomic-design-toolkit component layer)

The `E###` namespace is **reserved** for the atomic-design-toolkit's component-layer
findings (the "Element" layer of Atomic Design). It is *not* part of this engine's
six families and MUST NOT be emitted by the core audit-engine. It is documented here
only so the namespace stays globally unique across the toolkit family.

---

## Severity ladder

`blocker | high | medium | low | advisory`

| Severity   | Meaning                                                              |
| ---------- | ------------------------------------------------------------------- |
| `blocker`  | Must be fixed before merge/release; CI-blocking once promoted.       |
| `high`     | Serious; schedule immediately.                                       |
| `medium`   | Should fix; track in backlog.                                        |
| `low`      | Minor; opportunistic fix.                                            |
| `advisory` | Informational; no action required yet.                               |

This ladder is aligned with the **advisory → blocking promotion** policy in the
repo-health governance policy (forthcoming): findings begin their life as `advisory`
and are promoted up the ladder (ultimately to `blocker`, where they become
CI-blocking) per the governance cadence. Severity is therefore a *governed* field —
the engine emits an initial severity, but governance owns promotion.

---

## Finding fields

Each entry in `findings[]` is an object with the following fields. Required fields are
marked **(required)**.

| Field          | Type                                          | Notes |
| -------------- | --------------------------------------------- | ----- |
| `id`           | string **(required)**                         | `^(SCH\|CDC\|DDD\|ARC\|STR\|ENF)-[0-9]{3}$`, e.g. `SCH-001`. |
| `title`        | string **(required)**                         | One-line human summary of the finding. |
| `severity`     | enum **(required)**                           | One of the severity ladder values above. |
| `anti_pattern` | string **(required)**                         | The cited anti-pattern, e.g. `1NF (Codd 1970) + DRY`. Citations are encouraged. |
| `evidence`     | array of Evidence **(required, min 1)**       | At least one evidence object (see below). |
| `owner`        | string (optional)                             | Code-owner handle, e.g. `@platform-team`. |
| `cure_map`     | array of Cure **(required)**                  | Zero or more of `ownership`, `ci_guard`, `agent_rule`, `hook`. |
| `exemption`    | string (optional)                             | Reason text mirrored from a `@repo-health-exempt:` marker (see below). |
| `confidence`   | enum **(required)**                           | One of `confirmed`, `probable`, `unverified`. |

### Evidence object

| Field     | Type                       | Notes |
| --------- | -------------------------- | ----- |
| `file`    | string **(required)**      | Path to the offending file. |
| `line`    | integer (optional)         | 1-based line number. |
| `snippet` | string (optional)          | Short excerpt of the offending code. |

### Cure vocabulary (`cure_map`)

| Cure         | Meaning                                                  |
| ------------ | -------------------------------------------------------- |
| `ownership`  | Assign/clarify a code owner (CODEOWNERS, manifest).      |
| `ci_guard`   | Add a CI check that fails the build on recurrence.       |
| `agent_rule` | Add an agent/assistant rule to prevent recurrence.       |
| `hook`       | Add a Claude Code / OpenCode tool-call hook.             |

---

## Report envelope fields

| Field            | Type                              | Notes |
| ---------------- | --------------------------------- | ----- |
| `family`         | enum **(required)**               | One of the six namespaces above. |
| `repo`           | string **(required)**             | Repository identifier. |
| `stack`          | string **(required)**             | Tech stack, e.g. `supabase`. |
| `date`           | string **(required)**             | ISO `yyyy-mm-dd`; passed in by the caller (pure code does no `Date.now`). |
| `engine_version` | string **(required)**             | Audit-engine semver. |
| `findings`       | array of Finding **(required)**   | May be empty. |

---

## The `@repo-health-exempt:` marker

A finding can be exempted in-source by placing a marker comment of the form:

```
@repo-health-exempt: <reason>
```

near the offending code. When the engine detects this marker, it copies `<reason>`
into the finding's `exemption` field. Exempted findings are still reported (for
auditability) but governance treats the recorded `<reason>` as an accepted waiver
rather than an open action item.

---

## Emission targets

A single audit run fans out into **four** emission targets. The `AuditReport` is the
canonical intermediate representation from which all four are produced:

1. **Findings doc** — a human-readable Markdown report of the findings.
2. **OpenSpec change** — a proposed change in the repo's OpenSpec workflow.
3. **Bilingual Linear issues** — one Linear issue per finding, authored in the
   Bilingual Format (Human Layer + Agent Layer).
4. **4-cure scaffold proposals** — scaffolding proposals for the cures named in each
   finding's `cure_map` (`ownership`, `ci_guard`, `agent_rule`, `hook`).
