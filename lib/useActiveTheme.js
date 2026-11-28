// lib/useActiveTheme.js
//
// Client hook that reports the appearance currently applied to the document.
// Themes that ship their own stylesheet (brutalist, telegram) are selected
// through the root `data-theme` attribute; the original light and Dark Reader
// appearances keep the plain Bootstrap styles and are read from the saved
// cookie. Watching the attribute keeps every consumer in sync the moment the
// user switches appearance in Settings.
"use client";

import { useEffect, useState } from "react";
import { getSavedTheme } from "./theme";

function readActiveTheme() {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.theme || getSavedTheme();
}

export default function useActiveTheme() {
  // Start as "light" on the server and on the first client render so the
  // markup matches during hydration; the effect below syncs immediately after
  // mount (and on every later theme switch).
  const [theme, setTheme] = useState("light");

  useEffect(() => {
    const sync = () => setTheme(readActiveTheme());
    sync();

    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  return theme;
}
