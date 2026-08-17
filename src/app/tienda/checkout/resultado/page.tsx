"use client";

import Link from "next/link";
import { CheckCircle2, Clock3, XCircle } from "lucide-react";
import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useCart } from "@/store/cart";

function ResultadoContenido() {
  const params = useSearchParams();
  const clear = useCart((state) => state.clear);
  const status = params.get("status") || params.get("collection_status") || "pending";
  const approved = status === "approved";
  const rejected = status === "rejected" || status === "cancelled";
  useEffect(() => { if (approved) clear(); }, [approved, clear]);
  const Icon = approved ? CheckCircle2 : rejected ? XCircle : Clock3;
  return <div className="flex min-h-[65vh] flex-col items-center justify-center px-4 text-center"><span className={`rounded-full p-5 ${approved ? "bg-emerald-100 text-emerald-600" : rejected ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-600"}`}><Icon size={42} /></span><h1 className="mt-6 text-3xl font-black">{approved ? "¡Gracias por tu compra!" : rejected ? "El pago no se completó" : "Pago pendiente"}</h1><p className="mt-3 max-w-md text-sm text-brand-ink/60">{approved ? "Recibimos tu pedido y comenzamos a procesarlo." : rejected ? "Podés volver a la tienda e intentar nuevamente." : "MercadoPago todavía está procesando el pago. No cierres si querés revisar el estado."}</p><Link href="/tienda" className="mt-8 rounded-xl bg-brand-red px-5 py-3 text-sm font-bold text-white">Volver a la tienda</Link></div>;
}

export default function TiendaResultadoPage() {
  return <Suspense fallback={<div className="flex min-h-[65vh] items-center justify-center text-sm text-brand-ink/60">Cargando estado del pago...</div>}><ResultadoContenido /></Suspense>;
}
