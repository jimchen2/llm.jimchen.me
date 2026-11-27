import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getModeConfig,
  getModeMemory,
  getModeMaxMessages,
  getModeMessages,
  modeIsReadOnlyOnDevice,
  modePersistsConversation,
  modeWriteRequiresComputer,
  normalizeMode,
} from '../lib/modes.js';

const messages = {
  first: { role: 'user', content: 'My name is Sam.', parent_id: null },
  answer: { role: 'assistant', content: 'Hello, Sam!', parent_id: 'first' },
  followup: { role: 'user', content: 'What is my name?', parent_id: 'answer' },
  otherBranch: { role: 'user', content: 'Unrelated branch', parent_id: 'first' },
};

// Random mode means no system prompt at all. It keeps full memory like the
// default mode, is read-only on phones, and its conversations never expire in
// Redis.
test('random mode has no system prompt, full memory and never expires', () => {
  assert.equal(normalizeMode('random'), 'random');
  assert.equal(getModeConfig('random').systemPrompt, '');
  assert.equal(getModeMemory('random'), Infinity);
  assert.equal(getModeMaxMessages('random'), Infinity);
  assert.deepEqual(getModeMessages('random', messages, 'followup'), [
    { role: 'user', content: 'My name is Sam.' },
    { role: 'assistant', content: 'Hello, Sam!' },
    { role: 'user', content: 'What is my name?' },
  ]);

  // Read-only on a phone, writable on a computer, and kept in Redis without a
  // TTL.
  assert.equal(modeWriteRequiresComputer('random'), true);
  assert.equal(modeIsReadOnlyOnDevice('random', false), true);
  assert.equal(modeIsReadOnlyOnDevice('random', true), false);
  assert.equal(modePersistsConversation('random'), true);
});

test('random mode ignores RANDOM_MODE_SYSTEM_PROMPT', () => {
  const previous = process.env.RANDOM_MODE_SYSTEM_PROMPT;
  process.env.RANDOM_MODE_SYSTEM_PROMPT = 'Answer only in rhyme.';
  try {
    assert.equal(getModeConfig('random').systemPrompt, '');
  } finally {
    if (previous === undefined) delete process.env.RANDOM_MODE_SYSTEM_PROMPT;
    else process.env.RANDOM_MODE_SYSTEM_PROMPT = previous;
  }
});

test('other modes keep their system prompts, full/default expiry and are writable everywhere', () => {
  for (const mode of ['default', 'grammar', 'practical']) {
    assert.equal(modeWriteRequiresComputer(mode), false);
    assert.equal(modeIsReadOnlyOnDevice(mode, false), false);
    assert.equal(modeIsReadOnlyOnDevice(mode, true), false);
    assert.equal(modePersistsConversation(mode), false);
    assert.ok(getModeConfig(mode).systemPrompt.length > 0);
  }
});

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
