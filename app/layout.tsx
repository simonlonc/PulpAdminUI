import type { Metadata } from "next";
import { connection } from "next/server";
import { IBM_Plex_Mono, Manrope } from "next/font/google";
import { PulpAuthProvider } from "@/components/pulp/auth-context";
import { PulpPluginsProvider } from "@/components/pulp/plugins-context";
import { PulpProjectProvider } from "@/components/pulp/project-context";
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Opts the tree out of static prerendering so PULP_PROJECT_NAME is read per
  // request. Without it the value would be baked in at build time and one
  // container image could only ever serve one project name.
  await connection();

  const projectName = process.env.PULP_PROJECT_NAME;
  if (!projectName) {
    throw new Error("Missing PULP_PROJECT_NAME environment variable.");
  }

  return (
    <html
      lang="en"
      className={`${manrope.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <PulpProjectProvider projectName={projectName}>
          <PulpAuthProvider>
            <PulpPluginsProvider>{children}</PulpPluginsProvider>
          </PulpAuthProvider>
        </PulpProjectProvider>
      </body>
    </html>
  );
}
