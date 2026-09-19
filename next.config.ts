import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for the container images: .next/standalone carries
  // its own node_modules, so the runtime stage never installs dependencies.
  output: "standalone",
};

export default nextConfig;
