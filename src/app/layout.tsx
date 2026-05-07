import type { Metadata } from "next";
import { IBM_Plex_Sans, Geist_Mono } from "next/font/google";
import { withAppBasePath } from "@/lib/base-path";
import "./globals.css";
import { Providers } from "./providers";
import { TopBrandBadge } from "@/components/TopBrandBadge";

const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-ibm-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Stocks PM — Portfolio allocation & recommendations",
  description:
    "Enter your holdings and cash, see allocation and performance, and get clear rules-based recommendations. Web companion to the Stocks PM iOS app—not financial advice.",
  icons: {
    icon: withAppBasePath("/brand/stocks-pm-ios-logo.png"),
    apple: withAppBasePath("/brand/stocks-pm-ios-logo.png"),
    shortcut: withAppBasePath("/brand/stocks-pm-ios-logo.png"),
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${ibmPlexSans.variable} ${geistMono.variable} min-h-screen font-sans antialiased`}>
        <TopBrandBadge />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
