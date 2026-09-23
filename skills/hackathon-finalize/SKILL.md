---
name: hackathon-finalize
description: Final submission audit for challenge compliance, reproducibility, deployment readiness, judge-verifiable execution, and demo stability.
---

# Hackathon Finalize

Begin this before the final minutes. Finalization is engineering work, not paperwork.

## 1. Re-read the challenge

Re-read:
- exact task;
- scoring rubric;
- hard gates;
- required deliverables;
- deployment/demo requirements;
- restrictions on external services.

Create a short submission checklist from the actual challenge and mark each item PASS / BLOCKED / NOT REQUIRED.

## 2. Verify a clean start from the README

Pretend you are a judge with no prior context.

From a fresh terminal:

1. Follow the README literally.
2. Install dependencies using only documented commands.
3. Create/configure environment variables exactly as documented.
4. Start backend/frontend/services exactly as documented.
5. Do not rely on IDE state, an already-running server, hidden shell variables, globally installed packages, absolute local paths, or undocumented manual steps.
6. Confirm the primary application URL/entrypoint.

If a command in the README is stale, fix the README or the application before proceeding.

## 3. Deployment / deployability audit

If the challenge requires a hosted deployment:
- verify the deployed URL actually loads;
- verify frontend-to-backend URLs are correct in production;
- verify CORS/origin configuration;
- verify required environment variables/secrets are present in the deployment platform;
- verify build/start commands match the repository;
- verify production build succeeds;
- verify API health/readiness if applicable;
- verify external callbacks/services use reachable URLs rather than localhost;
- verify the deployment can be exercised without the developer's personal account unless rules explicitly allow it;
- record the deployed URL and exact verification evidence.

If a hosted deployment is **not** required:
- the repository must still be locally deployable/reproducible from the README;
- run the closest production-like build/start path available;
- do not accept “works only from my currently running dev environment” as deployable.

## 4. Production build verification

Run all relevant production-oriented checks, for example:
- frontend production build;
- backend import/startup;
- database/schema initialization or migration if used;
- static/lint/type checks that are part of the supported workflow;
- required artifact generation.

Do not add new heavyweight tooling during finalization unless needed to satisfy a hard requirement.

## 5. Primary demo flow

Run the exact flow you intend to show judges from beginning to end.

Verify:
- initial state;
- main input/import;
- core AI/analysis action;
- result/evidence;
- follow-up/detail interaction;
- recovery from the most likely demo failure.

Use actual rendered UI/browser verification where applicable.

## 6. Automated and contract checks

Run the relevant automated tests.

Also verify challenge-critical behavior that tests may miss:
- boundary conditions;
- deterministic calculations;
- structured output contracts;
- external API failure handling;
- missing/invalid input;
- security-sensitive or authorization paths if applicable.

Do not claim PASS without observed output.

## 7. README deployment/run instructions

The README must contain, as applicable:

- prerequisites and supported versions;
- exact install commands;
- exact environment setup;
- `.env.example` or a complete variable list with descriptions;
- backend start command;
- frontend start/build command;
- database/bootstrap command;
- test commands;
- production build/deploy command or deployment URL;
- sample/test credentials only if allowed and safe;
- external-service setup required for judges;
- known limitations that materially affect evaluation.

Every command should be copy-pasteable from the documented working directory.

## 8. Judge-verifiable external services

For every required external service:
- confirm it is reachable;
- confirm credentials/access strategy complies with event rules;
- avoid dependencies on a personal interactive login where judges cannot reproduce it;
- provide a test path, fallback, or clearly documented verification method when required.

## 9. Repository hygiene

Check:
- `git status`;
- final `git diff`;
- secrets/API keys;
- absolute local paths;
- debug-only flags;
- dead buttons/routes;
- task-critical TODO/FIXME markers;
- generated junk or large accidental files;
- misleading fake/demo data;
- uncommitted submission-critical changes.

Record the latest known-good commit SHA.

## 10. Final handoff

Update the final handoff with:

- challenge requirements checklist;
- changed file paths;
- latest known-good commit;
- exact run/deploy commands;
- deployment URL if applicable;
- tests/builds observed;
- demo flow observed;
- remaining known limitations;
- any judge credentials/access instructions permitted by the rules.

## 11. Freeze discipline

After the final clean run:
- only fix submission blockers or clear demo defects;
- re-run the affected validation after every late fix;
- avoid architecture changes, dependency churn, and cosmetic redesigns;
- keep a known-good commit available.

A submission is not ready because the code “looks done.” It is ready when a judge can run or access it using the documented path and the primary demo flow has been observed working.
