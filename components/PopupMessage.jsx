// components/PopupMessage.jsx
"use client";

import { useState, useEffect } from "react";
import Modal from "./Modal";

export default function PopupMessage() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Show the modal every time the component mounts (page load/refresh)
    setShow(true);
  }, []);

  const handleClose = () => setShow(false);

  return (
    <Modal
      show={show}
      onHide={handleClose}
      title="Important Notice"
      closeOnBackdrop={false}
      wide
      footer={
        <button type="button" className="btn btn-primary" onClick={handleClose}>
          I Understand
        </button>
      }
    >
      <p className="notice-strong">
        As a reminder, this platform is strictly for discussing coding, programming, and software development-related topics. Please refrain from off-topic conversations.
      </p>

      <hr />

      <h4>Q &amp; A</h4>

      <div className="qa-item">
        <strong>- About talking with AI</strong>
        <p>
          I am currently spending too much time talking with AI. It is time to gradually stop wasting too much time.
        </p>
      </div>

      <div className="qa-item">
        <strong>- About &quot;Chinese&quot; in the west</strong>
        <p>
          In terms of experiences in the west, there is a massive divide between the wealthy International school Chinese &amp; Asian Americans (not centralized in one place online), and the grad school, non wealthy, not totally fluent in English, Chinese/global south stem students (who usually dominate the Chinese language forums like 1p3a and huaren.us, facing social integration issues). I am in the former category.
        </p>
      </div>

      <div className="qa-item">
        <strong>- About dating</strong>
        <p>
          A happy social life is the most important thing. Dating is a good plus once my life is stable. Do not think of marriage.
        </p>
      </div>
    </Modal>
  );
}
