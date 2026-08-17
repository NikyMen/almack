"use client";

import Link from "next/link";
import { Flame } from "lucide-react";
import type { Product, SuperOferta } from "@/lib/types";
import { formatARS } from "@/lib/format";
import { useCart } from "@/store/cart";
import { useToast } from "@/store/toast";

/**
 * Hero principal de la home: banner "Super Oferta" con un producto destacado.
 * El fondo es un video mp4 en loop (si hay uno cargado) o la imagen del
 * producto con un zoom suave. Todo se edita desde /admin/ofertas.
 *
 * `tone` cambia la intensidad del fondo manteniendo la paleta de la marca.
 */
export function SuperOfertaHero({
  oferta,
  cartProduct,
  tone = "red",
}: {
  oferta: SuperOferta;
  cartProduct?: Product;
  tone?: "red" | "gold";
}) {
  const add = useCart((state) => state.add);
  const showToast = useToast((state) => state.show);
  const discount =
    oferta.oldPrice && oferta.oldPrice > oferta.price
      ? Math.round((1 - oferta.price / oferta.oldPrice) * 100)
      : null;
  const gold = tone === "gold";
  const unavailable =
    !cartProduct || !cartProduct.available || cartProduct.stock < oferta.cartQuantity;

  return (
    <section
      className={`relative mx-4 mt-3 overflow-hidden rounded-2xl shadow-card md:mx-6 md:mt-6 md:rounded-3xl ${
        gold ? "bg-[#172000] ring-2 ring-brand-gold/70" : "bg-brand-ink"
      }`}
    >
      <div className="absolute inset-0">
        {oferta.video ? (
          <video
            ref={(el) => {
              if (el) {
                el.muted = true;
                el.play().catch(() => {});
              }
            }}
            src={oferta.video}
            poster={oferta.image}
            autoPlay
            muted
            loop
            playsInline
            className="h-full w-full object-cover object-[68%_center] md:object-center"
          />
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={oferta.image}
            alt={oferta.title}
            className="so-zoom h-full w-full object-cover object-[68%_center] md:object-center"
          />
        )}
      </div>

      {gold ? (
        <>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_12%,rgba(197,237,27,0.42),transparent_32%),linear-gradient(180deg,rgba(12,16,21,0.15),rgba(12,16,21,0.82))]" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0c1015]/95 via-[#294000]/70 to-transparent md:bg-gradient-to-r md:from-[#0c1015]/95 md:via-[#426000]/65 md:to-transparent" />
          <div className="so-sweep absolute -left-32 top-10 h-16 w-[42rem] rotate-[-12deg] bg-brand-gold/40 blur-sm" />
        </>
      ) : (
        <>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_12%,rgba(197,237,27,0.28),transparent_28%),linear-gradient(180deg,rgba(12,16,21,0.12),rgba(12,16,21,0.78))]" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0c1015]/95 via-[#182500]/72 to-transparent md:bg-gradient-to-r md:from-[#0c1015]/95 md:via-[#243600]/70 md:to-transparent" />
          <div className="so-sweep absolute -left-32 top-10 h-16 w-[42rem] rotate-[-12deg] bg-brand-gold/25 blur-sm" />
        </>
      )}

      <div className="relative flex min-h-[330px] flex-col justify-end gap-2 p-4 sm:min-h-[360px] md:min-h-[460px] md:max-w-2xl md:justify-center md:gap-3 md:p-12">
        <span
          className={`so-pop so-badge inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.18em] md:text-sm ${
            gold ? "bg-brand-red text-white" : "bg-brand-gold text-brand-ink"
          }`}
        >
          <Flame size={14} className="shrink-0" /> Oferta destacada
        </span>

        <h1 className="so-pop so-delay-1 max-w-[11ch] font-display text-3xl font-bold uppercase leading-[0.95] text-white drop-shadow md:max-w-none md:text-6xl">
          {oferta.title}
        </h1>

        {oferta.subtitle && (
          <p className="so-pop so-delay-2 max-w-md text-sm font-semibold text-white/90 md:text-lg">
            {oferta.subtitle}
          </p>
        )}

        <div className="so-pop so-delay-2 mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="so-shine relative overflow-hidden rounded-xl bg-white px-3 py-1.5 text-3xl font-extrabold tracking-tight text-brand-red shadow-card md:px-4 md:py-2 md:text-6xl">
            {formatARS(oferta.price)}
          </span>
          {oferta.oldPrice && oferta.oldPrice > oferta.price && (
            <span className="text-base font-semibold text-white/60 line-through md:text-2xl">
              {formatARS(oferta.oldPrice)}
            </span>
          )}
          {discount !== null && discount > 0 && (
            <span
              className={`so-float rounded-lg px-2 py-1 text-sm font-extrabold md:text-lg ${
                gold ? "bg-brand-red text-white" : "bg-brand-gold text-brand-ink"
              }`}
            >
              -{discount}%
            </span>
          )}
        </div>

        <div className="so-pop so-delay-3 mt-3 flex gap-3 md:mt-5">
          <button
            type="button"
            disabled={unavailable}
            onClick={() => {
              if (!cartProduct) return;
              add(cartProduct, oferta.cartQuantity);
              showToast(`${oferta.cartQuantity} × ${cartProduct.name}`, { variant: "cart" });
            }}
            className="btn-gold disabled:cursor-not-allowed disabled:opacity-50 md:px-6 md:py-3 md:text-base"
          >
            Agregar al carrito
          </button>
          <Link
            href="/tienda/ofertas"
            className="hidden items-center justify-center rounded-lg border border-white/40 px-6 py-3 text-base font-bold text-white hover:bg-white/10 md:inline-flex"
          >
            Ver ofertas
          </Link>
        </div>
      </div>
    </section>
  );
}
