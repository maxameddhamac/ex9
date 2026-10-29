import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Inngest for AI Agents — Interactive Dashboard",
  description:
    "An interactive, visual guide to building durable, production-ready AI agent workflows with Inngest. Learn setup, step execution, retries, and observability.",
  keywords: ["Inngest", "AI Agents", "Next.js", "durable workflows", "step execution"],
  authors: [{ name: "Inngest Dashboard" }],
  openGraph: {
    title: "Inngest for AI Agents — Interactive Dashboard",
    description: "Visual guide to building durable AI agent workflows with Inngest",
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
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
