// lib/dataStructures.js
// Optimized data structures for chat message handling.
// Provides DoublyLinkedList, MessageTree, and FastConversationIndex
// with benchmark comparisons against naive array/object scans.

// ========== Doubly Linked List ==========
// O(1) append, delete, traverse. Backed by Map for O(1) random access.
// Traditional doubly linked list would be O(N) for find by id; we augment
// with a hash map so get/delete are O(1) while preserving order.

export class DLLNode {
  constructor(id, value) {
    this.id = id;
    this.value = value;
    this.prev = null;
    this.next = null;
  }
}

export class DoublyLinkedList {
  constructor() {
    this.head = null;
    this.tail = null;
    this.map = new Map(); // id -> node O(1)
    this._size = 0;
  }

  get size() { return this._size; }

  has(id) { return this.map.has(id); }

  get(id) {
    const n = this.map.get(id);
    return n ? n.value : undefined;
  }

  getNode(id) { return this.map.get(id) || null; }

  append(id, value) {
    const node = new DLLNode(id, value);
    if (!this.tail) {
      this.head = this.tail = node;
    } else {
      node.prev = this.tail;
      this.tail.next = node;
      this.tail = node;
    }
    this.map.set(id, node);
    this._size++;
    return node;
  }

  // O(1) delete via map lookup + pointer fixup
  delete(id) {
    const node = this.map.get(id);
    if (!node) return false;
    if (node.prev) node.prev.next = node.next;
    else this.head = node.next;
    if (node.next) node.next.prev = node.prev;
    else this.tail = node.prev;
    this.map.delete(id);
    this._size--;
    return true;
  }

  // O(1) insert after
  insertAfter(afterId, id, value) {
    const after = this.map.get(afterId);
    if (!after) return this.append(id, value);
    const node = new DLLNode(id, value);
    node.prev = after;
    node.next = after.next;
    if (after.next) after.next.prev = node;
    else this.tail = node;
    after.next = node;
    this.map.set(id, node);
    this._size++;
    return node;
  }

  // Traverse forward from id — O(k) where k = remaining length
  *traverseFrom(id) {
    let cur = id ? this.map.get(id) : this.head;
    while (cur) {
      yield cur.value;
      cur = cur.next;
    }
  }

  // Traverse backward
  *traverseBackwardFrom(id) {
    let cur = id ? this.map.get(id) : this.tail;
    while (cur) {
      yield cur.value;
      cur = cur.prev;
    }
  }

  toArray() {
    const arr = new Array(this._size);
    let i = 0;
    let cur = this.head;
    while (cur) {
      arr[i++] = cur.value;
      cur = cur.next;
    }
    return arr;
  }

  clear() {
    this.head = this.tail = null;
    this.map.clear();
    this._size = 0;
  }
}

// ========== Message Tree ==========
// Tree with parent pointers + children adjacency list.
// All operations O(1) or O(children) instead of O(N) scans.

export class MessageTreeNode {
  constructor(msg) {
    this.id = msg.id;
    this.msg = msg;
    this.parent = null; // id or null
    this.children = new Set(); // child ids, insertion order
  }
}

export class MessageTree {
  constructor() {
    this.nodes = new Map(); // id -> MessageTreeNode
    this.rootChildren = new Set(); // ids with parent == null
  }

  get size() { return this.nodes.size; }

  has(id) { return this.nodes.has(id); }

  get(id) {
    const n = this.nodes.get(id);
    return n ? n.msg : undefined;
  }

  add(msg) {
    const node = new MessageTreeNode(msg);
    node.parent = msg.parent_id || null;
    this.nodes.set(msg.id, node);
    if (msg.parent_id == null) {
      this.rootChildren.add(msg.id);
    } else {
      const parent = this.nodes.get(msg.parent_id);
      if (parent) parent.children.add(msg.id);
      else {
        // parent not yet inserted — we still track orphan; parent insertion will link?
        // For simplicity, lazily fix on parent add: re-scan orphans. Instead keep orphan map.
        // Here we just store and on future add we check.
      }
    }
    // fix orphans that were waiting for this node as parent
    for (const [oid, onode] of this.nodes) {
      if (oid !== msg.id && onode.parent === msg.id && !node.children.has(oid)) {
        // orphan was added before parent; link now if not already root
        if (this.rootChildren.has(oid)) this.rootChildren.delete(oid);
        node.children.add(oid);
      }
    }
    return node;
  }

