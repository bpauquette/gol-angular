# gol-angular

This project is an Angular port of the game-of-life React app. It aims to duplicate the functionality and screens as closely as possible, including ADA compliance logic and UI consistency.

## Key Architectural Decisions

- **Angular Material** is used for UI consistency with the original React/MUI app.
- **Global ADA Compliance State** is managed via an Angular service (`AdaComplianceService`) and injected where needed.
- **Component Structure**:
  - `GameOfLifeComponent`: Main app shell and controller.
  - `OptionsPanelComponent`: Settings dialog, ADA toggle, and performance controls.
  - `RunControlGroupComponent`: Start/stop controls, ADA dialog logic.
  - `AdaDialogComponent`: Modal dialog for ADA compliance explanations.
- **State Management**: Angular services and RxJS subjects are used for global state and reactivity.
- **Routing**: Not used; all screens are single-page for parity with the React app.
- **Testing**: Angular's built-in testing tools are recommended.

## Migration Notes

- All screens and controls are kept visually and functionally consistent with the React app.
- ADA compliance logic is enforced at the service and component level.
- Performance and interaction settings are ported as Angular Material controls.

## Setup

1. Install dependencies:
   ```bash
   cd gol-angular
   npm install
   ```
2. Run the app:
   ```bash
   ng serve
   ```

## Next Steps
- Implement main components and services.
- Port core logic and UI from React to Angular.
- Ensure ADA compliance and dialog logic matches original.

---

For questions or further migration details, see the original game-of-life React app or contact maintainers.