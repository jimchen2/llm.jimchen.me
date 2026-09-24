import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DoublyLinkedList,
  MessageTree,
  FastConversationIndex,
  SSEParser,
  paginateConversationsOptimized,
  paginateConversationsNaive,
} from '../lib/dataStructures.js';
import { parseSSEChunkFast, parseSSEChunkNaive } from '../lib/llm.js';
import { buildChildrenIndex, getActivePathFast } from '../lib/messageStore.js';

function time(fn, iterations = 1) {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  return performance.now() - start;
}

describe('DoublyLinkedList', () => {
  it('append and order', () => {
    const dll = new DoublyLinkedList();
    dll.append('a', { id: 'a', v: 1 });
    dll.append('b', { id: 'b', v: 2 });
    dll.append('c', { id: 'c', v: 3 });
    assert.deepEqual(dll.toArray().map(x => x.id), ['a', 'b', 'c']);
  });

  it('delete middle O(1)', () => {
    const dll = new DoublyLinkedList();
    dll.append('a', { id: 'a' });
    dll.append('b', { id: 'b' });
    dll.append('c', { id: 'c' });
    dll.delete('b');
    assert.deepEqual(dll.toArray().map(x => x.id), ['a', 'c']);
    assert.equal(dll.size, 2);
    assert.equal(dll.has('b'), false);
  });

  it('insertAfter', () => {
    const dll = new DoublyLinkedList();
    dll.append('a', { id: 'a' });
    dll.append('c', { id: 'c' });
    dll.insertAfter('a', 'b', { id: 'b' });
    assert.deepEqual(dll.toArray().map(x => x.id), ['a', 'b', 'c']);
  });

  it('traverseFrom', () => {
    const dll = new DoublyLinkedList();
    for (let i = 0; i < 5; i++) dll.append(`m${i}`, { id: `m${i}` });
    const arr = Array.from(dll.traverseFrom('m2')).map(x => x.id);
    assert.deepEqual(arr, ['m2', 'm3', 'm4']);
  });

  it('Map makes get O(1) vs Array find O(N) benchmark', () => {
    const N = 2000;
    const dll = new DoublyLinkedList();
    const arr = [];
    for (let i = 0; i < N; i++) {
      const id = `m${i}`;
      const val = { id };
      dll.append(id, val);
      arr.push(val);
    }
    const target = `m${N - 1}`;
    const iter = 2000;
    const tDll = time(() => dll.get(target), iter);
    const tArr = time(() => arr.find(x => x.id === target), iter);
    const speedup = tArr / tDll;
    console.log(`\nDLL get vs Array find: arr=${tArr.toFixed(2)}ms dll=${tDll.toFixed(2)}ms speedup=${speedup.toFixed(2)}x N=${N}`);
    assert.ok(speedup > 5, `Expected >5x, got ${speedup}`);
  });
});

describe('MessageTree', () => {
  it('loadAll and path', () => {
    const tree = new MessageTree();
    tree.add({ id: 'a', parent_id: null, content: 'root' });
    tree.add({ id: 'b', parent_id: 'a', content: 'child' });
    tree.add({ id: 'c', parent_id: 'a', content: 'branch' });
    tree.add({ id: 'd', parent_id: 'b', content: 'grand' });
    const path = tree.getPathToRoot('d').map(m => m.id);
    assert.deepEqual(path, ['a', 'b', 'd']);
    const sibs = tree.getSiblings('a').map(m => m.id).sort();
    assert.deepEqual(sibs, ['b', 'c']);
  });

  it('delete reparents', () => {
    const tree = new MessageTree();
    tree.loadAll([
      { id: 'a', parent_id: null },
      { id: 'b', parent_id: 'a' },
      { id: 'c', parent_id: 'b' },
      { id: 'd', parent_id: 'b' },
    ]);
    tree.delete('b');
    assert.equal(tree.get('b'), undefined);
    const sibs = tree.getSiblings('a').map(m => m.id).sort();
    assert.deepEqual(sibs, ['c', 'd']);
    assert.equal(tree.nodes.get('c').parent, 'a');
  });

  it('MessageTree siblings O(1) vs naive filter benchmark', () => {
    const N = 2000;
    const msgs = {};
    msgs['root'] = { id: 'root', parent_id: null };
    for (let i = 0; i < N; i++) {
      msgs[`m${i}`] = { id: `m${i}`, parent_id: 'root', content: 'x' };
    }
    const tree = new MessageTree();
    tree.loadAll(msgs);
    const iter = 500;
    const tNaive = time(() => Object.values(msgs).filter(m => m.parent_id === 'root'), iter);
    const tFast = time(() => tree.getSiblings('root'), iter);
    const speedup = tNaive / tFast;
    console.log(`\nMessageTree siblings: naive=${tNaive.toFixed(2)}ms fast=${tFast.toFixed(2)}ms speedup=${speedup.toFixed(2)}x N=${N}`);
    assert.ok(speedup > 3, `Expected >3x`);
  });
});

