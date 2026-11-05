import type { Metadata } from "next";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import { Shell } from "@/components/shell";
import { AccountProvider } from "@/lib/account/context";
import { getAccountState } from "@/lib/account/session";
import { PortfolioProvider } from "@/lib/portfolio-state";
import { RoundProvider } from "@/lib/season/context";
import { getCurrentRound } from "@/lib/season/session";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "VestEd",
  description: "Collegiate investment competition prototype. Sample data, no real-money trading.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [account, round] = await Promise.all([getAccountState(), getCurrentRound()]);
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} ${newsreader.variable} antialiased`}>
        <AccountProvider value={account}>
          <RoundProvider value={round}>
            <PortfolioProvider>
              <Shell>{children}</Shell>
            </PortfolioProvider>
          </RoundProvider>
        </AccountProvider>
      </body>
    </html>
  );
}
