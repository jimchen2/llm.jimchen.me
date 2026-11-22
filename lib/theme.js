const THEMES = new Set(["light", "dark", "brutalist"]);
const DARK_READER_SETTINGS = { brightness: 100, contrast: 90, sepia: 10 };

let themeRequestId = 0;

export function getSavedTheme() {
  if (typeof document === "undefined") return "light";

  const cookie = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("theme="));

  if (!cookie) return "light";

  const value = cookie.slice("theme=".length);
  return THEMES.has(value) ? value : "light";
}

function setThemeAttribute(theme) {
  if (theme === "brutalist") {
    document.documentElement.dataset.theme = "brutalist";
  } else {
    // The existing light and Dark Reader appearances continue to use the
    // original Bootstrap styles; only the opt-in brutalist theme needs an
    // attribute for its scoped CSS overrides.
    delete document.documentElement.dataset.theme;
  }
}

export function initializeTheme() {
  if (typeof document === "undefined") return "light";

  const theme = getSavedTheme();
  setThemeAttribute(theme);
  const requestId = ++themeRequestId;

  // Preserve the existing startup behavior: Dark Reader is enabled only when
  // the saved preference is dark. A fresh light/brutalist page needs no work.
  if (theme === "dark") {
    import("darkreader")
      .then((darkreader) => {
        if (requestId === themeRequestId) {
          darkreader.enable(DARK_READER_SETTINGS);
        }
      })
      .catch(() => {});
  }

  return theme;
}

export async function applyThemePreference(theme) {
  const nextTheme = THEMES.has(theme) ? theme : "light";
  if (typeof document === "undefined") return nextTheme;

  const requestId = ++themeRequestId;
  setThemeAttribute(nextTheme);
  document.cookie = `theme=${nextTheme}; path=/; max-age=31536000; samesite=lax`;

  const darkreader = await import("darkreader");
  // Ignore a late import if the user selected a different appearance in the
  // meantime, so the last selection always wins.
  if (requestId !== themeRequestId) return nextTheme;

  if (nextTheme === "dark") {
    darkreader.enable(DARK_READER_SETTINGS);
  } else {
    darkreader.disable();
  }

  return nextTheme;
}
