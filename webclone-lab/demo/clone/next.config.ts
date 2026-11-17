import type { NextConfig } from "next";
import rewrites from "../backend/next-rewrites.json";

const nextConfig: NextConfig = {
  output: "standalone",
  // API calls go to the independently reconstructed backend (wcl api), never the original.
  async rewrites() {
    return rewrites;
  },
};

export default nextConfig;
