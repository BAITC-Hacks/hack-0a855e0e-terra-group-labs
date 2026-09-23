---
name: hackathon-checkpoint
description: Create validated, useful Git checkpoints throughout a time-boxed hackathon without turning the history into commit spam.
---

# Hackathon Checkpoint

Use this after a coherent engineering increment.

## Cadence

During active coding time, aim for roughly **3–4 meaningful commits per hour** (about one every 15–20 minutes) when the work naturally supports that cadence.

This is a target, not a quota:
- do not split one logical change into fake micro-commits just to increase count;
- do not wait for an hourly milestone if a coherent, validated increment is already complete;
- do not commit broken intermediate states unless the commit is intentionally marked as a safe checkpoint and does not misrepresent validation.

Good commit boundaries include:
- backend contract + focused tests;
- one API endpoint and its service logic;
- one frontend workflow that is functional;
- one integration fix;
- one meaningful UI state or visualization;
- one reproducibility/deployment improvement;
- one bug fix with a regression test.

## Checkpoint procedure

1. Identify the coherent increment completed since the previous checkpoint.
2. Inspect:
   - `git status`
   - `git diff`
   - `git diff --staged` if anything is already staged.
3. Confirm unrelated/generated/local files are not accidentally included.
4. Run the narrowest relevant checks for this increment.
5. Record exact observed validation results.
6. Update the relevant `.agents/handoffs/` file with:
   - changed file paths;
   - behavior/contracts changed;
   - validation evidence;
   - risks or known limitations;
   - next exact action.
7. Stage only the files that belong to this increment.
8. Create a meaningful commit after official coding time starts and Git use is permitted.
9. Prefer conventional, readable commit messages such as:
   - `feat: add transaction graph endpoint`
   - `fix: handle disconnected account clusters`
   - `test: cover suspicious cycle detection`
   - `ui: add evidence detail panel`
   - `docs: verify clean-start instructions`
10. Push promptly when allowed and network conditions are stable; at minimum ensure important checkpoints are pushed regularly rather than leaving the entire event only on the laptop.

## Safety

Never:
- force-push;
- rewrite shared history;
- rebase another agent's work;
- amend someone else's commit;
- commit secrets;
- claim a test passed without observing it;
- create a meaningless commit solely because the skill was invoked.

## Milestone checkpoints

Near an organizer reporting hour or major demo milestone, make the checkpoint slightly richer:
- ensure the branch is pushed;
- summarize judge-visible progress;
- note the latest known-good commit SHA in the handoff;
- identify the next highest-value increment.

The repository history should tell a believable story of the product being built progressively during the event.
