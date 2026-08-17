"use client";

import { useEffect, useRef, useState } from "react";
import {
  Loader2,
  Minus,
  Plus,
  ShoppingBag,
  TicketPercent,
  Trash2,
  X,
} from "lucide-react";
import { useCart } from "@/store/cart";
import { useUI } from "@/store/ui";
import { formatARS } from "@/lib/format";
import type { CouponQuote } from "@/lib/types";

const CHECKOUT_ATTEMPT_KEY = "gestoria-checkout-attempt";

export function CartDrawer() {
  const open = useUI((s) => s.cartOpen);
  const close = useUI((s) => s.closeCart);
  const { lines, setQty, remove, total, clear } = useCart();
  const subtotal = total();
  const [couponCode, setCouponCode] = useState("");
  const [coupon, setCoupon] = useState<CouponQuote | null>(null);
  const [couponError, setCouponError] = useState("");
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  const finalTotal = coupon?.total ?? subtotal;
  const automaticPromoRequest = useRef(0);

  const [errorPago, setErrorPago] = useState<string | null>(null);
  const [pagando, setPagando] = useState(false);
  const checkoutAttempt = useRef<{ fingerprint: string; id: string } | null>(null);

  // Datos mínimos para registrar al cliente y coordinar la entrega.
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [direccion, setDireccion] = useState("");

  useEffect(() => {
    setCoupon(null);
    setCouponError("");
    if (lines.length === 0) return;

    const requestId = ++automaticPromoRequest.current;
    let cancelled = false;
    void fetch("/api/coupons/automatic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: lines.map((l) => ({ productId: l.product.id, qty: l.qty })) }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: CouponQuote | null) => {
        if (!cancelled && requestId === automaticPromoRequest.current && data?.automatic) setCoupon(data);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [lines]);

  const applyCoupon = async () => {
    if (!couponCode.trim() || validatingCoupon) return;
    setValidatingCoupon(true);
    setCouponError("");
    try {
      const res = await fetch("/api/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: couponCode,
          items: lines.map((l) => ({ productId: l.product.id, qty: l.qty })),
          // El código de bienvenida vale una vez por número: sin el teléfono
          // el servidor no puede validarlo.
          telefono: telefono.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Cupón inválido.");
      setCoupon(data);
      setCouponCode(data.code);
    } catch (e) {
      setCoupon(null);
      setCouponError(e instanceof Error ? e.message : "Cupón inválido.");
    } finally {
      setValidatingCoupon(false);
    }
  };

  // ---- Validaciones antes de habilitar el pago ----
  const nombreValido = nombre.trim().length >= 2;
  const telefonoValido = telefono.replace(/\D/g, "").length >= 6;
  const direccionValida = direccion.trim().length >= 4;
  const listoParaPagar = nombreValido && telefonoValido && direccionValida;

  const textoBoton = pagando
    ? "Redirigiendo a Mercado Pago…"
    : !nombreValido || !telefonoValido || !direccionValida
      ? "Completá tus datos"
      : "Pagar con Mercado Pago";

  // Inicia el pago: crea el pedido + preferencia en el backend y redirige a MP.
  const pagarConMercadoPago = async () => {
    if (!listoParaPagar || pagando) return;
    setErrorPago(null);
    setPagando(true);
    try {
      const payload = {
        items: lines.map((l) => ({
          productoId: Number(l.product.id),
          cantidad: l.qty,
        })),
        direccion: direccion.trim(),
        nombre: nombre.trim(),
        telefono: telefono.trim(),
        couponCode: coupon?.code,
      };
      const fingerprint = JSON.stringify(payload);
      if (!checkoutAttempt.current || checkoutAttempt.current.fingerprint !== fingerprint) {
        let stored: { fingerprint: string; id: string } | null = null;
        try {
          stored = JSON.parse(sessionStorage.getItem(CHECKOUT_ATTEMPT_KEY) ?? "null");
        } catch {
          stored = null;
        }
        checkoutAttempt.current =
          stored?.fingerprint === fingerprint && /^[0-9a-f-]{36}$/i.test(stored.id)
            ? stored
            : { fingerprint, id: crypto.randomUUID() };
        sessionStorage.setItem(CHECKOUT_ATTEMPT_KEY, JSON.stringify(checkoutAttempt.current));
      }
      const res = await fetch("/api/mp/preference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          checkoutId: checkoutAttempt.current.id,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.initPoint) {
        if (data?.resetCheckout) {
          checkoutAttempt.current = null;
          sessionStorage.removeItem(CHECKOUT_ATTEMPT_KEY);
        }
        throw new Error(data?.error || "No pudimos iniciar el pago.");
      }
      window.location.href = data.initPoint as string;
    } catch (e) {
      setErrorPago(e instanceof Error ? e.message : "No pudimos iniciar el pago.");
      setPagando(false);
    }
  };

  return (
    <>
      <div
        onClick={close}
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <aside
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-sm flex-col bg-white shadow-2xl transition-transform ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-black/5 px-4 py-3">
          <h2 className="flex items-center gap-2 font-semibold text-brand-ink">
            <ShoppingBag size={20} className="text-brand-red" /> Tu pedido
          </h2>
          <button onClick={close} aria-label="Cerrar" className="rounded-lg p-1 hover:bg-black/5">
            <X size={22} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {lines.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center text-brand-ink/50">
              <ShoppingBag size={42} className="mb-3 opacity-40" />
              <p className="font-medium">Tu carrito está vacío</p>
              <p className="text-sm">Agregá productos para empezar tu pedido.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {lines.map((l) => (
                <li key={l.product.id} className="flex gap-3 rounded-xl border border-black/5 p-2">
                  {l.product.image ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={l.product.image}
                      alt={l.product.name}
                      className="h-16 w-16 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-brand-cream text-2xl">📷</div>
                  )}
                  <div className="flex flex-1 flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-semibold">{l.product.name}</span>
                      <button
                        onClick={() => remove(l.product.id)}
                        className="text-brand-ink/40 hover:text-brand-red"
                        aria-label="Quitar"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <span className="text-sm text-brand-ink/60">{formatARS(l.product.price)}</span>
                    {(l.product.stock <= 0 || !l.product.available) && (
                      <span className="text-[11px] font-semibold text-brand-red">
                        {l.product.stock <= 0 ? "Agotado" : "No disponible"}
                      </span>
                    )}
                    <div className="mt-auto flex items-center gap-2">
                      <button
                        onClick={() => setQty(l.product.id, l.qty - 1)}
                        className="rounded-md border border-black/10 p-1 hover:bg-black/5"
                        aria-label="Restar"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="w-6 text-center text-sm font-semibold">{l.qty}</span>
                      <button
                        onClick={() => setQty(l.product.id, Math.min(l.qty + 1, l.product.stock))}
                        disabled={
                          l.qty >= l.product.stock ||
                          l.product.stock <= 0 ||
                          !l.product.available
                        }
                        className="rounded-md border border-black/10 p-1 hover:bg-black/5 disabled:opacity-30"
                        aria-label="Sumar"
                      >
                        <Plus size={14} />
                      </button>
                      {l.product.stock > 0 && l.product.available && l.qty >= l.product.stock && (
                        <span className="text-[11px] font-semibold text-brand-red">
                          Máximo disponible
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {lines.length > 0 && (
          <div className="max-h-[70%] overflow-y-auto border-t border-black/5 px-4 py-3">
            <div className="space-y-1 text-sm">
              {coupon && coupon.discount > 0 && (
                <>
                  <div className="flex justify-between text-brand-ink/60">
                    <span>Subtotal</span>
                    <span>{formatARS(subtotal)}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-emerald-700">
                    <span>Descuento</span>
                    <span>-{formatARS(coupon.discount)}</span>
                  </div>
                </>
              )}
              {coupon?.gift && (
                <div className="flex justify-between font-semibold text-emerald-700">
                  <span>🎁 Regalo</span>
                  <span>
                    {coupon.gift.qty}x {coupon.gift.name}
                  </span>
                </div>
              )}
              <div className="flex justify-between pt-1 text-base font-bold text-brand-ink">
                <span>Total</span>
                <span>{formatARS(finalTotal)}</span>
              </div>
            </div>

            <div className="mt-3 space-y-3">
              <div className="space-y-3 rounded-2xl border border-black/5 bg-brand-cream/60 p-3">
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-brand-ink/70">
                      Tu nombre
                    </span>
                    <input
                      type="text"
                      value={nombre}
                      onChange={(e) => setNombre(e.target.value)}
                      placeholder="Nombre y apellido"
                      className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-brand-ink/70">
                      Tu WhatsApp
                    </span>
                    <input
                      type="tel"
                      value={telefono}
                      onChange={(e) => setTelefono(e.target.value)}
                      placeholder="Tu número"
                      className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
                    />
                  </label>
                </div>

                <div>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-brand-ink/70">
                      Dirección de entrega
                    </span>
                    <input
                      type="text"
                      value={direccion}
                      onChange={(e) => setDireccion(e.target.value)}
                      placeholder="Calle, altura y localidad"
                      className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
                    />
                  </label>
                </div>
              </div>

              <div className="rounded-xl border border-dashed border-brand-red/30 bg-brand-cream/60 p-3">
                <label className="mb-1 flex items-center gap-1 text-xs font-semibold text-brand-ink/70">
                  <TicketPercent size={14} className="text-brand-red" /> Código de descuento
                </label>
                <div className="flex gap-2">
                  <input
                    value={couponCode}
                    onChange={(e) => {
                      automaticPromoRequest.current += 1;
                      setCouponCode(e.target.value.toUpperCase());
                      setCoupon(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") applyCoupon();
                    }}
                    placeholder="Ingresá el código"
                    className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm uppercase"
                  />
                  <button
                    type="button"
                    onClick={applyCoupon}
                    disabled={!couponCode.trim() || validatingCoupon}
                    className="rounded-lg bg-brand-ink px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
                  >
                    {validatingCoupon ? "…" : "Aplicar"}
                  </button>
                </div>
                {coupon && (
                  <p className="mt-2 text-xs font-semibold text-emerald-700">
                    ✓ {coupon.automatic ? "Promo aplicada automáticamente: " : ""}{coupon.description}
                  </p>
                )}
                {couponError && <p className="mt-2 text-xs font-semibold text-brand-red">{couponError}</p>}
              </div>

              <button
                onClick={pagarConMercadoPago}
                disabled={!listoParaPagar || pagando}
                className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white shadow-soft transition ${
                  !listoParaPagar || pagando
                    ? "cursor-not-allowed bg-black/20"
                    : "bg-[#009ee3] hover:brightness-95"
                }`}
              >
                {pagando && <Loader2 size={16} className="animate-spin" />}
                {textoBoton}
              </button>

              {errorPago && (
                <p className="rounded-lg bg-brand-red/10 px-3 py-2 text-center text-xs font-semibold text-brand-red">
                  {errorPago}
                </p>
              )}
            </div>

            <button
              onClick={clear}
              className="mt-2 w-full text-center text-xs text-brand-ink/50 hover:text-brand-red"
            >
              Vaciar carrito
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
