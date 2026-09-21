import assert from 'node:assert/strict';
import { test } from 'node:test';
import { markdownBlocks, tableCells } from '../src/conversation/markdownBlocks';

test('tables preserve cells, alignment and surrounding prose', () => {
  const blocks = markdownBlocks('Before\n\n| Area | Change |\n| :--- | ---: |\n| Thinking | **One** indicator |\n| Stop | `44pt` |\n\nAfter');
  assert.equal(blocks[0].kind, 'text');
  assert.deepEqual(blocks[1], { kind: 'table', headers: ['Area', 'Change'], alignments: ['left', 'right'],
    rows: [['Thinking', '**One** indicator'], ['Stop', '`44pt`']] });
  assert.equal(blocks[2].kind, 'text');
  assert.deepEqual(tableCells('| Pipe | a \\| b |'), ['Pipe', 'a | b']);
});
test('optional outside pipes, empty cells and streamed rows preserve column ownership', () => {
  assert.deepEqual(markdownBlocks('A | B\n:---: | ---\nvalue |\nnext | par')[0], {
    kind: 'table', headers: ['A', 'B'], alignments: ['center', 'left'], rows: [['value', ''], ['next', 'par']],
  });
  assert.equal(markdownBlocks('| A | B |\n| --')[0].kind, 'text');
  assert.equal(markdownBlocks('| A | B |\n| --- |')[0].kind, 'text');
  assert.deepEqual(tableCells('| | value |'), ['', 'value']);
});
test('complete and incomplete code fences never render their example pipes as tables', () => {
  const example = '| A | B |\n| --- | --- |\n| C | D |';
  for (const fence of ['```', '~~~~']) {
    for (const close of ['', `\n${fence}`]) {
      assert.deepEqual(markdownBlocks(`${fence}md\n${example}${close}`), [{ kind: 'code', text: example }]);
    }
  }
});
