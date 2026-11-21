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
    <div className="sidebar d-flex flex-column h-100">
      <div className="sidebar-top">
        {onCollapse && (
          <div className="sidebar-collapse-row">
            <button className="sidebar-icon-btn" onClick={onCollapse} aria-label="Collapse sidebar" title="Collapse sidebar">
              <span aria-hidden="true">‹</span>
            </button>
          </div>
        )}
        <button className="sidebar-new-chat" onClick={handleNewChat}>
          + New Chat
        </button>
      </div>

      <div className="sidebar-list" onScroll={handleScroll}>
        {conversations.map(c => (
          <div
            key={c.id}
            role="button"
            tabIndex={0}
            onClick={() => loadMessages(dbToken, c.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                loadMessages(dbToken, c.id);
              }
            }}
            className={`sidebar-item ${c.id === activeConversation ? 'sidebar-item-active' : ''}`}
          >
            <span className="sidebar-item-title">{c.title}</span>
            <button
              type="button"
              className="sidebar-item-delete"
              aria-label="Delete conversation"
              title="Delete conversation"
              onClick={(e) => handleDeleteConversation(e, c.id)}
            >
              &times;
            </button>
          </div>
        ))}

        {/* Loading indicator */}
        {isLoading && (
          <div className="sidebar-loading">
            <small>Loading...</small>
          </div>
        )}
      </div>

      <div className="sidebar-bottom">
        <button className="sidebar-settings" onClick={() => setShowSettings(true)}>
          ⚙ Settings
        </button>
      </div>
    </div>
  );
}
