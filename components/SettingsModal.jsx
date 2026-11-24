// components/SettingsModal.jsx
'use client';

import { useState, useEffect } from 'react';
import { Modal, Form, Button } from 'react-bootstrap';
import { applyThemePreference, getSavedTheme } from '../lib/theme';

export default function SettingsModal({ show, onHide, settings, setSettings, onSave, routeMode = 'default' }) {
  const [theme, setTheme] = useState('light');

  // Read the saved appearance when the settings dialog opens.
  useEffect(() => {
    if (show) {
      setTheme(getSavedTheme());
    }
  }, [show]);

  const handleThemeChange = async (newTheme) => {
    setTheme(newTheme);
    await applyThemePreference(newTheme);
  };

  // Switch modes — used by the Mode dropdown and by the 1/2/3 shortcuts.
  const switchMode = async (newMode) => {
    setSettings({ ...settings, mode: newMode });

    if (settings.dbToken) {
      try {
        await fetch('/api/settings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-db-token': settings.dbToken,
          },
          body: JSON.stringify({
            model: settings.model,
            mode: newMode,
          }),
        });
      } catch {
        // ignore — still navigate to the selected mode
      }
    }

    // Grammar and practical modes are separate routes; switching to
    // one of them navigates there. Switching back to default
    // navigates home from another route.
    if (newMode === 'grammar') {
      window.location.href = '/russian';
      return;
    }
    if (newMode === 'practical') {
      window.location.href = '/practical';
      return;
    }
    if (routeMode !== 'default') {
      window.location.href = '/';
      return;
    }
  };

  // Settings mode: while the dialog is open, 1 / 2 / 3 jump straight to
  // Default / Russian / Short conversation mode. Ignored while the user is
  // typing in a form field or while modifier keys are held.
  useEffect(() => {
    if (!show) return;

    const MODE_BY_KEY = { '1': 'default', '2': 'grammar', '3': 'practical' };
    const onKeyDown = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const newMode = MODE_BY_KEY[e.key];
      if (!newMode || newMode === (settings.mode || 'default')) return;
      const target = e.target;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return;
      e.preventDefault();
      switchMode(newMode);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [show, settings, routeMode]);

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title>Settings</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form>
          <Form.Group className="mb-3">
            <Form.Label className="fw-bold" htmlFor="theme-select">Theme</Form.Label>
            <Form.Select
              id="theme-select"
              aria-label="Select theme"
              value={theme}
              onChange={(e) => handleThemeChange(e.target.value)}
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="brutalist">Brutalist</option>
              <option value="telegram">Telegram</option>
            </Form.Select>
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
              onChange={async (e) => {
                const newMode = e.target.value;
                setSettings({ ...settings, mode: newMode });

                if (settings.dbToken) {
                  try {
                    await fetch('/api/settings', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'x-db-token': settings.dbToken,
                      },
                      body: JSON.stringify({
                        model: settings.model,
                        mode: newMode,
                      }),
                    });
                  } catch {
                    // ignore — still navigate to the selected mode
                  }
                }

                // Grammar and practical modes are separate routes; switching to
                // one of them navigates there. Switching back to default
                // navigates home from another route.
                if (newMode === 'grammar') {
                  window.location.href = '/russian';
                  return;
                }
                if (newMode === 'practical') {
                  window.location.href = '/practical';
                  return;
                }
                if (routeMode !== 'default') {
                  window.location.href = '/';
                  return;
                }
              }}
            >
              <option value="default">Default mode (1)</option>
              {/* Random mode is disabled for now (app/random/** is commented out). */}
              {/* <option value="random">Random mode (No memory) ↗</option> */}
              <option value="grammar">Russian mode ↗ (2)</option>
              <option value="practical">Short conversation mode ↗ (3)</option>
            </Form.Select>
            <Form.Text className="text-muted d-block">
              All modes share the same API key and model; each mode only differs by its system prompt.
            </Form.Text>
            <Form.Text className="text-muted d-block">
              Shortcut: press 1, 2, or 3 while this dialog is open to switch modes instantly.
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
