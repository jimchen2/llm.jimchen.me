// lib/messageStore.js
// Optimized message storage with O(1) indexed lookups.
// Previously the frontend did O(N) scans on every render:
//   Object.values(messages).filter(m => m.parent_id === parentId)
//   Object.values(messages).find(m => m.parent_id === leaf)
//   while(path) loop for active path
// This module provides a Map-backed store with a children index.

const ROOT_KEY = "__root__";

function normalizeParent(parentId) {
  return parentId == null ? ROOT_KEY : String(parentId);
}

// Build a children index from a plain messages object.
// Result: Map<parentKey, Set<id>>
// O(N) once, then O(1) per lookup.
export function buildChildrenIndex(messages) {
  const index = new Map();
  for (const id in messages) {
    const msg = messages[id];
    const key = normalizeParent(msg.parent_id);
    let set = index.get(key);
    if (!set) {
      set = new Set();
      index.set(key, set);
    }
    set.add(id);
  }
  return index;
}

// Incremental update helpers — O(1) per mutation so we never rebuild the whole index
// unless messages is replaced wholesale.
export function addToIndex(index, msg) {
  const key = normalizeParent(msg.parent_id);
  let set = index.get(key);
  if (!set) {
    set = new Set();
    index.set(key, set);
  }
  set.add(msg.id);
}

export function removeFromIndex(index, msg) {
  const key = normalizeParent(msg.parent_id);
  const set = index.get(key);
  if (set) {
    set.delete(msg.id);
    if (set.size === 0) index.delete(key);
  }
}

export function updateParentInIndex(index, msgId, oldParentId, newParentId) {
  if (String(oldParentId) === String(newParentId)) return;
  const oldKey = normalizeParent(oldParentId);
  const newKey = normalizeParent(newParentId);
  const oldSet = index.get(oldKey);
  if (oldSet) {
    oldSet.delete(msgId);
    if (oldSet.size === 0) index.delete(oldKey);
  }
  let newSet = index.get(newKey);
  if (!newSet) {
    newSet = new Set();
    index.set(newKey, newSet);
  }
  newSet.add(msgId);
}

// Fast sibling lookup: O(1) index get + O(k) where k = #siblings (not N)
export function getSiblingsFast(messages, childrenIndex, parentId) {
  const key = normalizeParent(parentId);
  const set = childrenIndex.get(key);
  if (!set) return [];
  // Preserve insertion order (Set iterates insertion order)
  const out = [];
  for (const id of set) {
    const m = messages[id];
    if (m) out.push(m);
  }
  return out;
}

// Id-only variant for tight loops (avoids mapping to objects)
export function getSiblingIdsFast(childrenIndex, parentId) {
  const set = childrenIndex.get(normalizeParent(parentId));
  return set ? Array.from(set) : [];
}

// Fast active path: O(depth) traversal, no allocations beyond path array.
// Uses hash map lookups O(1) each step.
export function getActivePathFast(messages, leafId) {
  const path = [];
  let curr = leafId;
  // Walk backwards then reverse once — avoids unshift O(depth^2)
  while (curr && messages[curr]) {
    path.push(messages[curr]);
    curr = messages[curr].parent_id;
  }
  // reverse in-place
  for (let i = 0, j = path.length - 1; i < j; i++, j--) {
    const tmp = path[i];
    path[i] = path[j];
    path[j] = tmp;
  }
  return path;
}

// Naive version for benchmarking comparison (old implementation)
export function getActivePathNaive(messages, leafId) {
  const path = [];
  let curr = leafId;
  while (curr && messages[curr]) {
    path.unshift(messages[curr]); // O(depth) per unshift -> O(depth^2)
    curr = messages[curr].parent_id;
  }
  return path;
}

export function getSiblingsNaive(messages, parentId) {
  return Object.values(messages).filter((m) => m.parent_id === parentId);
}

