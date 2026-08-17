import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@libsql/client", "libsql", "baileys", "pino", "qrcode"],
};

export default nextConfig;
