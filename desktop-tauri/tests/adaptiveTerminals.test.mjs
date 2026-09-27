import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adaptiveTerminals } from '../src/lib/adaptiveTerminals.ts';
const items = Array.from({length:5}, (_, i) => ({key:`chat:${i}`,shell:false})).concat({key:'pty:1',shell:true});
test('agents retain their order with shells below', () => {
 const layout=adaptiveTerminals(items,null);
 assert.deepEqual(layout.agents,items.slice(0,5)); assert.deepEqual(layout.shells,[items[5]]);
});
test('missing expansion, shell-only and empty projects have no ghost agents', () => {
 assert.equal(adaptiveTerminals(items,'gone').max,undefined);
 assert.equal(adaptiveTerminals([{key:'pty:1',shell:true}],null).onlyShells,true);
 assert.deepEqual(adaptiveTerminals([],null).agents,[]);
});
test('expansion preserves agent and shell order', () => {
 const normal=adaptiveTerminals(items,null),max=adaptiveTerminals(items,'chat:2');
 assert.deepEqual(normal.agents,max.agents); assert.equal(max.max,'chat:2'); assert.deepEqual(normal.shells,max.shells);
});
