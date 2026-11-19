import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { brand } from '@/copy/common';
import { THEME } from '@/styles/theme';
import { skylineCss } from '@/ui/skyline/palette';
import '@/styles/tokens.css';
import '@/styles/fonts.css';
import '@/styles/base.css';

export const metadata: Metadata = {
  title: { default: brand.name, template: `%s | ${brand.name}` },
  description: brand.description,
  applicationName: brand.name,
  appleWebApp: { capable: true, title: brand.name, statusBarStyle: 'default' },
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: THEME.light.ground },
    { media: '(prefers-color-scheme: dark)', color: THEME.dark.ground },
  ],
};

/** The colours of the skyline illustration as custom properties, generated from one palette file. */
const SKYLINE_CSS = skylineCss();

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <style dangerouslySetInnerHTML={{ __html: SKYLINE_CSS }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
