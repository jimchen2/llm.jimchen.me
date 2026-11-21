import 'katex/dist/katex.min.css';
import './globals.css';

const themeInitScript = `
(function() {
  try {
    var match = document.cookie.match(/(?:^|; )theme=(light|dark|brutalist)/);
    var theme = match ? match[1] : 'light';
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {}
})();
`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
