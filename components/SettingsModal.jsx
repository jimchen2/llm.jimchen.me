// components/SettingsModal.jsx
'use client';

import { useState, useEffect } from 'react';
import { Modal, Form, Button } from 'react-bootstrap';

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
    
    // Сохраняем выбор темы в cookie на 1 год
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
            <Form.Label className="fw-bold">Database Password</Form.Label>
            <Form.Control type="password" placeholder="DB Password" value={settings.dbToken} onChange={e => setSettings({...settings, dbToken: e.target.value})} />
          </Form.Group>
          
          <Form.Group className="mb-3">
            <Form.Label className="fw-bold">API Key</Form.Label>
            <Form.Control type="password" placeholder="API Key" value={settings.apiKey} onChange={e => setSettings({...settings, apiKey: e.target.value})} />
          </Form.Group>
          
          <Form.Group className="mb-3">
            <Form.Label className="fw-bold">Model</Form.Label>
            <Form.Control type="text" placeholder="Model" value={settings.model} onChange={e => setSettings({...settings, model: e.target.value})} />
          </Form.Group>
          
          <Form.Group className="mb-3">
            <Form.Label className="fw-bold">System Prompt</Form.Label>
            <Form.Control as="textarea" rows={3} placeholder="You are a helpful assistant." value={settings.systemPrompt} onChange={e => setSettings({...settings, systemPrompt: e.target.value})} />
          </Form.Group>
        </Form>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="primary" onClick={onSave}>Save Settings</Button>
      </Modal.Footer>
    </Modal>
  );
}
