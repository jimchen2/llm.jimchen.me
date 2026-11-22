import 'bootstrap/dist/css/bootstrap.min.css';
import 'katex/dist/katex.min.css';
import './globals.css';
import './brutalist.css';

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
