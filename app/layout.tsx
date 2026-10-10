import type { Metadata } from 'next';
import { Inter, Playfair_Display } from 'next/font/google';
import './globals.css';
import Navbar from '@/components/Navbar';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Genesis | Campus Events Platform',
  description: 'Smart campus events, hall booking, clash detection, and student affairs governance.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${playfair.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-[#FFFAF5] text-[#2B1B17]">
        <Navbar />
        <main className="flex-1 flex flex-col">{children}</main>
        <footer className="border-t border-[#EADFD6] bg-[#FFFFFF] py-6 text-center text-xs text-[#7A6A62]">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="font-serif font-bold text-[#B3202A] text-sm tracking-wide">GENESIS</span>
              <span className="text-[#EADFD6]">|</span>
              <p>© 2026 Campus Events Platform. All rights reserved.</p>
            </div>
            <div className="flex items-center gap-4">
              <span className="inline-flex items-center gap-1.5 font-medium text-[#7A6A62]">
                <span className="h-2 w-2 rounded-full bg-[#15803D] animate-pulse"></span>
                Postgres RLS &amp; Clash Prevention Active
              </span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
