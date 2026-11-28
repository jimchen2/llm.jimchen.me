const THEMES = new Set(["light", "dark", "brutalist", "telegram"]);
const SCOPED_ROOT_THEMES = new Set(["brutalist", "telegram"]);
const DARK_READER_SETTINGS = { brightness: 100, contrast: 90, sepia: 10 };

let themeRequestId = 0;
const themeListeners = new Set();

export function normalizeTheme(value) {
  return THEMES.has(value) ? value : "light";
}

export function getRootThemeAttribute(theme) {
  const normalized = normalizeTheme(theme);
  return SCOPED_ROOT_THEMES.has(normalized) ? normalized : undefined;
}

export function parseThemeCookie(cookieHeader = "") {
  if (!cookieHeader || typeof cookieHeader !== "string") return "light";

  const cookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("theme="));

  if (!cookie) return "light";

  const rawValue = cookie.slice("theme=".length);
  try {
    return normalizeTheme(decodeURIComponent(rawValue));
  } catch {
    return normalizeTheme(rawValue);
  }
}

// Synchronous <head> bootstrap so even cached/static HTML applies the root
// data-theme attribute from document.cookie before the browser's first paint.
export const THEME_INIT_SCRIPT = `(function(){try{var parts=document.cookie?document.cookie.split(";"):[];var theme="light";for(var i=0;i<parts.length;i++){var part=parts[i].trim();if(part.indexOf("theme=")===0){try{theme=decodeURIComponent(part.slice(6))}catch(e){theme=part.slice(6)}break}}if(theme==="brutalist"||theme==="telegram"){if(document.documentElement.dataset.theme!==theme){document.documentElement.dataset.theme=theme}}else if("theme" in document.documentElement.dataset){delete document.documentElement.dataset.theme}}catch(e){}})();`;

export function subscribeToThemeChange(listener) {
  themeListeners.add(listener);
  return () => {
    themeListeners.delete(listener);
  };
}

function notifyThemeListeners() {
  for (const listener of themeListeners) {
    listener();
  }
}

export function getSavedTheme() {
  if (typeof document === "undefined") return "light";
  return parseThemeCookie(document.cookie);
}

function setThemeAttribute(theme) {
  // Themes that ship their own scoped stylesheet (brutalist, telegram) are
  // selected through the root data-theme attribute. The original light and
  // Dark Reader appearances keep the plain Bootstrap styles.
  const rootTheme = getRootThemeAttribute(theme);
  if (rootTheme) {
    if (document.documentElement.dataset.theme !== rootTheme) {
      document.documentElement.dataset.theme = rootTheme;
    }
  } else if ("theme" in document.documentElement.dataset) {
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
  const nextTheme = normalizeTheme(theme);
  if (typeof document === "undefined") return nextTheme;

  const requestId = ++themeRequestId;
  document.cookie = `theme=${nextTheme}; path=/; max-age=31536000; samesite=lax`;
  setThemeAttribute(nextTheme);
  notifyThemeListeners();

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
