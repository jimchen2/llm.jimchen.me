// components/SettingsModal.jsx
'use client';

import { useState, useEffect } from 'react';
import { Modal, Form, Button, Dropdown } from 'react-bootstrap';
import { applyThemePreference } from '../lib/theme';
import useActiveTheme from '../lib/useActiveTheme';

export default function SettingsModal({
  show,
  onHide,
  settings,
  setSettings,
  onSave,
  routeMode = 'default',
  openModeDropdown = false,
  // Random mode is listed and selectable everywhere, exactly like the other
  // modes. On a device that is not a computer it opens read-only (no input),
  // so the option gets a small hint below the dropdown instead of a block.
  randomModeAvailable = false,
}) {
  // 'default' | 'grammar' | 'practical' | 'random' label shown on the Mode toggle.
  const MODE_LABELS = {
    default: 'Default mode (1)',
    grammar: 'Russian mode ↗ (2)',
    practical: 'Short conversation mode ↗ (3)',
    random: 'Random mode — no system prompt ↗',
  };
  const [modeDropdownOpen, setModeDropdownOpen] = useState(false);
  const activeTheme = useActiveTheme();
  const [theme, setTheme] = useState(activeTheme);

  // Sync the dropdown with the active appearance whenever it changes or the dialog opens.
  useEffect(() => {
    setTheme(activeTheme);
  }, [activeTheme, show]);

  // When Ctrl+Shift+P opens the dialog, pop the Mode dropdown open inside
  // Settings right away so the user can pick a mode with the mouse instead of
  // using the number keys.
  useEffect(() => {
    if (!show || !openModeDropdown) return;
    // Wait a tick for the modal to mount before opening the dropdown.
    const timer = setTimeout(() => setModeDropdownOpen(true), 60);
    return () => clearTimeout(timer);
  }, [show, openModeDropdown]);

  const handleThemeChange = async (newTheme) => {
    setTheme(newTheme);
    await applyThemePreference(newTheme);
  };

  // Switch modes — used by the Mode dropdown and the 1/2/3/4 keys in Settings.
  const switchMode = async (newMode) => {
    // Random mode is persisted like every other mode, on every device. Only
    // sending messages needs a computer (the chat is read-only elsewhere).
    const isRandom = newMode === 'random';

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

    // Grammar, practical and random modes are separate routes; switching to
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
    if (isRandom) {
      // Random mode has its own route on every device. On a phone the route
      // renders the normal chat UI read-only instead of hiding it.
      window.location.href = '/random';
      return;
    }
    if (routeMode !== 'default') {
      window.location.href = '/';
      return;
    }
  };

  // Settings mode: while the dialog is open, 1 / 2 / 3 jump straight to
  // Default / Russian / Short conversation mode, and 4 to random mode
  // (available everywhere; read-only on a phone). Ignored while the user is
  // typing in a form field or while modifier keys are held.
  useEffect(() => {
    if (!show) return;

    const MODE_BY_KEY = { '1': 'default', '2': 'grammar', '3': 'practical', '4': 'random' };
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
  }, [show, settings, routeMode, randomModeAvailable]);

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
            <Dropdown
              show={modeDropdownOpen}
              onToggle={(isOpen) => setModeDropdownOpen(isOpen)}
            >
              <Dropdown.Toggle
                id="mode-dropdown"
                variant="outline-dark"
                style={{ width: '100%' }}
              >
                {MODE_LABELS[settings.mode] || MODE_LABELS.default}
              </Dropdown.Toggle>
              <Dropdown.Menu align="start" style={{ minWidth: '16rem' }}>
                <Dropdown.Item
                  active={settings.mode === 'default'}
                  onClick={() => {
                    setModeDropdownOpen(false);
                    switchMode('default');
                  }}
                >
                  Default mode (1)
                </Dropdown.Item>
                <Dropdown.Item
                  active={settings.mode === 'grammar'}
                  onClick={() => {
                    setModeDropdownOpen(false);
                    switchMode('grammar');
                  }}
                >
                  Russian mode ↗ (2)
                </Dropdown.Item>
                <Dropdown.Item
                  active={settings.mode === 'practical'}
                  onClick={() => {
                    setModeDropdownOpen(false);
                    switchMode('practical');
                  }}
                >
                  Short conversation mode ↗ (3)
                </Dropdown.Item>
                <Dropdown.Item
                  active={settings.mode === 'random'}
                  onClick={() => {
                    setModeDropdownOpen(false);
                    switchMode('random');
                  }}
                >
                  Random mode — no system prompt ↗ (4)
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown>
            {!randomModeAvailable && (
              <Form.Text className="text-muted">
                Random mode is read-only on this device. Open it on a computer to send messages.
              </Form.Text>
            )}
          </Form.Group>
        </Form>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="primary" onClick={onSave}>Save Settings</Button>
      </Modal.Footer>
    </Modal>
  );
}
