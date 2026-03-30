#!/usr/bin/env bash
# check-greptile.sh — Check Greptile review status for a PR
# Usage: check-greptile.sh <PR_NUMBER> <OWNER/REPO>
#
# Returns one of:
#   NO_REVIEW   — Greptile hasn't reviewed yet
#   NO_GREPTILE — Greptile bot not found on this repo
#   SCORE:X/5   — Confidence score (e.g., SCORE:4/5)
#   ERROR       — Something went wrong

set -euo pipefail

PR_NUMBER="${1:?Usage: check-greptile.sh <PR_NUMBER> <OWNER/REPO>}"
REPO="${2:?Usage: check-greptile.sh <PR_NUMBER> <OWNER/REPO>}"

# Fetch issue comments (Greptile posts as issue comments, not PR review comments)
COMMENTS=$(gh api "repos/${REPO}/issues/${PR_NUMBER}/comments" \
  --jq '[.[] | select(.user.login | test("greptile"; "i")) | .body]' 2>/dev/null) || {
  echo "ERROR"
  exit 1
}

# Check if any Greptile comments exist
if [ "$COMMENTS" = "[]" ] || [ -z "$COMMENTS" ]; then
  # Check if Greptile bot exists as a collaborator
  GREPTILE_BOT=$(gh api "repos/${REPO}/collaborators" \
    --jq '[.[].login | select(test("greptile"; "i"))] | length' 2>/dev/null) || GREPTILE_BOT="0"

  if [ "$GREPTILE_BOT" = "0" ]; then
    echo "NO_GREPTILE"
  else
    echo "NO_REVIEW"
  fi
  exit 0
fi

# Extract the score from the LAST Greptile comment
SCORE=$(echo "$COMMENTS" | jq -r 'last' | grep -oP 'Confidence Score:\s*(\d)/5' | grep -oP '\d/5' | tail -1)

if [ -n "$SCORE" ]; then
  echo "SCORE:${SCORE}"
else
  echo "NO_REVIEW"
fi
