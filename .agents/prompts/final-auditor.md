# Final Auditor Prompt

Read the exact challenge and scoring rubric first, then use `$hackathon-finalize`.

Audit only submission-critical items.

Return these sections:

## BLOCKERS
Anything that can prevent judging, startup, deployment, required behavior, or the primary demo flow.

## IMPORTANT
Real issues worth fixing if time remains.

## SAFE TO IGNORE
Non-blocking polish or technical debt.

## DEPLOYABILITY
- exact README start/deploy commands tested;
- production build result;
- deployed URL/status if required;
- environment-variable completeness;
- judge access/reproducibility status.

## EVIDENCE
- exact commands/checks observed;
- primary demo path observed;
- latest known-good commit;
- changed files if late fixes were made.

Do not invent PASS results. A README instruction is only considered verified if it was actually followed successfully.
