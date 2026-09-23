# Ownership

Update this at the start of the challenge and whenever ownership changes.

Handoffs are the durable coordination layer:
- Codex: [`handoffs/codex.md`](handoffs/codex.md)
- Local QA/reviewer: [`handoffs/local-qa.md`](handoffs/local-qa.md)

| Area | Primary writer | Default path/scope | Handoff | Notes |
|---|---|---|---|---|
| Architecture / integration | Codex | Cross-cutting contracts and integration | [`codex.md`](handoffs/codex.md) | Owns final integration decisions |
| Frontend / UX | Codex | `frontend/` | [`codex.md`](handoffs/codex.md) | Uses `product-ui-design` skill |
| Backend core | Codex | `backend/` unless delegated | [`codex.md`](handoffs/codex.md) | Deterministic contracts first |
| Local implementation task | Assigned local model | Explicitly assigned files only | Relevant task handoff | Never assume broad repo ownership |
| Local QA / review | Local model | Read-only by default | [`local-qa.md`](handoffs/local-qa.md) | Review/tests; edits only when assigned |
| README / reproducibility / deployability | Codex | `README*`, deploy/config files | [`codex.md`](handoffs/codex.md) | Final clean-start/deploy owner |

## Rules

- One primary writer per file at a time.
- Ownership is by explicit path/scope, not merely by role name.
- Reviewers may suggest patches but should not race the primary writer.
- Before switching ownership, update the current handoff with:
  - exact changed file paths;
  - current contract/state;
  - validation evidence;
  - latest known-good commit;
  - next exact action.
- The receiving agent reads the relevant handoff before editing.
- If a task requires crossing ownership boundaries, update this table or record a temporary exception in the handoff first.
- Codex remains the integration owner unless the challenge requires a different arrangement.
