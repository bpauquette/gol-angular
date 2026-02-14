import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { HttpClientModule } from '@angular/common/http';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatSliderModule } from '@angular/material/slider';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatOptionModule } from '@angular/material/core';
import { MatDividerModule } from '@angular/material/divider';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AppComponent } from './app.component';
import { GameOfLifeComponent } from './game-of-life/game-of-life.component';
import { GameCanvasComponent } from './game-of-life/game-canvas.component';
import { ShapePreviewComponent } from './game-of-life/shape-preview.component';
import { ShapePaletteDialogComponent } from './game-of-life/shape-palette-dialog.component';
import { OptionsPanelComponent } from './options-panel/options-panel.component';
import { RunControlGroupComponent } from './run-control-group/run-control-group.component';
import { AdaDialogComponent } from './ada-dialog/ada-dialog.component';
import { AdaComplianceService } from './services/ada-compliance.service';
import { AuthDialogComponent } from './auth/auth-dialog.component';
import { HTTP_INTERCEPTORS } from '@angular/common/http';
import { AuthInterceptor } from './services/auth.interceptor';
import { PopulationMiniPanelComponent } from './game-of-life/population-mini-panel.component';
import { ScriptLogDialogComponent } from './game-of-life/script-log-dialog.component';

@NgModule({
  declarations: [
    AppComponent,
    GameOfLifeComponent,
    GameCanvasComponent,
    ShapePreviewComponent,
    ShapePaletteDialogComponent,
    PopulationMiniPanelComponent,
    ScriptLogDialogComponent,
    AuthDialogComponent,
    OptionsPanelComponent,
    RunControlGroupComponent,
    AdaDialogComponent
  ],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    HttpClientModule,
    FormsModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatInputModule,
    MatSelectModule,
    MatButtonToggleModule,
    MatSliderModule,
    MatCheckboxModule,
    MatToolbarModule,
    MatIconModule,
    MatCardModule,
    MatFormFieldModule,
    MatOptionModule,
    MatDividerModule,
    MatMenuModule,
    MatSidenavModule,
    MatTooltipModule
  ],
  providers: [
    AdaComplianceService,
    { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true }
  ],
  bootstrap: [AppComponent]
})
export class AppModule {}
