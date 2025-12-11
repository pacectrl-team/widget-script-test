import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'PaceCtrl Demo',
  description: 'Live demo of PaceCtrl widget and flow.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
