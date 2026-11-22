// components/SettingsModal.jsx
'use client';

import { useState, useEffect } from 'react';
import { Modal, Form, Button } from 'react-bootstrap';
import { applyThemePreference, getSavedTheme } from '../lib/theme';

export default function SettingsModal({ show, onHide, settings, setSettings, onSave }) {
  const [isDark, setIsDark] = useState(false);
  const [isBrutalist, setIsBrutalist] = useState(false);

  // Read the saved appearance when the settings dialog opens. Light remains
  // the default, while dark and brutalist are mutually exclusive options.
  useEffect(() => {
    if (show) {
      const theme = getSavedTheme();
      setIsDark(theme === 'dark');
      setIsBrutalist(theme === 'brutalist');
    }
  }, [show]);

  const handleThemeChange = async (theme) => {
    setIsDark(theme === 'dark');
    setIsBrutalist(theme === 'brutalist');
    await applyThemePreference(theme);
  };

  const handleDarkModeToggle = (e) => {
    handleThemeChange(e.target.checked ? 'dark' : 'light');
  };

  const handleBrutalistModeToggle = (e) => {
    handleThemeChange(e.target.checked ? 'brutalist' : 'light');
  };

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title>Settings</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form>
          <Form.Group className="mb-4 d-flex justify-content-between align-items-center">
            <Form.Label className="fw-bold mb-0" htmlFor="dark-mode-switch">Dark Mode</Form.Label>
            <Form.Check
              type="switch"
              id="dark-mode-switch"
              aria-label="Toggle dark mode"
              checked={isDark}
              onChange={handleDarkModeToggle}
            />
          </Form.Group>

          <Form.Group className="mb-2 d-flex justify-content-between align-items-center">
            <Form.Label className="fw-bold mb-0" htmlFor="brutalist-mode-switch">Brutalist Mode</Form.Label>
            <Form.Check
              type="switch"
              id="brutalist-mode-switch"
              aria-label="Toggle brutalist mode"
              checked={isBrutalist}
              onChange={handleBrutalistModeToggle}
            />
          </Form.Group>
          <Form.Text className="text-muted d-block mb-4">
            Dark and Brutalist modes are exclusive. Turn both off for Light Mode.
          </Form.Text>

          <Form.Group className="mb-3">
            <Form.Label className="fw-bold">Model</Form.Label>
            <Form.Control 
              type="text" 
              placeholder="Model" 
              value={settings.model || ''} 
              onChange={e => setSettings({...settings, model: e.target.value})} 
            />
          </Form.Group>
          
        </Form>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="primary" onClick={onSave}>Save Settings</Button>
      </Modal.Footer>
    </Modal>
  );
}
