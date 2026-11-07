
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';
import SiteHeader from './components/SiteHeader';

export const metadata: Metadata = {
  title: 'HavenSocial',

  description:
    'Connect meaningfully and build community on HavenSocial.',

  // HAVENSOCIAL BROWSER FAVICON
  icons: {
    icon: '/images/favicon/favicon.ico',
    shortcut: '/images/favicon/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" data-theme="light">
      <body>
        <SiteHeader />

        {children}

        <footer className="main-footer">
          <p>
            © {new Date().getFullYear()} HavenSocial by ByteHaven Tech Solutions Ltd
          </p>
        </footer>

      </body>
    </html>
  );
}
