import { HashlifeObservatoryService } from './hashlife-observatory.service';

describe('HashlifeObservatoryService', () => {
  let service: HashlifeObservatoryService;

  beforeEach(() => {
    service = new HashlifeObservatoryService();
  });

  it('defaults to cruise mode with power-of-two batching', () => {
    expect(service.getRunMode()).toBe('cruise');
    expect(service.getBatchSize('hashlife')).toBe(Math.pow(2, service.getSkipExponent()));
  });

  it('clamps exponent by mode bounds', () => {
    service.setRunMode('explore');
    service.setSkipExponent(99);
    expect(service.getSkipExponent()).toBeLessThanOrEqual(service.getRunModeConfig().maxExponent);

    service.setRunMode('warp');
    service.setSkipExponent(-50);
    expect(service.getSkipExponent()).toBeGreaterThanOrEqual(service.getRunModeConfig().minExponent);
  });

  it('uses single-step batch outside hashlife', () => {
    service.setSkipExponent(10);
    expect(service.getBatchSize('normal')).toBe(1);
  });
});
