// components/SettingsModal.jsx
'use client';

import { useState, useEffect } from 'react';
import { Modal, Form, Button, ListGroup, Badge } from 'react-bootstrap';
import { DEFAULT_MODE } from '../lib/modes';

export default function SettingsModal({ show, onHide, settings, setSettings, onSave }) {
  const [isDark, setIsDark] = useState(false);

  // Dynamically check if Dark Reader is enabled when modal opens
  useEffect(() => {
    if (show) {
      import('darkreader').then((darkreader) => {
        setIsDark(darkreader.isEnabled());
      });
    }
  }, [show]);

  const handleDarkModeToggle = async (e) => {
    const enable = e.target.checked;
    setIsDark(enable);
    
    // Save theme preference in cookie for 1 year
    document.cookie = `theme=${enable ? 'dark' : 'light'}; path=/; max-age=31536000`;
    
    // Dynamically import darkreader only on the client
    const darkreader = await import('darkreader');
    
    if (enable) {
      darkreader.enable({
        brightness: 100,
        contrast: 90,
        sepia: 10,
      });
    } else {
      darkreader.disable();
    }
  };

  const modes = settings.modes || [];

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title>Settings</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form>
          <Form.Group className="mb-4 d-flex justify-content-between align-items-center">
            <Form.Label className="fw-bold mb-0">Dark Mode</Form.Label>
            <Form.Check 
              type="switch"
              id="dark-mode-switch"
              checked={isDark}
              onChange={handleDarkModeToggle}
            />
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label className="fw-bold">Model override</Form.Label>
            <Form.Control
              type="text"
              placeholder={settings.defaultModel}
              value={settings.modelOverride || ''}
              onChange={e => setSettings({...settings, modelOverride: e.target.value})}
            />
            <Form.Text className="text-muted">
              Leave empty to use the model configured for each mode (default: <code>{settings.defaultModel}</code>).
            </Form.Text>
          </Form.Group>

          {/* API keys and system prompts are server side only (see .env.example) */}
          <Form.Group className="mb-3">
            <Form.Label className="fw-bold">Modes</Form.Label>
            <ListGroup variant="flush">
              {modes.map(m => (
                <ListGroup.Item key={m.id} className="px-0 py-2">
                  <div className="d-flex justify-content-between align-items-center">
                    <span className="fw-semibold">{m.icon} Mode {m.number} · {m.label}{m.id === DEFAULT_MODE ? ' (default)' : ''}</span>
                    <Badge bg={m.mocked ? 'warning' : 'success'} text={m.mocked ? 'dark' : undefined}>
                      {m.mocked ? 'mock (dev)' : 'key set'}
                    </Badge>
                  </div>
                  <div className="small text-muted">
                    model <code>{m.model}</code> · key <code>{m.apiKeyEnv}</code>
                  </div>
                  <div className="small text-muted">
                    system prompt: {m.hasSystemPrompt ? <code>{m.systemPromptEnv}</code> : <em>none (sent to the model without any system prompt)</em>}
                  </div>
                </ListGroup.Item>
              ))}
            </ListGroup>
            <Form.Text className="text-muted">
              API keys and system prompts live in the server environment, not in this dialog — see
              {' '}<code>.env.example</code>. Each mode keeps its own key so usage can be billed separately.
            </Form.Text>
          </Form.Group>
        </Form>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="primary" onClick={onSave}>Save Settings</Button>
      </Modal.Footer>
    </Modal>
  );
}
