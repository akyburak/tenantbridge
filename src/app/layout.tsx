// src/app/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { NextAuthProvider } from "@/components/providers/session-provider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "TenantBridge | Property Management Made Simple",
  description: "Multi-tenant SaaS platform connecting landlords and tenants with seamless property management tools.",
  keywords: "property management, tenant management, landlord, rental, multi-tenant, SaaS",
  authors: [{ name: "TenantBridge" }],
  creator: "TenantBridge",
  publisher: "TenantBridge",
  robots: "index, follow",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://tenantbridge.app",
    title: "TenantBridge | Property Management Made Simple",
    description: "Multi-tenant SaaS platform connecting landlords and tenants with seamless property management tools.",
    siteName: "TenantBridge",
  },
  twitter: {
    card: "summary_large_image",
    title: "TenantBridge | Property Management Made Simple",
    description: "Multi-tenant SaaS platform connecting landlords and tenants with seamless property management tools.",
  },
  viewport: {
    width: "device-width",
    initialScale: 1,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className={`${inter.className} h-full antialiased`}>
        <NextAuthProvider>
          {children}
        </NextAuthProvider>
      </body>
    </html>
  );
}