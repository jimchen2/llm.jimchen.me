import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getModeConfig,
  getModeMemory,
  getModeMaxMessages,
  getModeMessages,
  normalizeMode,
} from '../lib/modes.js';

const messages = {
  first: { role: 'user', content: 'My name is Sam.', parent_id: null },
  answer: { role: 'assistant', content: 'Hello, Sam!', parent_id: 'first' },
  followup: { role: 'user', content: 'What is my name?', parent_id: 'answer' },
  otherBranch: { role: 'user', content: 'Unrelated branch', parent_id: 'first' },
};

// Random mode is disabled for now (see lib/modes.js). The mode key is gone from
// MODES, so any stored conversation / request with mode "random" falls back to
// the default mode — including its full conversation memory.
test('random mode falls back to the default mode', () => {
  assert.equal(normalizeMode('random'), 'default');
  assert.equal(getModeMemory('random'), Infinity);
  assert.deepEqual(getModeMessages('random', messages, 'followup'), [
    { role: 'user', content: 'My name is Sam.' },
    { role: 'assistant', content: 'Hello, Sam!' },
    { role: 'user', content: 'What is my name?' },
  ]);
});

// Original no-memory behaviour of random mode, kept for when it is re-enabled.
//
// test('random mode has no memory: only the current message is sent', () => {
//   assert.equal(getModeMemory('random'), 0);
//   // Even in the middle of a conversation, earlier user/assistant turns
//   // ("My name is Sam." / "Hello, Sam!") must not be sent to the LLM.
//   assert.deepEqual(getModeMessages('random', messages, 'followup'), [
//     { role: 'user', content: 'What is my name?' },
//   ]);
//   assert.deepEqual(getModeMessages('random', messages, 'answer'), [
//     { role: 'assistant', content: 'Hello, Sam!' },
//   ]);
//   assert.deepEqual(getModeMessages('random', messages, 'first'), [
//     { role: 'user', content: 'My name is Sam.' },
//   ]);
// });
//
// test('random mode retry and branch context is only the selected message', () => {
//   // Retry re-sends just the prompt being retried (its parent user message),
//   // with no ancestry before it.
//   assert.deepEqual(getModeMessages('random', messages, 'otherBranch'), [
//     { role: 'user', content: 'Unrelated branch' },
//   ]);
// });

test('practical route is short conversation mode with a five-exchange limit', () => {
  assert.equal(normalizeMode('practical'), 'practical');
  assert.equal(getModeMemory('practical'), 9);
  assert.equal(getModeMaxMessages('practical'), 10);
  assert.match(getModeConfig('practical').label, /short conversation/i);
  assert.match(getModeConfig('practical').systemPrompt, /conversational/i);
  assert.match(getModeConfig('practical').systemPrompt, /shortly and concisely/i);
});

test('default and grammar modes retain full history', () => {
  for (const mode of ['default', 'grammar']) {
    assert.equal(getModeMemory(mode), Infinity);
    assert.equal(getModeMaxMessages(mode), Infinity);
    assert.deepEqual(getModeMessages(mode, messages, 'followup'), [
      { role: 'user', content: 'My name is Sam.' },
      { role: 'assistant', content: 'Hello, Sam!' },
      { role: 'user', content: 'What is my name?' },
    ]);
    // Branch/retry ancestry is still limited to the selected path.
    assert.deepEqual(getModeMessages(mode, messages, 'otherBranch'), [
      { role: 'user', content: 'My name is Sam.' },
      { role: 'user', content: 'Unrelated branch' },
    ]);
  }
});

test('short conversation context is capped at the latest ten messages', () => {
  const longPath = {};
  let parentId = null;
  for (let i = 0; i < 12; i++) {
    const id = `message-${i}`;
    longPath[id] = {
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Message ${i}`,
      parent_id: parentId,
    };
    parentId = id;
  }

  assert.deepEqual(
    getModeMessages('practical', longPath, parentId),
    Array.from({ length: 10 }, (_, i) => ({
      role: (i + 2) % 2 === 0 ? 'user' : 'assistant',
      content: `Message ${i + 2}`,
    }))
  );
});
