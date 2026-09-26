// Fragments for vite.config.js — merge into your own config.
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
// import viteCompression from "vite-plugin-compression";
// import { visualizer } from "rollup-plugin-visualizer";

export default defineConfig(({ mode }) => {
  // CI / deploy builds (Coolify, GitHub Actions… set CI=true) run in small
  // containers that OOM-kill `vite build` while brotli + gzip + the visualizer
  // run together. Skip them there when the server compresses at runtime (Caddy
  // `encode gzip zstd`, nginx `gzip on`) — the .gz/.br files are never served.
  const isCI = process.env.CI === "true";

  return {
    plugins: [
      // !isCI && viteCompression({ algorithm: "gzip" }),
      // !isCI && viteCompression({ algorithm: "brotliCompress", ext: ".br" }),
      // !isCI && visualizer({ filename: "dist/stats.html" }),
      VitePWA({
        workbox: {
          // Without this the service worker answers a NAVIGATION to /robots.txt
          // with the SPA shell and the router renders its 404 — humans see
          // "robots.txt 404" while crawlers (no SW) are fine.
          navigateFallbackDenylist: [
            /^\/robots\.txt$/,
            /^\/sitemap\.xml$/,
            /^\/llms\.txt$/,
            /^\/api\//,
            /\.(?:xml|txt|pdf|json|webmanifest)$/i,
          ],
        },
      }),
    ].filter(Boolean),
    build: {
      reportCompressedSize: !isCI,
      rollupOptions: {
        output: {
          manualChunks: {
            // Small shared deps get an explicit EAGER home. Left unclaimed,
            // prop-types was folded into a charts chunk and four pages
            // downloaded 151 KB of recharts to reach it.
            "vendor-react": ["react", "react-dom", "react-router-dom", "prop-types"],
            // One library per chunk, so the one eager library (here
            // framer-motion) doesn't drag the lazy ones onto the homepage.
            // Splitting a lumped "vendor-ui" cut eager JS ~75 %.
            "vendor-motion": ["framer-motion"],
            "vendor-gsap": ["gsap"],
            "vendor-lottie": ["lottie-web"],
            "vendor-toast": ["react-toastify"],
            "vendor-sweetalert": ["sweetalert2"],
            // Do NOT create "vendor-icons" / "vendor-charts": grouping every icon
            // put ~106 KB of icons on the homepage. Ungrouped, each icon ships
            // with the route that renders it.
          },
        },
      },
    },
  };
});
// Chunk names matter: prerender's `renderChain` regex matches them (plus page
// component chunk names like Home.<hash>.js).
