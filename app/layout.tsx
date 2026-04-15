import type { CSSProperties } from 'react';
import type { Metadata } from 'next';
import './globals.css';

const rootStyle = {
  '--font-sans': '"Avenir Next", "Segoe UI", "Helvetica Neue", sans-serif',
} as CSSProperties;

export const metadata: Metadata = {
  title: 'LeaseLens - Spot hidden lease traps',
  description: 'Help renters spot hidden lease traps before they sign.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="font-sans" style={rootStyle}>
      <body className="bg-slate-50 antialiased" suppressHydrationWarning>{children}</body>
    </html>
  );
}
