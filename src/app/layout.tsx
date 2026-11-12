import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Splash } from "@/components/Splash";

export const metadata: Metadata = {
  title: { default: "WAK – Weird Art Klub", template: "%s · WAK" },
  description: "En lukket kunstklub for børn. Del din kunst. Opdag noget weird. Tag med på tur.",
  applicationName: "WAK",
  robots: { index: false, follow: false },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "WAK", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#1015B9",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="da" suppressHydrationWarning>
      <body className="min-h-dvh">
        <Splash />
        {children}
      </body>
    </html>
  );
}
