# Architecture Contract (Angular)

This application follows a strict layered architecture for Angular.

## Core Principles

- `AppComponent` is a composition root only.
- Domain logic does not live in Angular templates or UI components.
- Side effects are isolated in services.
- Game behavior flows from model -> runtime services -> UI.
- Shared state uses a single source of truth (RxJS state services), not prop drilling.
- Prefer simple, testable services over large "god components."

## Global Keyboard Shortcuts (UI Policy)

All global UI shortcuts must be handled in one dedicated Angular location:

- Preferred: a `GlobalShortcutsService` wired once by the game shell.
- Acceptable: a single shell-level component handler (`@HostListener('window:keydown')`) that delegates to a service.

Rules:

- Do not place global shortcut logic across multiple nested components.
- Do not mutate model state directly from key handlers.
- Shortcut handlers call runtime/service commands only.
- Ignore shortcuts while typing in `input`, `textarea`, or editable fields.
- When adding or changing shortcuts, update this document.

## Layer Responsibilities

### Model Layer (`src/app/model`)

- Owns Game of Life state and rules.
- Exposes deterministic, testable APIs.
- Contains no Angular framework code, DOM APIs, timers, or network logic.

### Runtime/Controller Layer (`src/app/services`)

- Orchestrates run loop, stepping, engine switching, worker usage, checkpoints, and performance caps.
- Translates UI intent into model operations.
- Owns side effects (timers, workers, persistence, HTTP integration).
- Exposes readonly streams (`Observable`) for UI state and explicit command methods.

### UI State + Facade Services

- Encapsulate feature-level state (catalogs, auth/session, scripting catalog, imports).
- No cross-service business rules inside low-level storage/API wrappers.
- Composition happens in runtime/facade services, not in components.

### View Layer (`src/app/**/components`)

- Render UI and map user actions to service calls.
- Keep logic shallow: formatting, local UI toggles, and event forwarding only.
- Must not:
  - implement game rules
  - manage long-lived orchestration loops
  - reach into model internals

## Shell Component Contract (`GameOfLifeComponent`)

Treat the top-level game shell as controlled and minimal.

- Allowed:
  - compose child components
  - subscribe to readonly state streams
  - delegate commands to services
  - own short-lived UI-only state
- Not allowed:
  - embed engine algorithms
  - duplicate logic already owned by services
  - become a multi-domain "god class"

## Canvas/Input Contract

- Canvas component is an input/render surface only.
- It emits semantic events (`down`, `move`, `up`, `zoom`, `pan`) and renders provided state.
- It does not own simulation state, orchestration, or persistence.

## State Service Rules (DAO Equivalent)

- State services expose data, not cross-domain orchestration.
- Keep write operations explicit and narrow.
- Avoid hidden side effects in getters.
- Non-UI consumers access state through service APIs/adapters, not direct internals.

## Testing Expectations

- Model tests: correctness of rules and transformations.
- Runtime service tests: orchestration, invariants, and side effects.
- Component tests: rendering + event wiring only.
- New behavior should include tests at the layer where the behavior lives.

## Change Checklist

Before merging architecture-impacting work, verify:

- Is domain logic in a service/model instead of a component?
- Are side effects isolated to services?
- Are global shortcuts centralized?
- Are observables exposed readonly to UI?
- Does this increase or reduce coupling?
- Are tests added at the correct layer?

## Script Runtime Contract (2026-02-14)

These rules define how script execution interacts with the simulation engine.

- Single writer rule: when a script is running, the script interpreter exclusively owns world mutation.
- Runtime preemption: runtime loop is paused before script start.
- Deferred run intent: `START` and `STOP` inside scripts record post-run intent and do not switch runtime immediately mid-script.
- UI lock while running: canvas/tool edits and global simulation shortcuts are ignored while script execution is active.
- Deterministic command order: commands execute in source order with structured control flow (`IF`/`WHILE`/`FOR`) from parsed blocks.
- Rendering granularity: world mutations are pushed to runtime sync at command boundaries for draw commands and per-step for simulation commands (`STEP`, `UNTIL_STEADY`).
- Stability semantics: `UNTIL_STEADY` uses exact-state cycle detection within the requested step window and records period metadata.
- Cancel/error guarantees: cancellation is cooperative at command/step boundaries and preserves last valid world state.

Rationale from language/compiler practice:

- Phase separation: parse first, execute second, instead of interleaving parse+execution.
- Small-step operational model: explicit step boundaries for simulation advancement.
- Explicit machine state transitions: interpreter computes intent, runtime applies final machine state.

References used for this contract:

- SICP JavaScript adaptation, metacircular evaluator structure: https://sicp.sourceacademy.org/chapters/4.1.html
- Stanford CS242 operational semantics notes: https://stanford-cs242.github.io/f19/lectures/01-1-operational-semantics.html
- Crafting Interpreters (tree-walk execution model): https://craftinginterpreters.com/a-tree-walk-interpreter.html

## Heuristic Steady-State Detection (Research-Backed Requirements)

This section records requirements derived from published algorithm notes and Life-specific references.
It applies to `UNTIL_STEADY` detection in the script runtime.

### Required Classification Modes

- `still-life`: exact repeat with period 1.
- `oscillator`: exact repeat with period > 1.
- `spaceship`: normalized repeat with translation vector `(dx, dy)` and period > 0.
- `periodic-with-emission`: periodic growth signature (population/area) without global exact repeat.
- `inconclusive`: no confident result within configured budget.

### Detection Rules

- Use exact-state cycle detection for still-life/oscillator detection.
- Use translation-invariant signatures for spaceship detection.
- Require confidence confirmations before declaring a mode (do not trust one-off repeats).
- Track period and displacement for mode metadata.
- Keep a bounded history window to avoid unbounded memory growth.
- Treat emitter/gun-like behavior as distinct from globally steady state.
- When no confident classification is found in budget, return `inconclusive` instead of mislabeling.

### Why This Matters

- Life includes known oscillators, spaceships, and guns, so “steady” cannot mean only “period 1”.
- HashLife is very strong on regular patterns but can degrade on chaotic random soups; detection logic must be robust in both regimes.
- There is no practical fixed small period bound to assume globally; detector behavior must be budget-driven.

### Research and References

- LifeWiki (definitions and canonical classes):
  - Still lifes: https://conwaylife.com/wiki/Still_life
  - Oscillators: https://conwaylife.com/wiki/Oscillator
  - Spaceships: https://conwaylife.com/wiki/Spaceship
  - Guns/emitters: https://conwaylife.com/wiki/Gun
  - Glider periodic translation (period 4, displacement): https://conwaylife.com/wiki/Glider
- Golly HashLife algorithm notes (performance strengths/weaknesses):
  - https://golly.sourceforge.io/Help/Algorithms/HashLife.html
- Cycle-detection algorithms:
  - Brent, “An Improved Monte Carlo Factorization Algorithm” (contains the classic cycle-detection method):
    https://maths-people.anu.edu.au/~brent/pd/rpb051i.pdf
- Existence of arbitrarily large periods in Life:
  - Brown et al., “Omniperiodicity in the B36/S23 Life-like cellular automaton rule”:
    https://arxiv.org/abs/2312.02799
