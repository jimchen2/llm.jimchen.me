'use client';
import { Button, ListGroup } from 'react-bootstrap';
import { MODE_RANDOM, normalizeMode } from '@/lib/constants';

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
  isLoading
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
    <div className="d-flex flex-column h-100 bg-dark text-light border-end border-secondary">
      <div className="p-3 border-bottom border-secondary">
        <Button variant="outline-light" className="w-100 fw-bold" onClick={handleNewChat}>
          + New Chat
        </Button>
        <div className="text-center text-secondary mt-2" style={{ fontSize: '0.75rem' }}>
          New chats default to 🧮 tech mode
        </div>
      </div>
      
      <div className="flex-grow-1 overflow-auto p-2" onScroll={handleScroll}>
        <ListGroup variant="flush">
          {conversations.map(c => {
            const mode = normalizeMode(c.mode);
            const modeIcon = mode === MODE_RANDOM ? '🎲' : '🧮';
            const modeLabel = mode === MODE_RANDOM ? 'Random conversation' : 'Tech conversation';
            return (
              <ListGroup.Item 
                as="div"
                key={c.id} 
                action 
                onClick={() => loadMessages(dbToken, c.id)}
                className={`d-flex justify-content-between align-items-center rounded mb-1 text-light border-0 ${
                  c.id === activeConversation ? 'bg-secondary' : 'bg-dark'
                }`}
                style={{ cursor: 'pointer' }}
              >
                <span className="text-truncate flex-grow-1 me-2">
                  <span className="me-1" title={modeLabel}>{modeIcon}</span>
                  {c.title}
                </span>
                <Button 
                  variant="link" 
                  className="p-0 text-white-50 text-decoration-none fs-5" 
                  onClick={(e) => handleDeleteConversation(e, c.id)}
                >
                  &times;
                </Button>
              </ListGroup.Item>
            );
          })}
        </ListGroup>
        
        {/* Loading Spinner / Text indicator */}
        {isLoading && (
          <div className="text-center p-3 text-secondary">
            <small>Loading...</small>
          </div>
        )}
      </div>
      
      <div className="p-3 border-top border-secondary">
        <Button variant="dark" className="w-100 text-start" onClick={() => setShowSettings(true)}>
          ⚙ Settings
        </Button>
      </div>
    </div>
  );
}
