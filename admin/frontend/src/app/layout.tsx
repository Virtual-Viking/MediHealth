import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MediLink Admin",
  description: "Admin portal for MediLink",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

