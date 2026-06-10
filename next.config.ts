import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "raw.githubusercontent.com",
        pathname: "/unitedstates/images/gh-pages/congress/**",
      },
    ],
  },
};

export default nextConfig;
