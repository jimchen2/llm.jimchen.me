import test from 'node:test';
import assert from 'node:assert/strict';
import { getModeMemory, getModeMessages } from '../lib/modes.js';

const messages = {
  first: { role: 'user', content: 'My name is Sam.', parent_id: null },
  answer: { role: 'assistant', content: 'Hello, Sam!', parent_id: 'first' },
  followup: { role: 'user', content: 'What is my name?', parent_id: 'answer' },
  otherBranch: { role: 'user', content: 'Unrelated branch', parent_id: 'first' },
};

test('random mode sends the full active conversation history', () => {
  assert.equal(getModeMemory('random'), Infinity);
  assert.deepEqual(getModeMessages('random', messages, 'followup'), [
    { role: 'user', content: 'My name is Sam.' },
    { role: 'assistant', content: 'Hello, Sam!' },
    { role: 'user', content: 'What is my name?' },
  ]);
});

test('random mode retry and branch context includes only the selected ancestry', () => {
  assert.deepEqual(getModeMessages('random', messages, 'otherBranch'), [
    { role: 'user', content: 'My name is Sam.' },
    { role: 'user', content: 'Unrelated branch' },
  ]);
  assert.deepEqual(getModeMessages('random', messages, 'first'), [
    { role: 'user', content: 'My name is Sam.' },
  ]);
});

test('default and grammar retain full history', () => {
  for (const mode of ['default', 'grammar']) {
    assert.equal(getModeMemory(mode), Infinity);
    assert.deepEqual(getModeMessages(mode, messages, 'followup'), getModeMessages('random', messages, 'followup'));
  }
});
