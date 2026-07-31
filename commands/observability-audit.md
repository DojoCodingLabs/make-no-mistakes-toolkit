---
description: >
  Audit whether observability actually WORKS, not whether it is configured. Verifies
  telemetry is received (not merely emitted), that the configured credential points at a
  live destination, that init paths cannot silently disable monitoring, that alert channels
  carry real traffic and have named owners, and that every alert has been demonstrated
  capable of firing. Runtime audit against live systems — not a static repo scan. Accepts a
  target as $ARGUMENTS.
---

# /observability-audit

Audit the **function** of an observability stack, not its **existence**.

## Why this exists

Every observability failure worth having a postmortem about shares one shape: a control
passed an existence check and failed a function check. The credential was set. The SDK was
imported. The channel was created. An owner was named. None of it worked, and nothing said so.

The specific trap this command was built from: a service had ~65% of its serverless functions
importing the error-tracking SDK, calling init, capture and flush correctly — while the
configured DSN pointed at no live project. Errors were serialized, sanitized, tagged, and
posted into nothing for months. A separate commit had even *hardened the validation* of that
credential weeks earlier; it correctly detected the invalid value and reported it via
`console.error`, into a runtime log nobody reads. The alarm rang the whole time, inside a
soundproof room.

Coverage metrics cannot detect this. Coverage measures emitters. This command measures
**receivers**.

## What it checks

### 1. Receiver-side liveness (the load-bearing check)

For each emitting surface (serverless runtime, backend, frontend, workers), query the
telemetry provider for the count of events **actually received**, over the longest window the
provider's API allows, filtered by the tags the code claims to attach.

Zero received while the code is instrumented is a dead pipeline. This is the check that
inverts the usual direction and the reason the command exists.

Report per surface: `emitters_instrumented` vs `events_received`. A high first number with a
zero second number is the failure signature.

### 2. Credential-to-destination match

Confirm the configured credential corresponds to a live destination in the provider.

Where the platform exposes only a digest of a secret rather than its value, the match can
still be established without ever reading the secret: enumerate the provider's live keys via
its API, hash each candidate with the platform's digest algorithm, and compare. Validate the
algorithm first against a sibling secret whose plaintext is known or guessable — if that
reproduces its stored digest exactly, the comparison is sound.

A credential matching no live destination is the root cause of check 1 failing.

### 3. Silent-degradation paths

Read the telemetry initialization code and find every branch that **disables monitoring and
continues**. Typical shape:

```
if (!credential) { console.warn("monitoring disabled"); return; }
```

Each such branch is a place where the system can lose observability without anyone learning.
Report them all. The remediation is not to remove the branch — failing hard on a telemetry
outage couples deployability to a non-critical dependency — but to route it somewhere a human
reads, which check 4 covers.

### 4. Channel liveness and ownership

For each alert channel:

- **Events since creation.** A channel that has received nothing since it was created is not
  coverage; it reads as coverage, which is worse than having no channel at all.
- **Triage state.** Count alerts still untriaged past a stated SLA. If no SLA is stated, that
  is itself the finding.
- **Named owner and named backup.** An owner without a backup decays the first time that
  person is pulled elsewhere, and decays silently. "TBD" is a finding.

### 5. Outcome-based alerting

Error trackers fire on events that happen. They are structurally blind to a failure that
manifests as the **absence** of an expected outcome — no completed transactions, no
successful jobs, no ingested records.

Check whether any alert fires on absence. If every alert is error-triggered, the system cannot
detect its most commercially damaging failure mode.

When one exists, check that its threshold is **modeled rather than constant**. At low or
bursty volume, a flat window is untunable: set loose it never fires, set tight it fires during
every quiet period and gets muted within weeks. Expected volume is a function of hour-of-day,
day-of-week, and the domain's own calendar.

### 6. Falsifiability

For each alert, ask: **has it ever been observed firing on purpose?**

An alert never demonstrated red is unproven, regardless of how correct its query looks. Report
the date and the person for each alert that has been deliberately triggered; report every
alert that has not.

This is the check that generalizes the other five. Adopt the rule it implies:

> No control is considered deployed until it has been demonstrated capable of going red.

Note this is *not* chaos engineering, and should not be deferred until a chaos practice
exists. Chaos engineering tests whether the **system** survives injected failure and requires
a measurable steady state as a precondition — precisely what is broken when observability is
dead. Injecting faults against dead telemetry returns "no signal", which is indistinguishable
from resilience. Alert validation is the cheaper, earlier practice that unblocks chaos later.

## Usage

```
/observability-audit [target]
```

`target` defaults to the current repo plus whatever live environments its configuration
references. Provide an environment name to scope to one.

## Preflight

Establish read access before auditing; missing access produces false clean results, which is
the worst possible output for this command.

- Provider API token with organization-level read scope. Watch for narrow-scoped tokens —
  build-time upload tokens commonly 403 on read endpoints and will look like "no events".
- Read access to the platform's secret listing (names and digests are sufficient; values are
  not needed and should not be read).
- Read access to the alert channels.

If any is unavailable, state which check is degraded rather than reporting it clean.

## Output

A findings document with, per check: what was measured, the observed value, the expected
value, and the gap. Rank by whether the gap makes a real failure invisible.

Then a remediation sequence. Order it so that no step can manufacture false confidence — in
particular, ship the **receiver-side counter before** correcting any credential, so it reads
zero honestly first and any subsequent green coverage metric is provably a lie.

Finally, propose the durable controls: a liveness assertion on the receiver count, an
outcome-based SLI, ownership with an SLA and a backup, and — last — instrumentation-coverage
enforcement. Coverage enforcement shipped first is the single most likely path to repeating
the incident with a green badge attached.

## Anti-patterns this command exists to catch

| Anti-pattern | Why it survives review |
| -- | -- |
| Coverage metric as proof of observability | It is true and green, and measures the wrong end |
| Detector wired to `console.*` | The detection code is genuinely correct; only its sink is wrong |
| A synthetic probe using a privileged credential | It passes through the same function, skipping the authorization layer that actually fails |
| A probe pointed at a non-production environment | Defensible in review, fatal in practice |
| Alert channel created during planning, never wired | Its existence is visible; its emptiness is not |
| Monitoring pinned to a component being replaced | It stays green through the migration because the old path still runs, then goes blind at cutover |
