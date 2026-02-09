import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';
import { AdaComplianceService } from './ada-compliance.service';

const ADA_COMPLIANCE_STORAGE_KEY = 'gol.adaCompliance';

describe('AdaComplianceService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [AdaComplianceService]
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('defaults ADA mode to enabled on first use and persists it', async () => {
    localStorage.removeItem(ADA_COMPLIANCE_STORAGE_KEY);
    const service = TestBed.inject(AdaComplianceService);
    const initial = await firstValueFrom(service.adaCompliance$.pipe(take(1)));

    expect(initial).toBeTrue();
    expect(localStorage.getItem(ADA_COMPLIANCE_STORAGE_KEY)).toBe('true');
  });

  it('respects persisted ADA preference on startup', async () => {
    localStorage.setItem(ADA_COMPLIANCE_STORAGE_KEY, 'false');
    const service = TestBed.inject(AdaComplianceService);
    const initial = await firstValueFrom(service.adaCompliance$.pipe(take(1)));

    expect(initial).toBeFalse();
  });

  it('persists changes when ADA mode is toggled', () => {
    const service = TestBed.inject(AdaComplianceService);
    service.setAdaCompliance(false);
    expect(localStorage.getItem(ADA_COMPLIANCE_STORAGE_KEY)).toBe('false');

    service.setAdaCompliance(true);
    expect(localStorage.getItem(ADA_COMPLIANCE_STORAGE_KEY)).toBe('true');
  });
});
