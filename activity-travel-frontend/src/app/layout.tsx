import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Activity Travel",
  description: "Travel activity operations and booking SaaS"
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
