import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Header } from "@/components/Header";
import { currentUser } from "@/server/session.ts";

export const metadata: Metadata = {
  title: { default: "Velluto — streaming indipendente", template: "%s · Velluto" },
  description: "Piattaforma streaming indipendente: film e serie in 4K HDR, abbonamenti, preferiti e cronologia.",
};
export const viewport: Viewport = { themeColor: "#120b14", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await currentUser();
  return (
    <html lang="it">
      <body className="velvet-bg">
        <Header user={user ? { name: user.name, role: user.role } : null} />
        <main className="pb-24 md:pb-10">{children}</main>
        <footer className="mx-auto max-w-7xl px-5 pb-28 text-xs text-mist/80 md:px-10 md:pb-10">
          <p>Velluto è una piattaforma dimostrativa indipendente. I contenuti del catalogo sono open movie della Blender Foundation distribuiti con licenza Creative Commons Attribution; i crediti sono riportati su ogni scheda.</p>
        </footer>
      </body>
    </html>
  );
}
