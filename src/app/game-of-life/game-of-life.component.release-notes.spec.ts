import { GameOfLifeComponent } from './game-of-life.component';

describe('GameOfLifeComponent release notes dialog', () => {
  function createComponent() {
    const component = new GameOfLifeComponent(
      {} as any, // tools
      {} as any, // runtime
      {} as any, // model
      {} as any, // dialog
      {} as any, // auth
      {} as any, // shapesCatalog
      {} as any, // gridsCatalog
      {} as any, // adaService
      {} as any, // shapeImport
      {} as any, // scriptsCatalog
      {} as any, // scriptPlayground
      {} as any, // shortcuts
      {} as any, // simulationColorSchemes
      { open: () => ({ dismiss: () => {} }) } as any, // snackBar
      {} as any // ngZone
    );
    return component;
  }

  it('opens and closes the release notes dialog', () => {
    const component = createComponent();
    component.showReleaseNotesDialog = false;

    component.openReleaseNotesDialog();
    expect(component.showReleaseNotesDialog).toBeTrue();

    component.closeReleaseNotesDialog();
    expect(component.showReleaseNotesDialog).toBeFalse();
  });

  it('includes commit-by-commit release notes metadata', () => {
    const component = createComponent();

    expect(component.releaseNotesText).toContain('Release Tag: gol-angular/v1.0.5');
    expect(component.releaseNotesText).toContain('Compared To: v1.0.4');
    expect(component.releaseNotesText).toContain('COMMIT-BY-COMMIT BREAKDOWN');
  });
});
