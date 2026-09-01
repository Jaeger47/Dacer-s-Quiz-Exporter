import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
<<<<<<< HEAD
  metadataBase: new URL('https://quiq-offline-classroom.markdacer22.chatgpt.site'),
  title: 'Quiq Offline — Classroom Exam System',
  description:
    'Create offline quizzes, transfer results by QR, and analyze classroom performance privately on your device.',
  icons: {
    icon: '/quiq-icon.svg',
  },
  openGraph: {
    title: 'Quiq Offline — Classroom Exam System',
    description: 'Create exams. Scan results. Stay offline.',
    type: 'website',
    images: [
      {
        url: 'https://quiq-offline-classroom.markdacer22.chatgpt.site/og.png',
        width: 1200,
        height: 630,
        alt: 'Quiq Offline — Create exams, scan results, stay offline.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Quiq Offline — Classroom Exam System',
    description: 'Create exams. Scan results. Stay offline.',
    images: ['https://quiq-offline-classroom.markdacer22.chatgpt.site/og.png'],
  },
=======
  title: 'Quiq Offline — Classroom Exam System',
  description:
    'Create offline quizzes, transfer results by QR, and analyze classroom performance privately on your device.',
>>>>>>> b494772 (Build Quiq offline quiz and QR scanner)
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
