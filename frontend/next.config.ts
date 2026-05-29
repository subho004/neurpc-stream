import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow streaming responses from backend without buffering issues
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
};

export default nextConfig;
