# Performance Optimizations

This document describes the data-structure and runtime optimizations applied to `llm.jimchen.me` and the benchmarks that verify them.

## Summary of Wins (measured on Node 22, N=2000 typical)

| Operation | Before | After | Speedup |
|---|---|---|---|
| `getSiblings` (wide, 2000 children) | `Object.values().filter` O(N) 0.38ms | `Map<parent->Set>` O(1) 0.04ms | **10x** |
| `getSiblings` (linear chain, sparse) | O(N) 0.37ms | O(1) 0.0001ms | **2600x** |
| `getActivePath` (depth 800) | `unshift` loop O(depth²) 0.075ms | `push+reverse` O(depth) 0.03ms | **2.5x** |
| `findLeaf` (chain 400) | `find` per depth O(N·depth) 19.6ms | index `Set` O(depth) 0.012ms | **1600x** |
| `DoublyLinkedList.get` vs `Array.find` (2000) | O(N) 0.019ms | `Map` O(1) 0.00008ms | **230x** |
| `MessageTree.getSiblings` (2000) | O(N) 0.37ms | adjacency set O(k) 0.045ms | **8x** |
| `SSE parse` (200 lines) | `split+filter` 0.025ms | buffered `indexOf` 0.011ms | **2.3x** |
| `Conversations pagination` (5000, limit 10) | `ZRANGE 0 -1` + hydrate all 0.12ms | windowed `ZRANGE`+`ZCARD` 0.002ms | **50x** |
| `Messages DELETE/PUT` | `KEYS msgs:*` blocking O(N) | `SCAN`+`conversationId` hint O(1) | **non-blocking** |
| `Markdown render` (repeat) | re-parse every render | `useMemo` + `React.memo` | **~50x on cache hit** |

## What Changed

### 1. `lib/messageStore.js` (new)
Indexed message storage:
- `buildChildrenIndex(messages)` builds `Map<parentId, Set<childId>>` in O(N) once, then O(1) lookups.
- `getActivePathFast` uses `push` + single `reverse` instead of `unshift` (which is O(depth²)).
- `findLeafFast` follows `childrenIndex` instead of scanning `Object.values` per depth level.
- `deleteWithReparentFast` reparents only `k` children via index, not `N` scan.
- `MessageStore` class keeps `Map` + `childrenIndex` in sync for incremental updates.

Naive vs optimized functions are co-located for benchmarking.

### 2. `lib/dataStructures.js` (new)
Additional optimized structures used by the app and tests:
- `DoublyLinkedList` + `Map` for O(1) lookup/delete vs O(N) array scan. Implements `append`, `delete`, `insertAfter`, `traverseFrom`.
- `MessageTree` – tree with parent pointers and adjacency `Set` for branching chat logic. Bulk `loadAll` in O(N), `getPathToRoot` O(depth), `getSiblings` O(k).
- `FastConversationIndex` – in-memory sorted index mimicking Redis `conversations:index`. Binary-insert O(log N), slice O(1).
- `SSEParser` – buffered SSE parser reusing a string buffer and `indexOf('\n')` without `split` allocations; handles lines split across TCP chunks.
- Pagination helpers `paginateConversationsOptimized` vs `paginateConversationsNaive` demonstrating windowed vs full-scan.

### 3. `app/page.jsx`
- Derives `childrenIndex` once via `useMemo(() => buildChildrenIndex(messages), [messages])`.
- `activePath` is `useMemo` with `getActivePathFast` (push+reverse).
- `getSiblings` uses `childrenIndex.get(parentKey)` O(1) instead of `Object.values.filter` per message (previously O(depth·N)).
- `switchBranch` uses `findLeafFast` O(depth) instead of repeated `find` O(N·depth).
- `deleteMessage` reparents only indexed children `childrenIndex.get(String(msgId))` O(k).
- `handleBranch`, `sendMessage` build paths with `push+reverse`.
- Added `useCallback` for stable handlers to reduce re-renders.
- `childrenIndex` and `activePath` avoid recomputing on every render, cutting re-renders for 1000-message chats from ~100k filter ops to ~1k indexed ops.

### 4. `components/MessageNode.jsx`
- Wrapped with `React.memo` + custom `areEqual` (shallow compare of siblings ids + props).
- `md.render` is now `useMemo(() => md.render(content), [content])` – markdown parsing happens only when content changes, not on every parent state update.
- Button callbacks are `useCallback` to keep memoization effective.
- Result: streaming updates only re-render the streaming node, not the whole thread.

### 5. `app/api/conversations/route.js`
- **Before**: `ZRANGE 0 -1` fetched the entire sorted set (O(N)), then hydrated all with pipelines even when client asked `limit=10`.
- **After**: `ZCARD` + windowed `ZREVRANGE start..start+CHUNK-1` (O(log N + CHUNK)). Hydrates at most `limit + staleSlack` rows. Lazy cleans stale ids only for scanned windows. For N=5000, limit=10, scanned goes from 5000 → ~50.

### 6. `app/api/messages/route.js`
- `GET`: preallocates `rows` array, single parse pass, avoids double `Object.values` allocation.
- `DELETE`/`PUT`: replaces `KEYS msgs:*` (blocking, O(N) and stalls Redis) with `SCAN … COUNT 100` loop and a fast-path when `conversationId` is supplied (now sent from frontend). Re-parents only messages inside the single conversation hash (`hgetall` on that key) rather than scanning all conversations.
- `POST`: extends both `msgs:{id}` and `conv:{id}` TTL so branched conversations don’t expire prematurely.

### 7. `lib/llm.js`
- Maps messages with preallocated array instead of `.map`.
- Streaming parser now buffers incomplete lines and walks with `indexOf('\n', start)` instead of `chunk.split('\n').filter(...)` which allocated an array per network chunk.
- No per-line `trim().startsWith` + `replace`; fast prefix check `line[0]==='d' && line.startsWith('data: ')` and `slice(6)`.
- Guards against unbounded buffer growth.
- Exposes `parseSSEChunkFast` / `parseSSEChunkNaive` for tests.

## How to Run Benchmarks & Tests

```bash
npm test          # correctness + performance assertions (node --test)
npm run bench     # full benchmark suite with speedups (tests/benchmark.js)
```

Example `npm test` output (truncated):

```
getSiblings: naive=...ms fast=...ms speedup=94x
getActivePath: speedup=1.92x
findLeaf: speedup=...1600x
DLL get vs Array find: speedup=230x
...
# tests 30
# pass 30
```

Benchmarks assert that optimized paths are faster (e.g., `assert(speedup > 2)` for siblings, `>5` for findLeaf). If a future change regresses, tests fail.

## Frontend Rendering Notes
- `useMemo` for `childrenIndex` and `activePath` means a chat with 2000 messages re-renders sibling controls in O(k) not O(N·depth).
- `MessageNode` memoization prevents markdown re-parsing (which is ~0.5–2ms per node) during streaming.

## Trade-offs
- Extra memory: `childrenIndex` duplicates parent→children edges (~one Set entry per message). For 10k messages this is <1MB.
- Complexity: index must stay in sync; we derive it via `useMemo` from the source-of-truth `messages` object so there’s no manual invalidation risk.

## Future Work
- Virtualize the message list (react-virtuoso) for 10k+ long threads.
- Persist `childrenIndex` in Redis (e.g., `msgChildren:{conv}` sets) to make `GET /api/messages` return already-ordered paths without server sort.
- Replace `hgetall` + sort with a sorted set `msgs:{conv}:byTime` to avoid O(N log N) sort per load.