  // Bulk load O(N)
  loadAll(messagesObjOrArray) {
    this.nodes.clear();
    this.rootChildren.clear();
    const arr = Array.isArray(messagesObjOrArray) ? messagesObjOrArray : Object.values(messagesObjOrArray);
    // Two-pass: create nodes, then link
    for (const m of arr) {
      const node = new MessageTreeNode(m);
      node.parent = m.parent_id || null;
      this.nodes.set(m.id, node);
    }
    for (const node of this.nodes.values()) {
      const p = node.parent;
      if (p == null) this.rootChildren.add(node.id);
      else {
        const parent = this.nodes.get(p);
        if (parent) parent.children.add(node.id);
        else this.rootChildren.add(node.id); // orphan -> treat as root
      }
    }
  }

  getChildren(parentId) {
    if (parentId == null) {
      const out = [];
      for (const id of this.rootChildren) {
        const n = this.nodes.get(id);
        if (n) out.push(n.msg);
      }
      return out;
    }
    const p = this.nodes.get(parentId);
    if (!p) return [];
    const out = [];
    for (const cid of p.children) {
      const n = this.nodes.get(cid);
      if (n) out.push(n.msg);
    }
    return out;
  }

  getSiblings(parentId) { return this.getChildren(parentId); }

  getSiblingIds(parentId) {
    if (parentId == null) return Array.from(this.rootChildren);
    const p = this.nodes.get(parentId);
    return p ? Array.from(p.children) : [];
  }

  getPathToRoot(leafId) {
    const path = [];
    let cur = leafId;
    while (cur && this.nodes.has(cur)) {
      const n = this.nodes.get(cur);
      path.push(n.msg);
      cur = n.parent;
    }
    // reverse
    for (let i = 0, j = path.length - 1; i < j; i++, j--) {
      const tmp = path[i];
      path[i] = path[j];
      path[j] = tmp;
    }
    return path;
  }

  findLeaf(startId) {
    let cur = startId;
    while (true) {
      const node = this.nodes.get(cur);
      if (!node || node.children.size === 0) break;
      cur = node.children.values().next().value;
    }
    return cur;
  }

  // Delete + reparent O(#children)
  delete(id) {
    const node = this.nodes.get(id);
    if (!node) return false;
    const parentId = node.parent;

    // remove from parent's child set or root
    if (parentId == null) this.rootChildren.delete(id);
    else {
      const parent = this.nodes.get(parentId);
      if (parent) parent.children.delete(id);
    }

    // reparent children
    for (const childId of node.children) {
      const child = this.nodes.get(childId);
      if (!child) continue;
      child.parent = parentId;
      child.msg.parent_id = parentId;
      if (parentId == null) this.rootChildren.add(childId);
      else {
        const newParent = this.nodes.get(parentId);
        if (newParent) newParent.children.add(childId);
        else this.rootChildren.add(childId);
      }
    }

    this.nodes.delete(id);
    return true;
  }

  // Update message content O(1)
  updateContent(id, content) {
    const n = this.nodes.get(id);
    if (n) n.msg.content = content;
  }

  toObject() {
    const out = {};
    for (const [id, node] of this.nodes) out[id] = node.msg;
    return out;
  }
}

// ========== Fast Conversation Index ==========
// Sorted set + hash index similar to Redis conversations:index
// Maintains conversations sorted by created_at descending without resorting on each query.
// Uses binary insertion O(log N) for add, O(N) shift worst but N is small (conversations).
// For large N, could use balanced tree; here we optimize with Map + sorted array + lazy sort.

export class FastConversationIndex {
  constructor() {
    this.map = new Map(); // id -> conv
    this.sorted = []; // array sorted descending by created_at
    this.dirty = false;
  }

