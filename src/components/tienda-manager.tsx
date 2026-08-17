"use client";

import { useState, useTransition } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import type { Producto } from "@/db/schema";
import { money } from "@/lib/format";
import { togglePublicado, guardarDescripcionWeb, accionPublicacion } from "@/app/actions";

const redes = ["instagram", "facebook", "tiktok", "whatsapp"] as const;

export function TiendaManager({ items }: { items: Producto[] }) {
  const publicados = items.filter((p) => p.publicado);
  const [, startTransition] = useTransition();

  return (
    <>
      <div className="card mb-6 flex items-center gap-3 border-emerald-200 bg-emerald-50 p-4">
        <span className="relative flex h-3 w-3">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
        </span>
        <p className="text-sm font-medium text-emerald-800">
          Sincronización activa · {publicados.length} de {items.length} productos publicados
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {items.map((p) => (
          <ProductoCard key={p.id} p={p} onToggle={() => startTransition(() => togglePublicado(p.id))} />
        ))}
      </div>
    </>
  );
}

function ProductoCard({ p, onToggle }: { p: Producto; onToggle: () => void }) {
  const [desc, setDesc] = useState(p.descripcionWeb || p.descripcion || "");
  const [pub, setPub] = useState("");
  const [pubErr, setPubErr] = useState("");
  const [red, setRed] = useState<(typeof redes)[number]>("instagram");
  const [loading, setLoading] = useState("");
  const [, startTransition] = useTransition();

  return (
    <div className="card flex flex-col p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-semibold">{p.nombre}</p>
          <p className="text-xs text-slate-400">{p.categoria} · {money(p.precioVenta)}</p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs">
          <input type="checkbox" checked={p.publicado} onChange={onToggle} className="h-4 w-4 accent-brand-600" />
          {p.publicado ? "Publicado" : "Oculto"}
        </label>
      </div>

      <p className="mt-1 text-xs text-slate-400">Stock sincronizado: <b className="text-slate-600">{p.stock}</b></p>

      <textarea
        rows={3}
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        placeholder="Descripción para la web…"
        className="input mt-3 text-xs"
      />
      <button
        className="btn-ghost mt-2 px-3 py-1 text-xs"
        onClick={() => startTransition(() => guardarDescripcionWeb(p.id, desc))}
      >
        Guardar descripción web
      </button>

      <div className="mt-3 border-t border-slate-100 pt-3">
        <p className="label">Generar publicación para redes</p>
        <div className="flex flex-wrap gap-2">
          <select value={red} onChange={(e) => setRed(e.target.value as (typeof redes)[number])} className="input flex-1 py-1 text-xs">
            {redes.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <button
            className="btn-primary px-3 py-1 text-xs"
            disabled={loading === "pub"}
            onClick={async () => {
              setLoading("pub");
              const r = await accionPublicacion(p.nombre, red, p.descripcion || "");
              setLoading("");
              setPub(r.ok ? r.texto : "");
              setPubErr(r.ok ? "" : r.error);
            }}
          >
            {loading === "pub" ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generando…</>
            ) : (
              <><Sparkles className="h-3.5 w-3.5" /> Generar</>
            )}
          </button>
        </div>
        {pubErr && <p className="mt-2 text-xs text-rose-600">{pubErr}</p>}
        {pub && (
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-2 text-xs text-slate-700">{pub}</pre>
        )}
      </div>
    </div>
  );
}
