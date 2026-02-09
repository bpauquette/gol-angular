import { Injectable } from '@angular/core';
import { map } from 'rxjs/operators';
import { GameModelService, SimulationColorSchemeId } from '../model/game-model.service';
export type { SimulationColorSchemeId } from '../model/game-model.service';

export interface SimulationColorScheme {
  id: SimulationColorSchemeId;
  label: string;
  description: string;
  cellColor: string;
  backgroundColor: string;
  borderColor: string;
}

const DEFAULT_SCHEME_ID: SimulationColorSchemeId = 'biolife';

@Injectable({ providedIn: 'root' })
export class SimulationColorSchemeService {
  readonly availableSchemes: SimulationColorScheme[] = [
    {
      id: 'biolife',
      label: 'BioLife',
      description: 'Balanced default palette for long sessions.',
      cellColor: '#7CFF7C',
      backgroundColor: '#041D38',
      borderColor: '#1B2B40'
    },
    {
      id: 'neonCircuit',
      label: 'Neon Circuit',
      description: 'Cool neon accents with high cell separation.',
      cellColor: '#66F3FF',
      backgroundColor: '#061124',
      borderColor: '#2A3959'
    },
    {
      id: 'emberField',
      label: 'Ember Field',
      description: 'Warm amber cells on a dark background.',
      cellColor: '#FFB068',
      backgroundColor: '#1A120B',
      borderColor: '#4C2A1A'
    },
    {
      id: 'retroVector',
      label: 'Retro Vector',
      description: 'Classic phosphor look with strong contrast.',
      cellColor: '#91FF66',
      backgroundColor: '#001830',
      borderColor: '#204466'
    },
    {
      id: 'aurora',
      label: 'Aurora',
      description: 'Soft cyan glow with calmer saturation.',
      cellColor: '#A6E8FF',
      backgroundColor: '#071A2A',
      borderColor: '#2A4B63'
    },
    {
      id: 'adaSafe',
      label: 'ADA Safe',
      description: 'Lower-contrast palette intended for ADA mode.',
      cellColor: '#59666F',
      backgroundColor: '#2A333A',
      borderColor: '#44515A'
    }
  ];

  readonly selectedSchemeId$ = this.model.simulationColorSchemeId$;
  readonly scheme$ = this.selectedSchemeId$.pipe(
    map(id => this.resolveScheme(id))
  );

  get currentSchemeId(): SimulationColorSchemeId {
    return this.model.getSimulationColorScheme();
  }

  get currentScheme(): SimulationColorScheme {
    return this.resolveScheme(this.currentSchemeId);
  }

  setScheme(id: SimulationColorSchemeId | string): void {
    this.model.setSimulationColorScheme(id);
  }

  private resolveScheme(id: SimulationColorSchemeId): SimulationColorScheme {
    return this.availableSchemes.find(scheme => scheme.id === id)
      || this.availableSchemes.find(scheme => scheme.id === DEFAULT_SCHEME_ID)!
      || this.availableSchemes[0];
  }

  constructor(private model: GameModelService) {}
}
