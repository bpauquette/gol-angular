import { GameModelService, Cell } from './game-model.service';

function toCellSet(cells: Cell[]) {
  return new Set((cells || []).map(cell => `${cell.x},${cell.y}`));
}

describe('GameModelService Hashlife mode', () => {
  let normalModel: GameModelService;
  let hashlifeModel: GameModelService;

  beforeEach(() => {
    normalModel = new GameModelService();
    hashlifeModel = new GameModelService();
  });

  it('matches normal engine for a glider after 12 generations', () => {
    const glider: Cell[] = [
      { x: 0, y: 1 },
      { x: 1, y: 2 },
      { x: 2, y: 0 },
      { x: 2, y: 1 },
      { x: 2, y: 2 }
    ];

    normalModel.setLiveCells(glider);
    for (let i = 0; i < 12; i++) {
      normalModel.step(1);
    }

    hashlifeModel.setLiveCells(glider);
    hashlifeModel.setEngineMode('hashlife');
    hashlifeModel.setGenerationBatchSize(4);
    for (let i = 0; i < 3; i++) {
      hashlifeModel.stepByEngine();
    }

    expect(toCellSet(hashlifeModel.getLiveCells())).toEqual(toCellSet(normalModel.getLiveCells()));
    expect(hashlifeModel.getGenerationBatchSize()).toBe(4);
  });

  it('matches normal engine for an oscillator after 10 generations', () => {
    const toad: Cell[] = [
      { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 },
      { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }
    ];

    normalModel.setLiveCells(toad);
    normalModel.step(10);

    hashlifeModel.setLiveCells(toad);
    hashlifeModel.setEngineMode('hashlife');
    hashlifeModel.setGenerationBatchSize(5);
    hashlifeModel.stepByEngine();
    hashlifeModel.stepByEngine();

    expect(toCellSet(hashlifeModel.getLiveCells())).toEqual(toCellSet(normalModel.getLiveCells()));
  });

  it('uses one generation per step in normal mode and batch size in hashlife mode', () => {
    let normalGeneration = 0;
    let hashlifeGeneration = 0;
    normalModel.generation$.subscribe(value => normalGeneration = value);
    hashlifeModel.generation$.subscribe(value => hashlifeGeneration = value);

    normalModel.stepByEngine();
    expect(normalGeneration).toBe(1);

    hashlifeModel.setEngineMode('hashlife');
    hashlifeModel.setGenerationBatchSize(7);
    hashlifeModel.stepByEngine();
    expect(hashlifeGeneration).toBe(7);
  });
});
