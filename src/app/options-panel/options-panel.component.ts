import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { AdaComplianceService } from '../services/ada-compliance.service';
import { GameRuntimeService, PerformanceCaps } from '../services/game-runtime.service';
import { ThemeOption, ThemeService, ThemeId } from '../services/theme.service';
import {
  SimulationColorScheme,
  SimulationColorSchemeId,
  SimulationColorSchemeService
} from '../services/simulation-color-scheme.service';

@Component({
  selector: 'app-options-panel',
  templateUrl: './options-panel.component.html',
  styleUrls: ['./options-panel.component.css']
})
export class OptionsPanelComponent implements OnInit, OnDestroy {
  adaCompliance = true;
  detectStablePopulation = false;
  performanceCaps: PerformanceCaps = { maxFPS: 60, maxGPS: 30, enableFPSCap: false, enableGPSCap: false };
  maxChartGenerations = 5000;
  popWindowSize = 50;
  popTolerance = 0;
  currentTheme: ThemeId = 'dark';
  availableThemes: ThemeOption[] = [];
  currentSimulationColorSchemeId: SimulationColorSchemeId = 'biolife';
  availableSimulationColorSchemes: SimulationColorScheme[] = [];
  showAdaLiabilityDialog = false;
  liabilityAccepted = false;

  private subscriptions = new Subscription();

  constructor(
    private adaService: AdaComplianceService,
    private runtime: GameRuntimeService,
    private themeService: ThemeService,
    private simulationColorSchemes: SimulationColorSchemeService
  ) {}

  ngOnInit() {
    this.availableThemes = this.themeService.availableThemes;
    this.currentTheme = this.themeService.currentTheme;
    this.availableSimulationColorSchemes = this.simulationColorSchemes.availableSchemes;
    this.currentSimulationColorSchemeId = this.simulationColorSchemes.currentSchemeId;
    this.subscriptions.add(this.adaService.adaCompliance$.subscribe(val => this.adaCompliance = val));
    this.subscriptions.add(this.runtime.detectStablePopulation$.subscribe(val => this.detectStablePopulation = val));
    this.subscriptions.add(this.runtime.performanceCaps$.subscribe(val => this.performanceCaps = val));
    this.subscriptions.add(this.runtime.maxChartGenerations$.subscribe(val => this.maxChartGenerations = val));
    this.subscriptions.add(this.runtime.popWindowSize$.subscribe(val => this.popWindowSize = val));
    this.subscriptions.add(this.runtime.popTolerance$.subscribe(val => this.popTolerance = val));
    this.subscriptions.add(this.themeService.theme$.subscribe(theme => this.currentTheme = theme));
    this.subscriptions.add(
      this.simulationColorSchemes.selectedSchemeId$.subscribe(id => this.currentSimulationColorSchemeId = id)
    );
  }

  ngOnDestroy() {
    this.subscriptions.unsubscribe();
  }

  toggleAdaCompliance(event: any) {
    const requested = !!event.checked;
    if (requested) {
      this.showAdaLiabilityDialog = false;
      this.liabilityAccepted = false;
      this.adaService.setAdaCompliance(true);
      return;
    }

    this.liabilityAccepted = false;
    this.showAdaLiabilityDialog = true;
  }

  toggleDetectStablePopulation(event: any) {
    this.runtime.setDetectStablePopulation(!!event.checked);
  }

  updateMaxFPS(value: any) {
    this.runtime.setMaxFPS(Number(value));
  }

  updateMaxGPS(value: any) {
    this.runtime.setMaxGPS(Number(value));
  }

  toggleEnableFPSCap(event: any) {
    this.runtime.setEnableFPSCap(!!event.checked);
  }

  toggleEnableGPSCap(event: any) {
    this.runtime.setEnableGPSCap(!!event.checked);
  }

  updateMaxChartGenerations(value: any) {
    this.runtime.setMaxChartGenerations(Number(value));
  }

  updatePopWindowSize(value: any) {
    this.runtime.setPopWindowSize(Number(value));
  }

  updatePopTolerance(value: any) {
    this.runtime.setPopTolerance(Number(value));
  }

  onThemeChange(theme: ThemeId) {
    this.themeService.setTheme(theme);
  }

  onSimulationColorSchemeChange(schemeId: SimulationColorSchemeId) {
    this.simulationColorSchemes.setScheme(schemeId);
  }

  cancelDisableAda() {
    this.showAdaLiabilityDialog = false;
    this.liabilityAccepted = false;
  }

  confirmDisableAda() {
    if (!this.liabilityAccepted) return;
    this.adaService.setAdaCompliance(false);
    this.showAdaLiabilityDialog = false;
    this.liabilityAccepted = false;
  }
}
