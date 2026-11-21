// components/SettingsModal.jsx
'use client';

import { useState, useEffect } from 'react';
import Modal from './Modal';

export default function SettingsModal({ show, onHide, settings, setSettings, onSave, routeMode = 'default' }) {
  const [theme, setTheme] = useState('light');

  useEffect(() => {
    if (show) {
      const current = document.documentElement.getAttribute('data-theme');
      if (current === 'dark' || current === 'brutalist' || current === 'light') {
        setTheme(current);
      } else {
        const match = document.cookie.match(/(?:^|; )theme=(light|dark|brutalist)/);
        setTheme(match ? match[1] : 'light');
      }
    }
  }, [show]);

  const handleThemeChange = (e) => {
    const nextTheme = e.target.value;
    setTheme(nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
    document.cookie = `theme=${nextTheme}; path=/; max-age=31536000`;
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
        <label className="field-label" htmlFor="theme-select">
          Theme
        </label>
        <select
          id="theme-select"
          className="input"
          value={theme}
          onChange={handleThemeChange}
        >
          <option value="light">Light (Minimal)</option>
          <option value="dark">Dark (Minimal)</option>
          <option value="brutalist">Brutalist</option>
        </select>
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
