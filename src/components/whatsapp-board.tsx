"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  MessageCircle,
  QrCode,
  Loader2,
  Plug,
  PlugZap,
  X,
  Send,
  Plus,
  GripVertical,
  Trash2,
  Phone,
  Settings2,
  RefreshCw,
  Trophy,
  Save,
} from "lucide-react";
import { money } from "@/lib/format";
import type {
  ContactoDTO,
  MensajeDTO,
  WaSnapshot,
  DetalleContacto,
  PresupuestoItemInput,
} from "@/lib/whatsapp/manager";
import {
  iniciarConexion,
  cerrarSesion,
  abrirChat,
  enviarMensaje,
  sincronizarChat,
  sincronizarContactos,
  reordenarColumna,
  reordenarEtapas,
  crearEtapa,
  eliminarEtapa,
  obtenerDetalleContacto,
  actualizarContacto,
  guardarPresupuesto,
  marcarVentaExitosa,
  refrescarAvatar,
} from "@/app/(app)/whatsapp/actions";

export type EtapaDTO = { id: number; nombre: string; color: string; orden: number; esExito: boolean };
type MiembroDTO = { id: number; nombre: string };
type ProductoDTO = { id: number; nombre: string; precioVenta: number };

// --- Paleta por etapa --------------------------------------------------------
const colores: Record<string, { dot: string; chip: string; bar: string }> = {
  blue: { dot: "bg-blue-500", chip: "bg-blue-50 text-blue-700", bar: "bg-blue-500" },
  amber: { dot: "bg-amber-500", chip: "bg-amber-50 text-amber-700", bar: "bg-amber-500" },
  violet: { dot: "bg-violet-500", chip: "bg-violet-50 text-violet-700", bar: "bg-violet-500" },
  emerald: { dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700", bar: "bg-emerald-500" },
  rose: { dot: "bg-rose-500", chip: "bg-rose-50 text-rose-700", bar: "bg-rose-500" },
  slate: { dot: "bg-slate-400", chip: "bg-slate-100 text-slate-600", bar: "bg-slate-400" },
};
const colorDe = (c: string) => colores[c] ?? colores.slate;

function fmtHora(ms: number) {
  const d = new Date(ms);
  const hoy = new Date();
  const mismoDia = d.toDateString() === hoy.toDateString();
  return mismoDia
    ? d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
}

function fmtFecha(ms: number | null) {
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// Formatea el número en grupos legibles: "5493794802188" → "+549 3794 8021 88".
function fmtTelefono(t: string) {
  const d = (t || "").replace(/\D/g, "");
  if (!d) return "—";
  const rest = d.slice(3).replace(/(.{4})/g, "$1 ").trim();
  return `+${d.slice(0, 3)} ${rest}`.trim();
}

function iniciales(nombre: string) {
  const p = nombre.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "·";
}

// --- Avatar (foto o iniciales) ----------------------------------------------
function Avatar({
  nombre,
  avatar,
  className = "h-9 w-9",
  initialsClass = "bg-brand-100 text-brand-700",
  textSize = "text-xs",
}: {
  nombre: string;
  avatar?: string;
  className?: string;
  initialsClass?: string;
  textSize?: string;
}) {
  const [err, setErr] = useState(false);
  const base = `shrink-0 overflow-hidden rounded-full ${className}`;
  if (avatar && !err) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatar} alt={nombre} onError={() => setErr(true)} className={`${base} object-cover`} />;
  }
  return (
    <div className={`${base} flex items-center justify-center font-bold ${initialsClass} ${textSize}`}>
      {iniciales(nombre)}
    </div>
  );
}

