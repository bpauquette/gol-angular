import { Injectable } from '@angular/core';

export type ShortcutTool = 'draw' | 'erase' | 'line' | 'rect' | 'square' | 'circle' | 'oval' | 'randomRect' | 'capture' | 'shapes' | 'toggle';

export interface GlobalShortcutBindings {
  canHandle?: () => boolean;
  toggleRun?: () => void;
  step?: () => void;
  clear?: () => void;
  openHelp?: () => void;
  openScript?: () => void;
  openShapePalette?: () => void;
  toggleOptions?: () => void;
  zoomIn?: () => void;
  zoomOut?: () => void;
  panByCells?: (dx: number, dy: number) => void;
  setTool?: (tool: ShortcutTool) => void;
}

@Injectable({ providedIn: 'root' })
export class GlobalShortcutsService {
  register(bindings: GlobalShortcutBindings) {
    const handler = (event: KeyboardEvent) => this.handleKeydown(event, bindings);
    window.addEventListener('keydown', handler, { capture: true });
    return () => {
      window.removeEventListener('keydown', handler, { capture: true });
    };
  }

  private handleKeydown(event: KeyboardEvent, bindings: GlobalShortcutBindings) {
    if (!bindings) return;
    if (this.isTypingTarget(event.target)) return;
    if (bindings.canHandle && !bindings.canHandle()) return;

    const key = String(event.key || '').toLowerCase();
    const panStride = event.shiftKey ? 20 : 6;

    // Space toggles run/pause.
    if (event.code === 'Space') {
      bindings.toggleRun?.();
      event.preventDefault();
      return;
    }

    if (key === 'n' || key === '.') {
      bindings.step?.();
      event.preventDefault();
      return;
    }

    if (key === 'c') {
      bindings.clear?.();
      event.preventDefault();
      return;
    }

    if (key === '?' || key === '/') {
      bindings.openHelp?.();
      event.preventDefault();
      return;
    }

    if (key === 'k') {
      bindings.openScript?.();
      event.preventDefault();
      return;
    }

    if (key === 'p') {
      bindings.openShapePalette?.();
      event.preventDefault();
      return;
    }

    if (key === 'h') {
      bindings.toggleOptions?.();
      event.preventDefault();
      return;
    }

    if (key === '+' || key === '=') {
      bindings.zoomIn?.();
      event.preventDefault();
      return;
    }

    if (key === '-' || key === '_') {
      bindings.zoomOut?.();
      event.preventDefault();
      return;
    }

    if (key === 'arrowleft') {
      bindings.panByCells?.(-panStride, 0);
      event.preventDefault();
      return;
    }

    if (key === 'arrowright') {
      bindings.panByCells?.(panStride, 0);
      event.preventDefault();
      return;
    }

    if (key === 'arrowup') {
      bindings.panByCells?.(0, -panStride);
      event.preventDefault();
      return;
    }

    if (key === 'arrowdown') {
      bindings.panByCells?.(0, panStride);
      event.preventDefault();
      return;
    }

    // Tool hotkeys
    if (key === '1') bindings.setTool?.('draw');
    else if (key === '2') bindings.setTool?.('erase');
    else if (key === '3') bindings.setTool?.('line');
    else if (key === '4') bindings.setTool?.('rect');
    else if (key === '5') bindings.setTool?.('circle');
    else if (key === '6') bindings.setTool?.('randomRect');
    else if (key === '7') bindings.setTool?.('capture');
    else if (key === '8') bindings.setTool?.('shapes');
    else if (key === '9') bindings.setTool?.('toggle');
    else return;

    event.preventDefault();
  }

  private isTypingTarget(target: EventTarget | null) {
    const element = target as HTMLElement | null;
    if (!element) return false;
    const tag = (element.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    if (element.isContentEditable) return true;
    return !!element.closest('.mat-mdc-select-panel, .mat-mdc-dialog-container, .mat-mdc-menu-panel, .cdk-overlay-pane');
  }
}
