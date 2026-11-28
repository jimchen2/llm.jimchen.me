"use client";

import { createContext, useEffect, useLayoutEffect } from "react";
import { initializeTheme, normalizeTheme } from "../lib/theme";

export const InitialThemeContext = createContext("light");

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

export default function ThemeProvider({ initialTheme = "light", children }) {
  // Sync root theme (and Dark Reader if dark) before the browser paints.
  useIsomorphicLayoutEffect(() => {
    initializeTheme();
  }, []);

  return (
    <InitialThemeContext.Provider value={normalizeTheme(initialTheme)}>
      {children}
    </InitialThemeContext.Provider>
  );
}
