import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { OptionsPanelComponent } from './options-panel.component';
import { AdaComplianceService } from '../services/ada-compliance.service';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatCardModule } from '@angular/material/card';
import { GameRuntimeService } from '../services/game-runtime.service';
import { ThemeService } from '../services/theme.service';
import { SimulationColorSchemeService } from '../services/simulation-color-scheme.service';

class RuntimeMock {
  detectStablePopulation$ = new BehaviorSubject<boolean>(false);
  showSpeedGauge$ = new BehaviorSubject<boolean>(true);
  performanceCaps$ = new BehaviorSubject({ maxFPS: 60, maxGPS: 30, enableFPSCap: false, enableGPSCap: false });
  maxChartGenerations$ = new BehaviorSubject<number>(5000);
  popWindowSize$ = new BehaviorSubject<number>(50);
  popTolerance$ = new BehaviorSubject<number>(0);
  setDetectStablePopulation() {}
  setShowSpeedGauge() {}
  setMaxFPS() {}
  setMaxGPS() {}
  setEnableFPSCap() {}
  setEnableGPSCap() {}
  setMaxChartGenerations() {}
  setPopWindowSize() {}
  setPopTolerance() {}
}

class ThemeMock {
  availableThemes = [{ id: 'dark', label: 'Dark' }] as any;
  currentTheme = 'dark' as any;
  theme$ = new BehaviorSubject<any>('dark');
  setTheme() {}
}

class SimulationColorSchemeMock {
  availableSchemes = [
    { id: 'biolife', label: 'BioLife', description: '', cellColor: '#7CFF7C', backgroundColor: '#041D38', borderColor: '#1B2B40' },
    { id: 'adaSafe', label: 'ADA Safe', description: '', cellColor: '#59666F', backgroundColor: '#2A333A', borderColor: '#44515A' }
  ] as any;
  selectedSchemeId$ = new BehaviorSubject<any>('biolife');
  currentSchemeId = 'biolife' as any;
  setScheme() {}
}

describe('OptionsPanelComponent', () => {
  let component: OptionsPanelComponent;
  let fixture: ComponentFixture<OptionsPanelComponent>;
  let adaService: AdaComplianceService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ OptionsPanelComponent ],
      imports: [ MatCheckboxModule, MatCardModule ],
      providers: [
        AdaComplianceService,
        { provide: GameRuntimeService, useClass: RuntimeMock },
        { provide: ThemeService, useClass: ThemeMock },
        { provide: SimulationColorSchemeService, useClass: SimulationColorSchemeMock }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(OptionsPanelComponent);
    component = fixture.componentInstance;
    adaService = TestBed.inject(AdaComplianceService);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should toggle ADA compliance', () => {
    component.toggleAdaCompliance({ checked: true });
    expect(component.adaCompliance).toBe(true);
    component.toggleAdaCompliance({ checked: false });
    expect(component.showAdaLiabilityDialog).toBe(true);
  });

  it('should keep ADA enabled when liability dialog is canceled', () => {
    component.adaCompliance = true;
    component.toggleAdaCompliance({ checked: false });
    expect(component.showAdaLiabilityDialog).toBe(true);

    component.cancelDisableAda();
    expect(component.showAdaLiabilityDialog).toBe(false);
    expect(component.liabilityAccepted).toBe(false);
  });

  it('should keep ADA checkbox synced with shared state through rapid changes', () => {
    adaService.setAdaCompliance(false);
    expect(component.adaCompliance).toBe(false);

    adaService.setAdaCompliance(true);
    adaService.setAdaCompliance(false);
    adaService.setAdaCompliance(true);

    expect(component.adaCompliance).toBe(true);
  });

  it('should only disable ADA after explicit liability confirmation', () => {
    adaService.setAdaCompliance(true);
    component.toggleAdaCompliance({ checked: false });
    expect(component.showAdaLiabilityDialog).toBe(true);

    component.confirmDisableAda();
    expect(component.adaCompliance).toBe(true);

    component.liabilityAccepted = true;
    component.confirmDisableAda();
    expect(component.adaCompliance).toBe(false);
    expect(component.showAdaLiabilityDialog).toBe(false);
  });
});
