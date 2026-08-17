import type { Metadata, Viewport } from "next";
import { Poppins, Inter } from "next/font/google";
import "./globals.css";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-poppins",
});
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "GestorIA — ERP con Inteligencia Artificial",
  description:
    "Gestioná ventas, compras, stock, clientes y facturación. La IA transforma tus productos en contenido listo para vender.",
  icons: { icon: "/brand/favicon.png" },
};

// viewportFit: "cover" habilita env(safe-area-inset-*) → necesario para que la
// barra inferior no quede tapada por el gesto/notch en iPhone.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#0c1015",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${poppins.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
