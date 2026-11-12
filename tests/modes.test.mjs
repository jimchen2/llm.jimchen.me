import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getModeConfig,
  getModeMemory,
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

test('practical mode is a real mode with its own prompt', () => {
  assert.equal(normalizeMode('practical'), 'practical');
  assert.equal(getModeMemory('practical'), Infinity);
  assert.match(getModeConfig('practical').systemPrompt, /short and concisely/i);
});

test('default, grammar, and practical retain full history', () => {
  for (const mode of ['default', 'grammar', 'practical']) {
    assert.equal(getModeMemory(mode), Infinity);
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
