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
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var modeKey="stocks-pm-ui-theme";var resolvedKey="stocks-pm-ui-theme-resolved";var mode=localStorage.getItem(modeKey);if(mode==="auto"){mode="system";localStorage.setItem(modeKey,mode);}if(mode!=="light"&&mode!=="dark"&&mode!=="system"){var legacy=localStorage.getItem("theme");mode=legacy==="light"||legacy==="dark"?legacy:"system";localStorage.setItem(modeKey,mode);}localStorage.removeItem("stocks-pm-ui-theme-active");var hour=new Date().getHours();var day=hour>=7&&hour<19?"light":"dark";var theme=mode==="system"?day:mode;localStorage.setItem(resolvedKey,theme);var root=document.documentElement;root.classList.remove("light","dark");root.classList.add(theme);root.style.colorScheme=theme;}catch(e){}})();`,
          }}
        />
      </head>
      <body className={`${ibmPlexSans.variable} ${geistMono.variable} min-h-screen font-sans antialiased`}>
        <TopBrandBadge />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
