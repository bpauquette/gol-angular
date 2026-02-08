import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type ThemeId = 'dark' | 'light' | 'highContrast' | 'oled';

export interface ThemeOption {
  id: ThemeId;
  label: string;
}

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly storageKey = 'gol.themeMode';

  readonly availableThemes: ThemeOption[] = [
    { id: 'dark', label: 'Dark (Default)' },
    { id: 'light', label: 'Light' },
    { id: 'highContrast', label: 'High Contrast' },
    { id: 'oled', label: 'OLED' }
  ];

  private readonly themeSubject = new BehaviorSubject<ThemeId>(this.readInitialTheme());
  readonly theme$ = this.themeSubject.asObservable();

  constructor() {
    this.applyThemeClass(this.themeSubject.value);
  }

  get currentTheme(): ThemeId {
    return this.themeSubject.value;
  }

  setTheme(theme: ThemeId): void {
    if (theme === this.themeSubject.value) return;
    this.themeSubject.next(theme);
    try {
      localStorage.setItem(this.storageKey, theme);
    } catch {
      // Ignore storage failures.
    }
    this.applyThemeClass(theme);
  }

  private readInitialTheme(): ThemeId {
    try {
      const stored = localStorage.getItem(this.storageKey) as ThemeId | null;
      if (stored && this.availableThemes.some(t => t.id === stored)) {
        return stored;
      }
    } catch {
      // Ignore storage failures.
    }
    return 'dark';
  }

  private applyThemeClass(theme: ThemeId): void {
    const root = document.documentElement;
    root.classList.remove('theme-dark', 'theme-light', 'theme-highContrast', 'theme-oled');
    root.classList.add(`theme-${theme}`);
  }
}
