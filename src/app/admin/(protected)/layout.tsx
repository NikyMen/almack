import { redirect } from "next/navigation";
import { getUsuarioActual } from "@/lib/auth";
import { getContextoSucursal } from "@/lib/sucursal";
import { Sidebar } from "@/components/sidebar";
import { BottomNav } from "@/components/bottom-nav";
import { NavProvider } from "@/components/nav-context";
import { ConfigModal } from "@/components/config-modal";
import { FondoApp } from "@/components/fx/fondo-app";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const usuario = await getUsuarioActual();
  if (!usuario) redirect("/admin/login");
  // El selector de sucursal vive en el logo del sidebar, así que la lista y el
  // local activo se cargan una sola vez acá para todo el panel.
  const { lista, activaId } = await getContextoSucursal();

  return (
    <NavProvider>
      <FondoApp />
      <div className="flex min-h-dvh flex-col xl:flex-row">
        <Sidebar usuario={usuario} sucursales={lista} sucursalActivaId={activaId} />
        {/* pb-24 deja lugar a la barra inferior de móvil (h-16 + el FAB elevado) */}
        <main className="admin-content min-w-0 flex-1 overflow-x-hidden p-4 pb-24 sm:p-6 xl:pb-6 xl:p-8">{children}</main>
      </div>
      <BottomNav usuario={usuario} />
      <ConfigModal />
    </NavProvider>
  );
}
