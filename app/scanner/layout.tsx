import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Quiq Scanner — Offline Result Recorder',
  description: 'Scan, store, analyze, export, and back up classroom quiz results offline.',
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  themeColor: '#111a27',
};

export default function ScannerLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
