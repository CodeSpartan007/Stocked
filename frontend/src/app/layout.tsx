import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import SidebarLayout from "@/components/SidebarLayout";
import { AuthProvider } from "@/app/context/AuthContext";
import { ThemeProvider } from "@/app/context/ThemeContext";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Stocked | Capital Market Portfolio Tracker",
  description: "Stocked is a premium simulations and portfolio tracking system for capital markets stock counters and daily price tracking.",
};

const themeScript = `(function() {
  try {
    var t = localStorage.getItem('stocked_theme');
    var d = document.documentElement;
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var isDark = t === 'dark' || (!t) || (t === 'system' && prefersDark);
    if (isDark) {
      d.classList.add('dark');
      d.classList.remove('light');
      d.setAttribute('data-theme', 'dark');
      d.style.colorScheme = 'dark';
    } else {
      d.classList.add('light');
      d.classList.remove('dark');
      d.setAttribute('data-theme', 'light');
      d.style.colorScheme = 'light';
    }
  } catch (e) {}
})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className="h-full">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${inter.className} h-full overflow-hidden flex bg-app text-main antialiased`}>
        <AuthProvider>
          <ThemeProvider>
            <SidebarLayout>{children}</SidebarLayout>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
