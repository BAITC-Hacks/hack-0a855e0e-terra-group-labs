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
- Created and pushed meaningful baseline commit `87e633b` with scaffold, organizer materials, extracted parquet data, and hygiene rules.
- Installed parquet/graph analytics dependencies into the backend-managed environment and ran the organizer starter successfully.
- Implemented the deterministic one-command pipeline, generated all three required CSV artifacts, and added a contract validator plus depth-boundary regression test.

## In progress
- Checkpointing the validated analytics core, then exposing the same outputs through the investigation API.

## Changed files

| Path | Change | Status | Validation |
|---|---|---|---|
| `.gitignore` | Ignore secrets, Python/Node caches, builds, raw archives, and macOS extraction metadata | Ready | `git status --ignored` inspection pending |
| `.agents/handoffs/codex.md` | Record challenge contract and baseline state | Ready | Manual review |
| `backend/pyproject.toml` | Add project-local graph/parquet dependencies | Ready | Organizer starter completed in 1.984 s |
| `backend/uv.lock` | Lock resolved dependency versions | Ready | `uv add` completed |
| `backend/src/backend/pipeline.py` | Load/validate parquet, calculate graph features, cluster, assign roles/priority/evidence, and write outputs | Ready | Pipeline + test pass |
| `backend/src/backend/validate_outputs.py` | Mechanical submission contract validator | Ready | `SUBMISSION VALIDATION PASSED` |
| `tests/test_pipeline.py` | Full pipeline contract and depth-4 terminal regression | Ready | 1 passed |
| `outputs/nodes_roles.csv` | Required 2,248-node role output plus diagnostics | Ready | Validator pass |
| `outputs/clusters.csv` | Required deterministic cluster summaries/hypotheses | Ready | Validator pass |
| `outputs/top_nodes.csv` | Top 50 ranked investigation candidates | Ready | Validator pass |

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
`uv add numpy pandas pyarrow networkx scipy` -> PASS; installed numpy 2.5.3, pandas 3.0.6, pyarrow 25.0.1, networkx 3.7, scipy 1.18.1.
`PYTHONUTF8=1 uv run python organizer/starter.py ...` -> PASS in 1.984 s; generated 2,248-row placeholder `nodes_roles.csv`, empty `clusters.csv`, empty `top_nodes.csv` as designed.
`cd backend; PYTHONUTF8=1 uv run pipeline` -> PASS in 0.92 s; output role counts: peripheral 1293, terminal 404, consolidator 209, distributor 155, transit 118, coordinator 69.
`cd backend; uv run validate-outputs` -> PASS (`SUBMISSION VALIDATION PASSED`).
`uv run --project backend pytest -q` -> PASS (1 passed in 1.99 s).
`cd backend; uv run ruff check src ../tests` -> PASS.
Secret-literal scan outside ignored `.env` -> no matches.
`git check-ignore` -> `.env`, backend `.venv`, frontend `node_modules`, ZIP archives, and `__MACOSX` metadata are excluded.
```

## Runtime / environment changes
- Dependencies added/removed: added numpy, pandas, pyarrow, networkx, scipy to the backend project; scipy is required by NetworkX PageRank but absent from the organizer root requirements.
- Environment variables added/changed: documented name will be `OpenAIKEY`; `.env` remains ignored and was not read.
- Services/deployment changes: None

## Latest known-good Git state
- Branch: `main`
- Commit: `87e633b` (meaningful scaffold + organizer data baseline)
- Dependency checkpoint: `99f2654`
- Pushed: Yes (`origin/main`)

## Risks / blockers
- The organizer starter prints a Unicode arrow that fails under the host CP1251 console; project commands must force UTF-8 or avoid that character. No dependency blocker remains.

## Known limitations
- Betweenness uses a deterministic 300-node sample to keep laptop runtime sub-second; switch to exact/distributed graph analytics for a million-node graph.
- Role/priority scores are explainable heuristics for analyst attention, not guilt probabilities or ground-truth classifications.

## Handoff to
- Agent/role: TBD
- What they need to know: TBD

## Next exact action
- Commit/push pipeline + generated outputs, then add read-only FastAPI endpoints for overview, graph, node, edge transactions, clusters, and top priorities.
