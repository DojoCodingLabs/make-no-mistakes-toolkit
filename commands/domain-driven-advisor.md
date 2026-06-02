---
description: >
  Guided entry point for repo health when you don't know which audit you need.
  Inspects the repo, asks a few plain-language questions, recommends which
  audit(s) to run (or the full sequence), runs them, and finishes with a
  premortem on the remediation plan. Best first command for a new repo.
---

# /domain-driven-advisor

Trigger the **`domain-driven-advisor`** skill. It routes you to the right
audit(s) from the audit-engine family and stress-tests the result with a
premortem. See `references/domain-driven-advisor-triage.md` for the decision
tree.

## Usage

```
/domain-driven-advisor [path]
```
