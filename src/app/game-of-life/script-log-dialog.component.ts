import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-script-log-dialog',
  templateUrl: './script-log-dialog.component.html',
  styleUrls: ['./script-log-dialog.component.css']
})
export class ScriptLogDialogComponent {
  @Input() logLines: string[] = [];
  @Input() running = false;
  @Output() close = new EventEmitter<void>();
  @Output() clear = new EventEmitter<void>();

  onBackdropClick() {
    this.close.emit();
  }

  onDialogClick(event: MouseEvent) {
    event.stopPropagation();
  }
}
