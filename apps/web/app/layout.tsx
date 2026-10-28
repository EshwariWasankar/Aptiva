import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Aptiva',
  description: 'Planning layer above question banks for aptitude assessment preparation',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
