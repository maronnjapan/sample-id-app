import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Okta Token Exchange Demo",
  description: "Okta Org認可サーバーでのToken Exchange (RFC 8693) 検証アプリ",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
