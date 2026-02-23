import { GameOfLifeComponent } from './game-of-life.component';

describe('GameOfLifeComponent privacy policy text', () => {
  function createComponent() {
    return new GameOfLifeComponent(
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
  }

  it('uses current dates and PayPal-only support payment language', () => {
    const component = createComponent();
    const text = component.privacyPolicyText;

    expect(text).toContain('Published: February 22, 2026');
    expect(text).toContain('Last Updated: February 22, 2026');
    expect(text).toContain('effective as of February 22, 2026');
    expect(text).toContain('PayPal transaction identifiers and payer email confirmation');
    expect(text).toContain('Use the Support actions (heart icon/menu) to open the PayPal checkout flow');
    expect(text).toContain('Support Request URL: /requestsupport');
    expect(text).toContain('Support Purchase URL: /support');
    expect(text).not.toContain('Stripe');
  });
});
