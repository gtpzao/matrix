import { defineConfig } from "astro/config";

//[Configura Astro para gerar site estatico com URL publica, build statico e ajustes Vite.]
export default defineConfig({
  devToolbar: {
    enabled: false
  },
  output: "static",
  site: "https://matrixarchive.vercel.app",
  trailingSlash: "never",
  vite: {
    optimizeDeps: {
      exclude: ["aria-query", "axobject-query"]
    }
  }
});
