import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Children's Academy",
    short_name: "Children's Academy",
    description: "Modern private school: programs, olympiads, quizzes and brain games.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f8fc",
    theme_color: "#1d3557",
    icons: [
      { src: "/logo-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/logo-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}