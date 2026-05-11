import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trading Chart MVP",
  description: "Professional charting terminal MVP — canvas, indicators, drawings",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
