"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { guardarClaveAdministrador } from "@/app/admin/(protected)/equipo/actions";
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
  })}><div><label className="label" htmlFor="clave-admin">Nueva clave</label><input id="clave-admin" type="password" name="clave" autoComplete="new-password" required minLength={6} maxLength={64} className="input" placeholder="Mínimo 6 caracteres" /></div><div><label className="label" htmlFor="confirmacion-admin">Confirmar clave</label><input id="confirmacion-admin" type="password" name="confirmacion" autoComplete="new-password" required minLength={6} maxLength={64} className="input" /></div><button disabled={pendiente} className="btn-primary justify-center">{pendiente ? "Guardando…" : "Guardar clave"}</button></form>{mensaje && <p role="status" className={`mt-3 text-sm ${error ? "text-rose-600" : "text-emerald-600"}`}>{mensaje}</p>}</section>;
}
