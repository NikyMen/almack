import type { Metadata, Viewport } from "next";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/poppins/latin-500.css";
import "@fontsource/poppins/latin-600.css";
import "@fontsource/poppins/latin-700.css";
import "@fontsource/poppins/latin-800.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Almack — Tu kiosco amigo",
  description:
    "Gestioná ventas, compras, stock, clientes y facturación. La IA transforma tus productos en contenido listo para vender.",
  icons: {
    icon: "/brand/almack-mascot.jpeg",
    apple: "/brand/almack-mascot.jpeg",
  },
};

// viewportFit: "cover" habilita env(safe-area-inset-*) → necesario para que la
// barra inferior no quede tapada por el gesto/notch en iPhone.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ff711f",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
