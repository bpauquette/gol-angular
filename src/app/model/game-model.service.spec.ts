import { TestBed } from '@angular/core/testing';
import { AdaComplianceService } from '../services/ada-compliance.service';
import { GameModelService } from './game-model.service';

describe('GameModelService simulation color enforcement', () => {
  let model: GameModelService;
  let ada: AdaComplianceService;

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('gol.adaCompliance', 'false');
    TestBed.configureTestingModule({
      providers: [GameModelService, AdaComplianceService]
    });
    model = TestBed.inject(GameModelService);
    ada = TestBed.inject(AdaComplianceService);
  });

  it('defaults to biolife', () => {
    expect(model.getSimulationColorScheme()).toBe('biolife');
  });

  it('allows non-ADA scheme changes when ADA is off', () => {
    model.setSimulationColorScheme('neonCircuit');
    expect(model.getSimulationColorScheme()).toBe('neonCircuit');
  });

  it('forces ADA Safe scheme when ADA is enabled', () => {
    model.setSimulationColorScheme('retroVector');
    expect(model.getSimulationColorScheme()).toBe('retroVector');

    ada.setAdaCompliance(true);
    expect(model.getSimulationColorScheme()).toBe('adaSafe');
  });

  it('rejects non-ADA scheme changes while ADA is enabled', () => {
    ada.setAdaCompliance(true);
    expect(model.getSimulationColorScheme()).toBe('adaSafe');

    model.setSimulationColorScheme('emberField');
    expect(model.getSimulationColorScheme()).toBe('adaSafe');
  });

  it('restores prior non-ADA scheme when ADA is disabled', () => {
    model.setSimulationColorScheme('aurora');
    ada.setAdaCompliance(true);
    expect(model.getSimulationColorScheme()).toBe('adaSafe');

    ada.setAdaCompliance(false);
    expect(model.getSimulationColorScheme()).toBe('aurora');
  });
});
