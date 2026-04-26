// components/SettingsModal.jsx
'use client';

import { useState, useEffect } from 'react';
import { Modal, Form, Button } from 'react-bootstrap';

export default function SettingsModal({ show, onHide, settings, setSettings, onSave }) {
  const [isDark, setIsDark] = useState(false);

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
    
    // Сохраняем выбор в cookie на 1 год
    document.cookie = `theme=${enable ? 'dark' : 'light'}; path=/; max-age=31536000`;
    
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
      {/* Остальной код модального окна без изменений... */}
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
          {/* ... */}
        </Form>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="primary" onClick={onSave}>Save Settings</Button>
      </Modal.Footer>
    </Modal>
  );
}
