"use client";

import { useState } from "react";
import type { Cliente } from "@/db/schema";
import { FilterableTable, Col } from "@/components/filterable-table";
import { crearCliente } from "@/app/actions";

export function ClientesManager({ items }: { items: Cliente[] }) {
  const [open, setOpen] = useState(false);

  const cols: Col<Cliente>[] = [
    { key: "nombre", head: "Nombre", cell: (c) => <span className="font-medium">{c.nombre}</span>, value: (c) => c.nombre },
    { key: "email", head: "Email", cell: (c) => <span className="text-slate-500">{c.email || "—"}</span> },
    { key: "telefono", head: "Teléfono", cell: (c) => <span className="text-slate-500">{c.telefono || "—"}</span> },
    { key: "cuit", head: "CUIT", cell: (c) => <span className="text-slate-500">{c.cuit || "—"}</span> },
    { key: "direccion", head: "Dirección", cell: (c) => <span className="text-slate-500">{c.direccion || "—"}</span> },
  ];

  return (
    <>
      <div className="mb-4 flex justify-end">
        <button className="btn-primary" onClick={() => setOpen((v) => !v)}>
          {open ? "Cerrar" : "+ Nuevo cliente"}
        </button>
      </div>

      {open && (
        <form action={async (fd) => { await crearCliente(fd); setOpen(false); }} className="card mb-6 grid gap-4 p-5 md:grid-cols-3">
          <div><label className="label">Nombre / Razón social *</label><input name="nombre" className="input" required /></div>
          <div><label className="label">Email</label><input name="email" type="email" className="input" /></div>
          <div><label className="label">Teléfono</label><input name="telefono" className="input" /></div>
          <div><label className="label">CUIT</label><input name="cuit" className="input" /></div>
          <div className="md:col-span-2"><label className="label">Dirección</label><input name="direccion" className="input" /></div>
          <div className="md:col-span-3"><button className="btn-primary">Guardar</button></div>
        </form>
      )}

      <FilterableTable
        rows={items}
        cols={cols}
        rowKey={(c) => c.id}
        search={(c) => `${c.nombre} ${c.email} ${c.telefono} ${c.cuit} ${c.direccion}`}
        searchPlaceholder="Buscar cliente por nombre, email, CUIT…"
        mobileCard={(c) => (
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{c.nombre}</p>
            <p className="mt-0.5 truncate text-xs text-slate-500">{c.email || "sin email"}</p>
            <p className="mt-0.5 text-xs text-slate-400">
              {c.telefono || "sin teléfono"}
              {c.cuit ? ` · CUIT ${c.cuit}` : ""}
            </p>
          </div>
        )}
      />
    </>
  );
}
