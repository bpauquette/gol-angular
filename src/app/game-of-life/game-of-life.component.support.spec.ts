import { GameOfLifeComponent } from './game-of-life.component';

describe('GameOfLifeComponent support flow', () => {
  function createComponent() {
    const auth = {
      isLoggedIn: true,
      getPaymentConfig: jasmine.createSpy('getPaymentConfig').and.resolveTo({
        paypal: { enabled: false, clientId: null }
      })
    };
    const dialog = {
      open: jasmine.createSpy('open')
    };

    const component = new GameOfLifeComponent(
      {} as any, // tools
      {} as any, // runtime
      {} as any, // model
      dialog as any, // dialog
      auth as any,
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

    return { component, auth, dialog };
  }

  it('opens in-app support checkout dialog for logged-in users', () => {
    const { component } = createComponent();
    const openSpy = spyOn(window, 'open');

    component.openSupport();

    expect(component.showSupportPaymentDialog).toBeTrue();
    expect(openSpy).not.toHaveBeenCalled();
  });
});

