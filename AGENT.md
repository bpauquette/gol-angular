# Agent Operating Procedure

## Scope
- Work only in this repository unless explicitly told otherwise.
- Keep changes minimal, focused, and reversible.
- Avoid public API or behavior changes unless required by the task.

## Workflow
1. Create a task branch: `codex/<task-name>`.
2. Understand the issue and make a short plan before editing.
3. Implement in small, coherent changes.
4. Run verification commands until green.
5. Summarize what changed, why, risks, and verification results.

## Commands
- Install: `npm install`
- Lint: `npm run lint`
- Build: `npm run build`
- Tests: `npm test`

## Verification Standard
- Run at minimum:
- `npm run build`
- `npm test`
- If behavior changed, add or update tests that prove it.
- Do not finish with failing checks/build/tests.

## Safety Rules
- Do not commit secrets, tokens, or credentials.
- Do not mass-refactor unrelated files during a focused fix.
- If unexpected unrelated file changes appear, stop and ask before proceeding.

## Completion Checklist
- Change is implemented and scoped to the request.
- Verification commands pass.
- Any new behavior is covered by tests.
- Final report includes:
  - files changed
  - commands run
  - outcomes
  - known risks or follow-ups

