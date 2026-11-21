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
    <Modal
      show={show}
      onHide={onHide}
      title="Settings"
      footer={
        <button type="button" className="btn btn-primary" onClick={onSave}>
          Save Settings
        </button>
      }
    >
      <div className="field-row">
        <label className="field-label" htmlFor="dark-mode-switch">
          Dark Mode
        </label>
        <span className="switch">
          <input
            type="checkbox"
            id="dark-mode-switch"
            checked={isDark}
            onChange={handleDarkModeToggle}
          />
          <span className="switch-track" aria-hidden="true" />
        </span>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="model-input">
          Model
        </label>
        <input
          id="model-input"
          type="text"
          className="input"
          placeholder="Model"
          value={settings.model || ''}
          onChange={(e) => setSettings({ ...settings, model: e.target.value })}
        />
      </div>

      <div className="field">
        <label className="field-label" htmlFor="mode-select">
          Mode
        </label>
        <select
          id="mode-select"
          className="select"
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
        <span className="field-hint">
          All modes share the same API key and model; each mode only differs by its system prompt.
        </span>
      </div>
    </Modal>
  );
}
