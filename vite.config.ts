import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Bound to 0.0.0.0 so phones / other machines on the LAN can reach it.
// allowedHosts: true turns off Vite's Host-header allowlist (dev convenience only).
export default defineConfig({
  plugins: [react()],
  server: { host: "0.0.0.0", port: 5173, strictPort: true, allowedHosts: true },
  preview: { host: "0.0.0.0", port: 4173, strictPort: true, allowedHosts: true },
});
