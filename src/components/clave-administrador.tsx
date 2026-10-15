"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { guardarClaveAdministrador, guardarClavePrecio } from "@/app/admin/(protected)/equipo/actions";
export function ClaveAdministrador({ configurada }: { configurada: boolean }) {
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();
  return <section className="card mb-6 p-5"><h2 className="text-lg font-semibold">Clave de administrador</h2><p className="mt-1 text-sm text-slate-500">Autoriza las extracciones de efectivo con la caja abierta o cerrada. Solo los administradores pueden configurarla.</p><p className="mt-2 text-xs font-medium">{configurada ? "Clave configurada. Podés reemplazarla a continuación." : "Todavía no hay una clave configurada."}</p><form className="mt-4 grid items-end gap-4 md:grid-cols-3" action={fd => iniciar(async () => {
    setMensaje("");
    const resultado = await guardarClaveAdministrador(String(fd.get("clave") ?? ""), String(fd.get("confirmacion") ?? ""));
    setError(!resultado.ok); setMensaje(resultado.ok ? "Clave de administrador guardada." : resultado.error);
    if (resultado.ok) { router.refresh(); }
  })}><div><label className="label" htmlFor="clave-admin">Nueva clave</label><input id="clave-admin" type="password" name="clave" autoComplete="new-password" required minLength={4} maxLength={64} className="input" placeholder="Mínimo 4 caracteres" /></div><div><label className="label" htmlFor="confirmacion-admin">Confirmar clave</label><input id="confirmacion-admin" type="password" name="confirmacion" autoComplete="new-password" required minLength={4} maxLength={64} className="input" /></div><button disabled={pendiente} className="btn-primary justify-center">{pendiente ? "Guardando…" : "Guardar clave"}</button></form>{mensaje && <p role="status" className={`mt-3 text-sm ${error ? "text-rose-600" : "text-emerald-600"}`}>{mensaje}</p>}</section>;
}

export function ClavePrecio({ configurada }: { configurada: boolean }) {
  const [mensaje, setMensaje] = useState("");
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();
  return <section className="card mb-6 p-5"><h2 className="text-lg font-semibold">Contraseña para cambios de precio</h2><p className="mt-1 text-sm text-slate-500">Autorizá ajustes de productos o promociones desde Caja. Solo un administrador puede configurar esta contraseña numérica.</p><p className="mt-2 text-xs font-medium">{configurada ? "Contraseña configurada. Podés reemplazarla." : "Todavía no hay una contraseña configurada."}</p><form className="mt-4 grid items-end gap-4 md:grid-cols-3" action={fd => iniciar(async () => {
    const r = await guardarClavePrecio(String(fd.get("clave") ?? ""), String(fd.get("confirmacion") ?? ""));
    setMensaje(r.ok ? "Contraseña guardada." : r.error);
    if (r.ok) router.refresh();
  })}><div><label className="label" htmlFor="clave-precio">Nueva contraseña numérica</label><input id="clave-precio" type="password" inputMode="numeric" pattern="[0-9]{3,12}" name="clave" autoComplete="new-password" required className="input" placeholder="3 a 12 dígitos" /></div><div><label className="label" htmlFor="confirmacion-precio">Confirmar contraseña</label><input id="confirmacion-precio" type="password" inputMode="numeric" pattern="[0-9]{3,12}" name="confirmacion" autoComplete="new-password" required className="input" /></div><button disabled={pendiente} className="btn-primary justify-center">{pendiente ? "Guardando…" : "Guardar contraseña"}</button></form>{mensaje && <p role="status" className="mt-3 text-sm text-slate-600">{mensaje}</p>}</section>;
}
