import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMessageTreeIndex,
  getActivePath,
  getChildren,
  getDescendantLeaf,
  getSiblings,
} from '../lib/messageTree.mjs';

const messages = {
  root: { id: 'root', parent_id: null, content: 'root', created_at: 1 },
  a: { id: 'a', parent_id: 'root', content: 'A', created_at: 2 },
  b: { id: 'b', parent_id: 'root', content: 'B', created_at: 3 },
  a1: { id: 'a1', parent_id: 'a', content: 'A1', created_at: 4 },
  b1: { id: 'b1', parent_id: 'b', content: 'B1', created_at: 5 },
};

test('getActivePath returns root-to-leaf message path', () => {
  assert.deepEqual(
    getActivePath(messages, 'a1').map((message) => message.id),
    ['root', 'a', 'a1']
  );
});

test('buildMessageTreeIndex provides O(1) child and sibling lookups', () => {
  const index = buildMessageTreeIndex(messages);

  assert.deepEqual(getChildren(index, 'root').map((message) => message.id), ['a', 'b']);

  const { siblings, index: siblingIndex } = getSiblings(index, 'b', 'root');
  assert.deepEqual(siblings.map((message) => message.id), ['a', 'b']);
  assert.equal(siblingIndex, 1);
});

test('getDescendantLeaf follows the first child chain without scanning all messages', () => {
  const index = buildMessageTreeIndex(messages);
  assert.equal(getDescendantLeaf(index, 'root'), 'a1');
  assert.equal(getDescendantLeaf(index, 'b'), 'b1');
});

test('path and leaf helpers tolerate accidental cycles', () => {
  const cyclicMessages = {
    a: { id: 'a', parent_id: 'c', created_at: 1 },
    b: { id: 'b', parent_id: 'a', created_at: 2 },
    c: { id: 'c', parent_id: 'b', created_at: 3 },
  };
  const cyclicIndex = buildMessageTreeIndex(cyclicMessages);

  assert.deepEqual(getActivePath(cyclicMessages, 'c').map((message) => message.id), ['a', 'b', 'c']);
  assert.equal(getDescendantLeaf(cyclicIndex, 'a'), 'c');
});

test('large conversations can be indexed and navigated quickly', () => {
  const largeMessages = {};
  const messageCount = 20_000;

  for (let i = 0; i < messageCount; i += 1) {
    largeMessages[`m${i}`] = {
      id: `m${i}`,
      parent_id: i === 0 ? null : `m${i - 1}`,
      created_at: i,
      content: `message ${i}`,
    };
  }

  const started = performance.now();
  const index = buildMessageTreeIndex(largeMessages);
  const path = getActivePath(largeMessages, `m${messageCount - 1}`);
  const leaf = getDescendantLeaf(index, 'm0');
  const elapsedMs = performance.now() - started;

  assert.equal(path.length, messageCount);
  assert.equal(leaf, `m${messageCount - 1}`);
  assert.ok(elapsedMs < 1_000, `large conversation helpers took ${elapsedMs.toFixed(1)}ms`);
});
