export const ROOT_PARENT_KEY = "__root__";

const parentKey = (parentId) => parentId ?? ROOT_PARENT_KEY;

const getMessageList = (messages) => {
  if (!messages) return [];
  return Array.isArray(messages) ? messages : Object.values(messages);
};

const compareMessages = (a, b) => {
  const aCreated = Number.isFinite(a?.created_at) ? a.created_at : 0;
  const bCreated = Number.isFinite(b?.created_at) ? b.created_at : 0;
  if (aCreated !== bCreated) return aCreated - bCreated;
  return String(a?.id ?? "").localeCompare(String(b?.id ?? ""));
};

export function buildMessageTreeIndex(messages) {
  const childrenByParent = Object.create(null);

  for (const message of getMessageList(messages)) {
    if (!message || !message.id) continue;
    const key = parentKey(message.parent_id);
    if (!childrenByParent[key]) childrenByParent[key] = [];
    childrenByParent[key].push(message);
  }

  const firstChildByParent = Object.create(null);
  for (const [key, children] of Object.entries(childrenByParent)) {
    children.sort(compareMessages);
    firstChildByParent[key] = children[0];
  }

  return { childrenByParent, firstChildByParent };
}

export function getActivePath(messages, currentId) {
  const path = [];
  const seen = new Set();
  let curr = currentId;

  while (curr && messages?.[curr] && !seen.has(curr)) {
    seen.add(curr);
    const message = messages[curr];
    path.push(message);
    curr = message.parent_id;
  }

  path.reverse();
  return path;
}

export function getSiblings(treeIndex, msgId, parentId) {
  const siblings = treeIndex?.childrenByParent?.[parentKey(parentId)] ?? [];
  return {
    siblings,
    index: siblings.findIndex((message) => message.id === msgId),
  };
}

export function getChildren(treeIndex, parentId) {
  return treeIndex?.childrenByParent?.[parentKey(parentId)] ?? [];
}

export function getFirstChild(treeIndex, parentId) {
  return treeIndex?.firstChildByParent?.[parentKey(parentId)] ?? null;
}

export function getDescendantLeaf(treeIndex, startId) {
  let leaf = startId;
  const seen = new Set();

  while (leaf && !seen.has(leaf)) {
    seen.add(leaf);
    const child = getFirstChild(treeIndex, leaf);
    if (!child || seen.has(child.id)) break;
    leaf = child.id;
  }

  return leaf;
}
