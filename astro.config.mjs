import { defineConfig } from "astro/config";

export default defineConfig({
  devToolbar: {
    enabled: false
  },
  output: "static",
  site: "https://matrixdossier.netlify.app",
  trailingSlash: "never",
  vite: {
    optimizeDeps: {
      exclude: ["aria-query", "axobject-query"]
    }
  }
});
