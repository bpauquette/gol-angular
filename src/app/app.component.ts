import { Component } from '@angular/core';
import { ThemeService } from './services/theme.service';

@Component({
  selector: 'app-root',
  template: `
    <app-game-of-life></app-game-of-life>
  `,
  styles: []
})
export class AppComponent {
  constructor(_theme: ThemeService) {}
}
