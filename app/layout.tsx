import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Nexus - AI Workplace OS",
    template: "%s | Nexus",
  },
  description: "AI-powered workplace operating system combining communication, projects, and Nova AI.",
  keywords: [
    "Nexus",
    "AI Workplace",
    "Collaboration",
    "Task Management",
    "Real-time Messaging",
    "Nova AI",
    "Kanban Board",
    "Direct Messages"
  ],
  authors: [{ name: "Nexus Team" }],
  applicationName: "Nexus",
  manifest: "/manifest.json",
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://nexus-workspace.vercel.app",
    siteName: "Nexus",
    title: "Nexus - AI Workplace OS",
    description: "AI-powered workplace operating system combining communication, projects, and Nova AI.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Nexus - AI Workplace OS",
    description: "AI-powered workplace operating system combining communication, projects, and Nova AI.",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
        suppressHydrationWarning
      >
        <body className="min-h-full flex flex-col">
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem
            disableTransitionOnChange
          >
            {children}
            <Toaster theme="dark" position="bottom-right" closeButton richColors />
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
