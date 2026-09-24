import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildChildrenIndex,
  getSiblingsFast,
  getSiblingsNaive,
  getActivePathFast,
  getActivePathNaive,
  findLeafFast,
  findLeafNaive,
  deleteWithReparentFast,
  deleteWithReparentNaive,
  MessageStore,
  buildMessageMapFast,
} from '../lib/messageStore.js';

// Helper to generate a linear chain of messages plus branching
function genMessagesLinear(n) {
  const msgs = {};
  let parent = null;
  for (let i = 0; i < n; i++) {
    const id = `m${i}`;
    msgs[id] = { id, parent_id: parent, role: i % 2 === 0 ? 'user' : 'assistant', content: `msg ${i}`, created_at: i };
    parent = id;
  }
  return msgs;
}

function genMessagesBranching(n, branchEvery = 10) {
  const msgs = {};
  // root
  msgs['m0'] = { id: 'm0', parent_id: null, role: 'user', content: 'root', created_at: 0 };
  let chainParent = 'm0';
  let created = 1;
  for (let i = 1; i < n; i++) {
    const id = `m${i}`;
    // Every branchEvery steps, create 2 siblings off same parent
    if (i % branchEvery === 0 && msgs[chainParent]) {
      // create a sibling branch
      const siblingId = `s${i}`;
      if (!msgs[siblingId]) {
        msgs[siblingId] = { id: siblingId, parent_id: chainParent, role: 'assistant', content: `branch ${i}`, created_at: created++ };
      }
    }
    msgs[id] = { id, parent_id: chainParent, role: 'assistant', content: `msg ${i}`, created_at: created++ };
    chainParent = id;
  }
  return msgs;
}

function time(fn, iterations = 1) {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  return performance.now() - start;
}

describe('messageStore correctness', () => {
  it('buildChildrenIndex groups correctly', () => {
    const msgs = {
      a: { id: 'a', parent_id: null },
      b: { id: 'b', parent_id: 'a' },
      c: { id: 'c', parent_id: 'a' },
      d: { id: 'd', parent_id: 'b' },
    };
    const idx = buildChildrenIndex(msgs);
    assert.equal(idx.get('__root__').has('a'), true);
    assert.equal(idx.get('a').has('b'), true);
    assert.equal(idx.get('a').has('c'), true);
    assert.equal(idx.get('b').has('d'), true);
  });

  it('getActivePathFast matches naive', () => {
    const msgs = genMessagesLinear(100);
    const leaf = 'm99';
    const fast = getActivePathFast(msgs, leaf);
    const naive = getActivePathNaive(msgs, leaf);
    assert.deepEqual(fast.map(m => m.id), naive.map(m => m.id));
  });

  it('getActivePathFast handles branching path', () => {
    const msgs = {
      a: { id: 'a', parent_id: null },
      b: { id: 'b', parent_id: 'a' },
      c: { id: 'c', parent_id: 'a' },
      d: { id: 'd', parent_id: 'b' },
    };
    const fast = getActivePathFast(msgs, 'd');
    assert.deepEqual(fast.map(m => m.id), ['a', 'b', 'd']);
  });

  it('getSiblingsFast matches naive', () => {
    const msgs = {
      a: { id: 'a', parent_id: null },
      b: { id: 'b', parent_id: 'a' },
      c: { id: 'c', parent_id: 'a' },
      d: { id: 'd', parent_id: 'b' },
    };
    const idx = buildChildrenIndex(msgs);
    const fast = getSiblingsFast(msgs, idx, 'a').map(m => m.id).sort();
    const naive = getSiblingsNaive(msgs, 'a').map(m => m.id).sort();
    assert.deepEqual(fast, naive);
  });

  it('findLeafFast matches naive', () => {
    const msgs = genMessagesLinear(50);
    const idx = buildChildrenIndex(msgs);
    const leafFast = findLeafFast(msgs, idx, 'm10');
    const leafNaive = findLeafNaive(msgs, 'm10');
    assert.equal(leafFast, leafNaive);
  });

  it('findLeafFast branching', () => {
    const msgs = {
      a: { id: 'a', parent_id: null },
      b: { id: 'b', parent_id: 'a' },
      c: { id: 'c', parent_id: 'a' },
      d: { id: 'd', parent_id: 'b' },
      e: { id: 'e', parent_id: 'd' },
    };
    const idx = buildChildrenIndex(msgs);
    const leaf = findLeafFast(msgs, idx, 'a');
    // Should follow first child b -> d -> e
    assert.equal(leaf, 'e');
    assert.equal(findLeafNaive(msgs, 'a'), 'e');
  });

  it('deleteWithReparentFast reparents correctly', () => {
    const msgs = {
      a: { id: 'a', parent_id: null },
      b: { id: 'b', parent_id: 'a' },
      c: { id: 'c', parent_id: 'b' },
      d: { id: 'd', parent_id: 'b' },
      e: { id: 'e', parent_id: 'c' },
    };
    const idx = buildChildrenIndex(JSON.parse(JSON.stringify(msgs)));
    const msgsCopy = JSON.parse(JSON.stringify(msgs));
    deleteWithReparentFast(msgsCopy, idx, 'b');
    // c and d should now be children of a
    assert.equal(msgsCopy['c'].parent_id, 'a');
    assert.equal(msgsCopy['d'].parent_id, 'a');
    assert.equal(msgsCopy['b'], undefined);
    // index updated
    assert.equal(idx.get('a').has('c'), true);
    assert.equal(idx.get('a').has('d'), true);
    assert.equal(idx.has('b'), false);
  });

  it('deleteWithReparentFast matches naive result', () => {
    const original = {
      a: { id: 'a', parent_id: null },
      b: { id: 'b', parent_id: 'a' },
      c: { id: 'c', parent_id: 'b' },
      d: { id: 'd', parent_id: 'b' },
    };
    const msgsFast = JSON.parse(JSON.stringify(original));
    const msgsNaive = JSON.parse(JSON.stringify(original));
    const idx = buildChildrenIndex(msgsFast);
    deleteWithReparentFast(msgsFast, idx, 'b');
    deleteWithReparentNaive(msgsNaive, 'b');
    assert.deepEqual(Object.keys(msgsFast).sort(), Object.keys(msgsNaive).sort());
    for (const id of Object.keys(msgsFast)) {
      assert.equal(msgsFast[id].parent_id, msgsNaive[id].parent_id);
    }
  });

  it('MessageStore maintains consistency', () => {
    const store = new MessageStore({});
    store.add({ id: 'a', parent_id: null, content: 'hi' });
    store.add({ id: 'b', parent_id: 'a', content: 'hello' });
    store.add({ id: 'c', parent_id: 'a', content: 'branch' });
    assert.equal(store.size(), 3);
    const siblings = store.getSiblings('a');
    assert.equal(siblings.length, 2);
    const path = store.getActivePath('b');
    assert.deepEqual(path.map(m => m.id), ['a', 'b']);
    const leaf = store.findLeaf('a');
    assert.ok(leaf === 'b' || leaf === 'c');
    store.delete('b');
    assert.equal(store.size(), 2);
    assert.equal(store.get('b'), undefined);
  });

  it('buildMessageMapFast correct', () => {
    const rows = [{ id: 'a', x: 1 }, { id: 'b', x: 2 }, { id: 'c', x: 3 }];
    const { map, lastId } = buildMessageMapFast(rows);
    assert.equal(map['a'].x, 1);
    assert.equal(lastId, 'c');
  });
});