describe('FastConversationIndex', () => {
  it('add slice maintains sorted order', () => {
    const idx = new FastConversationIndex();
    idx.add({ id: 'a', created_at: 100 });
    idx.add({ id: 'b', created_at: 300 });
    idx.add({ id: 'c', created_at: 200 });
    assert.deepEqual(idx.slice(0, 2).map(c => c.id), ['b', 'c']);
    assert.deepEqual(idx.slice(1, 2).map(c => c.id), ['c', 'a']);
  });

  it('remove', () => {
    const idx = new FastConversationIndex();
    idx.add({ id: 'a', created_at: 100 });
    idx.add({ id: 'b', created_at: 200 });
    idx.remove('b');
    assert.equal(idx.size, 1);
    assert.deepEqual(idx.slice(0, 10).map(c => c.id), ['a']);
  });

  it('pagination optimized vs naive scanned count', () => {
    const N = 10000;
    const sortedIds = Array.from({ length: N }, (_, i) => `conv${i}`);
    // stale every 10th
    const staleSet = new Set(sortedIds.filter((_, i) => i % 10 === 0));
    const hydrate = (id) => staleSet.has(id) ? null : { id, data: 'x' };
    const naive = paginateConversationsNaive(sortedIds, hydrate, 10, 10, staleSet);
    const opt = paginateConversationsOptimized(sortedIds, hydrate, 10, 10, staleSet);
    assert.deepEqual(naive.rows.map(r => r.id), opt.rows.map(r => r.id));
    console.log(`\nPagination scanned: naive=${naive.scanned} optimized=${opt.scanned} N=${N}`);
    assert.ok(opt.scanned < naive.scanned, 'optimized should scan less');
  });
});

describe('SSEParser vs naive split', () => {
  it('correctness', () => {
    const chunk = 'data: {"a":1}\n\ndata: {"b":2}\n:ping\n\ndata: [DONE]\n';
    const fast = parseSSEChunkFast(chunk);
    // fast filters [DONE] internally (as callLLM does), so it should return only the two JSON payloads
    assert.deepEqual(fast.payloads, ['{"a":1}', '{"b":2}']);
    // naive includes DONE; we verify that our fast correctly strips it
    const naive = parseSSEChunkNaive(chunk);
    assert.ok(naive.includes('[DONE]'));
    // After filtering DONE, both should match
    const naiveFiltered = naive.filter(x => x !== '[DONE]');
    assert.deepEqual(fast.payloads, naiveFiltered);
  });

  it('performance: buffer parser faster than split+filter', () => {
    const big = Array.from({ length: 200 }, (_, i) => `data: {"text":"chunk ${i} with some payload data to make sizable"}`).join('\n') + '\n';
    const iter = 500;
    const tNaive = time(() => parseSSEChunkNaive(big), iter);
    const tFast = time(() => parseSSEChunkFast(big), iter);
    const speedup = tNaive / tFast;
    console.log(`\nSSE parse: naive=${tNaive.toFixed(2)}ms fast=${tFast.toFixed(2)}ms speedup=${speedup.toFixed(2)}x iter=${iter}`);
    assert.ok(speedup > 1.1, `Expected >1.1x speedup, got ${speedup}`);
  });

  it('SSEParser handles split lines across chunks', () => {
    const parser = new SSEParser();
    const p1 = parser.feed('data: {"partial": "hel');
    assert.equal(p1.length, 0);
    const p2 = parser.feed('lo"}\n\ndata: {"next":1}\n');
    assert.equal(p2.length, 2);
    assert.equal(p2[0], '{"partial": "hello"}');
  });
});

describe('Overall data structure edge cases', () => {
  it('handles empty messages', () => {
    const tree = new MessageTree();
    tree.loadAll({});
    assert.equal(tree.getPathToRoot('none').length, 0);
    const idx = buildChildrenIndex({});
    assert.equal(idx.size, 0);
  });

  it('handles deep chain quickly', () => {
    const N = 5000;
    const msgs = {};
    let parent = null;
    for (let i = 0; i < N; i++) {
      const id = `m${i}`;
      msgs[id] = { id, parent_id: parent };
      parent = id;
    }
    const start = performance.now();
    const path = getActivePathFast(msgs, `m${N - 1}`);
    const elapsed = performance.now() - start;
    assert.equal(path.length, N);
    console.log(`\nDeep chain N=${N} path built in ${elapsed.toFixed(2)}ms`);
    assert.ok(elapsed < 50, 'should be <50ms');
  });
});
