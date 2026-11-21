// components/SettingsModal.jsx
'use client';

import { useState, useEffect } from 'react';
import Modal from './Modal';

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
        <div className="mb-4 d-flex justify-content-between align-items-center gap-3">
          <label className="brutal-label mb-0" htmlFor="dark-mode-switch">Dark Mode</label>
          <span className="brutal-switch">
            <input
              type="checkbox"
              role="switch"
              id="dark-mode-switch"
              checked={isDark}
              onChange={handleDarkModeToggle}
              aria-label="Dark Mode"
            />
            <span className="brutal-switch-track" aria-hidden="true" />
          </span>
        </div>

        <div className="mb-3">
          <label className="brutal-label" htmlFor="settings-model">Model</label>
          <input
            type="text"
            id="settings-model"
            className="brutal-input"
            placeholder="Model"
            value={settings.model || ''}
            onChange={e => setSettings({...settings, model: e.target.value})}
          />
        </div>

        <div className="mb-3">
          <label className="brutal-label" htmlFor="settings-mode">Mode</label>
          <select
            id="settings-mode"
            className="brutal-select"
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
            <option value="default">Default mode</option>
            {/* Random mode is disabled for now (app/random/** is commented out). */}
            {/* <option value="random">Random mode (No memory) ↗</option> */}
            <option value="grammar">Russian mode ↗</option>
            <option value="practical">Short conversation mode ↗</option>
          </select>
          <p className="text-muted small mt-1 mb-0">
            All modes share the same API key and model; each mode only differs by its system prompt.
          </p>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <button className="btn btn-primary" onClick={onSave}>Save Settings</button>
      </Modal.Footer>
    </Modal>
  );
}
