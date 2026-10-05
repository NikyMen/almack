import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ExcelJS carga sus dependencias de archivos con Node (fstream/rimraf).
  serverExternalPackages: ["@libsql/client", "libsql", "baileys", "pino", "qrcode", "exceljs"],
  experimental: {
    // Las fotos de producto viajan dentro de la server action del formulario de
    // Stock. El default (1 MB) cortaba cualquier foto sacada con el celular.
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default nextConfig;
