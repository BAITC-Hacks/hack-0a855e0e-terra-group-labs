# HackAlem Context

## Event
- Development time is limited; optimize for judge-verifiable value.
- Read the exact challenge and scoring rubric before architecture work.
- Reproducibility and README/run instructions are part of the deliverable.

## Current architecture defaults
These are defaults, not requirements:
- `frontend/`: React + TypeScript + Vite.
- `backend/`: Python + FastAPI.
- `tests/`: end-to-end / cross-service verification.
- Prefer deterministic tools/services around an AI orchestrator rather than asking an LLM to perform deterministic calculations.

## First actions after the challenge is revealed
1. Extract hard requirements, scoring criteria, gates and forbidden approaches.
2. Identify what must be deterministic vs semantic/AI-driven.
3. Establish the thinnest end-to-end slice.
4. Update `.agents/OWNERSHIP.md`.
5. Update the Codex/local-agent handoffs.
6. Only then add task-specific dependencies.

## Definition of done
- Core user flow works end-to-end.
- Required behavior is verifiably correct.
- Failure paths are understandable.
- UI is coherent and demo-ready.
- README contains exact run steps.
- A clean run has been performed before submission.
