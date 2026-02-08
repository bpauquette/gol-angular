import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { EngineMode } from '../model/game-model.service';

export type HashlifeRunMode = 'explore' | 'cruise' | 'warp';

export interface HashlifeRunModeConfig {
  id: HashlifeRunMode;
  label: string;
  description: string;
  minExponent: number;
  maxExponent: number;
  defaultExponent: number;
  renderFps: number;
}

export interface HashlifeTelemetry {
  workerElapsedMs: number;
  effectiveBatchSize: number;
  advancedSinceRender: number;
  workerUsed: boolean;
}

const MODE_CONFIGS: Record<HashlifeRunMode, HashlifeRunModeConfig> = {
  explore: {
    id: 'explore',
    label: 'Explore',
    description: 'Smaller jumps with frequent redraws for inspection.',
    minExponent: 0,
    maxExponent: 9,
    defaultExponent: 4, // 16
    renderFps: 30
  },
  cruise: {
    id: 'cruise',
    label: 'Cruise',
    description: 'Balanced speed and readability for general runs.',
    minExponent: 2,
    maxExponent: 12,
    defaultExponent: 7, // 128
    renderFps: 20
  },
  warp: {
    id: 'warp',
    label: 'Warp',
    description: 'Large generation jumps and sparse redraws for long leaps.',
    minExponent: 6,
    maxExponent: 15,
    defaultExponent: 11, // 2048
    renderFps: 8
  }
};

@Injectable({ providedIn: 'root' })
export class HashlifeObservatoryService {
  readonly availableModes = Object.values(MODE_CONFIGS);

  private runModeSubject = new BehaviorSubject<HashlifeRunMode>('cruise');
  readonly runMode$ = this.runModeSubject.asObservable();

  private skipExponentSubject = new BehaviorSubject<number>(MODE_CONFIGS.cruise.defaultExponent);
  readonly skipExponent$ = this.skipExponentSubject.asObservable();

  private telemetrySubject = new BehaviorSubject<HashlifeTelemetry>({
    workerElapsedMs: 0,
    effectiveBatchSize: 1,
    advancedSinceRender: 0,
    workerUsed: true
  });
  readonly telemetry$ = this.telemetrySubject.asObservable();

  setRunMode(mode: HashlifeRunMode | string) {
    const normalized = normalizeMode(mode);
    this.runModeSubject.next(normalized);
    const config = MODE_CONFIGS[normalized];
    const clamped = clampExponent(this.skipExponentSubject.value, config);
    this.skipExponentSubject.next(clamped);
  }

  setSkipExponent(value: number) {
    const config = MODE_CONFIGS[this.runModeSubject.value];
    const next = clampExponent(value, config);
    this.skipExponentSubject.next(next);
  }

  getRunMode() {
    return this.runModeSubject.value;
  }

  getRunModeConfig(mode: HashlifeRunMode = this.runModeSubject.value) {
    return MODE_CONFIGS[mode];
  }

  getSkipExponent() {
    return this.skipExponentSubject.value;
  }

  getBatchSize(engineMode: EngineMode) {
    if (engineMode !== 'hashlife') return 1;
    const exponent = this.skipExponentSubject.value;
    return Math.max(1, Math.min(32768, Math.pow(2, exponent)));
  }

  getRenderIntervalMs(engineMode: EngineMode) {
    if (engineMode !== 'hashlife') return Math.floor(1000 / 60);
    const fps = this.getRunModeConfig().renderFps;
    return Math.max(1, Math.floor(1000 / fps));
  }

  recordTelemetry(partial: Partial<HashlifeTelemetry>) {
    this.telemetrySubject.next({
      ...this.telemetrySubject.value,
      ...partial
    });
  }
}

function normalizeMode(mode: string): HashlifeRunMode {
  if (mode === 'explore' || mode === 'cruise' || mode === 'warp') return mode;
  return 'cruise';
}

function clampExponent(value: number, config: HashlifeRunModeConfig) {
  const normalized = Math.floor(Number(value));
  if (!Number.isFinite(normalized)) return config.defaultExponent;
  return Math.max(config.minExponent, Math.min(config.maxExponent, normalized));
}
