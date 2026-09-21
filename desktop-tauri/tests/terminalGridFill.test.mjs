import test from 'node:test';
import assert from 'node:assert/strict';
import { terminalGridCells } from '../src/lib/terminalGridColumns.ts';

test('three terminals fill the bottom row instead of leaving a vacant cell', () => {
  assert.deepEqual(terminalGridCells(3, 2).cells, [
    { gridColumn: '1 / span 1', gridRow: 1 },
    { gridColumn: '2 / span 1', gridRow: 1 },
    { gridColumn: '1 / span 2', gridRow: 2 },
  ]);
});

test('every row fills its width, with balanced populations and no overlap', () => {
  for (let count = 1; count <= 40; count++) {
    for (let columns = 1; columns <= count; columns++) {
      const { cells, rows, tracks } = terminalGridCells(count, columns);
      assert.equal(cells.length, count);
      const populations = [];
      for (let row = 1; row <= rows; row++) {
        const members = cells.filter(cell => cell.gridRow === row);
        populations.push(members.length);
        let next = 1;
        for (const cell of members) {
          const [start, span] = cell.gridColumn.split(' / span ').map(Number);
          assert.equal(start, next);
          next += span;
        }
        assert.equal(next, tracks + 1);
      }
      assert.ok(Math.max(...populations) - Math.min(...populations) <= 1);
    }
  }
});
