import { cookies } from 'next/headers';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'katex/dist/katex.min.css';
import './globals.css';
import './brutalist.css';
import './telegram.css';
import ThemeProvider from '../components/ThemeProvider';
import {
  THEME_INIT_SCRIPT,
  getRootThemeAttribute,
  normalizeTheme,
} from '../lib/theme';

export default async function RootLayout({ children }) {
  const cookieStore = await cookies();
  const initialTheme = normalizeTheme(cookieStore.get('theme')?.value);
  const rootTheme = getRootThemeAttribute(initialTheme);

  return (
    <html lang="en" data-theme={rootTheme} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <ThemeProvider initialTheme={initialTheme}>{children}</ThemeProvider>
      </body>
    </html>
  );
}
