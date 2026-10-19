"use client";
import { Overlay } from "@/components/overlay";

import { useState, useMemo, ReactNode } from "react";
import { ArrowUpDown, Filter, Search, X, SlidersHorizontal, ChevronRight } from "lucide-react";

export type Col<T> = {
  key: string;
  head: string;
  /** valor para mostrar */
  cell: (row: T) => ReactNode;
  /** valor para ordenar/filtrar (número o string) */
  value?: (row: T) => string | number;
  /** activa filtro por valores únicos (estado, canal…) */
  filter?: boolean;
  /** activa orden asc/desc (fecha, total…) */
  sort?: boolean;
  className?: string;
  width?: number;
};

type SortOption<T> = { key: string; label: string; direction: "asc" | "desc"; compare?: (a: T, b: T) => number };

export function FilterableTable<T>({
  rows,
  cols,
  rowKey,
  search,
  searchPlaceholder = "Buscar…",
  rowClassName,
  mobileCard,
  onRowClick,
  compact = false,
  sortOptions,
  groupBy,
  groupHeader,
  showResultCount = true,
}: {
  rows: T[];
  cols: Col<T>[];
  rowKey: (row: T) => string | number;
  /** función que devuelve el texto buscable de una fila */
  search?: (row: T) => string;
  searchPlaceholder?: string;
  /** clases extra por fila (p. ej. para atenuar filas ocultas) */
  rowClassName?: (row: T) => string;
  /**
   * Render alternativo para pantallas chicas: en vez de la tabla se muestra una
   * lista de tarjetas. Una tabla de 7 columnas es ilegible en un celular.
   */
  mobileCard?: (row: T) => ReactNode;
  onRowClick?: (row: T) => void;
  compact?: boolean;
  sortOptions?: SortOption<T>[];
  groupBy?: (row: T) => string;
  groupHeader?: (key: string, rows: T[]) => ReactNode;
  showResultCount?: boolean;
}) {
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<Record<string, Set<string>>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [panelMovil, setPanelMovil] = useState(false);

  const valOf = (c: Col<T>, r: T) => (c.value ? c.value(r) : String(c.cell(r) ?? ""));

  const opciones = useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const c of cols)
      if (c.filter) m[c.key] = [...new Set(rows.map((r) => String(valOf(c, r))))].sort();
    return m;
  }, [rows, cols]);

  const filtered = useMemo(() => {
    let out = rows;
    if (q && search) {
      const t = q.toLowerCase();
      out = out.filter((r) => search(r).toLowerCase().includes(t));
    }
    for (const c of cols) {
      const sel = filters[c.key];
      if (sel && sel.size) out = out.filter((r) => sel.has(String(valOf(c, r))));
    }
    if (sortKey) {
      const c = cols.find((x) => x.key === sortKey);
      const custom = sortOptions?.find(o => o.key === sortKey)?.compare;
      if (c || custom) {
        out = [...out].sort((a, b) => {
          const va = c ? valOf(c, a) : 0, vb = c ? valOf(c, b) : 0;
          const cmp = custom ? custom(a, b) : typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
          return sortDir === "asc" ? cmp : -cmp;
        });
      }
    }
    return out;
  }, [rows, q, filters, sortKey, sortDir, cols, search, sortOptions]);

  const groups = useMemo(() => {
    if (!groupBy) return null;
    const result = new Map<string, T[]>();
    for (const row of filtered) {
      const key = groupBy(row);
      const group = result.get(key) ?? [];
      group.push(row);
      result.set(key, group);
    }
    return [...result.entries()];
  }, [filtered, groupBy]);

  function toggleFiltro(key: string, val: string) {
    setFilters((f) => {
      const s = new Set(f[key] ?? []);
      if (s.has(val)) s.delete(val);
      else s.add(val);
      return { ...f, [key]: s };
    });
  }

  function limpiar() {
    setFilters({});
    setSortKey(null);
    setQ("");
  }

  const activos = Object.values(filters).reduce((a, s) => a + s.size, 0);
  const hayAjustes = activos > 0 || Boolean(sortKey) || Boolean(q);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {search && (
          <div className="relative min-w-[180px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="input pl-9"
              placeholder={searchPlaceholder}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        )}

        {sortOptions && <label className="flex items-center gap-2 text-xs text-slate-500">
          Ordenar
          <select className="input w-auto max-w-full" value={sortKey ? `${sortKey}:${sortDir}` : ""} onChange={e => {
            const opcion = sortOptions.find(o => `${o.key}:${o.direction}` === e.target.value);
            setSortKey(opcion?.key ?? null); setSortDir(opcion?.direction ?? "desc");
          }}>
            <option value="">Sin ordenar</option>
            {sortOptions.map(o => <option key={`${o.key}:${o.direction}`} value={`${o.key}:${o.direction}`}>{o.label}</option>)}
          </select>
        </label>}

        {/* En mobile los filtros de las cabeceras no existen: van a una hoja */}
        {mobileCard && (cols.some((c) => c.filter || c.sort)) && (
          <button className="btn-ghost shrink-0 xl:hidden" onClick={() => setPanelMovil(true)}>
            <SlidersHorizontal className="h-4 w-4" />
            {activos > 0 && <span className="rounded-full bg-navy px-1.5 text-[10px] text-white">{activos}</span>}
          </button>
        )}

        {hayAjustes && (
          <button className="btn-ghost shrink-0 text-xs" onClick={limpiar}>
            <X className="h-3.5 w-3.5" /> Limpiar
          </button>
        )}
        {showResultCount && <span className="ml-auto text-xs text-slate-400">{filtered.length} resultado(s)</span>}
      </div>

      {/* Lista de tarjetas (mobile) */}
      {mobileCard && (
        <div className="grid gap-3 sm:grid-cols-2 xl:hidden">
          {(groups ?? [["", filtered] as [string, T[]]]).flatMap(([key, rows]) => [
            ...(groups && groupHeader ? [<div key={`group-${key}`} className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm font-semibold text-navy sm:col-span-2">{groupHeader(key, rows)}</div>] : []),
            ...rows.map((r) => {
            const contenido = <div className="min-w-0 flex-1">{mobileCard(r)}</div>;
            return onRowClick ? (
              <button
                key={rowKey(r)}
                onClick={() => onRowClick(r)}
                className={`card flex w-full min-w-0 items-center gap-2 p-4 text-left transition active:bg-slate-50 ${rowClassName?.(r) ?? ""}`}
              >
                {contenido}
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
              </button>
            ) : (
              <div key={rowKey(r)} className={`card min-w-0 p-4 ${rowClassName?.(r) ?? ""}`}>
                {mobileCard(r)}
              </div>
            );
            }),
          ])}
          {filtered.length === 0 && <p className="px-4 py-8 text-center text-sm text-slate-400">Sin resultados</p>}
        </div>
      )}

      {/* Tabla (escritorio, y también mobile si no hay render de tarjeta) */}
      <div className={`card overflow-x-auto ${mobileCard ? "hidden xl:block" : ""}`}>
        <table className={`w-full ${compact ? "table-fixed text-xs" : "text-sm"}`}>
          {compact && <colgroup>{cols.map(c => <col key={c.key} style={c.width ? { width: `${c.width}%` } : undefined} />)}</colgroup>}
          <thead className="border-b border-slate-200 bg-slate-50/80 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              {cols.map((c) => {
                const sel = filters[c.key];
                const active = (sel && sel.size > 0) || sortKey === c.key;
                return (
                  <th key={c.key} className={`relative py-3 font-medium ${compact ? "break-words px-2" : "px-4"}`}>
                    {c.filter || c.sort ? (
                      <button
                        className={`flex items-center gap-1 hover:text-navy ${active ? "text-navy" : ""}`}
                        onClick={() => {
                          if (c.sort && !c.filter) {
                            setSortKey(c.key);
                            setSortDir((d) => (sortKey === c.key && d === "desc" ? "asc" : "desc"));
                          } else {
                            setOpen((o) => (o === c.key ? null : c.key));
                          }
                        }}
                      >
                        <span className={compact ? "min-w-0 break-words" : undefined}>{c.head}</span>
                        {c.filter ? <Filter className="h-3 w-3 shrink-0" /> : <ArrowUpDown className="h-3 w-3 shrink-0" />}
                        {sel && sel.size > 0 && <span className="rounded-full bg-navy px-1.5 text-[9px] text-white">{sel.size}</span>}
                      </button>
                    ) : (
                      c.head
                    )}

                    {open === c.key && c.filter && (
                      <div className="absolute left-0 top-full z-20 mt-1 w-44 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
                        {c.sort && (
                          <div className="mb-1 flex gap-1 border-b border-slate-100 pb-1">
                            <button className="btn-ghost flex-1 py-1 text-[11px]" onClick={() => { setSortKey(c.key); setSortDir("asc"); setOpen(null); }}>↑ Asc</button>
                            <button className="btn-ghost flex-1 py-1 text-[11px]" onClick={() => { setSortKey(c.key); setSortDir("desc"); setOpen(null); }}>↓ Desc</button>
                          </div>
                        )}
                        <div className="max-h-52 overflow-auto">
                          {opciones[c.key]?.map((o) => (
                            <label key={o} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs normal-case text-slate-600 hover:bg-slate-50">
                              <input type="checkbox" checked={sel?.has(o) ?? false} onChange={() => toggleFiltro(c.key, o)} />
                              {o}
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(groups ?? [["", filtered] as [string, T[]]]).flatMap(([key, rows]) => [
              ...(groups && groupHeader ? [<tr key={`group-${key}`}><th colSpan={cols.length} scope="rowgroup" className="bg-slate-100 px-4 py-3 text-left text-sm font-semibold text-navy">{groupHeader(key, rows)}</th></tr>] : []),
              ...rows.map((r) => (
              <tr
                key={rowKey(r)}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
                onKeyDown={onRowClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onRowClick(r); } } : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                className={`hover:bg-slate-50 ${onRowClick ? "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-lime" : ""} ${rowClassName?.(r) ?? ""}`}
              >
                {cols.map((c) => (
                  <td key={c.key} className={`py-3 ${compact ? "break-words px-2 [overflow-wrap:anywhere]" : "px-4"} ${c.className ?? ""}`}>{c.cell(r)}</td>
                ))}
              </tr>
              )),
            ])}
            {filtered.length === 0 && (
              <tr><td colSpan={cols.length} className="px-4 py-8 text-center text-slate-400">Sin resultados</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Hoja de filtros y orden en mobile */}
      {panelMovil && (
        <Overlay className="overlay xl:hidden" onClick={() => setPanelMovil(false)}>
          <div className="sheet p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold">Filtrar y ordenar</h3>
              <button className="btn-ghost px-2 py-1.5" onClick={() => setPanelMovil(false)} aria-label="Cerrar">
                <X className="h-4 w-4" />
              </button>
            </div>

            {cols.filter((c) => c.sort).length > 0 && (
              <div className="mb-5">
                <p className="label">Ordenar por</p>
                <div className="flex flex-wrap gap-2">
                  {cols.filter((c) => c.sort).map((c) => {
                    const activo = sortKey === c.key;
                    return (
                      <button
                        key={c.key}
                        onClick={() => {
                          setSortKey(c.key);
                          setSortDir((d) => (activo && d === "desc" ? "asc" : "desc"));
                        }}
                        className={`badge border px-3 py-1.5 ${activo ? "border-lime bg-lime/15 text-navy" : "border-slate-200 text-slate-600"}`}
                      >
                        {c.head} {activo && (sortDir === "asc" ? "↑" : "↓")}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {cols.filter((c) => c.filter).map((c) => (
              <div key={c.key} className="mb-5">
                <p className="label">{c.head}</p>
                <div className="flex flex-wrap gap-2">
                  {opciones[c.key]?.map((o) => {
                    const activo = filters[c.key]?.has(o) ?? false;
                    return (
                      <button
                        key={o}
                        onClick={() => toggleFiltro(c.key, o)}
                        className={`badge border px-3 py-1.5 ${activo ? "border-lime bg-lime/15 text-navy" : "border-slate-200 text-slate-600"}`}
                      >
                        {o}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            <div className="flex gap-2 pt-1">
              <button className="btn-primary flex-1 justify-center" onClick={() => setPanelMovil(false)}>
                Ver {filtered.length} resultado(s)
              </button>
              {hayAjustes && (
                <button className="btn-ghost" onClick={limpiar}>
                  Limpiar
                </button>
              )}
            </div>
          </div>
        </Overlay>
      )}
    </div>
  );
}
