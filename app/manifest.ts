import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pulp Admin UI",
    short_name: "Pulp Admin",
    description: "Manage Pulp users and groups",
    start_url: "/dashboard",
    display: "standalone",
    // zinc-100 at 70% over white: the admin shell's light page background.
    background_color: "#f7f7f8",
    theme_color: "#f7f7f8",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
