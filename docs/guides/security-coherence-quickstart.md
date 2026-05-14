# Quick Start: Security & Coherence Integration

**For:** Developers integrating security-coherence checks into their workflow  
**Time:** 5 min to set up, <1 min per use  
**Outcome:** Zero security regressions, zero coherence misalignments, faster code review

---

## The Flow (New)

```
You write code
  ↓
pnpm lint && pnpm test ✓
  ↓
git push origin feat/your-feature
  ↓
/security-coherence approve feat/your-feature
  ↓
PASS ✓ or VETO ⛔?
  ↓
PASS → Open PR → Review → Merge
VETO → Fix issues → Push → Re-check
```

---

## Step-by-Step

### 1. Before You Code

**Read in order (once per feature):**
- `docs/specs/feat-your-feature.md` — what you're building
- `.github/skills/<your-domain>/SKILL.md` — how to build it
- Quick mental scan: Does the spec contradict SYSTEM_DESIGN.md rules?

**Example:** "This spec requires bypassing the 3% fee on poster. But SYSTEM_DESIGN.md says fees are always 3% on agreed_price. Contradiction! Ask product owner."

### 2. Write Your Code

Follow the domain skill patterns. No surprises here — you've done this before.

### 3. Run Your Tests

```bash
cd apps/api  # or apps/web, or packages/shared
pnpm lint
pnpm test
```

**All green?** Continue.

### 4. Push Your Branch

```bash
git add .
git commit -m "feat(api): add gigs listing endpoint"
git push origin feat/your-feature
```

### 5. Invoke Security-Coherence (The New Step)

```bash
/security-coherence approve feat/your-feature
```

**The agent will:**
1. Read your branch diff
2. Read the spec at `docs/specs/feat-your-feature.md`
3. Check against SYSTEM_DESIGN.md, architecture docs, skill files
4. Run security checks (auth, data handling, injection, secrets, business logic)
5. Output either **PASS ✓** or **VETO ⛔** with reasons

### 6a. If PASS ✓

You're good to go. Open your PR:

```bash
gh pr create \
  --title "feat(api): add gigs listing endpoint" \
  --body "$(cat <<'EOF'
## Summary
- Fetches gigs with region/category filtering
- Respects visibility rules (hides private fields)
- Rate-limited to prevent abuse

## Security & Coherence ✓
- /security-coherence approve: PASS
- No auth bypass, data exposure, or business-logic violations
- Follows backend-api skill patterns

## Test Plan
- [ ] Manual: GET /gigs?region=tbilisi returns correct results
- [ ] Manual: Hidden fields not returned for unauthorized users
EOF
)"
```

Code review now focuses on logic, UX, performance — security + coherence already validated.

### 6b. If VETO ⛔

Agent lists specific issues. Example:

```
## VETO ⛔

### Critical
- Missing requireAuth on POST /gigs/new (line 52)
  Risk: Anyone can create gigs
  Fix: Add { preHandler: [requireAuth] }

- OTP stored plaintext (line 246)
  Risk: Breach exposes all verification codes
  Fix: Use hashOtp(code) before insert

### Non-Critical
- Entire request logged (middleware.ts:12)
  Risk: Passwords appear in logs
  Fix: Sanitize password field
```

**Your action:**
1. Fix the critical issues (you have to)
2. Consider fixing non-critical issues (recommended)
3. Commit and push
4. Re-run: `/security-coherence approve feat/your-feature`
5. Loop until PASS

---

## Common Scenarios

### "Agent VETO'd me but I disagree"

Examples where you might disagree:
- Agent says "missing auth check" but your endpoint is public
- Agent says "field-level error" but you're returning form-level error

**Your action:**
1. Comment in PR: "Agent flagged X, but here's why it's correct: ..."
2. Tech Lead reviews, decides if you or agent is right
3. If agent is wrong, update agent instructions (contribute back!)
4. If you're wrong, fix the code

---

### "My feature is security-critical, I want extra checks"

Examples: Auth flows, payment logic, admin endpoints

**Your action:**
1. Add a note in your PR: "Security-sensitive area, please double-check"
2. Invite security review: "Tech Lead, can you spot-check the auth flow?"
3. Agent has already run, human now does deeper review

---

### "I need to refactor a domain but worried about breaking integrations"

Examples: Changing how gigs are fetched, redesigning contract state machine

