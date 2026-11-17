import type { Metadata } from "next";
import "../components/sites/novashop/site.css";
import { Header } from "@/components/sites/novashop/Header";

export const metadata: Metadata = { title: "NovaShop — Home" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Header />
        {children}
        <footer>© 2026 NovaShop demo — authorized test fixture</footer>
      </body>
    </html>
  );
}
