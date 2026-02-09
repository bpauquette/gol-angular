import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

const ADA_COMPLIANCE_STORAGE_KEY = 'gol.adaCompliance';

@Injectable({ providedIn: 'root' })
export class AdaComplianceService {
  private adaComplianceSubject = new BehaviorSubject<boolean>(true);
  adaCompliance$ = this.adaComplianceSubject.asObservable();

  constructor() {
    const stored = this.readStoredAdaCompliance();
    this.adaComplianceSubject.next(stored.value);
    if (!stored.hasStoredValue) {
      this.writeAdaCompliance(stored.value);
    }
  }

  setAdaCompliance(enabled: boolean) {
    const value = !!enabled;
    this.adaComplianceSubject.next(value);
    this.writeAdaCompliance(value);
  }

  private readStoredAdaCompliance() {
    try {
      const raw = localStorage.getItem(ADA_COMPLIANCE_STORAGE_KEY);
      if (raw === 'true') return { value: true, hasStoredValue: true };
      if (raw === 'false') return { value: false, hasStoredValue: true };
      // First-time users default to ADA mode enabled.
      return { value: true, hasStoredValue: false };
    } catch (error) {
      console.error('[AdaCompliance] Failed to read ADA compliance setting from storage.', error);
      return { value: true, hasStoredValue: false };
    }
  }

  private writeAdaCompliance(value: boolean) {
    try {
      localStorage.setItem(ADA_COMPLIANCE_STORAGE_KEY, value ? 'true' : 'false');
    } catch (error) {
      console.error('[AdaCompliance] Failed to persist ADA compliance setting to storage.', { value, error });
    }
  }
}
