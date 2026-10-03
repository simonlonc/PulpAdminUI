import type { NextConfig } from "next";

// `next dev` serves /_next/* only to localhost unless the requesting origin is allowed,
// and it will otherwise rewrite this file to add the origin itself. Reading the list from
// the environment keeps machine-specific hostnames out of version control: set
// NEXT_DEV_ALLOWED_ORIGINS to a comma-separated list in .env (see .env.example).
// Unset leaves Next's own default in place. Dev-only; it has no effect on the
// standalone production build.
const devOrigins = process.env.NEXT_DEV_ALLOWED_ORIGINS?.trim()
  ?.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  // Self-contained server bundle for the container images: .next/standalone carries
  // its own node_modules, so the runtime stage never installs dependencies.
  output: "standalone",
  ...(devOrigins?.length ? { allowedDevOrigins: devOrigins } : {}),
};

export default nextConfig;
