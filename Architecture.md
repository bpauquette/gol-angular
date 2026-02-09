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
