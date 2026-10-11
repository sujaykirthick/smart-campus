import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Navbar from '@/components/Navbar';
import { ToastProvider } from '@/components/ui';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Amrita Events | Campus Events Portal',
  description: 'Amrita Vishwa Vidyapeetham campus events, hall booking, clash prevention, and attendance portal.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-white text-neutral-900 font-sans">
        <ToastProvider>
          <Navbar />
          <main className="flex-1 flex flex-col">{children}</main>
        </ToastProvider>
        <footer className="border-t border-neutral-200 bg-[#F5F5F5] py-6 text-xs text-neutral-600">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="font-bold text-[#A4161A]">Amrita Vishwa Vidyapeetham</span>
              <span className="text-neutral-300">|</span>
              <p>Campus Events Portal</p>
            </div>
            <p className="text-neutral-500">© 2026 Amrita Vishwa Vidyapeetham. All rights reserved.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
