// components/SettingsModal.jsx
'use client';

import { useState, useEffect } from 'react';
import { Modal, Form, Button } from 'react-bootstrap';

export default function SettingsModal({ show, onHide, settings, setSettings, onSave, routeMode = 'default' }) {
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
            <Form.Label className="fw-bold">Model</Form.Label>
            <Form.Control 
              type="text" 
              placeholder="Model" 
              value={settings.model || ''} 
              onChange={e => setSettings({...settings, model: e.target.value})} 
            />
          </Form.Group>
          
          <Form.Group className="mb-3">
            <Form.Label className="fw-bold">Mode</Form.Label>
            <Form.Select 
              value={settings.mode || 'default'}
              onChange={(e) => {
                // Random mode is disabled for now (app/random/** is commented out).
                // if (e.target.value === 'random') {
                //   window.location.href = 'https://llm.jimchen.me/random';
                //   return;
                // }
                // Grammar and practical modes are separate routes; switching to
                // one of them navigates there. Switching back to default only
                // needs to save the mode (or navigate home from another route).
                if (e.target.value === 'grammar') {
                  window.location.href = 'https://llm.jimchen.me/grammar';
                  return;
                }
                if (e.target.value === 'practical') {
                  window.location.href = 'https://llm.jimchen.me/practical';
                  return;
                }
                if (routeMode !== 'default') {
                  window.location.href = 'https://llm.jimchen.me/';
                  return;
                }
                setSettings({ ...settings, mode: 'default' });
              }}
            >
              <option value="default">Default mode</option>
              {/* Random mode is disabled for now (app/random/** is commented out). */}
              {/* <option value="random">Random mode (No memory) ↗</option> */}
              <option value="grammar">Grammar mode ↗</option>
              <option value="practical">Practical mode ↗</option>
            </Form.Select>
            <Form.Text className="text-muted">
              All modes share the same API key and model; each mode only differs by its system prompt.
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
