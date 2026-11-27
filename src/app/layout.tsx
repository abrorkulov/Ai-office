import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const sans = Geist({ subsets: ["latin", "cyrillic"], variable: "--ff-sans" });
const mono = Geist_Mono({ subsets: ["latin", "cyrillic"], variable: "--ff-mono" });

export const metadata: Metadata = {
  title: { default: "Штат — офис для ИИ-сотрудников и команды", template: "%s · Штат" },
  description: "ИИ-сотрудники со своими моделями, руководитель ИИ, который раздаёт им работу, и этаж для разработчиков. Каждое важное действие — с вашего одобрения.",
};
export const viewport: Viewport = { themeColor: "#ffffff" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
