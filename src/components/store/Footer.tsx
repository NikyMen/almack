import Link from "next/link";
import { PackageCheck, ShieldCheck, Sparkles } from "lucide-react";
import { Logo } from "@/components/Logo";

export function Footer() {
  return (
    <footer className="mt-8 hidden border-t border-white/10 bg-brand-ink text-white/80 md:block">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-10 md:grid-cols-3">
        <div>
          <Logo />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/60">
            Catálogo online con precios y disponibilidad actualizados desde GestorIA.
          </p>
        </div>
        <div>
          <h4 className="mb-3 font-semibold text-white">Navegación</h4>
          <ul className="space-y-2 text-sm">
            <li><Link href="/tienda" className="hover:text-brand-gold">Inicio</Link></li>
            <li><Link href="/tienda/productos" className="hover:text-brand-gold">Productos</Link></li>
            <li><Link href="/tienda/ofertas" className="hover:text-brand-gold">Ofertas</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="mb-3 font-semibold text-white">Compra con confianza</h4>
          <ul className="space-y-3 text-sm text-white/65">
            <li className="flex items-center gap-2"><PackageCheck size={16} className="text-brand-gold" /> Stock real</li>
            <li className="flex items-center gap-2"><ShieldCheck size={16} className="text-brand-gold" /> Pago protegido</li>
            <li className="flex items-center gap-2"><Sparkles size={16} className="text-brand-gold" /> Asistencia online</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10 py-4 text-center text-xs text-white/45">
        © {new Date().getFullYear()} Consultoría Digital · Tienda administrada con GestorIA
      </div>
    </footer>
  );
}
