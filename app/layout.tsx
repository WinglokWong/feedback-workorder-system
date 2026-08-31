import type { Metadata, Viewport } from "next";
import { Noto_Sans_SC } from "next/font/google";
import PwaRegister from "../components/PwaRegister";
import "./globals.css";

const notoSans = Noto_Sans_SC({ variable: "--font-noto-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "工单中心",
  description: "查看最新服务工单、维护通知与附件。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/icons/apple-touch-icon.png",
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "工单中心",
  },
  formatDetection: { telephone:false },
  other: {
    "mobile-web-app-capable": "yes",
    "application-name": "工单中心"
  }
};

export const viewport: Viewport = {
  themeColor: "#2f65a7",
  colorScheme: "light"
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className={notoSans.variable}><PwaRegister />{children}</body>
    </html>
  );
}
