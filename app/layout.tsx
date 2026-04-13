import type {Metadata} from 'next';
import './globals.css';
import { Inter } from "next/font/google";
import { cn } from "@/lib/utils";

const inter = Inter({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: 'LeaseLens - Spot hidden lease traps',
  description: 'Help renters spot hidden lease traps before they sign.',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" className={cn("font-sans", inter.variable)}>
      <body className="bg-slate-50 antialiased" suppressHydrationWarning>{children}</body>
    </html>
  );
}