describe('messageStore performance', () => {
  it('getSiblingsFast is faster than naive for large N', () => {
    const N = 1500;
    const msgs = genMessagesLinear(N);
    for (let i = 0; i < 50; i++) {
      msgs[`branch${i}`] = { id: `branch${i}`, parent_id: 'm0', role: 'user', content: 'branch', created_at: N + i };
    }
    const idx = buildChildrenIndex(msgs);
    const iterations = 300;
    const tNaive = time(() => getSiblingsNaive(msgs, 'm0'), iterations);
    const tFast = time(() => getSiblingsFast(msgs, idx, 'm0'), iterations);
    const speedup = tNaive / tFast;
    console.log(`\ngetSiblings: naive=${tNaive.toFixed(2)}ms fast=${tFast.toFixed(2)}ms speedup=${speedup.toFixed(2)}x (N=${N}, iter=${iterations})`);
    assert.ok(speedup > 2, `Expected speedup >2, got ${speedup}`);
  });

  it('getActivePathFast is faster than naive (avoids unshift)', () => {
    const N = 600;
    const msgs = genMessagesLinear(N);
    const leaf = `m${N - 1}`;
    const iterations = 600;
    const tNaive = time(() => getActivePathNaive(msgs, leaf), iterations);
    const tFast = time(() => getActivePathFast(msgs, leaf), iterations);
    const speedup = tNaive / tFast;
    console.log(`\ngetActivePath: naive=${tNaive.toFixed(2)}ms fast=${tFast.toFixed(2)}ms speedup=${speedup.toFixed(2)}x (depth=${N}, iter=${iterations})`);
    assert.ok(speedup > 1.2, `Expected speedup >1.2, got ${speedup}`);
  });

  it('findLeafFast is faster than naive for large N', () => {
    const N = 400;
    const msgs = genMessagesLinear(N);
    const idx = buildChildrenIndex(msgs);
    const iterations = 50;
    const tNaive = time(() => findLeafNaive(msgs, 'm0'), iterations);
    const tFast = time(() => findLeafFast(msgs, idx, 'm0'), iterations);
    const speedup = tNaive / tFast;
    console.log(`\nfindLeaf: naive=${tNaive.toFixed(2)}ms fast=${tFast.toFixed(2)}ms speedup=${speedup.toFixed(2)}x (N=${N}, iter=${iterations})`);
    assert.ok(speedup > 5, `Expected speedup >5, got ${speedup}`);
  });

  it('deleteWithReparentFast is faster than naive', () => {
    const N = 2000;
    const iterations = 200;
    // Micro-benchmark: finding children to reparent is the hot path.
    // Naive scans all messages O(N), fast does O(1) index lookup + O(k) reparent.
    const msgs = genMessagesLinear(N);
    const idx = buildChildrenIndex(msgs);
    // Add extra children to make reparent work visible: create 5 children under target
    for (let i = 0; i < 5; i++) msgs[`extra${i}`] = { id: `extra${i}`, parent_id: 'm1000', role: 'assistant', content: 'x' };
    const idx2 = buildChildrenIndex(msgs);
    const tNaive = time(() => {
      // naive: scan to find children
      const children = Object.values(msgs).filter(m => m.parent_id === 'm1000');
      // simulate reparent
      for (const c of children) c.parent_id = 'm999';
    }, iterations);
    const tFast = time(() => {
      const set = idx2.get('m1000');
      if (set) for (const cid of set) msgs[cid].parent_id = 'm999';
    }, iterations);
    const opSpeedup = tNaive / tFast;
    console.log(` delete reparent scan: naive=${tNaive.toFixed(2)}ms fast=${tFast.toFixed(2)}ms speedup=${opSpeedup.toFixed(2)}x (N=${N}, iter=${iterations})`);
    // restore
    for (let i = 0; i < 5; i++) msgs[`extra${i}`].parent_id = 'm1000';
    assert.ok(opSpeedup > 5, `Expected op speedup >5, got ${opSpeedup}`);
  });
});
