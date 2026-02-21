import { GameOfLifeComponent } from './game-of-life.component';

describe('GameOfLifeComponent ADA onboarding wiring', () => {
  type RuntimeStub = {
    closeFirstLoadWarning: jasmine.Spy;
  };

  type AdaServiceStub = {
    setAdaCompliance: jasmine.Spy;
  };

  function createComponent() {
    const runtime: RuntimeStub = {
      closeFirstLoadWarning: jasmine.createSpy('closeFirstLoadWarning')
    };
    const adaService: AdaServiceStub = {
      setAdaCompliance: jasmine.createSpy('setAdaCompliance')
    };

    const component = new GameOfLifeComponent(
      {} as any, // tools
      runtime as any,
      {} as any, // model
      {} as any, // dialog
      {} as any, // auth
      {} as any, // shapesCatalog
      {} as any, // gridsCatalog
      adaService as any,
      {} as any, // shapeImport
      {} as any, // scriptsCatalog
      {} as any, // scriptPlayground
      {} as any, // shortcuts
      {} as any, // simulationColorSchemes
      { run: (fn: () => any) => fn(), runOutsideAngular: (fn: () => any) => fn() } as any
    );

    return { component, runtime, adaService };
  }

  it('delegates onboarding ADA toggle to the shared ADA service', () => {
    const { component, adaService } = createComponent();

    component.setAdaComplianceFromOnboarding(false);
    component.setAdaComplianceFromOnboarding(true);

    expect(adaService.setAdaCompliance).toHaveBeenCalledTimes(2);
    expect(adaService.setAdaCompliance).toHaveBeenCalledWith(false);
    expect(adaService.setAdaCompliance).toHaveBeenCalledWith(true);
  });

  it('delegates onboarding close action to runtime state', () => {
    const { component, runtime } = createComponent();

    component.closeFirstLoadWarning();

    expect(runtime.closeFirstLoadWarning).toHaveBeenCalled();
  });

  it('enables ADA for safe defaults', () => {
    const { component, adaService } = createComponent();

    component.applySafeVisualCaps();

    expect(adaService.setAdaCompliance).toHaveBeenCalledWith(true);
    expect(component.photoTestResult).toContain('ADA mode enabled');
  });
});
