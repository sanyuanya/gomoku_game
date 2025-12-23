import "@/styles/globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { LanguageProvider } from "@/components/LanguageContext";

export const metadata: Metadata = {
  title: "Offline Gomoku",
  description: "Offline Gomoku with AI bot and threat routes"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <LanguageProvider>
          <main>{children}</main>
        </LanguageProvider>
      </body>
    </html>
  );
}
