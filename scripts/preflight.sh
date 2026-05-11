#!/usr/bin/env bash
# Preflight gate for any AI-assisted work in this repo.
#
# Usage:
#   bash scripts/preflight.sh <task-branch-name>
#
# Examples:
#   bash scripts/preflight.sh feat/uat-contract-signing
#   bash scripts/preflight.sh fix/auth-token-expiry
#   bash scripts/preflight.sh docs/uat-readiness-sync
#
# What it does:
#   1. Fetches all remotes.
#   2. Refuses to continue if the working tree is dirty.
#   3. Switches to the canonical integration branch (uat/first-slice).
#   4. Fast-forwards it to origin.
#   5. Creates the named task branch off it, or switches into it if it already exists
#      (rebasing onto the latest integration branch).
#
# This is the single biggest defense against parallel-dev drift.

set -euo pipefail

INTEGRATION_BRANCH="uat/first-slice"
ALLOWED_PREFIXES_REGEX='^(feat|fix|docs|chore|refactor)/.+'

TASK_BRANCH="${1:-}"

if [[ -z "$TASK_BRANCH" ]]; then
  echo "error: task branch name is required"
  echo ""
  echo "usage: bash scripts/preflight.sh <task-branch-name>"
  echo "  example: bash scripts/preflight.sh feat/uat-contract-signing"
  exit 1
fi

if [[ ! "$TASK_BRANCH" =~ $ALLOWED_PREFIXES_REGEX ]]; then
  echo "error: branch name '$TASK_BRANCH' must start with one of:"
  echo "  feat/   fix/   docs/   chore/   refactor/"
  echo ""
  echo "see docs/guides/sdlc-and-cicd.md for branch naming rules."
  exit 1
fi

echo "→ fetching remotes (with prune)"
git fetch --all --prune

echo "→ asserting clean working tree"
if [[ -n "$(git status --porcelain)" ]]; then
  echo ""
  echo "error: working tree is not clean."
  echo "       commit, stash (with a label), or discard your changes before starting a new task."
  echo ""
  git status --short
  exit 1
fi

echo "→ switching to $INTEGRATION_BRANCH"
git switch "$INTEGRATION_BRANCH"

echo "→ fast-forwarding $INTEGRATION_BRANCH from origin"
git pull --ff-only origin "$INTEGRATION_BRANCH"

INTEGRATION_SHA="$(git rev-parse --short "$INTEGRATION_BRANCH")"

if git show-ref --verify --quiet "refs/heads/$TASK_BRANCH"; then
  echo "→ task branch $TASK_BRANCH exists locally — switching to it"
  git switch "$TASK_BRANCH"
  echo "→ rebasing $TASK_BRANCH onto $INTEGRATION_BRANCH ($INTEGRATION_SHA)"
  git rebase "$INTEGRATION_BRANCH"
else
  echo "→ creating new task branch $TASK_BRANCH from $INTEGRATION_BRANCH ($INTEGRATION_SHA)"
  git switch -c "$TASK_BRANCH"
fi

echo ""
echo "ready: $TASK_BRANCH (base: $INTEGRATION_BRANCH @ $INTEGRATION_SHA)"
echo ""
echo "next steps:"
echo "  1. read docs/specs/<ticket>.md (or create it if missing)"
echo "  2. implement the slice"
echo "  3. run local checks: pnpm --filter <package> lint && pnpm --filter <package> test"
echo "  4. commit with a conventional message and push"
