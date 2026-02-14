# Script Engine Contract

This document defines required behavior for the script interpreter and Game of Life runtime.

## Requirements

1. Single writer ownership
- While a script run is active, the interpreter is the only writer of world state.
- Runtime autoplay and user edit tools must not mutate world state during script execution.

2. Runtime handoff model
- Runtime is paused before script start.
- Script `START` and `STOP` are deferred intent markers, not immediate runtime toggles.
- After script completion:
  - `START` intent => runtime running
  - `STOP` intent => runtime paused
  - no intent => restore pre-script runtime state

3. Deterministic execution
- Script source is parsed into block structure before execution.
- Commands execute in source order with explicit control-flow boundaries.
- Interpreter state (variables, cursor, pen, cells) is explicit and isolated.

4. Simulation stepping semantics
- `STEP n` advances exactly `n` generations.
- `UNTIL_STEADY var maxSteps` advances at most `maxSteps` generations.
- `UNTIL_STEADY` uses exact full-state cycle detection over visited states in the local run window.

5. Rendering sync contract
- Draw commands that mutate many cells (`RECT`, `CLEAR`) sync at command boundary.
- Simulation commands sync per generation step (`STEP`, `UNTIL_STEADY`).
- UI HUD receives progress events with line/action/percent/elapsed/ops.

6. Safety and cancellation
- Cancellation checks occur at command and step boundaries.
- On cancel/error, execution stops at a consistent boundary.
- Last valid model state is preserved and synced.

7. Observability
- Each run has a stable `runId`.
- Progress and logs include enough information to reconstruct where execution paused or failed.

## Applied Language/Compiler Ideas

- Parse/execute separation (front-end vs execution phase) reduces ambiguous runtime behavior.
- Small-step semantics for simulation operations creates testable, predictable stepping.
- Explicit machine-state transitions avoid hidden side effects from script keywords.

References:

- SICP JavaScript adaptation (evaluator structure): https://sicp.sourceacademy.org/chapters/4.1.html
- Stanford CS242 operational semantics notes: https://stanford-cs242.github.io/f19/lectures/01-1-operational-semantics.html
- Crafting Interpreters (tree-walk interpreter model): https://craftinginterpreters.com/a-tree-walk-interpreter.html
