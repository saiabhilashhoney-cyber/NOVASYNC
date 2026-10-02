import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nova Cart — Live-Sync & Trust Engine",
  description:
    "Real-time local store inventory sync for quick-commerce. Instant stock updates, smart substitution guard, and trust-first checkout experience.",
  keywords:
    "quick commerce, live inventory, local store, stock sync, smart substitution",
  openGraph: {
    title: "Nova Cart — Live-Sync & Trust Engine",
    description:
      "Real-time local store inventory with Smart Substitution Guard",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Space+Grotesk:wght@400;500;600;700&display=swap"
        />
      </head>
      <body className="antialiased" style={{ display: "flex", justifyContent: "center" }}><div style={{ width: "100%", maxWidth: "1440px" }}>{children}</div></body>
    </html>
  );
}
