"use client";
import { Overlay } from "@/components/overlay";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { operarCaja } from "@/app/caja-actions";
import { createClientId } from "@/lib/client-id";
import { money } from "@/lib/format";
export function ExtraccionCaja({ turnoId, disponible }: { turnoId: number | null; disponible: number }) {
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState("");
  const [pendiente, iniciar] = useTransition();
  const solicitud = useRef("");
  const router = useRouter();
  return <><button className="btn-ghost border border-slate-200" onClick={() => { solicitud.current = createClientId(); setError(""); setAbierto(true); }}>Extracción</button>{abierto && <Overlay className="overlay"><div className="sheet p-4 sm:p-5" role="dialog" aria-modal="true" aria-labelledby="titulo-extraccion"><h3 id="titulo-extraccion" className="text-lg font-semibold">Extracción</h3><p className="mt-2 text-sm text-slate-500">Efectivo disponible: <strong className="text-navy">{money(disponible)}</strong>. Se requiere la clave de administrador.</p>{!turnoId ? <p className="mt-4 text-sm text-rose-600">Todavía no hay efectivo registrado. Abrí la caja antes de realizar la primera extracción.</p> : <form className="mt-4 space-y-3 sm:space-y-4" action={fd => iniciar(async () => {
    setError("");
    try {
      const r = await operarCaja({ operacion: "extraccion", turnoId, monto: Number(fd.get("monto")), motivo: String(fd.get("motivo") ?? ""), clave: String(fd.get("clave") ?? ""), solicitudId: solicitud.current });
      if (!r.ok) { setError(r.error); return; }
      setAbierto(false); router.refresh();
    } catch { setError("No se pudo confirmar la extracción. Reintentá sin cambiar los datos."); }
  })}><div><label htmlFor="extraccion-monto" className="label">Monto a retirar</label><input id="extraccion-monto" name="monto" type="number" min="0.01" max={disponible} step="0.01" required className="input" /></div><div><label htmlFor="extraccion-motivo" className="label">Motivo</label><input id="extraccion-motivo" name="motivo" required maxLength={500} className="input" /></div><div><label htmlFor="extraccion-clave" className="label">Clave de administrador</label><input id="extraccion-clave" name="clave" type="password" required maxLength={64} autoComplete="off" className="input" /></div>{error && <p role="alert" className="text-sm text-rose-600">{error}</p>}<button disabled={pendiente} className="btn-primary w-full justify-center">{pendiente ? "Confirmando…" : "Confirmar extracción"}</button></form>}<button disabled={pendiente} className="btn-ghost mt-3 w-full justify-center" onClick={() => setAbierto(false)}>Cancelar</button></div></Overlay>}</>;
}

