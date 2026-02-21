import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatCardModule } from '@angular/material/card';
import { OptionsPanelComponent } from './options-panel.component';
import { AdaComplianceService } from '../services/ada-compliance.service';
import { GameRuntimeService } from '../services/game-runtime.service';
import { ThemeService } from '../services/theme.service';
import { SimulationColorSchemeService } from '../services/simulation-color-scheme.service';

class RuntimeMock {
  detectStablePopulation$ = new BehaviorSubject<boolean>(false);
  performanceCaps$ = new BehaviorSubject({ maxFPS: 60, maxGPS: 30, enableFPSCap: false, enableGPSCap: false });
  maxChartGenerations$ = new BehaviorSubject<number>(5000);
  popWindowSize$ = new BehaviorSubject<number>(50);
  popTolerance$ = new BehaviorSubject<number>(0);
  setDetectStablePopulation = jasmine.createSpy('setDetectStablePopulation');
  setMaxFPS = jasmine.createSpy('setMaxFPS');
  setMaxGPS = jasmine.createSpy('setMaxGPS');
  setEnableFPSCap = jasmine.createSpy('setEnableFPSCap');
  setEnableGPSCap = jasmine.createSpy('setEnableGPSCap');
  setMaxChartGenerations = jasmine.createSpy('setMaxChartGenerations');
  setPopWindowSize = jasmine.createSpy('setPopWindowSize');
  setPopTolerance = jasmine.createSpy('setPopTolerance');
  replayFirstLoadWarning = jasmine.createSpy('replayFirstLoadWarning');
  setOptionsOpen = jasmine.createSpy('setOptionsOpen');
}

class ThemeMock {
  availableThemes = [{ id: 'dark', label: 'Dark' }] as any;
  currentTheme = 'dark' as any;
  theme$ = new BehaviorSubject<any>('dark');
  setTheme = jasmine.createSpy('setTheme');
}

class SimulationColorSchemeMock {
  availableSchemes = [
    { id: 'biolife', label: 'BioLife', description: '', cellColor: '#7CFF7C', backgroundColor: '#041D38', borderColor: '#1B2B40' },
    { id: 'adaSafe', label: 'ADA Safe', description: '', cellColor: '#59666F', backgroundColor: '#2A333A', borderColor: '#44515A' }
  ] as any;
  selectedSchemeId$ = new BehaviorSubject<any>('biolife');
  currentSchemeId = 'biolife' as any;
  setScheme = jasmine.createSpy('setScheme');
}

describe('OptionsPanelComponent', () => {
  let component: OptionsPanelComponent;
  let fixture: ComponentFixture<OptionsPanelComponent>;
  let adaService: AdaComplianceService;
  let runtime: RuntimeMock;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [OptionsPanelComponent],
      imports: [MatCheckboxModule, MatCardModule],
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
    runtime = TestBed.inject(GameRuntimeService) as unknown as RuntimeMock;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should delegate ADA checkbox changes to shared ADA service', () => {
    spyOn(adaService, 'setAdaCompliance').and.callThrough();

    component.toggleAdaCompliance({ checked: false });
    component.toggleAdaCompliance({ checked: true });

    expect(adaService.setAdaCompliance).toHaveBeenCalledWith(false);
    expect(adaService.setAdaCompliance).toHaveBeenCalledWith(true);
  });

  it('should keep ADA checkbox synced with shared state through rapid changes', () => {
    adaService.setAdaCompliance(false);
    expect(component.adaCompliance).toBe(false);

    adaService.setAdaCompliance(true);
    adaService.setAdaCompliance(false);
    adaService.setAdaCompliance(true);

    expect(component.adaCompliance).toBe(true);
  });

  it('should reset privacy controls by replaying onboarding and closing options', () => {
    component.resetPrivacyControls();

    expect(runtime.replayFirstLoadWarning).toHaveBeenCalled();
    expect(runtime.setOptionsOpen).toHaveBeenCalledWith(false);
  });
});
