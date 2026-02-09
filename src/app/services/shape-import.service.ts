import { Injectable } from '@angular/core';
import { Cell } from '../model/game-model.service';

export interface ParsedShapeInput {
  name: string;
  description: string;
  cells: Cell[];
  width: number;
  height: number;
  rleText: string;
}

@Injectable({ providedIn: 'root' })
export class ShapeImportService {
  parse(input: string, fallbackName = 'Imported Shape'): ParsedShapeInput {
    const raw = String(input || '').trim();
    if (!raw) {
      throw new Error('Shape text is empty.');
    }

    const parsedRle = this.tryParseRle(raw, fallbackName);
    if (parsedRle) return parsedRle;

    const parsedCoords = this.tryParseCoordinateList(raw, fallbackName);
    if (parsedCoords) return parsedCoords;

    throw new Error('Unsupported shape format. Use RLE text or one x,y pair per line.');
  }

  private tryParseRle(raw: string, fallbackName: string): ParsedShapeInput | null {
    const lines = raw
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((line) => line.trim());
    if (!lines.length) return null;

    const comments = lines.filter((line) => line.startsWith('#'));
    const dataLines = lines.filter((line) => line && !line.startsWith('#'));
    if (!dataLines.length) return null;

    const header = dataLines.find((line) => /^x\s*=/.test(line));
    if (!header) return null;

    const bodyLines = dataLines.filter((line) => line !== header);
    const body = bodyLines.join('');
    if (!body.includes('!')) {
      throw new Error('Invalid RLE: missing ! terminator.');
    }

    const headerMatch = header.match(/x\s*=\s*(\d+)\s*,\s*y\s*=\s*(\d+)/i);
    const width = headerMatch ? Number(headerMatch[1]) : 0;
    const height = headerMatch ? Number(headerMatch[2]) : 0;

    let x = 0;
    let y = 0;
    let run = '';
    const cells: Cell[] = [];
    const emitRun = (count: number, token: string) => {
      const steps = Math.max(1, count || 1);
      if (token === 'o') {
        for (let i = 0; i < steps; i++) {
          cells.push({ x: x + i, y });
        }
        x += steps;
        return;
      }
      if (token === 'b') {
        x += steps;
        return;
      }
      if (token === '$') {
        y += steps;
        x = 0;
      }
    };

    for (let i = 0; i < body.length; i++) {
      const ch = body[i];
      if (/\d/.test(ch)) {
        run += ch;
        continue;
      }
      if (ch === 'o' || ch === 'b' || ch === '$') {
        const count = run ? Number(run) : 1;
        run = '';
        emitRun(count, ch);
        continue;
      }
      if (ch === '!') {
        break;
      }
      // ignore whitespace and unknown tokens safely
    }

    const nameLine = comments.find((line) => /^#N\s+/i.test(line));
    const descLines = comments
      .filter((line) => /^#C\s+/i.test(line))
      .map((line) => line.replace(/^#C\s+/i, '').trim())
      .filter(Boolean);
    const name = nameLine ? nameLine.replace(/^#N\s+/i, '').trim() : fallbackName;

    return {
      name: name || fallbackName,
      description: descLines.join(' ').trim(),
      cells: this.normalizeCells(cells),
      width: width || this.computeBounds(cells).width,
      height: height || this.computeBounds(cells).height,
      rleText: raw
    };
  }

  private tryParseCoordinateList(raw: string, fallbackName: string): ParsedShapeInput | null {
    const lines = raw
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (!lines.length) return null;

    const cells: Cell[] = [];
    for (const line of lines) {
      if (line.startsWith('#')) continue;
      const match = line.match(/^(-?\d+)\s*[, ]\s*(-?\d+)$/);
      if (!match) return null;
      cells.push({ x: Number(match[1]), y: Number(match[2]) });
    }

    if (!cells.length) return null;
    const bounds = this.computeBounds(cells);
    return {
      name: fallbackName,
      description: '',
      cells: this.normalizeCells(cells),
      width: bounds.width,
      height: bounds.height,
      rleText: ''
    };
  }

  private normalizeCells(cells: Cell[]) {
    const seen = new Set<string>();
    const out: Cell[] = [];
    for (const cell of cells) {
      const x = Math.floor(Number(cell?.x));
      const y = Math.floor(Number(cell?.y));
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const key = `${x},${y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ x, y });
    }
    return out;
  }

  private computeBounds(cells: Cell[]) {
    if (!cells.length) return { width: 0, height: 0 };
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const cell of cells) {
      minX = Math.min(minX, cell.x);
      maxX = Math.max(maxX, cell.x);
      minY = Math.min(minY, cell.y);
      maxY = Math.max(maxY, cell.y);
    }
    return {
      width: maxX - minX + 1,
      height: maxY - minY + 1
    };
  }
}
