import { Injectable, OnDestroy } from '@angular/core';

export interface LoopStepResult {
  elapsedMs: number;
  generationsApplied: number;
}

export interface SimulationLoopConfig {
  getBaseBatchSize: () => number;
  getMaxBatchSize: () => number;
  getRenderIntervalMs: () => number;
  getGenerationIntervalMs: () => number;
  runBatch: (generations: number) => Promise<LoopStepResult | null>;
  onError?: (error: unknown) => void;
}

@Injectable({ providedIn: 'root' })
export class SimulationLoopService implements OnDestroy {
  private config: SimulationLoopConfig | null = null;
  private running = false;
  private inFlight = false;
  private rafId: number | null = null;
  private nextAllowedStepAt = 0;
  private lastRenderFrameAt = 0;
  private adaptiveScale = 1;

  ngOnDestroy() {
    this.stop();
  }

  start(config: SimulationLoopConfig) {
    this.stop();
    this.config = config;
    this.running = true;
    this.nextAllowedStepAt = 0;
    this.lastRenderFrameAt = 0;
    this.adaptiveScale = 1;
    this.scheduleNextFrame();
  }

  stop() {
    this.running = false;
    this.inFlight = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private scheduleNextFrame() {
    if (!this.running) return;
    this.rafId = requestAnimationFrame((timestamp) => this.onFrame(timestamp));
  }

  private onFrame(timestamp: number) {
    if (!this.running || !this.config) return;

    const frameIntervalMs = Math.max(0, this.config.getRenderIntervalMs());
    if (frameIntervalMs > 0 && this.lastRenderFrameAt > 0 && timestamp - this.lastRenderFrameAt < frameIntervalMs) {
      this.scheduleNextFrame();
      return;
    }

    if (this.inFlight) {
      this.scheduleNextFrame();
      return;
    }

    const now = performance.now();
    if (now < this.nextAllowedStepAt) {
      this.scheduleNextFrame();
      return;
    }

    const baseBatch = clamp(Math.floor(this.config.getBaseBatchSize()), 1, 4096);
    const maxBatch = clamp(Math.floor(this.config.getMaxBatchSize()), baseBatch, 4096);
    const desiredBatch = clamp(Math.round(baseBatch * this.adaptiveScale), 1, maxBatch);
    const minGenerationMs = Math.max(0, this.config.getGenerationIntervalMs());

    this.inFlight = true;
    this.lastRenderFrameAt = timestamp;
    if (minGenerationMs > 0) {
      this.nextAllowedStepAt = now + desiredBatch * minGenerationMs;
    }

    const startedAt = performance.now();
    this.config.runBatch(desiredBatch)
      .then((result) => {
        if (!result) return;
        const elapsedMs = Number(result.elapsedMs);
        const measuredMs = Number.isFinite(elapsedMs) ? elapsedMs : (performance.now() - startedAt);
        this.tuneBatchScale(measuredMs);
      })
      .catch((error) => {
        this.adaptiveScale = Math.max(1, this.adaptiveScale * 0.5);
        this.config?.onError?.(error);
      })
      .then(() => {
        this.inFlight = false;
        this.scheduleNextFrame();
      });
  }

  private tuneBatchScale(elapsedMs: number) {
    if (!Number.isFinite(elapsedMs)) return;
    if (elapsedMs >= 18) {
      this.adaptiveScale = Math.max(1, this.adaptiveScale * 0.7);
      return;
    }
    if (elapsedMs <= 6) {
      this.adaptiveScale = Math.min(8, this.adaptiveScale * 1.18);
    }
  }
}

function clamp(value: number, min: number, max: number) {
  const normalized = Number.isFinite(value) ? value : min;
  return Math.min(max, Math.max(min, normalized));
}
