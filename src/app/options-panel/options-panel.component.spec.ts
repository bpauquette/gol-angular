import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { OptionsPanelComponent } from './options-panel.component';
import { AdaComplianceService } from '../services/ada-compliance.service';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatCardModule } from '@angular/material/card';
import { GameRuntimeService } from '../services/game-runtime.service';
import { ThemeService } from '../services/theme.service';

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

describe('OptionsPanelComponent', () => {
  let component: OptionsPanelComponent;
  let fixture: ComponentFixture<OptionsPanelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ OptionsPanelComponent ],
      imports: [ MatCheckboxModule, MatCardModule ],
      providers: [
        AdaComplianceService,
        { provide: GameRuntimeService, useClass: RuntimeMock },
        { provide: ThemeService, useClass: ThemeMock }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(OptionsPanelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should toggle ADA compliance', () => {
    component.toggleAdaCompliance({ checked: true });
    expect(component.adaCompliance).toBe(true);
    component.toggleAdaCompliance({ checked: false });
    expect(component.adaCompliance).toBe(false);
  });
});
