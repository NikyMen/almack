"use client";

import Link from "next/link";
import { X, Home, PackageSearch, Tag, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/Logo";
import { useUI } from "@/store/ui";

const links = [
  { href: "/tienda", label: "Inicio", icon: Home },
  { href: "/tienda/productos", label: "Productos", icon: PackageSearch },
  { href: "/tienda/ofertas", label: "Ofertas", icon: Tag },
];

export function SideMenu() {
  const open = useUI((s) => s.menuOpen);
  const close = useUI((s) => s.closeMenu);

  return (
    <>
      <div
        onClick={close}
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <aside
        className={`fixed left-0 top-0 z-50 flex h-full w-72 flex-col bg-white shadow-2xl transition-transform ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-black/5 px-4 py-3">
          <Logo />
          <button onClick={close} aria-label="Cerrar" className="rounded-lg p-1 hover:bg-black/5">
            <X size={22} />
          </button>
        </div>
        <nav className="flex-1 px-2 py-3">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={close}
              className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-brand-ink hover:bg-brand-cream"
            >
              <Icon size={20} className="text-brand-red" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-black/5 px-4 py-4 text-sm text-brand-ink/70">
          <p className="flex items-start gap-2">
            <ShieldCheck size={17} className="mt-0.5 shrink-0 text-brand-red" />
            Precios y stock sincronizados directamente con GestorIA.
          </p>
        </div>
      </aside>
    </>
  );
}
