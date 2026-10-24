"use client";

import { useState } from "react";
import Link from "next/link";
import { Archive, ArrowLeftRight, Boxes, Menu, PackagePlus, TriangleAlert, Truck } from "lucide-react";
import { RightDrawer } from "@/components/right-drawer";

export function StockOptions({ administrador, puedeMover, actual }: { administrador: boolean; puedeMover: boolean; actual: string }) {
  const [abierto, setAbierto] = useState(false);
  const opciones = [
    { href: "/admin/stock", title: "Ver stock", icon: Boxes },
    { href: "/admin/stock/carga", title: "Cargar stock", icon: PackagePlus },
    { href: "/admin/stock?vista=alertas", title: "Alertas de stock", icon: TriangleAlert },
    ...(puedeMover ? [{ href: "/admin/stock/mover", title: "Mover stock", icon: ArrowLeftRight }] : []),
    { href: "/admin/stock?sucursal=transito", title: "Stock en tránsito", icon: Truck },
    ...(administrador ? [{ href: "/admin/stock/respaldos", title: "Respaldos", icon: Archive }] : []),
  ];
  return <>
    <button type="button" className="btn-ghost ml-auto gap-2 border border-slate-200 bg-white shadow-sm transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-800" onClick={() => setAbierto(true)} aria-haspopup="dialog" aria-expanded={abierto}>
      <Menu className="h-4 w-4" /> Opciones de stock
    </button>
    <RightDrawer title="Opciones de stock" open={abierto} onClose={() => setAbierto(false)}>
      <nav className="space-y-2" aria-label="Opciones de stock">
        {opciones.map(({ href, title, icon: Icon }) => <Link key={href} href={href} onClick={() => setAbierto(false)} aria-current={actual === href ? "page" : undefined} className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium transition hover:-translate-x-0.5 hover:border-orange-300 hover:bg-orange-50 hover:text-orange-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${actual === href ? "border-orange-200 bg-orange-50 text-orange-800" : "border-slate-200 text-slate-700"}`}><Icon className="h-5 w-5" />{title}</Link>)}
      </nav>
    </RightDrawer>
  </>;
}
