# Codex Handoff

## Current goal
Build the smallest complete, reproducible AML graph-analysis pipeline and investigation UI required by the HackAlem "Graph of Money" case.

## Challenge / scoring references
- Required: one-command parquet-to-three-CSV pipeline under 5 minutes; roles/evidence for all 2,248 nodes; clustering; top >=20; directed graph UI with role/cluster highlighting and exact GID search.
- Required artifacts: repository, README, generated CSVs, one architecture diagram, and a five-minute demo flow.
- Scoring: task fit 25, technical implementation 25, README/reproducibility 25, value/applicability 15, development potential/originality 10.

## Completed
- Read the official eight-page challenge PDF, organizer dataset README, starter code, repository instructions, and full user prompt.
- Confirmed the existing pushed commit `e432645` only adds `.gitignore`; the starter and dataset remain untracked.
- Verified no credential-like literals outside the ignored `.env`; the runtime variable name is `OpenAIKEY` and optional AI must not gate core outputs.

## In progress
- Establishing a meaningful baseline containing the allowed scaffold, organizer starter, extracted parquet data, and repository instructions while excluding local/generated artifacts.

## Changed files

| Path | Change | Status | Validation |
|---|---|---|---|
| `.gitignore` | Ignore secrets, Python/Node caches, builds, raw archives, and macOS extraction metadata | Ready | `git status --ignored` inspection pending |
| `.agents/handoffs/codex.md` | Record challenge contract and baseline state | Ready | Manual review |

Use exact repository-relative paths.

## Files currently owned
- See `.agents/OWNERSHIP.md`.
- List temporary exceptions here if ownership changed for a specific task.

## Decisions / contracts
- API/data contracts: preserve the organizer CSV schemas exactly; extra diagnostic columns are allowed.
- Deterministic rules: all required roles, scores, clustering, priority, evidence, and outputs work offline without an LLM.
- AI/semantic responsibilities: optional only, grounded in deterministic graph-tool output, and reads `OpenAIKEY` if implemented.
- Assumptions: extracted organizer parquet files may be committed for judge reproducibility; duplicate ZIPs and `__MACOSX` metadata are excluded.

## Validation observed

Record exact commands and observed results.

```text
Official PDF extracted successfully with bundled `pypdf`; 8 pages inspected.
`uv 0.12.17`, `Python 3.13.15` available.
`cd backend; uv run backend` -> PASS (`Hello from backend!`).
`cd frontend; npm run build` -> PASS (Vite production build, 20 modules, 291 ms).
Organizer starter run -> EXPECTED FAIL before dependency install: `ModuleNotFoundError: No module named 'numpy'`.
Secret-literal scan outside ignored `.env` -> no matches.
`git check-ignore` -> `.env`, backend `.venv`, frontend `node_modules`, ZIP archives, and `__MACOSX` metadata are excluded.
```

## Runtime / environment changes
- Dependencies added/removed: None yet; pandas, pyarrow, networkx, and numpy will be added to the backend environment after baseline.
- Environment variables added/changed: documented name will be `OpenAIKEY`; `.env` remains ignored and was not read.
- Services/deployment changes: None

## Latest known-good Git state
- Branch: `main`
- Commit: `e432645` (incomplete baseline; `.gitignore` only)
- Pushed: Yes (`origin/main`)

## Risks / blockers
- Reproduced the dependency blocker: organizer starter cannot import `numpy` in the backend `uv` environment. Next increment installs the four task-required packages there.

## Known limitations
- None yet.

## Handoff to
- Agent/role: TBD
- What they need to know: TBD

## Next exact action
- Inspect ignored/untracked files, commit the meaningful baseline, push it, then install/sync graph and parquet dependencies with `uv` and run the organizer starter against `data_for_case/data (1)/data`.
