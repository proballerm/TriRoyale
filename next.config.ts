import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // ❗Build even if ESLint has errors
    ignoreDuringBuilds: true,
  },
  // Optional: if TS type errors block your build, uncomment the next block.
  // typescript: {
  //   ignoreBuildErrors: true,
  // },
};

export default nextConfig;