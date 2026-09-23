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
- Added the minimal read-only FastAPI contract required by the demo: summary, priorities, node details/neighbors, edge transactions, clusters, and full/filtered graph.
- Replaced the Vite demo with a browser-verified AML investigation workspace using the real 2,248-node graph.
- Fixed the GID trust-boundary contract: identifiers exceed JavaScript safe integers, so API/UI transport `gid/src/dst` as exact decimal strings.

## In progress
- Post-baseline AML workspace iteration from known-good `286073c`: discovery filters, relationship traversal, percentile explainability, Russian-first copy, cluster-level graph, network analytics, focused QA, and a one-command local launcher.

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
| `backend/src/backend/api.py` | Demo-scoped read-only API over generated outputs/raw edge transactions | Ready | API contract test pass |
| `backend/src/backend/__init__.py` | Start the local API with `uv run backend` | Ready | Import/TestClient pass |
| `tests/test_api.py` | Summary, GID lookup, 404, edge transactions, ego graph | Ready | 2 total tests pass |
| `frontend/src/App.tsx` | Search, priority queue, depth-banded Cytoscape map, node/edge evidence, cluster filter | Ready | Browser flow verified |
| `frontend/src/App.css` | AML-specific responsive investigation layout | Ready | 1440x900 + default viewport inspected |
| `frontend/src/index.css` | Minimal global tokens/reset/accessibility | Ready | Browser inspected |
| `frontend/vite.config.ts` | Local `/api` proxy | Ready | Live integration verified |
| `frontend/package*.json` | Add Cytoscape and its TypeScript declarations | Ready | npm build/lint pass |
| `README.md` | Exact setup/run/check commands, architecture, scorecards, limitations, demo cases, scaling | Ready | Commands re-run from repository root |
| `.env.example` | Safe placeholder for optional future `OpenAIKEY` use | Ready | Contains no secret |
| `frontend/vite.config.ts` | Pin demo host to `127.0.0.1` and proxy API | Ready | Clean-start URL loaded |

### Post-baseline iteration checkpoints

- `backend/src/backend/pipeline.py`: preserves role/priority formulas; exports percentile and role-component diagnostics, strengthens numeric evidence, and adds cluster priority/role summaries.
- `backend/src/backend/api.py`: adds deterministic node discovery filters, Russian coverage copy, role-component explanations, counterparty cluster metadata, `/api/cluster-graph`, and `/api/analytics`.
- `tests/test_pipeline.py`: adds semantic role invariants, full output contracts, and byte-for-byte two-run reproducibility.
- `tests/test_api.py`: adds discovery, GID string-safety, error, cluster-graph, and analytics regression checks.
- `outputs/nodes_roles.csv`, `outputs/clusters.csv`: regenerated from the unchanged score formulas with the new diagnostic columns.
- Validation: pipeline 1.03 s + validator PASS; pytest 2 passed; Ruff PASS. Only upstream FastAPI/Starlette TestClient deprecation warnings remain.

Use exact repository-relative paths.

## Files currently owned
- See `.agents/OWNERSHIP.md`.
- List temporary exceptions here if ownership changed for a specific task.

## Decisions / contracts
- API/data contracts: preserve the organizer CSV schemas exactly; extra diagnostic columns are allowed.
- Deterministic rules: all required roles, scores, clustering, priority, evidence, and outputs work offline without an LLM.
- AI/semantic responsibilities: optional only, grounded in deterministic graph-tool output, and reads `OpenAIKEY` if implemented.
- Assumptions: extracted organizer parquet files may be committed for judge reproducibility; duplicate ZIPs and `__MACOSX` metadata are excluded.

### UI design plan

- Primary user/job: a bank AML analyst deciding which GID to inspect first and why.
- Demo moment: search any GID, focus its directed ego network, and read role/priority/evidence plus a visible depth-4 coverage warning when applicable.
- Visual concept: a restrained dark investigation console centered on a five-band depth map of observed money flow.
- Palette: ink `#0b0f14` page, slate `#121922` surface, mist `#e8edf2` text, steel `#8d9aa8` secondary, amber `#f3b33d` action/selection, coral `#ef6a62` warning; role colors remain categorical.
- Typography: system sans for UI and compact tabular numerals for GIDs/metrics; no external font dependency.
- Shape/spacing: 4/8/12/16/24 px rhythm, 2–6 px radii, thin dividers, shadows only for the selected-node panel.
- Desktop layout:

