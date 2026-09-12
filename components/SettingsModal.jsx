// components/SettingsModal.jsx
'use client';

import { useState, useEffect } from 'react';
import { Modal, Form, Button } from 'react-bootstrap';
import { MODE_TECH, MODE_RANDOM, DEFAULT_MODEL } from '@/lib/constants';

export default function SettingsModal({
  show,
  onHide,
  settings,
  setSettings,
  onSave,
  mode,
  modeLocked,
  onModeChange,
}) {
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

  const isRandom = mode === MODE_RANDOM;

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title>Settings</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form>
          {/* Mode — the default mode for new chats. Once a conversation exists,
              its mode is fixed, so the picker shows (and locks to) that mode. */}
          <Form.Group className="mb-3">
            <Form.Label className="fw-bold">Mode</Form.Label>
            <div className="d-flex gap-2">
              <Button
                variant={mode === MODE_TECH ? 'primary' : 'outline-secondary'}
                onClick={() => onModeChange?.(MODE_TECH)}
                disabled={modeLocked}
                className="w-100"
                title="Mode 1: tech assistant with the tech system prompt"
              >
                🧮 Tech
              </Button>
              <Button
                variant={mode === MODE_RANDOM ? 'warning' : 'outline-secondary'}
                onClick={() => onModeChange?.(MODE_RANDOM)}
                disabled={modeLocked}
                className="w-100"
                title="Mode 2: no system prompt, talk about anything"
              >
                🎲 Random
              </Button>
            </div>
            <Form.Text className="text-muted">
              {modeLocked
                ? `🔒 This conversation is ${isRandom ? 'random' : 'tech'} — mode is fixed per conversation.`
                : isRandom
                  ? 'Mode 2: no system prompt — talk about anything.'
                  : 'Mode 1 (default): math & CS system prompt.'}
            </Form.Text>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label className="fw-bold">Model</Form.Label>
            <Form.Control
              type="text"
              placeholder="Model"
              value={settings.model || ''}
              onChange={(e) => setSettings({ ...settings, model: e.target.value })}
            />
            <Form.Text className="text-muted">
              Default: {DEFAULT_MODEL}. API keys and prompts live server-side in .env (see .env.example).
            </Form.Text>
          </Form.Group>

          <Form.Group className="mb-0 pt-3 border-top d-flex justify-content-between align-items-center">
            <Form.Label className="fw-bold mb-0">Dark Mode</Form.Label>
            <Form.Check
              type="switch"
              id="dark-mode-switch"
              checked={isDark}
              onChange={handleDarkModeToggle}
            />
          </Form.Group>
        </Form>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="primary" onClick={onSave}>
          Save Settings
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
