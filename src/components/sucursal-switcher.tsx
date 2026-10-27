"use client";

// El logo de Almack es también el selector de local.
//
// El panel arranca en la sucursal elegida al iniciar sesión. El administrador
// puede pasar a la vista consolidada o elegir otro local desde este menú.
//
// Solo el superadmin puede cambiar de local o administrarlos (ver esSuperAdmin
// en src/lib/permisos.ts). Para el resto del equipo el logo es solo el logo.

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Loader2, Pencil, Plus, Store, Trash2, X } from "lucide-react";
import type { Sucursal } from "@/db/schema";
import {
  archivarSucursal,
  crearSucursal,
  renombrarSucursal,
  seleccionarSucursal,
} from "@/app/actions";

type Props = {
  sucursales: Sucursal[];
  activaId: number | null;
  /** Solo el superadmin ve el menú; el resto ve el logo quieto. */
  puedeAdministrar: boolean;
  /** `compacto` es la barra superior de mobile: logo chico y sin subtítulo. */
  compacto?: boolean;
};

export function SucursalSwitcher({ sucursales, activaId, puedeAdministrar, compacto }: Props) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [editando, setEditando] = useState<number | null>(null);
  const [agregando, setAgregando] = useState(false);
  const [error, setError] = useState("");
  const [pendiente, startTransition] = useTransition();
  const caja = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [posicion, setPosicion] = useState({ left: 0, top: 0, maxHeight: 0 });

  const activa = sucursales.find((s) => s.id === activaId) ?? null;
  const etiqueta = activa ? activa.nombre : "Todas las sucursales";
  const direccionActiva = activa?.direccion?.trim() ?? "";

  // Clic afuera o Escape cierran el menú.
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node) && !menu.current?.contains(e.target as Node)) cerrar();
    };
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && cerrar();
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierto]);

  useLayoutEffect(() => {
    if (!abierto) return;
    const ubicar = () => {
      const rect = caja.current?.getBoundingClientRect();
      if (!rect) return;
      setPosicion({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - Math.min(320, window.innerWidth - 16) - 8)),
        top: Math.min(rect.bottom + 8, window.innerHeight - 80),
        maxHeight: Math.max(80, window.innerHeight - rect.bottom - 24),
      });
    };
    ubicar();
    window.addEventListener("resize", ubicar);
    window.addEventListener("scroll", ubicar, true);
    return () => {
      window.removeEventListener("resize", ubicar);
      window.removeEventListener("scroll", ubicar, true);
    };
  }, [abierto]);

  function cerrar() {
    setAbierto(false);
    setEditando(null);
    setAgregando(false);
    setError("");
  }

  // Toda acción del menú termina igual: si falló se muestra el motivo, y si
  // salió bien se refresca para que el panel se vuelva a leer con el local nuevo.
  function correr(accion: () => Promise<{ ok: boolean; error?: string }>, alTerminar?: () => void) {
    setError("");
    startTransition(async () => {
      const r = await accion();
      if (!r.ok) return setError(r.error ?? "No se pudo completar la acción.");
      alTerminar?.();
      router.refresh();
    });
  }

  const marca = (
    <>
      <Image
        src="/brand/logo-almack-horizontal.png"
        alt="Almack"
        width={720}
        height={360}
        priority
        className={compacto ? "h-6 w-auto rounded-md" : "h-auto w-40 rounded-xl ring-1 ring-white/10"}
      />
      {!compacto && <p className="mt-3 text-xs font-semibold tracking-wide text-lime">Almack</p>}
    </>
  );

  if (!puedeAdministrar) {
    return (
      <div className={compacto ? "flex items-center gap-2" : ""}>
        {marca}
        <div><p className={compacto ? "text-sm font-semibold text-lime" : "text-[11px] text-slate-400"}>{etiqueta}</p>{direccionActiva && <p className="max-w-52 truncate text-[11px] text-slate-400" title={direccionActiva}>{direccionActiva}</p>}</div>
      </div>
    );
  }

  return (
    <div className={`relative ${compacto ? "flex items-center gap-2" : ""}`} ref={caja}>
      <button
        onClick={() => (abierto ? cerrar() : setAbierto(true))}
        aria-expanded={abierto}
        aria-haspopup="menu"
        title="Cambiar de sucursal"
        className={
          compacto
            ? "flex items-center gap-2 rounded-lg px-1 py-0.5 transition hover:bg-white/10"
            : "block w-full rounded-xl px-1 py-1 text-left transition hover:bg-white/5"
        }
      >
        {marca}
        <span
          className={
            compacto
              ? "flex items-center gap-1 text-sm font-semibold text-lime"
              : "mt-0.5 flex items-center gap-1 text-[11px] text-slate-400"
          }
        >
          <span className="max-w-[9rem] truncate">{compacto ? activa?.nombre ?? "Todas" : etiqueta}</span>
          <ChevronDown className={`h-3 w-3 shrink-0 transition ${abierto ? "rotate-180" : ""}`} />
        </span>
        {direccionActiva && <span className="block max-w-[13rem] truncate text-[11px] text-slate-400" title={direccionActiva}>{direccionActiva}</span>}
      </button>

      {abierto && createPortal(
        <div
          ref={menu}
          role="menu"
          style={{ left: posicion.left, top: posicion.top, maxHeight: posicion.maxHeight }}
          className="fixed z-[100] w-72 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1.5 text-slate-700 shadow-xl"
        >
          <p className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Sucursal
          </p>

          <Fila
            activo={activaId === null}
            icono={<Store className="h-4 w-4 shrink-0 text-slate-400" />}
            titulo="Todas las sucursales"
            ayuda="Stock y métricas de todos los locales juntos"
            onClick={() => correr(() => seleccionarSucursal(null), cerrar)}
          />

          <div className="my-1 border-t border-slate-100" />

          {sucursales.map((s) =>
            editando === s.id ? (
              <FormNombre
                key={s.id}
                inicial={s.nombre}
                direccionInicial={s.direccion}
                pendiente={pendiente}
                onCancelar={() => setEditando(null)}
                onGuardar={(nombre, direccion) =>
                  correr(() => renombrarSucursal(s.id, nombre, direccion), () => setEditando(null))
                }
                extra={
                  sucursales.length > 1 && (
                    <button
                      type="button"
                      title="Dar de baja la sucursal"
                      className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                      onClick={() => {
                        if (!confirm(`¿Dar de baja "${s.nombre}"? Tiene que estar sin mercadería.`)) return;
                        correr(() => archivarSucursal(s.id), () => setEditando(null));
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )
                }
              />
            ) : (
              <Fila
                key={s.id}
                activo={activaId === s.id}
                icono={<Store className="h-4 w-4 shrink-0 text-slate-400" />}
                titulo={s.nombre}
                ayuda={s.direccion || undefined}
                onClick={() => correr(() => seleccionarSucursal(s.id), cerrar)}
                accion={
                  <button
                    type="button"
                    title="Editar nombre y dirección"
                    className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                    onClick={(e) => {
                      e.stopPropagation();
                      setError("");
                      setAgregando(false);
                      setEditando(s.id);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                }
              />
            )
          )}

          <div className="my-1 border-t border-slate-100" />

          {agregando ? (
            <FormNombre
              inicial=""
              direccionInicial=""
              placeholder="Nombre de la sucursal"
              pendiente={pendiente}
              onCancelar={() => setAgregando(false)}
              onGuardar={(nombre, direccion) => correr(() => crearSucursal(nombre, direccion), () => setAgregando(false))}
            />
          ) : (
            <button
              className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              onClick={() => {
                setError("");
                setEditando(null);
                setAgregando(true);
              }}
            >
              <Plus className="h-4 w-4 shrink-0" /> Agregar sucursal
            </button>
          )}

          {error && <p className="px-2.5 py-1.5 text-xs text-rose-600">{error}</p>}
          {pendiente && (
            <p className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-400">
              <Loader2 className="h-3 w-3 animate-spin" /> Guardando…
            </p>
          )}
        </div>, document.body
      )}
    </div>
  );
}

function Fila({
  activo,
  icono,
  titulo,
  ayuda,
  onClick,
  accion,
}: {
  activo: boolean;
  icono: React.ReactNode;
  titulo: string;
  ayuda?: string;
  onClick: () => void;
  accion?: React.ReactNode;
}) {
  return (
    <div
      className={`group flex items-center gap-2 rounded-xl px-2.5 py-2 transition ${
        activo ? "bg-lime/20" : "hover:bg-slate-50"
      }`}
    >
      <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={onClick}>
        {icono}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{titulo}</span>
          {ayuda && <span className="block truncate text-[11px] text-slate-400">{ayuda}</span>}
        </span>
        {activo && <Check className="h-4 w-4 shrink-0 text-navy" />}
      </button>
      {accion}
    </div>
  );
}

// Input inline que sirve tanto para crear como para renombrar.
function FormNombre({
  inicial,
  direccionInicial,
  placeholder = "Nombre",
  pendiente,
  onGuardar,
  onCancelar,
  extra,
}: {
  inicial: string;
  direccionInicial: string;
  placeholder?: string;
  pendiente: boolean;
  onGuardar: (nombre: string, direccion: string) => void;
  onCancelar: () => void;
  extra?: React.ReactNode;
}) {
  const [valor, setValor] = useState(inicial);
  const [direccion, setDireccion] = useState(direccionInicial);

  return (
    <div className="space-y-2 px-1.5 py-1">
      <input
        autoFocus
        className="input min-w-0 w-full py-1.5 text-sm"
        value={valor}
        placeholder={placeholder}
        disabled={pendiente}
        onChange={(e) => setValor(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onGuardar(valor, direccion);
          }
          if (e.key === "Escape") onCancelar();
        }}
      />
      <input
        className="input min-w-0 w-full py-1.5 text-sm"
        value={direccion}
        placeholder="Calle y altura, por ejemplo San Martín 123"
        aria-label="Dirección de la sucursal"
        maxLength={200}
        disabled={pendiente}
        onChange={(e) => setDireccion(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onGuardar(valor, direccion); } if (e.key === "Escape") onCancelar(); }}
      />
      <div className="flex items-center justify-end gap-1">
        {extra}
        <button
          type="button"
          title="Guardar"
          className="rounded-lg p-1.5 text-emerald-600 transition hover:bg-emerald-50"
          disabled={pendiente}
          onClick={() => onGuardar(valor, direccion)}
        >
          <Check className="h-4 w-4" />
        </button>
        <button
          type="button"
          title="Cancelar"
          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100"
          onClick={onCancelar}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