```text
┌ header: title · observed totals · exact GID search ┐
├ priority queue ┬ depth 0→4 network ┬ node evidence ┤
│ ranked rows    │ selectable flows  │ metrics/links  │
├─────────────── coverage limitations / role legend ─┤
└─────────────────────────────────────────────────────┘
```

- Memorable element: depth-banded directed network with an ego-focus mode; labels appear only for the selected node and its neighbors.
- Anti-template check: no hero, fake KPI cards, unused navigation, chat, gradients, or decorative charts.

### Current UI iteration

- Primary question remains “кого проверить первым и почему?”, with exact GID search preserved for the jury path.
- Discovery: one compact `Фильтры` drawer produces an actionable result list; the header remains search-first rather than becoming a dense form.
- Relationship traversal: counterparty is the primary row action; flow evidence is a separate explicit action, enabling node → relationship → node investigation.
- Explainability: user-facing percentiles are expressed as `топ X%`; raw centrality is demoted from the primary view; role and priority are labelled as structural expression and review priority, never guilt probability.
- Network views: the same canvas switches between GID nodes and deterministic cluster supernodes; five depth lanes remain the memorable visual and depth 4 is labelled as the observation boundary.
- Analytics: compact evidence tables/bars below the workspace answer structure, cluster, signal, and inter-cluster-flow questions without a generic KPI dashboard or chart dependency.
- Russian is the default product language; API/CSV role enums and technical commands remain unchanged.
- Optional AI and light theme remain gated until deterministic discovery, navigation, cluster view, analytics, and QA are stable.

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
`uv run --project backend pytest -q` after API -> PASS (2 passed in 2.01 s; upstream TestClient deprecation warnings only).
FastAPI TestClient `/api/summary` -> 2,248 nodes, 3,119 edges, 4,840 transactions, 365,890,012.01 KZT observed.
`cd frontend; npm run build` -> PASS (18 modules, 320 ms; expected Cytoscape chunk-size warning only).
`cd frontend; npm run lint` -> PASS.
Browser QA at 1440x900 -> no horizontal overflow (`innerWidth == scrollWidth == 1440`); overview readable; exact depth-4 GID `100000000404740100` opened with explicit boundary warning; edge transaction detail and cluster 1 hypothesis opened successfully.
Browser console after fixes -> no new errors/warnings; removed invalid Cytoscape HSL syntax and custom wheel sensitivity.
Final clean setup: `uv sync --project backend --dev` PASS; `npm ci --prefix frontend` PASS, 0 vulnerabilities.
Final pipeline: `uv run --project backend pipeline` PASS in 0.90 s; outputs reproduced byte-stably (`git diff -- outputs` empty).
Final validator PASS; pytest 2 passed in 2.26 s; Ruff PASS; ESLint PASS; production build PASS in 399 ms (Cytoscape bundle-size advisory only).
Final documented starts: `uv run --project backend backend` and `npm run dev --prefix frontend` both PASS; `http://127.0.0.1:5173` loaded 2,248 nodes / 3,119 flows.
Final hygiene: no credential-like literals, task-critical TODO/FIXME, output drift, or horizontal overflow found.
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
- Dependency checkpoint: `659a470`
- Analytics checkpoint: `2be434e`
- API checkpoint: `9a20718`
- Browser-verified UI checkpoint: `fa0d11a`
- Final reproducible documentation checkpoint: `4670ad5`
- Pushed: Yes (`origin/main`)

## Risks / blockers
- The organizer starter prints a Unicode arrow that fails under the host CP1251 console; project commands must force UTF-8 or avoid that character. No dependency blocker remains.

## Known limitations
- Betweenness uses a deterministic 300-node sample to keep laptop runtime sub-second; switch to exact/distributed graph analytics for a million-node graph.
- Role/priority scores are explainable heuristics for analyst attention, not guilt probabilities or ground-truth classifications.

## Handoff to
- Agent/role: judges / demo presenter
- What they need to know: follow the root README literally; core outputs are offline and deterministic; `OpenAIKEY` is optional and unused; use the three documented demo GIDs and emphasize observed evidence/data limitations rather than accusations.

## Next exact action
- Freeze non-blocking changes; use the README demo path and fix only submission blockers.
