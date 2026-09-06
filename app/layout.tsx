import type { Metadata } from "next";
import { IBM_Plex_Mono, Manrope } from "next/font/google";
import { PulpAuthProvider } from "@/components/pulp/auth-context";
import { PulpPluginsProvider } from "@/components/pulp/plugins-context";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pulp Admin UI",
  description: "Manage Pulp users and groups",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <PulpAuthProvider>
          <PulpPluginsProvider>{children}</PulpPluginsProvider>
        </PulpAuthProvider>
      </body>
    </html>
  );
}
