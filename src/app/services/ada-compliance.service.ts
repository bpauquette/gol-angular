import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AdaComplianceService {
  private adaComplianceSubject = new BehaviorSubject<boolean>(false);
  adaCompliance$ = this.adaComplianceSubject.asObservable();

  setAdaCompliance(enabled: boolean) {
    this.adaComplianceSubject.next(enabled);
  }
}
