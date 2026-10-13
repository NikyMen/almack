"use client";

import { useEffect, useState } from "react";
import type { CouponQuote } from "@/lib/types";

export function usePromocionAutomatica(items: { productoId: number; cantidad: number }[]): CouponQuote | null {
  const [promo, setPromo] = useState<CouponQuote | null>(null);
  const clave = JSON.stringify(items);
  useEffect(() => {
    let cancelado = false;
    setPromo(null);
    if (!items.length) return;
    void fetch("/api/coupons/automatic", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: items.map(i => ({ productId: i.productoId, qty: i.cantidad })) }) })
      .then(r => r.ok ? r.json() : null)
      .then((r: CouponQuote | null) => { if (!cancelado && r?.automatic) setPromo(r); })
      .catch(() => undefined);
    return () => { cancelado = true; };
  // La clave representa exactamente los ítems de la cotización.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);
  return promo;
}
