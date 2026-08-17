import { redirect } from "next/navigation";
import { getUsuarioActual } from "@/lib/auth";
import { Sidebar } from "@/components/sidebar";
import { BottomNav } from "@/components/bottom-nav";
import { NavProvider } from "@/components/nav-context";
import { ConfigModal } from "@/components/config-modal";
import { FondoApp } from "@/components/fx/fondo-app";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const usuario = await getUsuarioActual();
  if (!usuario) redirect("/login");

  return (
    <NavProvider>
      <FondoApp />
      <div className="flex min-h-screen flex-col md:flex-row">
        <Sidebar usuario={usuario} />
        {/* pb-24 deja lugar a la barra inferior de móvil (h-16 + el FAB elevado) */}
        <main className="flex-1 overflow-x-hidden p-4 pb-24 md:p-6 md:pb-6 lg:p-8">{children}</main>
      </div>
      <BottomNav usuario={usuario} />
      <ConfigModal />
    </NavProvider>
  );
}
