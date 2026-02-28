import { GameOfLifeComponent } from './game-of-life.component';

describe('GameOfLifeComponent LifeWiki launch behavior', () => {
  type SnackBarStub = {
    open: jasmine.Spy;
  };

  function createComponent() {
    const snackBar: SnackBarStub = {
      open: jasmine.createSpy('open').and.returnValue({ dismiss: () => {} } as any)
    };

    const component = new GameOfLifeComponent(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      snackBar as any,
      {} as any
    );

    return { component, snackBar };
  }

  it('opens LifeWiki in a new tab and does not replace current tab when popup is blocked', () => {
    const { component, snackBar } = createComponent();
    const originalHref = window.location.href;
    spyOn(window, 'open').and.returnValue(null);

    component.openLifeWiki();

    expect(window.open).toHaveBeenCalledWith(
      'https://conwaylife.com/wiki/Main_Page',
      '_blank',
      'noopener,noreferrer'
    );
    expect(window.location.href).toBe(originalHref);
    expect(snackBar.open).toHaveBeenCalled();
  });

  it('does not show popup warning when a new tab opens successfully', () => {
    const { component, snackBar } = createComponent();
    spyOn(window, 'open').and.returnValue({} as Window);

    component.openLifeWiki();

    expect(snackBar.open).not.toHaveBeenCalled();
  });
});
