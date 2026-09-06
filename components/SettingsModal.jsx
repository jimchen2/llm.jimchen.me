// components/SettingsModal.jsx
'use client';

import { useState, useEffect } from 'react';
import { Modal, Form, Button } from 'react-bootstrap';

// Current Gemini text models (September 2026). The field still accepts any
// custom model id — this list is just a quick picker.
const MODEL_SUGGESTIONS = [
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3-flash-preview',
  'gemini-3.1-pro-preview',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
];

const THINKING_LEVELS = [
  { value: 'minimal', label: 'Minimal (fastest)' },
  { value: 'low', label: 'Low (default)' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High (most reasoning)' },
];

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
            <Form.Label className="fw-bold">API Key</Form.Label>
            <Form.Control
              type="password"
              placeholder="API Key"
              value={settings.apiKey || ''}
              onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
            />
            <Form.Text className="text-muted">
              Stored on the server in Redis; only you can see it with your access password.
            </Form.Text>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label className="fw-bold">Model</Form.Label>
            <Form.Control
              type="text"
              list="model-options"
              placeholder="Model"
              value={settings.model || ''}
              onChange={(e) => setSettings({ ...settings, model: e.target.value })}
            />
            <datalist id="model-options">
              {MODEL_SUGGESTIONS.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
            <Form.Text className="text-muted">
              Pick a suggestion or type any model id (e.g. a <code>-preview</code> model).
            </Form.Text>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label className="fw-bold">Thinking Level</Form.Label>
            <Form.Select
              value={THINKING_LEVELS.find((t) => t.value === settings.thinkingLevel)?.value || 'low'}
              onChange={(e) => setSettings({ ...settings, thinkingLevel: e.target.value })}
            >
              {THINKING_LEVELS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Form.Select>
            <Form.Text className="text-muted">
              Higher = more reasoning before answering, slower and pricier.
            </Form.Text>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label className="fw-bold">System Prompt</Form.Label>
            <Form.Control
              as="textarea"
              rows={5}
              value={settings.systemPrompt}
              onChange={(e) => setSettings({ ...settings, systemPrompt: e.target.value })}
            />
            <div className="d-flex justify-content-between align-items-center mt-1">
              <Form.Text className="text-muted">
                Saved persistently. Keep it empty to reset to the default.
              </Form.Text>
              <Button
                size="sm"
                variant="outline-secondary"
                onClick={() =>
                  setSettings({
                    ...settings,
                    systemPrompt:
                      'You are a technical/research assistant. Only answer questions related to math and cs. Be concise, do not make assumptions, and do not answer any off-topic queries.',
                  })
                }
              >
                Reset to default
              </Button>
            </div>
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
