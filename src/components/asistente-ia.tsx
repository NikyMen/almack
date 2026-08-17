"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  Sparkles, Send, Plus, Trash2, MessageSquare, Loader2, TriangleAlert, X, PanelLeft,
} from "lucide-react";
import {
  listarConversaciones, obtenerMensajes, enviarMensaje, eliminarConversacion,
  type ConversacionResumen, type MensajeChat,
} from "@/app/(app)/ia/actions";

const EJEMPLOS = [
  "¿Qué productos tienen stock bajo?",
  "¿Cuánto vendí en total?",
  "¿Cuál es el valor de mi inventario?",
  "¿Qué me conviene reponer primero?",
];

// La conversación abierta se recuerda en el navegador: así volver desde otra
// sección (o recargar) reabre el chat donde estaba, no uno vacío.
const KEY_ACTIVA = "gestoria:ia:conv";

export function AsistenteIA({ inicial }: { inicial: ConversacionResumen[] }) {
  const [conversaciones, setConversaciones] = useState(inicial);
  const [activa, setActiva] = useState<number | null>(null);
  const [mensajes, setMensajes] = useState<MensajeChat[]>([]);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const [listaAbierta, setListaAbierta] = useState(false);
  const [enviando, startTransition] = useTransition();

  const finRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const abrir = useCallback(async (id: number | null) => {
    setActiva(id);
    setError("");
    try {
      localStorage.setItem(KEY_ACTIVA, id === null ? "" : String(id));
    } catch {
      /* sin localStorage seguimos igual, solo se pierde al recargar */
    }
    if (id === null) {
      setMensajes([]);
      return;
    }
    setCargando(true);
    setMensajes(await obtenerMensajes(id));
    setCargando(false);
  }, []);

  // Restaurar la conversación abierta la última vez.
  useEffect(() => {
    const guardada = Number(localStorage.getItem(KEY_ACTIVA) || 0);
    if (guardada && inicial.some((c) => c.id === guardada)) abrir(guardada);
    else if (inicial.length > 0) abrir(inicial[0].id);
    // Solo al montar: después manda la interacción del usuario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [mensajes, enviando]);

  function enviar(pregunta: string) {
    const q = pregunta.trim();
    if (!q || enviando) return;
    setError("");
    setTexto("");
    // Optimista: la pregunta aparece al instante con id negativo temporal.
    const provisorio: MensajeChat = { id: -Date.now(), rol: "user", texto: q, creadoEn: new Date() };
    setMensajes((m) => [...m, provisorio]);

    startTransition(async () => {
      const r = await enviarMensaje(activa, q);
      if (!r.ok) {
        setError(r.error);
        if (r.conversacionId) {
          setActiva(r.conversacionId);
          setMensajes((m) => m.map((x) => (x.id === provisorio.id ? { ...r.usuario, creadoEn: r.usuario.creadoEn } : x)));
        } else {
          setMensajes((m) => m.filter((x) => x.id !== provisorio.id));
          setTexto(q);
        }
        return;
      }
      setActiva(r.conversacionId);
      try {
        localStorage.setItem(KEY_ACTIVA, String(r.conversacionId));
      } catch {
        /* ignorado */
      }
      setMensajes((m) => [...m.filter((x) => x.id !== provisorio.id), r.usuario, r.asistente]);
      setConversaciones(await listarConversaciones());
    });
  }

  async function borrar(id: number) {
    if (!confirm("¿Eliminar esta conversación? No se puede deshacer.")) return;
    await eliminarConversacion(id);
    const restantes = await listarConversaciones();
    setConversaciones(restantes);
    if (activa === id) abrir(restantes[0]?.id ?? null);
  }

  function nuevoChat() {
    // No se crea la fila hasta que haya un mensaje: evita listas llenas de
    // conversaciones vacías si alguien toca el botón varias veces.
    abrir(null);
    setListaAbierta(false);
    textareaRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      enviar(texto);
    }
  }

  const lista = (
    <>
      <button className="btn-primary mb-3 w-full justify-center" onClick={nuevoChat}>
        <Plus className="h-4 w-4" /> Nuevo chat
      </button>
      <div className="space-y-1 overflow-y-auto">
        {conversaciones.length === 0 && (
          <p className="px-2 py-4 text-center text-xs text-slate-400">Todavía no hay conversaciones.</p>
        )}
        {conversaciones.map((c) => {
          const sel = c.id === activa;
          return (
            <div
              key={c.id}
              className={`group flex items-center gap-1 rounded-xl pr-1 transition ${
                sel ? "bg-lime/15" : "hover:bg-slate-100"
              }`}
            >
              <button
                onClick={() => { abrir(c.id); setListaAbierta(false); }}
                className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5 text-left"
              >
                <MessageSquare className={`h-3.5 w-3.5 shrink-0 ${sel ? "text-navy" : "text-slate-400"}`} />
                <span className={`truncate text-sm ${sel ? "font-medium text-navy" : "text-slate-600"}`}>
                  {c.titulo}
                </span>
              </button>
              <button
                onClick={() => borrar(c.id)}
                className="rounded-lg p-1.5 text-slate-400 opacity-100 transition hover:bg-white hover:text-rose-500 md:opacity-0 md:group-hover:opacity-100"
                aria-label={`Eliminar conversación ${c.titulo}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </>
  );

  return (
    <div className="grid gap-4 md:grid-cols-[250px_1fr]">
      {/* Lista de conversaciones: fija en escritorio */}
      <aside className="card hidden max-h-[75vh] flex-col p-3 md:flex">{lista}</aside>

      {/* Chat */}
      <section className="card flex h-[calc(100dvh-13rem)] min-h-[420px] flex-col md:h-[75vh]">
        <header className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          <button
            className="btn-ghost px-2 py-1.5 md:hidden"
            onClick={() => setListaAbierta(true)}
            aria-label="Ver conversaciones"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
          <Sparkles className="h-4 w-4 text-lime" />
          <h2 className="truncate text-sm font-semibold">
            {conversaciones.find((c) => c.id === activa)?.titulo ?? "Nueva conversación"}
          </h2>
          <button className="btn-ghost ml-auto px-2 py-1.5 md:hidden" onClick={nuevoChat} aria-label="Nuevo chat">
            <Plus className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {cargando && (
            <p className="flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando conversación…
            </p>
          )}

          {!cargando && mensajes.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <Sparkles className="h-8 w-8 text-lime" />
              <div>
                <p className="font-semibold">Preguntale a la IA sobre tu negocio</p>
                <p className="mt-1 text-sm text-slate-500">Responde con los datos reales de tu ERP.</p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {EJEMPLOS.map((e) => (
                  <button
                    key={e}
                    onClick={() => enviar(e)}
                    className="badge border border-slate-200 bg-white px-3 py-1.5 text-slate-600 hover:border-lime hover:bg-lime/10"
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          )}

          {mensajes.map((m) => (
            <div key={m.id} className={`flex ${m.rol === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  m.rol === "user"
                    ? "rounded-br-sm bg-navy text-white"
                    : "rounded-bl-sm border border-slate-200 bg-white text-slate-700"
                }`}
              >
                {m.texto}
              </div>
            </div>
          ))}

          {enviando && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Pensando…
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {error}
            </div>
          )}

          <div ref={finRef} />
        </div>

        <div className="border-t border-slate-100 p-3">
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              rows={1}
              value={texto}
              onChange={(e) => {
                setTexto(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
              }}
              onKeyDown={onKeyDown}
              placeholder="Preguntá sobre tu negocio…  (Enter envía, Shift+Enter salta de línea)"
              className="input max-h-36 resize-none py-2.5"
            />
            <button
              className="btn-primary shrink-0 px-3 py-2.5"
              disabled={enviando || !texto.trim()}
              onClick={() => enviar(texto)}
              aria-label="Enviar"
            >
              {enviando ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </section>

      {/* Lista de conversaciones en mobile */}
      {listaAbierta && (
        <div className="overlay md:hidden" onClick={() => setListaAbierta(false)}>
          <div className="sheet flex flex-col p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold">Conversaciones</h3>
              <button className="btn-ghost px-2 py-1.5" onClick={() => setListaAbierta(false)} aria-label="Cerrar">
                <X className="h-4 w-4" />
              </button>
            </div>
            {lista}
          </div>
        </div>
      )}
    </div>
  );
}
