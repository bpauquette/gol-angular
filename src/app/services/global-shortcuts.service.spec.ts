import { GlobalShortcutsService } from './global-shortcuts.service';

describe('GlobalShortcutsService', () => {
  let service: GlobalShortcutsService;

  beforeEach(() => {
    service = new GlobalShortcutsService();
  });

  function fireKey(key: string) {
    const event = new KeyboardEvent('keydown', { key });
    Object.defineProperty(event, 'target', {
      value: document.body,
      configurable: true
    });
    window.dispatchEvent(event);
  }

  it('maps H to Focus Mode toggle', () => {
    const toggleChrome = jasmine.createSpy('toggleChrome');
    const toggleOptions = jasmine.createSpy('toggleOptions');
    const unregister = service.register({
      toggleChrome,
      toggleOptions
    });

    fireKey('h');

    expect(toggleChrome).toHaveBeenCalledTimes(1);
    expect(toggleOptions).not.toHaveBeenCalled();
    unregister();
  });

  it('maps O to options toggle', () => {
    const toggleChrome = jasmine.createSpy('toggleChrome');
    const toggleOptions = jasmine.createSpy('toggleOptions');
    const unregister = service.register({
      toggleChrome,
      toggleOptions
    });

    fireKey('o');

    expect(toggleOptions).toHaveBeenCalledTimes(1);
    expect(toggleChrome).not.toHaveBeenCalled();
    unregister();
  });
});
