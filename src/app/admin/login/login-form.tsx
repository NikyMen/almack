"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { login } from "./actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary mt-2 w-full">
      {pending ? "Ingresando…" : "Ingresar"}
    </button>
  );
}

export function LoginForm({ sucursales }: { sucursales: { id: number; nombre: string }[] }) {
  const [state, action] = useActionState(login, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-300">Usuario</label>
        <input
          name="usuario"
          autoComplete="username"
          required
          placeholder="Tu usuario"
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-base text-white outline-none transition placeholder:text-slate-500 focus:border-lime focus:ring-2 focus:ring-lime/30 sm:py-2 sm:text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-300">Contraseña</label>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="••••••••"
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-base text-white outline-none transition placeholder:text-slate-500 focus:border-lime focus:ring-2 focus:ring-lime/30 sm:py-2 sm:text-sm"
        />
      </div>

      <div>
        <label htmlFor="sucursalId" className="mb-1 block text-xs font-medium text-slate-300">Sucursal donde ingresás</label>
        <select id="sucursalId" name="sucursalId" required defaultValue="" className="w-full rounded-xl border border-white/10 bg-navy px-3 py-2.5 text-base text-white outline-none focus:border-lime focus:ring-2 focus:ring-lime/30 sm:py-2 sm:text-sm">
          <option value="" disabled>Elegí una sucursal</option>
          {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
      </div>

      {state?.error && <p className="text-sm text-rose-400">{state.error}</p>}

      <Submit />
    </form>
  );
}
