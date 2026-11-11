import type { MetadataRoute } from "next";

// Installable as an app (PWA). We deliberately do NOT add an offline cache:
// children's private images should never be stored on a shared device.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WAK – Weird Art Klub",
    short_name: "WAK",
    description: "Del din kunst. Opdag noget weird. Tag med på tur.",
    start_url: "/kunst",
    display: "standalone",
    background_color: "#FFF7E9",
    theme_color: "#1015B9",
    lang: "da",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
