import { GameOfLifeComponent } from './game-of-life.component';

describe('GameOfLifeComponent support request dialog', () => {
  function createComponent(overrides: any = {}) {
    const auth = {
      isLoggedIn: false,
      getBackendApiBase: jasmine.createSpy('getBackendApiBase').and.returnValue('https://backend-blue.localhost/api'),
      submitSupportRequest: jasmine.createSpy('submitSupportRequest').and.resolveTo({
        ok: true,
        requestId: 'req-123',
        requestedAt: '2026-02-22T00:00:00.000Z'
      }),
      ...overrides
    };

    const component = new GameOfLifeComponent(
      {} as any, // tools
      {} as any, // runtime
      {} as any, // model
      {} as any, // dialog
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

    return { component, auth };
  }

  it('prefills contact info from logged-in email when opening support request dialog', () => {
    const { component } = createComponent();
    component.authEmail = 'tester@example.com';

    component.openSupportRequestDialog();

    expect(component.showSupportRequestDialog).toBeTrue();
    expect(component.supportRequestContactInfo).toBe('tester@example.com');
    expect(component.supportRequestText).toBe('');
  });

  it('submits support request with required contact info and request text', async () => {
    const { component, auth } = createComponent();
    component.openSupportRequestDialog();
    component.supportRequestContactInfo = 'contact@example.com';
    component.supportRequestText = 'Need help with script editor.';

    await component.submitSupportRequest();

    expect(auth.submitSupportRequest).toHaveBeenCalledWith({
      contactInfo: 'contact@example.com',
      requestText: 'Need help with script editor.'
    });
    expect(component.supportRequestSuccess).toContain('Request submitted.');
    expect(component.supportRequestText).toBe('');
  });
});
