import type { NextConfig } from "next";
import "./src/lib/env/clientEnv";
import "./src/lib/env/serverEnv";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  typedRoutes: true,
  cacheComponents: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        pathname: "/**",
      },
    ],
  },
  experimental: {
    // Importers send Base64 (~4/3 of source bytes) plus the Server Action
    // envelope. Keep this above the encoded size of the app's 2 MB file cap.
    serverActions: {
      bodySizeLimit: "5mb",
    },
  },
};

export default nextConfig;
