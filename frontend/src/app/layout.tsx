import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import SidebarLayout from "@/components/SidebarLayout";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Stocked | Capital Market Portfolio Tracker",
  description: "Stocked is a premium simulations and portfolio tracking system for capital markets stock counters and daily price tracking.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full bg-slate-950 text-slate-100 dark">
      <body className={`${inter.className} h-full overflow-hidden flex bg-slate-950 text-slate-100 antialiased`}>
        <SidebarLayout>{children}</SidebarLayout>
      </body>
    </html>
  );
}
