import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { AdaDialogComponent } from '../ada-dialog/ada-dialog.component';

@Component({
  selector: 'app-run-control-group',
  templateUrl: './run-control-group.component.html',
  styleUrls: ['./run-control-group.component.css']
})
export class RunControlGroupComponent {
  @Input() isRunning = false;
  @Input() adaCompliance = false;
  @Output() toggleRun = new EventEmitter<void>();

  constructor(private dialog: MatDialog) {}

  handlePlayPause() {
    if (this.adaCompliance) {
      this.dialog.open(AdaDialogComponent);
      return;
    }
    this.toggleRun.emit();
  }
}
