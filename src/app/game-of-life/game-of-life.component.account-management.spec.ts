import { GameOfLifeComponent } from './game-of-life.component';

describe('GameOfLifeComponent account management', () => {
  function createComponent(authOverrides: Partial<any> = {}) {
    const auth = {
      isLoggedIn: true,
      email: 'user@example.com',
      hasSupportAccess$: { subscribe: () => ({ unsubscribe: () => {} }) },
      email$: { subscribe: () => ({ unsubscribe: () => {} }) },
      token$: { subscribe: () => ({ unsubscribe: () => {} }) },
      refreshMe: jasmine.createSpy('refreshMe').and.resolveTo(undefined),
      getAccountDeletionStatus: jasmine.createSpy('getAccountDeletionStatus').and.resolveTo({
        deletionScheduled: false,
        deletionDate: null,
        daysRemaining: null
      }),
      exportAccountData: jasmine.createSpy('exportAccountData').and.resolveTo({ shapes: [] }),
      scheduleAccountDeletion: jasmine.createSpy('scheduleAccountDeletion').and.resolveTo({
        success: true,
        deletionDate: '2026-03-22T00:00:00.000Z'
      }),
      cancelAccountDeletion: jasmine.createSpy('cancelAccountDeletion').and.resolveTo({ success: true }),
      logout: jasmine.createSpy('logout'),
      getBackendApiBase: jasmine.createSpy('getBackendApiBase').and.returnValue('https://backend-blue.localhost/api'),
      ...authOverrides
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

  it('opens account dialog and loads deletion status', async () => {
    const { component, auth } = createComponent({
      getAccountDeletionStatus: jasmine.createSpy('getAccountDeletionStatus').and.resolveTo({
        deletionScheduled: true,
        deletionDate: '2026-03-22T00:00:00.000Z',
        daysRemaining: 28
      })
    });

    component.openAccountDialog();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(component.showAccountDialog).toBeTrue();
    expect(auth.refreshMe).toHaveBeenCalled();
    expect(auth.getAccountDeletionStatus).toHaveBeenCalled();
    expect(component.accountDeletionScheduled).toBeTrue();
    expect(component.accountDeletionDate).toBe('2026-03-22T00:00:00.000Z');
    expect(component.accountDeletionDaysRemaining).toBe(28);
  });

  it('schedules account deletion through auth service', async () => {
    const { component, auth } = createComponent({
      getAccountDeletionStatus: jasmine.createSpy('getAccountDeletionStatus').and.resolveTo({
        deletionScheduled: true,
        deletionDate: '2026-03-22T00:00:00.000Z',
        daysRemaining: 28
      })
    });

    await component.scheduleMyAccountDeletion();

    expect(auth.scheduleAccountDeletion).toHaveBeenCalledWith(30);
    expect(auth.getAccountDeletionStatus).toHaveBeenCalled();
    expect(component.accountDeletionScheduled).toBeTrue();
    expect(component.accountDialogSuccess).toContain('Account deletion scheduled');
  });
});

