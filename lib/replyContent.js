// A request can outlive the view (or message) that started it. Never insert a
// missing reply: the current map may belong to a different conversation.
export function updateReplyContent(messages, replyId, update) {
  const reply = messages[replyId];
  if (!reply) return messages;

  const content = update(reply.content);
  if (content === reply.content) return messages;
  return { ...messages, [replyId]: { ...reply, content } };
}