// Find deepest leaf following first-child pointers.
// Naive does linear scan per depth level O(N*depth). Fast uses index O(depth).
export function findLeafFast(messages, childrenIndex, startId) {
  let leaf = startId;
  while (true) {
    const set = childrenIndex.get(normalizeParent(leaf));
    if (!set || set.size === 0) break;
    // pick first child (insertion order). Using iterator avoids Array alloc.
    const first = set.values().next().value;
    if (!first || !messages[first]) break;
    leaf = first;
  }
  return leaf;
}

export function findLeafNaive(messages, startId) {
  let leaf = startId;
  let found = true;
  while (found) {
    const child = Object.values(messages).find((m) => m.parent_id === leaf);
    if (child) leaf = child.id;
    else found = false;
  }
  return leaf;
}

// Delete + reparent children: O(#children) instead of O(N)
export function deleteWithReparentFast(messages, childrenIndex, msgId) {
  const msg = messages[msgId];
  if (!msg) return { messages, childrenIndex };

  const parentId = msg.parent_id;
  const msgKey = normalizeParent(msg.parent_id);
  const childKey = normalizeParent(msgId);

  const childSet = childrenIndex.get(childKey);

  // Remove the message from its parent's set
  const parentSet = childrenIndex.get(msgKey);
  if (parentSet) {
    parentSet.delete(msgId);
    if (parentSet.size === 0) childrenIndex.delete(msgKey);
  }

  // Re-parent children to deleted node's parent
  if (childSet) {
    let newParentSet = childrenIndex.get(msgKey);
    if (!newParentSet) {
      newParentSet = new Set();
      childrenIndex.set(msgKey, newParentSet);
    }
    for (const childId of childSet) {
      const child = messages[childId];
      if (child) child.parent_id = parentId;
      newParentSet.add(childId);
    }
    childrenIndex.delete(childKey);
  }

  delete messages[msgId];
  return { messages, childrenIndex };
}

// Naive delete: O(N)
export function deleteWithReparentNaive(messages, msgId) {
  const msg = messages[msgId];
  const parentId = msg ? msg.parent_id : null;
  Object.values(messages).forEach((m) => {
    if (m.parent_id === msgId) m.parent_id = parentId;
  });
  delete messages[msgId];
  return messages;
}

// MessageStore class — keeps map + index in sync for incremental updates.
// Uses plain object for React state compatibility but also mirrors a Map for speed.
export class MessageStore {
  constructor(initialMessages = {}) {
    // Keep reference to plain object for React; also maintain Map for O(1) get
    this.messages = initialMessages; // plain object {id: msg}
    this.map = new Map(Object.entries(initialMessages));
    this.childrenIndex = buildChildrenIndex(initialMessages);
  }

  // Replace entire store (e.g., loadMessages)
  replaceAll(newMessages) {
    this.messages = newMessages;
    this.map = new Map(Object.entries(newMessages));
    this.childrenIndex = buildChildrenIndex(newMessages);
  }

  get(id) {
    return this.map.get(id);
  }

  add(msg) {
    this.messages[msg.id] = msg;
    this.map.set(msg.id, msg);
    addToIndex(this.childrenIndex, msg);
  }

  // O(1) siblings
  getSiblings(parentId) {
    return getSiblingsFast(this.messages, this.childrenIndex, parentId);
  }

  // O(depth)
  getActivePath(leafId) {
    return getActivePathFast(this.messages, leafId);
  }

  findLeaf(startId) {
    return findLeafFast(this.messages, this.childrenIndex, startId);
  }

  delete(msgId) {
    const msg = this.map.get(msgId);
    if (!msg) return;
    const result = deleteWithReparentFast(this.messages, this.childrenIndex, msgId);
    this.messages = result.messages;
    this.childrenIndex = result.childrenIndex;
    this.map.delete(msgId);
    // children parent_id already mutated in-place; map entries stay consistent
  }

  size() {
    return this.map.size;
  }

  // For iterating
  values() {
    return this.map.values();
  }

  toObject() {
    return this.messages;
  }
}

// Utility: build a message map from array in O(N) single pass (avoid spread copies)
export function buildMessageMapFast(rows) {
  const map = {};
  let lastId = null;
  for (let i = 0; i < rows.length; i++) {
    const m = rows[i];
    map[m.id] = m;
    lastId = m.id;
  }
  return { map, lastId };
}
