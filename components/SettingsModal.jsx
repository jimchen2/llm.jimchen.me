'use client';
import { Modal, Form, Button } from 'react-bootstrap';
import Darkreader from "react-darkreader";

export default function SettingsModal({ show, onHide, settings, setSettings, onSave }) {
  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title>Settings</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form>
          <Form.Group className="mb-4 d-flex justify-content-between align-items-center">
            <Form.Label className="fw-bold mb-0">Dark Mode</Form.Label>
            <Darkreader />
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
