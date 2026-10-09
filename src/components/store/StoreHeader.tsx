"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogIn, Menu, ShoppingCart } from "lucide-react";
import { Logo } from "@/components/Logo";
import { SearchBar } from "@/components/store/SearchBar";
import { useCart } from "@/store/cart";
import { useUI } from "@/store/ui";
import { cn } from "@/lib/cn";

const navLinks = [
  { href: "/", label: "Inicio" },
  { href: "/tienda/productos", label: "Productos" },
  { href: "/tienda/ofertas", label: "Ofertas" },
];

export function StoreHeader() {
  const count = useCart((s) => s.lines.reduce((a, l) => a + l.qty, 0));
  const openCart = useUI((s) => s.openCart);
  const toggleMenu = useUI((s) => s.toggleMenu);
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-black/5 bg-brand-cream/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-6">
        {/* Hamburguesa solo en mobile */}
        <button
          onClick={toggleMenu}
          aria-label="Abrir menú"
          className="rounded-lg p-1.5 text-brand-red hover:bg-black/5 md:hidden"
        >
          <Menu size={24} />
        </button>

        <Link href="/" aria-label="Inicio de la tienda Almack">
          <Logo className="h-11 w-28 sm:h-14 sm:w-[190px]" />
        </Link>

        {/* Navegación horizontal solo en escritorio */}
        <nav className="hidden items-center gap-1 md:flex">
          {navLinks.map(({ href, label }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm font-semibold transition",
                  active
                    ? "bg-brand-red/10 text-brand-red"
                    : "text-brand-ink/70 hover:bg-black/5 hover:text-brand-ink"
                )}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          {/* Buscador en escritorio */}
          <Suspense fallback={null}>
            <SearchBar className="hidden w-48 lg:block xl:w-60" />
          </Suspense>

          <Link
            href="/admin/login"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand-red px-2.5 py-2 text-xs font-semibold text-white transition hover:bg-brand-red/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-red sm:px-3 sm:text-sm"
          >
            <LogIn size={18} aria-hidden="true" className="hidden shrink-0 sm:block" />
            <span className="whitespace-nowrap">Iniciar sesión</span>
          </Link>

          <button
            onClick={openCart}
            aria-label="Abrir carrito"
            className="relative rounded-lg p-1.5 text-brand-red hover:bg-black/5"
          >
            <ShoppingCart size={24} />
            {count > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-gold px-1 text-[11px] font-bold text-brand-ink">
                {count}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Buscador en mobile */}
      <div className="px-4 pb-3 lg:hidden">
        <Suspense fallback={null}>
          <SearchBar />
        </Suspense>
      </div>
    </header>
  );
}
