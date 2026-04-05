import type { Metadata, Viewport } from 'next';
import { Playfair_Display, DM_Sans, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['500', '600'],
  style: ['normal', 'italic'],
  variable: '--disp',
  display: 'swap',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  variable: '--body',
  display: 'swap',
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--mono',
  display: 'swap',
});

export const viewport: Viewport = {
  themeColor: '#08080A',
};

export const metadata: Metadata = {
  title: 'Content Intelligence Engine',
  description:
    'AI-powered competitive intelligence pipeline — scrape, transcribe, analyze, and generate original video concepts from competitor content.',
  keywords: ['content intelligence', 'competitive analysis', 'AI content generation', 'video concepts'],
  openGraph: {
    title: 'Content Intelligence Engine',
    description: 'AI-powered competitive intelligence pipeline',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${playfair.variable} ${dmSans.variable} ${ibmPlexMono.variable}`}
    >
      <body style={{ fontFamily: 'var(--body), system-ui, sans-serif' }}>
        {children}
      </body>
    </html>
  );
}
