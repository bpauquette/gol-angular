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
      { open: () => ({ dismiss: () => {} }) } as any, // snackBar
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

  it('tracks legal-risk acknowledgment state for onboarding', () => {
    const { component } = createComponent();
    expect(component.adaRiskAcknowledged).toBeFalse();

    component.setAdaRiskAcknowledgedFromOnboarding(true);
    expect(component.adaRiskAcknowledged).toBeTrue();

    component.setAdaRiskAcknowledgedFromOnboarding(false);
    expect(component.adaRiskAcknowledged).toBeFalse();
  });

  it('resets legal-risk acknowledgment when onboarding ADA toggle changes', () => {
    const { component } = createComponent();
    component.adaRiskAcknowledged = true;

    component.setAdaComplianceFromOnboarding(false);
    expect(component.adaRiskAcknowledged).toBeFalse();
  });

  it('starts photosensitivity probe immediately when opened from the toolbar flow', () => {
    const { component } = createComponent();
    component.adaCompliance = true;
    spyOn(component, 'runPhotosensitivityProbe').and.returnValue(true);

    component.openPhotosensitivityTest();

    expect(component.runPhotosensitivityProbe).toHaveBeenCalledWith({ showResultsDialogOnComplete: true });
    expect(component.showPhotosensitivityDialog).toBeFalse();
  });

  it('does not allow closing first-load warning via escape before legal acknowledgment', () => {
    const { component, runtime } = createComponent();
    (component as any).showCheckpointNotice = jasmine.createSpy('showCheckpointNotice');
    component.showFirstLoadWarning = true;
    component.adaCompliance = false;
    component.adaRiskAcknowledged = false;

    const handled = (component as any).closeTopmostDialog();

    expect(handled).toBeTrue();
    expect((component as any).showCheckpointNotice).toHaveBeenCalled();
    expect(runtime.closeFirstLoadWarning).not.toHaveBeenCalled();
  });

  it('allows closing first-load warning via escape without legal acknowledgment when ADA is on', () => {
    const { component, runtime } = createComponent();
    component.showFirstLoadWarning = true;
    component.adaCompliance = true;
    component.adaRiskAcknowledged = false;

    const handled = (component as any).closeTopmostDialog();

    expect(handled).toBeTrue();
    expect(runtime.closeFirstLoadWarning).toHaveBeenCalled();
  });
});