**Your action:**
1. Read the coherence framework (integration points section)
2. Map your changes to downstream consumers
3. Mark affected domains in your PR ("This touches: billing ledger, dispute resolution")
4. Agent will catch obvious breakage
5. Tech Lead will trace deeper dependencies

---

### "How do I interpret the agent's security checks?"

The agent checks these categories:

| Category | What It Checks | Example VETO |
|----------|----------------|-------------|
| **Auth & Access Control** | All protected routes use requireAuth, tokens handled correctly | Missing middleware on sensitive route |
| **Data Validation** | Zod schemas, no SQL injection, file upload validation | Raw SQL query instead of ORM |
| **Sensitive Data** | Passwords hashed, OTP hashed, no secrets in code | `localStorage.setItem('token')` |
| **Business Logic** | Fee calculation, state machines, admin restrictions | Fee calculation uses wrong price field |
| **Dependencies** | npm audit clean, no EOL packages | Critical CVE in dependency |

Each VETO lists:
- **Issue:** What's wrong
- **Location:** File and line number
- **Risk:** Why it matters
- **Fix:** How to solve it

---

## Advanced: Custom Checks

Want to add a domain-specific security check?

1. Add it to the agent instructions at `.github/agents/cybersecurity-agent.agent.md`
2. Include: what to check, examples of PASS/VETO
3. Test on your next PR

Example: "Check that contract state transitions are atomic"

```
### Contract State Transitions (Custom for deal-lifecycle)

Checklist:
- [ ] All state changes wrapped in db.transaction()
- [ ] No intermediate states visible to API
- [ ] Ledger writes atomically with contract updates
```

---

## Reference: Agent Invocation Patterns

**Approve your branch:**
```bash
/security-coherence approve feat/your-feature
```

**Audit specific files:**
```bash
/security-coherence audit apps/api/src/routes/auth/index.ts
```

**Check specific concerns:**
```bash
/security-coherence check --focus=secrets
/security-coherence check --focus=auth
/security-coherence check --focus=business-logic
```

**Request deep review (slow, comprehensive):**
```bash
/security-coherence deep-review feat/your-feature --reason="payment code, extra caution"
```

---

## When the Agent is Unavailable

If the agent is unreachable:

1. **Run manual coherence check:**
   - Read the checklist at `docs/guides/project-coherence-framework.md`
   - Check your code against the 5-point checklist
   - Flag any issues in your PR description

2. **Request human security review:**
   - Tag Tech Lead in PR: "Manual security review requested"
   - They'll do a deeper dive

3. **Proceed to code review** with a note: "Agent check pending, will resolve before merge"

---

## Metrics: Track Your Own Improvement

As you use the agent:

- **Iteration 1–3:** Expect 2–5 VETOs per feature (you're learning the patterns)
- **Iteration 4–6:** 1–2 VETOs per feature (patterns becoming intuitive)
- **Iteration 7+:** 0–1 VETOs per feature (you've internalized security best practices)

**Goal:** VETOs drop to zero, meaning you're catching issues before push.

---

## Questions?

- **How does the agent know what to check?** It reads the coherence framework (`docs/guides/project-coherence-framework.md`) and your spec.
- **Can the agent be wrong?** Yes. Escalate to Tech Lead. Agent reasoning is always visible.
- **Does this slow me down?** No. Agent runs in seconds. You save 2–3h/sprint on rework.
- **What if my code is urgent?** Code is never "too urgent" to be secure. Fix the VETOs first.

---

## Next: Integrate Into Your IDE

**Coming soon:** Pre-commit hooks that auto-run security-coherence checks.

```bash
# In your .git/hooks/pre-push
#!/bin/bash
branch=$(git rev-parse --abbrev-ref HEAD)
/security-coherence approve $branch || exit 1
```

For now: Manual invocation is fine. Make it a habit!

---

## Summary

| When | What | Command |
|------|------|---------|
| **After local tests pass** | Check security + coherence | `/security-coherence approve <branch>` |
| **Get PASS** | Open PR | `gh pr create ...` |
| **Get VETO** | Fix issues | (code, commit, push, re-check) |
| **During code review** | Security + coherence already cleared | (human focuses on logic) |
| **Merge** | Both gates have passed | `git squash-merge` |

**Result:** Faster iterations, zero security regressions, clearer PRs, better onboarding.
