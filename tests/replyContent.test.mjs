import test from 'node:test';
import assert from 'node:assert/strict';
import { updateReplyContent } from '../lib/replyContent.js';

test('late reply updates leave a different conversation or new chat untouched', () => {
  for (const view of [{ replyB: { content: 'B is streaming' } }, {}]) {
    const result = updateReplyContent(view, 'replyA', () => assert.fail('stale update ran'));
    assert.strictEqual(result, view);
  }
});

test('updates only the matching reply without mutating the previous view', () => {
  const view = { user: { content: 'Hello' }, reply: { role: 'assistant', content: 'Hi' } };
  const result = updateReplyContent(view, 'reply', (content) => content + '!');
  assert.deepEqual(result.reply, { role: 'assistant', content: 'Hi!' });
  assert.strictEqual(result.user, view.user);
  assert.equal(view.reply.content, 'Hi');
});
