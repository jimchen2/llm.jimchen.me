// lib/useActiveTheme.js
//
// Client hook that reports the appearance currently applied to the document.
// Themes that ship their own stylesheet (brutalist, telegram) are selected
// through the root `data-theme` attribute; the original light and Dark Reader
// appearances keep the plain Bootstrap styles and are read from the saved
// cookie.
//
// During SSR and hydration the hook reads `InitialThemeContext` (populated from
// the request's `theme` cookie in RootLayout), and on the client it reads the
// live DOM/cookie synchronously via `useSyncExternalStore` so neither initial
// page loads nor newly mounted messages ever flash the default light theme.
"use client";

import { useContext, useSyncExternalStore } from "react";
import { InitialThemeContext } from "../components/ThemeProvider";
import { getSavedTheme, subscribeToThemeChange } from "./theme";

export function readActiveTheme() {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.theme || getSavedTheme();
}

function subscribe(onStoreChange) {
  if (typeof document === "undefined") return () => {};

  const observer = new MutationObserver(onStoreChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  const unsubscribeTheme = subscribeToThemeChange(onStoreChange);

  return () => {
    observer.disconnect();
    unsubscribeTheme();
  };
}

export default function useActiveTheme() {
  const initialTheme = useContext(InitialThemeContext);
  return useSyncExternalStore(
    subscribe,
    readActiveTheme,
    () => initialTheme
  );
}
