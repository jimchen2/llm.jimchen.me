'use client';

export default function Sidebar({
  conversations,
  activeConversation,
  handleNewChat,
  loadMessages,
  handleDeleteConversation,
  setShowSettings,
  dbToken,
  loadMore,
  hasMore,
  isLoading,
  onCollapse
}) {

  // Infinite scroll trigger function
  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    // Buffer of 5 pixels to trigger load
    if (scrollHeight - scrollTop <= clientHeight + 5 && hasMore && !isLoading) {
      loadMore();
    }
  };

  return (
    <div className="sidebar">
      <div className="sidebar-top">
        {onCollapse && (
          <div className="sidebar-top-actions">
            <button
              type="button"
              className="btn btn-sm btn-on-dark"
              onClick={onCollapse}
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
            >
              <span aria-hidden="true">‹</span>
            </button>
          </div>
        )}
        <button type="button" className="btn btn-on-dark" onClick={handleNewChat}>
          + New Chat
        </button>
      </div>

      <div className="sidebar-scroll" onScroll={handleScroll}>
        <ul className="conv-list">
          {conversations.map(c => (
            <li
              key={c.id}
              className={`conv-item${c.id === activeConversation ? ' is-active' : ''}`}
              onClick={() => loadMessages(dbToken, c.id)}
            >
              <span className="conv-title">{c.title}</span>
              <button
                type="button"
                className="conv-delete"
                onClick={(e) => handleDeleteConversation(e, c.id)}
                aria-label={`Delete conversation ${c.title}`}
              >
                &times;
              </button>
            </li>
          ))}
        </ul>

        {/* Loading Spinner / Text indicator */}
        {isLoading && (
          <div className="sidebar-loading">Loading...</div>
        )}
      </div>

      <div className="sidebar-foot">
        <button type="button" className="btn btn-on-dark" onClick={() => setShowSettings(true)}>
          ⚙ Settings
        </button>
      </div>
    </div>
  );
}
