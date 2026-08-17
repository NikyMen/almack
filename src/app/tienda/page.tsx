import Link from "next/link";
import { CreditCard, PackageCheck, ShieldCheck, Sparkles, Tag } from "lucide-react";
import {
  listTiendaOfertas,
  listTiendaProductos,
  tiendaToStoreProduct,
  tiendaToSuperOferta,
} from "@/lib/tienda";
import { ProductCatalog } from "@/components/store/ProductCatalog";
import { PromoCarousel } from "@/components/store/PromoCarousel";
import { SuperOfertaHero } from "@/components/store/SuperOfertaHero";

export const dynamic = "force-dynamic";

export default async function TiendaHomePage() {
  const [rows, offerRows] = await Promise.all([listTiendaProductos(), listTiendaOfertas()]);
  const productos = rows.map(tiendaToStoreProduct);
  const ofertas = offerRows.map(tiendaToStoreProduct);
  const superOferta = offerRows[0] ? tiendaToSuperOferta(offerRows[0]) : null;
  const ofertasDestacadas = superOferta ? ofertas.slice(1) : ofertas;

  return (
    <div className="space-y-8 md:space-y-14">
      {superOferta ? (
        <SuperOfertaHero
          oferta={superOferta}
          cartProduct={productos.find((product) => product.id === superOferta.cartProductId)}
        />
      ) : (
        <HeroClasico productCount={productos.length} />
      )}

      {ofertasDestacadas.length > 0 && (
        <section className="px-4 md:px-6">
          <div className="mb-4 flex items-end justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-brand-ink/45">Selección especial</p>
              <h2 className="mt-1 flex items-center gap-2 text-xl font-extrabold text-brand-ink md:text-3xl"><Tag size={22} className="text-brand-red" /> Ofertas destacadas</h2>
            </div>
            <Link href="/tienda/ofertas" className="text-sm font-bold text-brand-red hover:underline">Ver todas</Link>
          </div>
          <div className="rounded-3xl bg-brand-gold/10 p-3 ring-1 ring-brand-gold/35 md:p-5"><PromoCarousel products={ofertasDestacadas} /></div>
        </section>
      )}

      <section className="px-4 md:px-6">
        <div className="mb-5">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-brand-ink/45">Catálogo online</p>
          <h2 className="mt-1 text-xl font-extrabold text-brand-ink md:text-3xl">Todos los productos</h2>
          <p className="mt-1 text-sm text-brand-ink/55">Precios y disponibilidad sincronizados con nuestro inventario.</p>
        </div>
        <ProductCatalog products={productos} />
      </section>

      <section className="px-4 pb-2 md:px-6">
        <div className="grid grid-cols-3 gap-2 md:gap-4">
          <Feature icon={PackageCheck} title="Stock real" subtitle="Actualizado" />
          <Feature icon={ShieldCheck} title="Compra segura" subtitle="Protegida" />
          <Feature icon={CreditCard} title="Pago online" subtitle="Mercado Pago" />
        </div>
      </section>
    </div>
  );
}

function HeroClasico({ productCount }: { productCount: number }) {
  return (
    <section className="relative mx-4 mt-3 overflow-hidden rounded-3xl bg-brand-ink shadow-card md:mx-6 md:mt-6">
      <div className="absolute -right-20 -top-28 h-80 w-80 rounded-full bg-brand-gold/20 blur-3xl" />
      <div className="absolute -bottom-40 right-20 h-80 w-80 rounded-full border-[42px] border-brand-gold/10" />
      <div className="relative flex min-h-[340px] flex-col justify-end p-6 sm:min-h-[390px] md:min-h-[460px] md:max-w-3xl md:justify-center md:p-12">
        <span className="inline-flex w-fit items-center gap-2 rounded-full bg-brand-gold px-3 py-1.5 text-xs font-black uppercase tracking-[0.2em] text-brand-ink"><Sparkles size={14} /> Tienda online</span>
        <h1 className="mt-5 max-w-2xl font-display text-4xl font-extrabold leading-[0.98] tracking-tight text-white md:text-6xl">Todo lo que buscás, en un solo lugar.</h1>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/65 md:text-lg">Explorá {productCount || "nuestros"} productos, consultá disponibilidad real y comprá de forma simple y segura.</p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="/tienda/productos" className="rounded-xl bg-brand-gold px-5 py-3 text-sm font-extrabold text-brand-ink transition hover:brightness-95">Ver productos</Link>
          <Link href="/tienda/ofertas" className="rounded-xl border border-white/20 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/10">Ver ofertas</Link>
        </div>
      </div>
    </section>
  );
}

function Feature({ icon: Icon, title, subtitle }: { icon: typeof ShieldCheck; title: string; subtitle: string }) {
  return <div className="flex flex-col items-center rounded-2xl bg-white p-3 text-center shadow-soft md:flex-row md:gap-3 md:p-5 md:text-left"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-gold text-brand-ink"><Icon size={20} /></span><span className="mt-2 md:mt-0"><strong className="block text-xs text-brand-ink md:text-sm">{title}</strong><small className="text-[10px] text-brand-ink/50 md:text-xs">{subtitle}</small></span></div>;
}
