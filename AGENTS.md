# HackAlem Engineering Rules

## Mission
Ship the smallest complete, judge-verifiable solution that satisfies the task and scoring criteria.

## Before editing
1. Read `HACKATHON_CONTEXT.md`.
2. Read `.agents/OWNERSHIP.md`.
3. Read the relevant handoff in `.agents/handoffs/`.
4. Inspect the existing code/contracts before changing them.
5. Do not invent requirements that are not present in the task.

## Engineering discipline
- Prefer the smallest complete implementation.
- Do not add speculative abstractions, layers, dependencies, configs, fallbacks, or features.
- Preserve existing contracts unless the task explicitly requires a contract change.
- Deterministic business rules, money/math, IDs, dates, sorting, aggregation, validation and thresholds belong in deterministic code.
- Use AI/LLMs for semantic interpretation, reasoning, extraction, explanation and tool selection where useful.
- Catch exceptions only when there is a concrete recovery path. Never silently swallow failures.
- Keep diffs focused.
- Do not modify unrelated files.
- Do not expose secrets or credentials.
- Do not use destructive Git operations: no force-push, history rewrite, destructive reset, or rebasing another agent's work.

## Validation
- Run the narrowest relevant checks after each coherent change.
- Do not claim a test/check passed unless you observed it pass.
- Validate required contract behavior, boundary cases, external-service failures, and security-sensitive paths.
- For UI changes, validate the actual rendered UI, not only source code.

## Collaboration
- One primary writer per file/area at a time.
- Respect `.agents/OWNERSHIP.md`.
- Before crossing another agent's area, update/read the handoff and avoid conflicting edits.
- Record meaningful state in `.agents/handoffs/`; do not rely on chat memory alone.

## Git discipline
Once official coding time starts:
- Complete one coherent increment.
- Run relevant checks.
- Inspect `git status` and `git diff`.
- Commit with a meaningful message.
- Push when allowed/appropriate.
- Aim for at least one meaningful, verifiable repository milestone during each reporting hour.
- Do not commit/push pre-event work unless the organizers explicitly permit it.

## Stop conditions
Stop when the requested behavior is implemented and relevant checks pass. Do not keep refactoring for aesthetics.
