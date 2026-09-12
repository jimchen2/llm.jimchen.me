// components/SettingsModal.jsx
'use client';

import { useState, useEffect } from 'react';
import { Modal, Form, Button } from 'react-bootstrap';
import { MODES, MODE_LABELS, DEFAULT_MODE } from '@/lib/modes';

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

  const activeMode = settings.activeMode || DEFAULT_MODE;
  const modes = settings.modes || {};

  const updateMode = (mode, patch) => {
    setSettings({
      ...settings,
      modes: {
        ...modes,
        [mode]: { ...(modes[mode] || {}), ...patch },
      },
    });
  };

  return (
    <Modal show={show} onHide={onHide} centered scrollable>
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

          <Form.Group className="mb-4">
            <Form.Label className="fw-bold">Active Mode</Form.Label>
            <Form.Select
              value={activeMode}
              onChange={(e) => setSettings({ ...settings, activeMode: e.target.value })}
            >
              {MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {MODE_LABELS[mode]}
                </option>
              ))}
            </Form.Select>
          </Form.Group>

          {MODES.map((mode) => (
            <div key={mode} className="mb-4 border rounded p-3">
              <div className="fw-bold mb-3">
                {MODE_LABELS[mode]}
                {mode === activeMode && <span className="badge bg-primary ms-2">active</span>}
              </div>

              <Form.Group className="mb-3">
                <Form.Label>API Key</Form.Label>
                <Form.Control
                  type="password"
                  placeholder="API Key"
                  value={modes[mode]?.apiKey || ''}
                  onChange={(e) => updateMode(mode, { apiKey: e.target.value })}
                />
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>Model</Form.Label>
                <Form.Control
                  type="text"
                  placeholder="Model"
                  value={modes[mode]?.model || ''}
                  onChange={(e) => updateMode(mode, { model: e.target.value })}
                />
              </Form.Group>

              <Form.Group>
                <Form.Label>System Prompt</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={3}
                  placeholder="Leave empty for no system prompt"
                  value={modes[mode]?.systemPrompt ?? ''}
                  onChange={(e) => updateMode(mode, { systemPrompt: e.target.value })}
                />
                <Form.Text muted>Empty is valid — no system prompt will be sent.</Form.Text>
              </Form.Group>
            </div>
          ))}
        </Form>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="primary" onClick={onSave}>Save Settings</Button>
      </Modal.Footer>
    </Modal>
  );
}
