import 'bootstrap/dist/css/bootstrap.min.css';
import 'katex/dist/katex.min.css';
import './globals.css';

export const metadata = {
  title: 'LLM Chat',
  description: 'Minimal, fast LLM chat interface',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
