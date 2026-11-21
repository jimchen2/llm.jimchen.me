// components/PopupMessage.jsx
"use client";

import { useState, useEffect } from "react";
import { Modal, Button } from "react-bootstrap";

export default function PopupMessage() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Show the modal every time the component mounts (page load/refresh)
    setShow(true);
  }, []);

  const handleClose = () => setShow(false);

  return (
    <Modal show={show} onHide={handleClose} size="lg" centered backdrop="static">
      <Modal.Header closeButton>
        <Modal.Title>Important Notice</Modal.Title>
      </Modal.Header>
      <Modal.Body style={{ maxHeight: '60vh', overflowY: 'auto' }}>
        <p className="text-danger fw-bold">
          As a reminder, this platform is strictly for discussing coding, programming, and software development-related topics. Please refrain from off-topic conversations.
        </p>
        
        <hr />

        <h4 className="mt-3 mb-3">Q & A</h4>
        
        <div className="mb-3">
          <strong>- About talking with AI</strong>
          <p className="mt-1">
            I am currently spending too much time talking with AI. It is time to gradually stop wasting too much time.
          </p>
        </div>

        <div className="mb-3">
          <strong>- About "Chinese" in the west</strong>
          <p className="mt-1">
            In terms of experiences in the west, there is a massive divide between the wealthy International school Chinese & Asian Americans (not centralized in one place online), and the grad school, non wealthy, not totally fluent in English, Chinese/global south stem students (who usually dominate the Chinese language forums like 1p3a and huaren.us, facing social integration issues). I am in the former category.
          </p>
        </div>

        <div className="mb-3">
          <strong>- About dating</strong>
          <p className="mt-1">
            A happy social life is the most important thing. Dating is a good plus once my life is stable. Do not think of marriage.
          </p>
        </div>
        
      </Modal.Body>
      <Modal.Footer>
        <Button variant="primary" onClick={handleClose} className="fw-bold px-4">
          I Understand
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