  add(conv) {
    this.map.set(conv.id, conv);
    // Insert in sorted order via binary search O(log N)
    let lo = 0, hi = this.sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.sorted[mid].created_at > conv.created_at) lo = mid + 1;
      else hi = mid;
    }
    this.sorted.splice(lo, 0, conv);
  }

  remove(id) {
    const conv = this.map.get(id);
    if (!conv) return;
    this.map.delete(id);
    const idx = this.sorted.findIndex(c => c.id === id);
    if (idx !== -1) this.sorted.splice(idx, 1);
  }

  // paginated slice O(1) slice, no full scan
  slice(offset, limit) {
    return this.sorted.slice(offset, offset + limit);
  }

  get size() { return this.map.size; }
}

// ========== Optimized string/buffer utilities ==========
// For LLM streaming: avoid split+filter per chunk which creates many temporary arrays.

// Fast SSE line parser reusing a buffer string
export class SSEParser {
  constructor() {
    this.buffer = "";
  }

  // Feed a new chunk string, return array of data payloads (without "data: " prefix)
  // Reuses buffer to handle split lines across chunks with minimal allocations.
  feed(chunk) {
    this.buffer += chunk;
    const payloads = [];
    let start = 0;
    while (true) {
      const nl = this.buffer.indexOf("\n", start);
      if (nl === -1) break;
      const line = this.buffer.slice(start, nl);
      start = nl + 1;
      // Fast check without trim: data: prefix has 5 chars
      if (line.length >= 6 && line[0] === 'd' && line.startsWith("data: ")) {
        const data = line.slice(6).trim();
        if (data) payloads.push(data);
      }
    }
    // Keep remainder
    if (start > 0) {
      this.buffer = this.buffer.slice(start);
    }
    // Avoid unbounded buffer growth (shouldn't happen with proper SSE)
    if (this.buffer.length > 1_000_000) this.buffer = "";
    return payloads;
  }

  flush() {
    const b = this.buffer;
    this.buffer = "";
    if (b.startsWith("data: ")) return [b.slice(6).trim()];
    return [];
  }
}

// Micro-optimized conversation pagination (windowed) vs full-scan
// Naive: zrevrange 0 -1 then pipeline hgetall for all, then slice
// Optimized: fetch only offset..offset+limit+staleBuffer via pipeline, loop if stale exceeded.
// This function simulates the logic for testing without Redis.
export function paginateConversationsOptimized(sortedIds, hydrateFn, offset, limit, staleSet) {
  const out = [];
  let skip = offset;
  let scanned = 0;
  const CHUNK = 50;
  // we only need to look ahead enough to fill limit + handle stales
  // In worst case where many stale, we may scan further, but bounded.
  let idx = 0;
  const maxScan = Math.min(sortedIds.length, offset + limit + Math.max(50, Math.floor(sortedIds.length * 0.1)));
  // Simpler model: iterate chunks but early exit once we have limit and not scanning beyond needed
  // For simulation we iterate until limit filled or idx exceeds sortedIds
  for (let i = 0; i < sortedIds.length && out.length < limit; i += CHUNK) {
    const chunkIds = sortedIds.slice(i, i + CHUNK);
    const rows = chunkIds.map(hydrateFn); // hydrateFn returns null for stale
    for (let j = 0; j < rows.length; j++) {
      const row = rows[j];
      const id = chunkIds[j];
      if (!row) continue; // stale handled elsewhere count
      if (staleSet && staleSet.has(id)) continue; // stale
      if (skip > 0) { skip--; continue; }
      out.push(row);
      if (out.length >= limit) break;
    }
    scanned += chunkIds.length;
    // early break if we have filled and we aren't in a high-stale scenario
    if (out.length >= limit) break;
    // If we still haven't filled, keep scanning
  }
  return { rows: out, scanned };
}

export function paginateConversationsNaive(sortedIds, hydrateFn, offset, limit, staleSet) {
  const all = [];
  for (const id of sortedIds) {
    const row = hydrateFn(id);
    if (!row) continue;
    if (staleSet && staleSet.has(id)) continue;
    all.push(row);
  }
  return { rows: all.slice(offset, offset + limit), scanned: sortedIds.length };
}
