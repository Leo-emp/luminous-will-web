import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Luminous Will | Video Generator",
  description: "Generate dark aesthetic motivational videos automatically",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">
        <div className="grain-overlay" />
        {children}
      </body>
    </html>
  );
}
