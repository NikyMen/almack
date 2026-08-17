"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, PackageSearch, Tag } from "lucide-react";
import { cn } from "@/lib/cn";

const items = [
  { href: "/tienda", label: "Inicio", icon: Home },
  { href: "/tienda/productos", label: "Productos", icon: PackageSearch },
  { href: "/tienda/ofertas", label: "Ofertas", icon: Tag },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-black/5 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_12px_rgba(0,0,0,0.06)]">
      <ul className="flex items-stretch justify-around">
        {items.map(({ href, label, icon: Icon }) => {
          const active = href === "/tienda" ? pathname === "/tienda" : pathname.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className={cn(
                  "flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition",
                  active ? "text-brand-red" : "text-brand-ink/55 hover:text-brand-ink"
                )}
              >
                <Icon size={22} strokeWidth={active ? 2.4 : 2} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
