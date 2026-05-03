import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Treat 127.0.0.1 as a same-origin host in dev. Without this, the dev
  // server (which binds to localhost) blocks the HMR socket + RSC transport
  // for 127.0.0.1, which silently breaks React hydration of client
  // components — the page renders but click handlers never wire up.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
