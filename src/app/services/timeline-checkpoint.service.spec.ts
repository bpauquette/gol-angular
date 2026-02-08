import { TimelineCheckpointService } from './timeline-checkpoint.service';

describe('TimelineCheckpointService', () => {
  let service: TimelineCheckpointService;
  let latestCheckpoints: any[] = [];

  beforeEach(() => {
    service = new TimelineCheckpointService();
    service.checkpoints$.subscribe(checkpoints => latestCheckpoints = checkpoints);
  });

  it('stores immutable snapshots and restores by id', () => {
    const cells = [{ x: 1, y: 2 }];
    service.addCheckpoint(128, cells);
    cells[0].x = 99;

    expect(latestCheckpoints.length).toBe(1);
    expect(latestCheckpoints[0].cells[0].x).toBe(1);

    const restored = service.restoreCheckpoint(latestCheckpoints[0].id);
    expect(restored?.generation).toBe(128);
  });

  it('skips checkpoints that are too close in generation', () => {
    service.addCheckpoint(100, [{ x: 0, y: 0 }]);
    service.addCheckpoint(120, [{ x: 1, y: 1 }]);
    expect(latestCheckpoints.length).toBe(1);
  });

  it('clears all checkpoints', () => {
    service.addCheckpoint(100, [{ x: 0, y: 0 }]);
    service.clear();
    expect(latestCheckpoints.length).toBe(0);
  });
});
