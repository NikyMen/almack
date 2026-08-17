"use client";

import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { logout } from "@/app/login/actions";
import { tieneAcceso, MODULOS_VISIBLES, type ModuloKey, type UsuarioActual } from "@/lib/permisos";
import { useNav } from "@/components/nav-context";
import {
  LayoutDashboard,
  ScanLine,
  TrendingUp,
  Truck,
  Boxes,
  Users,
  UserCog,
  ReceiptText,
  Store,
  Sparkles,
  MessageCircle,
  Menu,
  LogOut,
  Settings,
  X,
  type LucideIcon,
} from "lucide-react";

const LightRays = dynamic(() => import("@/components/fx/light-rays"), { ssr: false });

const ICONOS: Record<ModuloKey, LucideIcon> = {
  panel: LayoutDashboard,
  caja: ScanLine,
  stock: Boxes,
  ventas: TrendingUp,
  compras: Truck,
  clientes: Users,
  facturacion: ReceiptText,
  tienda: Store,
  whatsapp: MessageCircle,
  ia: Sparkles,
  equipo: UserCog,
};

function SidebarContent({
  usuario,
  visibles,
  path,
  onNavigate,
  onConfig,
}: {
  usuario: UsuarioActual;
  visibles: typeof MODULOS_VISIBLES;
  path: string;
  onNavigate?: () => void;
  onConfig: () => void;
}) {
  return (
    <>
      <div className="mb-8 px-2">
        <Image src="/brand/logo-cd.webp" alt="Consultoría Digital" width={180} height={120} className="h-auto w-40" priority />
        <p className="mt-3 text-xs font-semibold tracking-wide text-lime">GestorIA</p>
        <p className="text-[11px] text-slate-500">ERP con Inteligencia Artificial</p>
      </div>

      <nav className="flex flex-col gap-1">
        {visibles.map((item) => {
          const active = item.href === "/" ? path === "/" : path.startsWith(item.href);
          const Icon = ICONOS[item.key];
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition md:py-2 ${
                active ? "bg-lime/15 text-lime" : "text-slate-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto space-y-3 pt-6">
        <Link
          href="/tienda"
          onClick={onNavigate}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-400 transition hover:bg-white/5 hover:text-white md:py-2"
        >
          <Store className="h-4 w-4 shrink-0" />
          Ver tienda
        </Link>

        <button
          onClick={onConfig}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-400 transition hover:bg-white/5 hover:text-white md:py-2"
        >
          <Settings className="h-4 w-4 shrink-0" />
          Configuración
        </button>

        <div className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-white">{usuario.nombre}</p>
            <p className="text-[11px] text-slate-500">
              {usuario.rol === "admin" ? "Administrador" : "Miembro"}
            </p>
          </div>
          <form action={logout}>
            <button
              className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-slate-400 transition hover:text-rose-400"
              title="Cerrar sesión"
            >
              <LogOut className="h-3.5 w-3.5" />
              Salir
            </button>
          </form>
        </div>
      </div>
    </>
  );
}

export function Sidebar({ usuario }: { usuario: UsuarioActual }) {
  const path = usePathname();
  const { menuAbierto, setMenuAbierto, setConfigAbierta } = useNav();
  const visibles = MODULOS_VISIBLES.filter((item) => tieneAcceso(usuario, item.key));

  const abrirConfig = () => {
    setMenuAbierto(false);
    setConfigAbierta(true);
  };

  return (
    <>
      {/* Barra superior compacta en móvil: la navegación vive abajo */}
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-white/10 bg-navy px-4 py-2.5 text-slate-300 md:hidden">
        <button
          onClick={() => setMenuAbierto(!menuAbierto)}
          className="rounded-lg p-1.5 text-slate-300 transition hover:bg-white/10 hover:text-white"
          aria-expanded={menuAbierto}
          aria-label="Abrir menú"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Image src="/brand/logo-cd.webp" alt="" width={90} height={60} className="h-6 w-auto" priority />
        <span className="text-sm font-semibold tracking-wide text-lime">GestorIA</span>
      </header>

      {/* Sidebar fijo en escritorio, con los rayos de luz de fondo */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col overflow-hidden bg-navy px-4 py-6 text-slate-300 md:flex">
        <LightRays className="absolute inset-0 -z-0 h-full w-full opacity-70" />
        <div className="relative z-10 flex h-full flex-col">
          <SidebarContent usuario={usuario} visibles={visibles} path={path} onConfig={abrirConfig} />
        </div>
      </aside>

      {/* Overlay + drawer deslizante en móvil */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity md:hidden ${
          menuAbierto ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setMenuAbierto(false)}
        aria-hidden={!menuAbierto}
      />
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col overflow-y-auto bg-navy px-4 py-6 text-slate-300 shadow-xl transition-transform md:hidden ${
          menuAbierto ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <button
          onClick={() => setMenuAbierto(false)}
          className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
          aria-label="Cerrar menú"
        >
          <X className="h-5 w-5" />
        </button>
        <SidebarContent
          usuario={usuario}
          visibles={visibles}
          path={path}
          onNavigate={() => setMenuAbierto(false)}
          onConfig={abrirConfig}
        />
      </aside>
    </>
  );
}
