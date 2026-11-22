const THEMES = new Set(["light", "dark", "brutalist", "telegram"]);
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
  // Themes that ship their own scoped stylesheet (brutalist, telegram) are
  // selected through the root data-theme attribute. The original light and
  // Dark Reader appearances keep the plain Bootstrap styles.
  if (theme === "brutalist" || theme === "telegram") {
    document.documentElement.dataset.theme = theme;
  } else {
    delete document.documentElement.dataset.theme;
  }
}

export function initializeTheme() {
  if (typeof document === "undefined") return "light";

  const theme = getSavedTheme();
  setThemeAttribute(theme);
  const requestId = ++themeRequestId;

  // Preserve the existing startup behavior: Dark Reader is enabled only when
  // the saved preference is dark. A fresh light/brutalist/telegram page needs
  // no work.
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
