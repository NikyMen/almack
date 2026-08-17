export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatCard({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className={`card p-5 ${accent ? "border-transparent bg-navy text-white" : ""}`}>
      <p className={`text-xs font-medium ${accent ? "text-lime" : "text-slate-500"}`}>{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
      {hint && <p className={`mt-1 text-xs ${accent ? "text-slate-400" : "text-slate-400"}`}>{hint}</p>}
    </div>
  );
}

const estilos: Record<string, string> = {
  completada: "bg-emerald-50 text-emerald-700",
  pagada: "bg-emerald-50 text-emerald-700",
  recibida: "bg-emerald-50 text-emerald-700",
  verificado: "bg-emerald-50 text-emerald-700",
  pendiente: "bg-amber-50 text-amber-700",
  pedido: "bg-amber-50 text-amber-700",
  falta_controlar: "bg-blue-50 text-blue-700",
  emitida: "bg-blue-50 text-blue-700",
  cancelada: "bg-rose-50 text-rose-700",
  anulada: "bg-rose-50 text-rose-700",
  online: "bg-violet-50 text-violet-700",
  local: "bg-slate-100 text-slate-600",
};

// Slugs de la DB que se muestran distinto a como se guardan.
const etiquetas: Record<string, string> = {
  falta_controlar: "Falta controlar",
  pedido: "Pedido",
  verificado: "Verificado",
};

export function Estado({ value }: { value: string }) {
  return (
    <span className={`badge ${estilos[value] ?? "bg-slate-100 text-slate-600"}`}>
      {etiquetas[value] ?? value}
    </span>
  );
}

export function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-4 py-3 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}
