import { Component, HostListener, Input, OnChanges, SimpleChanges } from '@angular/core';

@Component({
  selector: 'app-population-mini-panel',
  template: `
    <button
      type="button"
      class="pop-mini"
      (click)="toggleExpanded()"
      [attr.aria-expanded]="expanded"
      aria-label="Cell population"
    >
      <div class="pop-mini-left">
        <div class="pop-mini-label">Pop</div>
        <div class="pop-mini-value">{{ currentDisplay }}</div>
      </div>
      <svg class="pop-mini-spark" viewBox="0 0 120 28" preserveAspectRatio="none" aria-hidden="true">
        <polyline class="pop-mini-line" [attr.points]="sparkPoints"></polyline>
      </svg>
    </button>

    <div class="pop-overlay" *ngIf="expanded" (click)="close()" role="dialog" aria-modal="true">
      <div class="pop-panel" (click)="$event.stopPropagation()">
        <div class="pop-panel-header">
          <div class="pop-panel-title">Cell Population</div>
          <div class="pop-panel-sub">
            <span>Gen {{ generationDisplay }}</span>
            <span class="sep">/</span>
            <span>Now {{ currentDisplay }}</span>
            <span class="sep" *ngIf="deltaDisplay !== null">/</span>
            <span *ngIf="deltaDisplay !== null">{{ deltaDisplay }}</span>
          </div>
          <button type="button" class="pop-panel-close" (click)="close()" aria-label="Close">X</button>
        </div>

        <div class="pop-panel-body">
          <svg class="pop-panel-chart" viewBox="0 0 640 220" preserveAspectRatio="none" aria-hidden="true">
            <polyline class="pop-panel-line" [attr.points]="chartPoints"></polyline>
          </svg>

          <div class="pop-panel-metrics">
            <div class="metric">
              <div class="k">Min</div>
              <div class="v">{{ minDisplay }}</div>
            </div>
            <div class="metric">
              <div class="k">Max</div>
              <div class="v">{{ maxDisplay }}</div>
            </div>
            <div class="metric">
              <div class="k">Avg</div>
              <div class="v">{{ avgDisplay }}</div>
            </div>
          </div>

          <div class="pop-panel-hint">Click outside this panel to collapse.</div>
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./population-mini-panel.component.css']
})
export class PopulationMiniPanelComponent implements OnChanges {
  @Input() history: number[] = [];
  @Input() current = 0;
  @Input() generation = 0;

  @Input() miniWindow = 120;
  @Input() chartWindow = 1200;

  expanded = false;

  sparkPoints = '';
  chartPoints = '';

  minDisplay = 'N/A';
  maxDisplay = 'N/A';
  avgDisplay = 'N/A';
  deltaDisplay: string | null = null;

  get currentDisplay(): string {
    return formatCompact(this.current);
  }

  get generationDisplay(): string {
    return formatCompact(this.generation);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['history'] || changes['current'] || changes['miniWindow'] || changes['chartWindow']) {
      this.recompute();
    }
  }

  @HostListener('window:keydown', ['$event'])
  onWindowKeyDown(event: KeyboardEvent) {
    if (!this.expanded) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
    }
  }

  toggleExpanded(): void {
    this.expanded = !this.expanded;
  }

  close(): void {
    this.expanded = false;
  }

  private recompute(): void {
    const history = Array.isArray(this.history)
      ? this.history.map((n) => Number(n)).filter((n) => Number.isFinite(n))
      : [];
    const fullSeries = history.length ? history : [Number(this.current) || 0];
    const miniWindow = clampWindow(this.miniWindow, 2, 200000);
    const chartWindow = clampWindow(this.chartWindow, 2, 200000);
    const miniSeries = takeTail(fullSeries, miniWindow);
    const chartSeries = takeTail(fullSeries, chartWindow);

    const stats = computeStats(chartSeries);
    this.minDisplay = Number.isFinite(stats.min) ? formatCompact(stats.min) : 'N/A';
    this.maxDisplay = Number.isFinite(stats.max) ? formatCompact(stats.max) : 'N/A';
    this.avgDisplay = Number.isFinite(stats.avg) ? formatCompact(stats.avg) : 'N/A';

    const delta = computeDelta(chartSeries);
    this.deltaDisplay = delta === null ? null : formatDelta(delta);

    // Focus on the most recent window so the mini chart reads as "over time".
    this.sparkPoints = buildPolylinePoints(miniSeries, 120, 28, 120);
    this.chartPoints = buildPolylinePoints(chartSeries, 640, 220, 480);
  }
}

function buildPolylinePoints(series: number[], width: number, height: number, maxPoints: number): string {
  const data = downsample(series, maxPoints);
  const n = data.length;
  if (n === 0) return '';

  // Scale from 0..maxPop (not min..max). This makes the chart easier to read and
  // avoids "flattening" when history is long and mostly stable.
  const maxPop = Math.max(10, ...data);
  const plotHeight = Math.max(1, height - 2);

  const points: string[] = [];
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? width / 2 : (i / (n - 1)) * width;
    const value = Math.max(0, data[i]);
    const normalized = maxPop <= 0 ? 0 : value / maxPop;
    const y = plotHeight - normalized * plotHeight + 1;
    points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return points.join(' ');
}

function downsample(series: number[], maxPoints: number): number[] {
  const n = series.length;
  if (n <= maxPoints) return series.slice();

  const step = n / maxPoints;
  const out: number[] = [];
  for (let i = 0; i < maxPoints; i++) {
    out.push(series[Math.floor(i * step)]);
  }
  out[out.length - 1] = series[n - 1];
  return out;
}

function computeStats(series: number[]) {
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let count = 0;
  for (const v of series) {
    if (!Number.isFinite(v)) continue;
    min = Math.min(min, v);
    max = Math.max(max, v);
    sum += v;
    count += 1;
  }
  const avg = count ? sum / count : NaN;
  return { min, max, avg };
}

function computeDelta(series: number[]): number | null {
  if (series.length < 2) return null;
  const last = series[series.length - 1];
  const prev = series[series.length - 2];
  if (!Number.isFinite(last) || !Number.isFinite(prev)) return null;
  return last - prev;
}

function formatDelta(delta: number): string {
  if (!Number.isFinite(delta)) return '';
  if (delta === 0) return '+0';
  if (delta > 0) return `+${formatCompact(delta)}`;
  return `-${formatCompact(Math.abs(delta))}`;
}

function formatCompact(value: number): string {
  const n = Math.floor(Number(value) || 0);
  const abs = Math.abs(n);
  if (abs < 1000) return String(n);
  if (abs < 1000000) return `${(n / 1000).toFixed(abs < 10000 ? 1 : 0)}k`;
  return `${(n / 1000000).toFixed(abs < 10000000 ? 1 : 0)}M`;
}

function takeTail(series: number[], maxLength: number): number[] {
  const n = series.length;
  if (n <= maxLength) return series.slice();
  return series.slice(n - maxLength);
}

function clampWindow(value: unknown, min: number, max: number): number {
  const num = Math.floor(Number(value) || 0);
  return Math.max(min, Math.min(max, num));
}
