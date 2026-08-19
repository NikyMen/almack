import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@libsql/client", "libsql", "baileys", "pino", "qrcode"],
  experimental: {
    // Las fotos de producto viajan dentro de la server action del formulario de
    // Stock. El default (1 MB) cortaba cualquier foto sacada con el celular.
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default nextConfig;
