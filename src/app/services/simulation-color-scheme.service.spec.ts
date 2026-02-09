import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { skip, take } from 'rxjs/operators';
import { AdaComplianceService } from './ada-compliance.service';
import { SimulationColorSchemeService } from './simulation-color-scheme.service';

describe('SimulationColorSchemeService', () => {
  let service: SimulationColorSchemeService;
  let adaService: AdaComplianceService;

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('gol.adaCompliance', 'false');
    TestBed.configureTestingModule({
      providers: [SimulationColorSchemeService, AdaComplianceService]
    });
    service = TestBed.inject(SimulationColorSchemeService);
    adaService = TestBed.inject(AdaComplianceService);
  });

  it('defaults to BioLife when no persisted value exists', () => {
    expect(service.currentSchemeId).toBe('biolife');
    expect(service.currentScheme.label).toBe('BioLife');
  });

  it('switches schemes while ADA mode is off', () => {
    service.setScheme('neonCircuit');
    expect(service.currentSchemeId).toBe('neonCircuit');
    expect(service.currentScheme.label).toBe('Neon Circuit');
  });

  it('forces ADA Safe when ADA mode is enabled', async () => {
    service.setScheme('retroVector');
    expect(service.currentSchemeId).toBe('retroVector');

    const nextScheme = firstValueFrom(service.selectedSchemeId$.pipe(skip(1), take(1)));
    adaService.setAdaCompliance(true);

    expect(await nextScheme).toBe('adaSafe');
    expect(service.currentSchemeId).toBe('adaSafe');
  });

  it('blocks non-ADA scheme selection while ADA mode is enabled', () => {
    adaService.setAdaCompliance(true);
    service.setScheme('emberField');
    expect(service.currentSchemeId).toBe('adaSafe');
  });

  it('restores previous non-ADA scheme after ADA mode is disabled', () => {
    service.setScheme('aurora');
    adaService.setAdaCompliance(true);
    expect(service.currentSchemeId).toBe('adaSafe');

    adaService.setAdaCompliance(false);
    expect(service.currentSchemeId).toBe('aurora');
  });
});