// ===========================================================================
export function WhatsappBoard({
  etapas: etapasIniciales,
  contactosIniciales,
  equipo,
  productos,
  snapInicial,
}: {
  etapas: EtapaDTO[];
  contactosIniciales: ContactoDTO[];
  equipo: MiembroDTO[];
  productos: ProductoDTO[];
  snapInicial: WaSnapshot;
}) {
  const [conn, setConn] = useState<WaSnapshot>(snapInicial);
  const [etapas, setEtapas] = useState<EtapaDTO[]>(etapasIniciales);
  const [contactos, setContactos] = useState<ContactoDTO[]>(contactosIniciales);
  const [, startTransition] = useTransition();

  // Chat abierto + panel de configuración
  const [abierto, setAbierto] = useState<number | null>(null);
  const [configAbierta, setConfigAbierta] = useState(false);
  const abiertoRef = useRef<number | null>(null);
  abiertoRef.current = abierto;
  const [mensajes, setMensajes] = useState<MensajeDTO[]>([]);
  const mensajesRef = useRef<MensajeDTO[]>([]);
  mensajesRef.current = mensajes;

  // Fusiona el estado de un contacto que llega del servidor (SSE o polling):
  // si es nuevo lo agrega; si ya existe, sólo refresca los campos de mensajería
  // y la foto (la posición del kanban es local, la maneja el drag). No re-renderiza
  // si nada cambió. Si el chat está abierto, mantiene la card como leída.
  function aplicarContacto(c: ContactoDTO) {
    setContactos((prev) => {
      const i = prev.findIndex((x) => x.id === c.id);
      const noLeidos = abiertoRef.current === c.id ? 0 : c.noLeidos;
      if (i === -1) return [...prev, { ...c, noLeidos }];
      const cur = prev[i];
      const next = {
        ...cur,
        nombre: c.nombre || cur.nombre,
        avatar: c.avatar || cur.avatar,
        ultimoMensaje: c.ultimoMensaje,
        ultimoMensajeEn: c.ultimoMensajeEn,
        noLeidos,
      };
      if (
        cur.nombre === next.nombre &&
        cur.avatar === next.avatar &&
        cur.ultimoMensaje === next.ultimoMensaje &&
        cur.ultimoMensajeEn === next.ultimoMensajeEn &&
        cur.noLeidos === next.noLeidos
      ) {
        return prev; // sin cambios → evita re-render
      }
      const copy = [...prev];
      copy[i] = next;
      return copy;
    });
  }

  // Agrega mensajes nuevos al chat abierto, deduplicando por id (sirve para SSE
  // y para el polling de respaldo).
  function agregarMensajes(nuevos: MensajeDTO[], contactoId: number) {
    if (abiertoRef.current !== contactoId) return;
    setMensajes((prev) => {
      const ids = new Set(prev.map((x) => x.id));
      const add = nuevos.filter((m) => !ids.has(m.id));
      return add.length ? [...prev, ...add] : prev;
    });
  }

  // Drag & drop
  const [drag, setDrag] = useState<{ tipo: "card" | "col"; id: number } | null>(null);
  const [hint, setHint] = useState<{ etapaId: number; index: number } | null>(null);
  const [hintCol, setHintCol] = useState<number | null>(null);
  const didDrag = useRef(false);

  // --- SSE: estado de conexión + contactos + mensajes en vivo ---------------
  useEffect(() => {
    const es = new EventSource("/api/whatsapp/stream");

    es.addEventListener("status", (e) => setConn(JSON.parse((e as MessageEvent).data)));
    es.addEventListener("contact", (e) =>
      aplicarContacto(JSON.parse((e as MessageEvent).data) as ContactoDTO)
    );
    es.addEventListener("message", (e) => {
      const m: MensajeDTO = JSON.parse((e as MessageEvent).data);
      agregarMensajes([m], m.contactoId);
    });

    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Polling de respaldo: garantiza consistencia aunque el SSE pierda un
  // evento (proxy/buffering/reconexión). Reconcilia contactos y, si hay un chat
  // abierto, trae sus mensajes nuevos por id. Barato para un CRM de pocos leads.
  useEffect(() => {
    let vivo = true;
    const tick = async () => {
      try {
        const lista = await sincronizarContactos();
        if (vivo) lista.forEach(aplicarContacto);
      } catch {
        /* reintenta en el próximo tick */
      }
      const id = abiertoRef.current;
      if (id != null) {
        try {
          const reales = mensajesRef.current.filter((m) => m.id > 0).map((m) => m.id);
          const desde = reales.length ? Math.max(...reales) : 0;
          const nuevos = await sincronizarChat(id, desde);
          if (vivo && nuevos.length) agregarMensajes(nuevos, id);
        } catch {
          /* reintenta en el próximo tick */
        }
      }
    };
    const t = setInterval(tick, 4000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Conexión -------------------------------------------------------------
  const [conectando, setConectando] = useState(false);
  async function conectar() {
    setConectando(true);
    try {
      setConn(await iniciarConexion());
    } finally {
      setConectando(false);
    }
  }
  async function desconectar() {
    if (!confirm("¿Cerrar la sesión de WhatsApp? Tendrás que volver a escanear el QR.")) return;
    setConn(await cerrarSesion());
  }

  // --- Chat -----------------------------------------------------------------
  async function abrir(id: number, conConfig = false) {
    setAbierto(id);
    setConfigAbierta(conConfig);
    setMensajes([]);
    setContactos((prev) => prev.map((c) => (c.id === id ? { ...c, noLeidos: 0 } : c)));
    const msgs = await abrirChat(id);
    if (abiertoRef.current === id) setMensajes(msgs);
  }

  // Envío optimista: mostramos el mensaje al instante (id temporal negativo) y
  // lo reconciliamos cuando el servidor responde. Si falla, lo quitamos. Así no
  // se percibe la latencia del ACK de WhatsApp ni de la persistencia.
  async function enviarDesdeChat(contactoId: number, texto: string) {
    const tempId = -Date.now();
    const optimista: MensajeDTO = {
      id: tempId,
      contactoId,
      desdeMi: true,
      texto,
      tipo: "texto",
      timestamp: Date.now(),
    };
    setMensajes((prev) => [...prev, optimista]);
    const res = await enviarMensaje(contactoId, texto);
    if (abiertoRef.current !== contactoId) {
      // El usuario cambió de chat; el SSE/polling reflejará el resultado.
      return res.ok ? { ok: true as const } : { ok: false as const, error: res.error };
    }
    if (res.ok) {
      setMensajes((prev) => {
        const sinTemp = prev.filter((m) => m.id !== tempId);
        return sinTemp.some((m) => m.id === res.mensaje.id) ? sinTemp : [...sinTemp, res.mensaje];
      });
      return { ok: true as const };
    }
    setMensajes((prev) => prev.filter((m) => m.id !== tempId));
    return { ok: false as const, error: res.error };
  }

  // --- Helpers de estado de cards -------------------------------------------
  function patchContacto(id: number, patch: Partial<ContactoDTO>) {
    setContactos((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  // Reubica una card al final de una columna (usado por "venta exitosa" y por
  // cambios de etapa desde la configuración).
  function colocarEnEtapa(id: number, etapaId: number) {
    setContactos((prev) => {
      const moving = prev.find((c) => c.id === id);
      if (!moving) return prev;
      const rest = prev.filter((c) => c.id !== id);
      const orden = rest.filter((c) => (c.etapaId ?? etapas[0]?.id) === etapaId).length;
      return rest.concat([{ ...moving, etapaId, orden }]);
    });
  }

  // --- DnD de cards ---------------------------------------------------------
  const cardsDe = (etapaId: number) =>
    contactos
      .filter((c) => (c.etapaId ?? etapas[0]?.id) === etapaId)
      .sort((a, b) => a.orden - b.orden || b.ultimoMensajeEn - a.ultimoMensajeEn);

  function moverCard(id: number, etapaId: number, index: number) {
    const moving = contactos.find((c) => c.id === id);
    if (!moving) return;
    const etapaDest = etapas.find((e) => e.id === etapaId);
    // Gate: a la etapa de "venta exitosa" sólo entran leads con presupuesto.
    if (etapaDest?.esExito && !moving.tienePresupuesto) {
      alert(
        `Para mover un lead a “${etapaDest.nombre}” primero cargá un presupuesto desde la configuración del lead (⚙).`
      );
      return;
    }
    const updated = { ...moving, etapaId };
    const rest = contactos.filter((c) => c.id !== id);
    const destIds = rest
      .filter((c) => (c.etapaId ?? etapas[0]?.id) === etapaId)
      .sort((a, b) => a.orden - b.orden);
    const i = Math.max(0, Math.min(index, destIds.length));
    destIds.splice(i, 0, updated);
    const ordenMap = new Map(destIds.map((c, idx) => [c.id, idx]));
    setContactos(
      rest
        .concat([updated])
        .map((c) => (ordenMap.has(c.id) ? { ...c, etapaId, orden: ordenMap.get(c.id)! } : c))
    );
    startTransition(() => {
      reordenarColumna(
        etapaId,
        destIds.map((c) => c.id)
      );
    });
  }

  // --- DnD de columnas ------------------------------------------------------
  function moverColumna(id: number, targetId: number) {
    if (id === targetId) return;
    const orden = [...etapas].sort((a, b) => a.orden - b.orden);
    const from = orden.findIndex((e) => e.id === id);
    const to = orden.findIndex((e) => e.id === targetId);
    const [m] = orden.splice(from, 1);
    orden.splice(to, 0, m);
    const next = orden.map((e, i) => ({ ...e, orden: i }));
    setEtapas(next);
    startTransition(() => reordenarEtapas(next.map((e) => e.id)));
  }

  // --- Etapas ---------------------------------------------------------------
  async function nuevaEtapa() {
    const nombre = prompt("Nombre de la nueva columna:");
    if (!nombre?.trim()) return;
    const optimista: EtapaDTO = {
      id: -Date.now(),
      nombre: nombre.trim(),
      color: "slate",
      orden: etapas.length,
      esExito: false,
    };
    setEtapas((p) => [...p, optimista]);
    await crearEtapa(nombre.trim(), "slate");
    // recargamos para obtener el id real
    location.reload();
  }
  async function borrarEtapa(id: number) {
    if (etapas.length <= 1) return;
    if (!confirm("¿Eliminar esta columna? Sus contactos pasan a la primera columna.")) return;
    setEtapas((p) => p.filter((e) => e.id !== id));
    setContactos((p) =>
      p.map((c) => (c.etapaId === id ? { ...c, etapaId: etapas.find((e) => e.id !== id)?.id ?? null } : c))
    );
    await eliminarEtapa(id);
  }

  const etapasOrden = [...etapas].sort((a, b) => a.orden - b.orden);
  const contactoAbierto = contactos.find((c) => c.id === abierto) ?? null;

  return (
    <div className="space-y-5">
      {/* Barra de conexión */}
      <ConexionBar
        conn={conn}
        conectando={conectando}
        onConectar={conectar}
        onDesconectar={desconectar}
        totalContactos={contactos.length}
      />

      {/* Tablero kanban */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {etapasOrden.map((etapa) => {
          const col = colorDe(etapa.color);
          const cards = cardsDe(etapa.id);
          const resaltada = hintCol === etapa.id && drag?.tipo === "col";
          return (
            <div
              key={etapa.id}
              className={`flex w-72 shrink-0 flex-col rounded-2xl bg-slate-100/70 ${
                resaltada ? "ring-2 ring-lime" : ""
              }`}
              onDragOver={(e) => {
                if (drag?.tipo === "col") {
                  e.preventDefault();
                  setHintCol(etapa.id);
                }
              }}
              onDrop={(e) => {
                if (drag?.tipo === "col") {
                  e.preventDefault();
                  moverColumna(drag.id, etapa.id);
                  setDrag(null);
                  setHintCol(null);
                }
              }}
            >
              {/* Header columna (arrastrable para reordenar) */}
              <div
                className="flex items-center gap-2 px-3 py-3"
                draggable
                onDragStart={() => setDrag({ tipo: "col", id: etapa.id })}
                onDragEnd={() => {
                  setDrag(null);
                  setHintCol(null);
                }}
              >
                <GripVertical className="h-4 w-4 cursor-grab text-slate-400" />
                <span className={`h-2.5 w-2.5 rounded-full ${col.dot}`} />
                <h3 className="text-sm font-semibold text-slate-700">{etapa.nombre}</h3>
                {etapa.esExito && <Trophy className="h-3.5 w-3.5 text-amber-500" />}
                <span className={`badge ${col.chip}`}>{cards.length}</span>
                <button
                  onClick={() => borrarEtapa(etapa.id)}
                  className="ml-auto text-slate-300 transition hover:text-rose-500"
                  title="Eliminar columna"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Cuerpo columna (drop zone de cards) */}
              <div
                className="flex min-h-[120px] flex-1 flex-col gap-2 px-2 pb-3"
                onDragOver={(e) => {
                  if (drag?.tipo !== "card") return;
                  e.preventDefault();
                  setHint({ etapaId: etapa.id, index: cards.length });
                }}
                onDrop={(e) => {
                  if (drag?.tipo !== "card") return;
                  e.preventDefault();
                  if (hint) moverCard(drag.id, hint.etapaId, hint.index);
                  setDrag(null);
                  setHint(null);
                }}
              >
                {cards.length === 0 && (
                  <p className="px-2 py-6 text-center text-xs text-slate-400">Sin contactos</p>
                )}
                {cards.map((c, i) => (
                  <div key={c.id}>
                    {hint?.etapaId === etapa.id && hint.index === i && (
                      <div className={`mb-2 h-1 rounded-full ${col.bar}`} />
                    )}
                    <ContactoCard
                      c={c}
                      responsable={equipo.find((u) => u.id === c.responsableId)?.nombre}
                      activo={abierto === c.id}
                      arrastrando={drag?.tipo === "card" && drag.id === c.id}
                      onDragStart={() => {
                        didDrag.current = true;
                        setDrag({ tipo: "card", id: c.id });
                      }}
                      onDragEnd={() => {
                        setDrag(null);
                        setHint(null);
                        setTimeout(() => (didDrag.current = false), 0);
                      }}
                      onDragOver={(e) => {
                        if (drag?.tipo !== "card") return;
                        e.preventDefault();
                        e.stopPropagation();
                        const r = e.currentTarget.getBoundingClientRect();
                        const despues = e.clientY > r.top + r.height / 2;
                        setHint({ etapaId: etapa.id, index: i + (despues ? 1 : 0) });
                      }}
                      onClick={() => {
                        if (didDrag.current) return;
                        abrir(c.id);
                      }}
                      onConfig={() => abrir(c.id, true)}
                    />
                  </div>
                ))}
                {hint?.etapaId === etapa.id && hint.index === cards.length && cards.length > 0 && (
                  <div className={`h-1 rounded-full ${col.bar}`} />
                )}
              </div>
            </div>
          );
        })}

        {/* Añadir columna */}
        <button
          onClick={nuevaEtapa}
          className="flex h-12 w-72 shrink-0 items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 text-sm font-medium text-slate-500 transition hover:border-lime hover:text-slate-700"
        >
          <Plus className="h-4 w-4" /> Añadir columna
        </button>
      </div>

      {/* Panel de chat + configuración */}
      {contactoAbierto && (
        <ChatPanel
          key={contactoAbierto.id}
          contacto={contactoAbierto}
          mensajes={mensajes}
          conectado={conn.status === "open"}
          configAbierta={configAbierta}
          onToggleConfig={() => setConfigAbierta((v) => !v)}
          etapas={etapasOrden}
          equipo={equipo}
          productos={productos}
          onPatch={(patch) => patchContacto(contactoAbierto.id, patch)}
          onColocar={(etapaId) => colocarEnEtapa(contactoAbierto.id, etapaId)}
          onClose={() => {
            setAbierto(null);
            setConfigAbierta(false);
          }}
          onEnviar={(t) => enviarDesdeChat(contactoAbierto.id, t)}
        />
      )}
    </div>
  );
}

// --- Barra de conexión -------------------------------------------------------
function ConexionBar({
  conn,
  conectando,
  onConectar,
  onDesconectar,
  totalContactos,
}: {
  conn: WaSnapshot;
  conectando: boolean;
  onConectar: () => void;
  onDesconectar: () => void;
  totalContactos: number;
}) {
  const conectado = conn.status === "open";
  return (
    <>
      <div className="card flex flex-wrap items-center gap-4 p-4">
        <div
          className={`flex h-11 w-11 items-center justify-center rounded-xl ${
            conectado ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"
          }`}
        >
          <MessageCircle className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {conectado ? "WhatsApp conectado" : "WhatsApp desconectado"}
          </p>
          <p className="text-xs text-slate-500">
            {conectado
              ? `${conn.me?.nombre || conn.me?.id?.split(":")[0] || "Sesión activa"} · ${totalContactos} contactos`
              : conn.status === "connecting"
                ? "Conectando…"
                : conn.status === "qr"
                  ? "Escaneá el código QR para vincular"
                  : "Conectá tu cuenta para recibir mensajes"}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {conectado ? (
            <button className="btn-ghost" onClick={onDesconectar}>
              <PlugZap className="h-4 w-4" /> Desconectar
            </button>
          ) : (
            <button className="btn-primary" onClick={onConectar} disabled={conectando || conn.status === "connecting"}>
              {conectando || conn.status === "connecting" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plug className="h-4 w-4" />
              )}
              Conectar WhatsApp
            </button>
          )}
        </div>
      </div>

      {/* Modal QR */}
      {conn.status === "qr" && conn.qr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/70 p-4">
          <div className="card w-full max-w-sm p-6 text-center">
            <div className="mb-3 flex items-center justify-center gap-2 text-navy">
              <QrCode className="h-5 w-5 text-brand-600" />
              <h2 className="text-lg font-bold">Vinculá tu WhatsApp</h2>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={conn.qr} alt="Código QR de WhatsApp" className="mx-auto h-64 w-64 rounded-xl border border-slate-200" />
            <ol className="mt-4 space-y-1 text-left text-xs text-slate-500">
              <li>1. Abrí WhatsApp en tu teléfono.</li>
              <li>2. Tocá Menú ⋮ → <b>Dispositivos vinculados</b>.</li>
              <li>3. Tocá <b>Vincular un dispositivo</b> y escaneá este código.</li>
            </ol>
            <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-slate-400">
              <Loader2 className="h-3 w-3 animate-spin" /> Esperando escaneo…
            </p>
          </div>
        </div>
      )}
    </>
  );
}

// --- Card de contacto --------------------------------------------------------
function ContactoCard({
  c,
  responsable,
  activo,
  arrastrando,
  onDragStart,
  onDragEnd,
  onDragOver,
  onClick,
  onConfig,
}: {
  c: ContactoDTO;
  responsable?: string;
  activo: boolean;
  arrastrando: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onClick: () => void;
  onConfig: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onClick={onClick}
      className={`group cursor-pointer rounded-xl border bg-white p-3 shadow-sm transition hover:shadow-md ${
        activo ? "border-lime ring-1 ring-lime" : "border-slate-200"
      } ${arrastrando ? "opacity-40" : ""}`}
    >
      <div className="flex items-center gap-2.5">
        <Avatar nombre={c.nombre} avatar={c.avatar} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-800">{c.nombre}</p>
          <p className="truncate text-xs text-slate-400">{fmtTelefono(c.telefono)}</p>
        </div>
        {c.noLeidos > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-lime px-1.5 text-[11px] font-bold text-navy">
            {c.noLeidos}
          </span>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onConfig();
          }}
          className="rounded-lg p-1 text-slate-300 opacity-0 transition hover:bg-slate-100 hover:text-slate-600 group-hover:opacity-100"
          title="Configuración del lead"
        >
          <Settings2 className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-2 truncate text-xs text-slate-500">{c.ultimoMensaje || "—"}</p>
      <div className="mt-1 flex items-center justify-between gap-2">
        {responsable ? (
          <span className="truncate text-[10px] font-medium text-brand-600">@ {responsable}</span>
        ) : (
          <span />
        )}
        <span className="text-[10px] text-slate-400">{fmtHora(c.ultimoMensajeEn)}</span>
      </div>
    </div>
  );
}

// --- Panel de chat + configuración ------------------------------------------
function ChatPanel({
  contacto,
  mensajes,
  conectado,
  configAbierta,
  onToggleConfig,
  etapas,
  equipo,
  productos,
  onPatch,
  onColocar,
  onClose,
  onEnviar,
}: {
  contacto: ContactoDTO;
  mensajes: MensajeDTO[];
  conectado: boolean;
  configAbierta: boolean;
  onToggleConfig: () => void;
  etapas: EtapaDTO[];
  equipo: MiembroDTO[];
  productos: ProductoDTO[];
  onPatch: (patch: Partial<ContactoDTO>) => void;
  onColocar: (etapaId: number) => void;
  onClose: () => void;
  onEnviar: (texto: string) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const finRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes.length]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const t = texto.trim();
    if (!t || enviando) return;
    setEnviando(true);
    setError(null);
    setTexto(""); // optimista: limpiamos el input de inmediato
    const res = await onEnviar(t);
    setEnviando(false);
    if (!res.ok) {
      setError(res.error);
      setTexto(t); // restauramos el texto si el envío falló
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-navy/40" />
      <div
        className={`relative flex h-full w-full bg-white shadow-2xl transition-[max-width] ${
          configAbierta ? "max-w-4xl" : "max-w-md"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Columna de configuración (izquierda) */}
        {configAbierta && (
          <ConfigLead
            contacto={contacto}
            etapas={etapas}
            equipo={equipo}
            productos={productos}
            onPatch={onPatch}
            onColocar={onColocar}
          />
        )}

        {/* Columna de chat (derecha) */}
        <div className="flex h-full min-w-0 flex-1 flex-col">
          {/* Header */}
          <div className="flex items-center gap-3 border-b border-slate-200 bg-navy px-4 py-3 text-white">
            <Avatar
              nombre={contacto.nombre}
              avatar={contacto.avatar}
              initialsClass="bg-lime text-navy"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{contacto.nombre}</p>
              <p className="flex items-center gap-1 text-xs text-slate-400">
                <Phone className="h-3 w-3" /> {fmtTelefono(contacto.telefono)}
              </p>
            </div>
            <button
              onClick={onToggleConfig}
              className={`rounded-lg p-1.5 transition hover:bg-white/10 ${
                configAbierta ? "text-lime" : "text-slate-300 hover:text-white"
              }`}
              title="Configuración del lead"
            >
              <Settings2 className="h-5 w-5" />
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-300 transition hover:bg-white/10 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Mensajes */}
          <div className="flex-1 space-y-2 overflow-y-auto bg-[#f5f7f0] p-4">
            {mensajes.length === 0 && (
              <p className="mt-8 text-center text-xs text-slate-400">No hay mensajes todavía.</p>
            )}
            {mensajes.map((m) => (
              <div key={m.id} className={`flex ${m.desdeMi ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                    m.desdeMi
                      ? "rounded-br-sm bg-lime text-navy"
                      : "rounded-bl-sm bg-white text-slate-700"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{m.texto}</p>
                  <p className={`mt-0.5 text-right text-[10px] ${m.desdeMi ? "text-navy/60" : "text-slate-400"}`}>
                    {fmtHora(m.timestamp)}
                  </p>
                </div>
              </div>
            ))}
            <div ref={finRef} />
          </div>

          {/* Input */}
          <form onSubmit={enviar} className="border-t border-slate-200 p-3">
            {error && <p className="mb-2 text-xs text-rose-500">{error}</p>}
            <div className="flex items-end gap-2">
              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    enviar(e);
                  }
                }}
                rows={1}
                placeholder={conectado ? "Escribí un mensaje…" : "Conectá WhatsApp para responder"}
                disabled={!conectado || enviando}
                className="input max-h-28 flex-1 resize-none"
              />
              <button type="submit" className="btn-primary !px-3" disabled={!conectado || enviando || !texto.trim()}>
                {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// --- Configuración del lead (columna izquierda) ------------------------------
type ItemEdit = PresupuestoItemInput & { key: number };
let itemSeq = 1;

function ConfigLead({
  contacto,
  etapas,
  equipo,
  productos,
  onPatch,
  onColocar,
}: {
  contacto: ContactoDTO;
  etapas: EtapaDTO[];
  equipo: MiembroDTO[];
  productos: ProductoDTO[];
  onPatch: (patch: Partial<ContactoDTO>) => void;
  onColocar: (etapaId: number) => void;
}) {
  const [detalle, setDetalle] = useState<DetalleContacto | null>(null);
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [notas, setNotas] = useState("");
  const [responsableId, setResponsableId] = useState<number | null>(null);
  const [etapaId, setEtapaId] = useState<number | null>(null);
  const [items, setItems] = useState<ItemEdit[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [estado, setEstado] = useState<string | null>(null);
  const [refrescando, setRefrescando] = useState(false);

  useEffect(() => {
    let vivo = true;
    obtenerDetalleContacto(contacto.id).then((d) => {
      if (!vivo || !d) return;
      setDetalle(d);
      setNombre(d.nombre);
      setEmail(d.email);
      setNotas(d.notas);
      setResponsableId(d.responsableId);
      setEtapaId(d.etapaId);
      setItems(d.items.map((i) => ({ ...i, key: itemSeq++ })));
    });
    return () => {
      vivo = false;
    };
  }, [contacto.id]);

  const total = items.reduce((a, i) => a + (Number(i.cantidad) || 0) * (Number(i.precioUnit) || 0), 0);

  function setItem(key: number, patch: Partial<ItemEdit>) {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  }
  function elegirProducto(key: number, productoId: number | null) {
    const p = productos.find((x) => x.id === productoId);
    setItem(key, {
      productoId,
      descripcion: p ? p.nombre : "",
      precioUnit: p ? p.precioVenta : 0,
    });
  }
  function agregarItem() {
    setItems((prev) => [...prev, { key: itemSeq++, productoId: null, descripcion: "", cantidad: 1, precioUnit: 0 }]);
  }
  function quitarItem(key: number) {
    setItems((prev) => prev.filter((i) => i.key !== key));
  }

  const itemsLimpios = (): PresupuestoItemInput[] =>
    items.map((i) => ({
      productoId: i.productoId ?? null,
      descripcion: i.descripcion,
      cantidad: Number(i.cantidad) || 1,
      precioUnit: Number(i.precioUnit) || 0,
    }));

  async function guardar() {
    setGuardando(true);
    setEstado(null);
    // Guardamos el presupuesto primero para que el gate de etapa lo vea.
    await guardarPresupuesto(contacto.id, itemsLimpios());
    const res = await actualizarContacto(contacto.id, {
      nombre,
      email,
      notas,
      responsableId,
      etapaId,
    });
    setGuardando(false);
    if (!res.ok) {
      setEstado(res.error);
      return;
    }
    onPatch({ nombre, responsableId, tienePresupuesto: total > 0 });
    if (etapaId != null && etapaId !== contacto.etapaId) onColocar(etapaId);
    setEstado("Guardado ✓");
    setTimeout(() => setEstado(null), 2500);
  }

  async function ventaExitosa() {
    setGuardando(true);
    setEstado(null);
    await guardarPresupuesto(contacto.id, itemsLimpios());
    const res = await marcarVentaExitosa(contacto.id);
    setGuardando(false);
    if (!res.ok) {
      setEstado(res.error);
      return;
    }
    onPatch({ tienePresupuesto: true, etapaId: res.etapaId });
    onColocar(res.etapaId);
    setEtapaId(res.etapaId);
    setEstado("¡Venta marcada como exitosa! 🎉");
    setTimeout(() => setEstado(null), 2500);
  }

  async function refrescarFoto() {
    setRefrescando(true);
    const res = await refrescarAvatar(contacto.id);
    setRefrescando(false);
    if (res.ok) {
      onPatch({ avatar: res.avatar });
      setDetalle((d) => (d ? { ...d, avatar: res.avatar } : d));
    }
  }

  if (!detalle) {
    return (
      <div className="flex h-full w-[340px] shrink-0 items-center justify-center border-r border-slate-200 bg-slate-50">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="flex h-full w-[340px] shrink-0 flex-col border-r border-slate-200 bg-slate-50">
      <div className="border-b border-slate-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-700">Configuración del lead</h3>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* Avatar + identificación */}
        <div className="flex items-center gap-3">
          <Avatar nombre={nombre} avatar={detalle.avatar} className="h-14 w-14" textSize="text-base" />
          <button
            onClick={refrescarFoto}
            disabled={refrescando}
            className="btn-ghost !px-2 !py-1 text-xs"
            title="Actualizar foto desde WhatsApp"
          >
            {refrescando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Foto
          </button>
        </div>

        {/* Campos no editables */}
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2">
            <ReadOnly label="Teléfono" value={fmtTelefono(detalle.telefono)} icon={<Phone className="h-3 w-3" />} />
          </div>
          <div className="col-span-2">
            <ReadOnly label="Alta" value={fmtFecha(detalle.creadoEn)} />
          </div>
        </div>

        {/* Campos editables */}
        <div>
          <label className="label">Nombre</label>
          <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </div>
        <div>
          <label className="label">Email</label>
          <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="label">Responsable</label>
          <select
            className="input"
            value={responsableId ?? ""}
            onChange={(e) => setResponsableId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Sin asignar</option>
            {equipo.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Etapa</label>
          <select
            className="input"
            value={etapaId ?? ""}
            onChange={(e) => setEtapaId(e.target.value ? Number(e.target.value) : null)}
          >
            {etapas.map((et) => (
              <option key={et.id} value={et.id}>
                {et.nombre}
                {et.esExito ? " 🏆" : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Notas</label>
          <textarea
            className="input min-h-16 resize-none"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Notas internas del lead…"
          />
        </div>

        {/* Presupuesto */}
        <div className="border-t border-slate-200 pt-3">
          <div className="mb-2 flex items-center justify-between">
            <label className="label !mb-0">Presupuesto</label>
            <button onClick={agregarItem} className="btn-ghost !px-2 !py-1 text-xs">
              <Plus className="h-3.5 w-3.5" /> Ítem
            </button>
          </div>
          {items.length === 0 && (
            <p className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-center text-xs text-slate-400">
              Sin ítems. Agregá productos del stock para armar el presupuesto.
            </p>
          )}
          <div className="space-y-2">
            {items.map((it) => (
              <div key={it.key} className="space-y-2 rounded-lg border border-slate-200 bg-white p-2">
                <div className="flex items-center gap-2">
                  <select
                    className="input !py-1 flex-1 text-xs"
                    value={it.productoId ?? ""}
                    onChange={(e) => elegirProducto(it.key, e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">Ítem manual…</option>
                    {productos.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => quitarItem(it.key)}
                    className="rounded p-1 text-slate-300 transition hover:bg-rose-50 hover:text-rose-500"
                    title="Quitar ítem"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <input
                  className="input !py-1 text-xs"
                  placeholder="Descripción"
                  value={it.descripcion}
                  onChange={(e) => setItem(it.key, { descripcion: e.target.value })}
                />
                <div className="flex items-center gap-2 text-xs">
                  <input
                    type="number"
                    min={1}
                    className="input !py-1 w-14"
                    value={it.cantidad}
                    onChange={(e) => setItem(it.key, { cantidad: Number(e.target.value) })}
                  />
                  <span className="text-slate-400">×</span>
                  <input
                    type="number"
                    min={0}
                    className="input !py-1 flex-1"
                    value={it.precioUnit}
                    onChange={(e) => setItem(it.key, { precioUnit: Number(e.target.value) })}
                  />
                  <span className="ml-auto whitespace-nowrap font-semibold text-slate-700">
                    {money((Number(it.cantidad) || 0) * (Number(it.precioUnit) || 0))}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2 text-sm">
            <span className="font-medium text-slate-500">Total</span>
            <span className="font-bold text-slate-800">{money(total)}</span>
          </div>
        </div>
      </div>

      {/* Acciones */}
      <div className="space-y-2 border-t border-slate-200 p-3">
        {estado && <p className="text-center text-xs font-medium text-emerald-600">{estado}</p>}
        <button
          onClick={ventaExitosa}
          disabled={guardando || total <= 0}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
          title={total <= 0 ? "Cargá un presupuesto para habilitar la venta exitosa" : undefined}
        >
          <Trophy className="h-4 w-4" /> Marcar venta exitosa
        </button>
        <button onClick={guardar} disabled={guardando} className="btn-primary w-full justify-center">
          {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Guardar cambios
        </button>
      </div>
    </div>
  );
}

function ReadOnly({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-slate-400">
        {icon}
        {label}
      </p>
      <p className="truncate text-sm font-medium text-slate-700">{value}</p>
    </div>
  );
}
