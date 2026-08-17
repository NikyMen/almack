"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Send, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/cn";

const SALUDO =
  "¡Hola! Soy el asistente de la tienda. Preguntame por productos, precios o disponibilidad.";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

export function FloatingActions() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? "Cerrar el asistente" : "Abrir el asistente"}
        aria-expanded={open}
        className="fixed bottom-24 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-brand-ink text-brand-gold shadow-card transition hover:scale-105 md:bottom-6"
      >
        {open ? <X size={24} /> : <Sparkles size={24} />}
      </button>
      {open && <ChatPanel onClose={() => setOpen(false)} />}
    </>
  );
}

function ChatPanel({ onClose }: { onClose: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([{ role: "assistant", content: SALUDO }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [msgs, loading]);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    const next = [...msgs, { role: "user" as const, content: text }];
    setMsgs(next);
    setInput("");
    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/tienda/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.slice(1).slice(-12) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "No pudimos responderte.");
      setMsgs([...next, { role: "assistant", content: data.reply }]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No pudimos responderte.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div role="dialog" aria-label="Asistente de la tienda" className="fixed bottom-40 right-4 z-40 flex h-[26rem] max-h-[calc(100dvh-11rem)] w-[calc(100vw-2rem)] max-w-sm flex-col overflow-hidden rounded-xl2 bg-white shadow-card ring-1 ring-black/5">
      <header className="flex items-center gap-2 border-b border-black/5 bg-brand-ink px-4 py-3 text-white">
        <Sparkles size={18} className="text-brand-gold" />
        <div className="flex-1"><p className="text-sm font-semibold">Asistente de tienda</p><p className="text-[11px] text-white/55">Consultá el catálogo online</p></div>
        <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-full p-1 text-white/60 hover:bg-white/10 hover:text-white"><X size={18} /></button>
      </header>
      <div ref={scroller} className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {msgs.map((message, index) => <div key={index} className={cn("max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm", message.role === "user" ? "ml-auto bg-brand-ink text-white" : "bg-brand-cream text-brand-ink")}>{message.content}</div>)}
        {loading && <div className="flex items-center gap-2 rounded-xl bg-brand-cream px-3 py-2 text-sm text-brand-ink/60"><Loader2 size={14} className="animate-spin" />Escribiendo…</div>}
        {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      </div>
      <form onSubmit={send} className="flex items-center gap-2 border-t border-black/5 p-2">
        <input ref={inputRef} value={input} onChange={(event) => setInput(event.target.value)} maxLength={500} placeholder="Escribí tu consulta…" className="flex-1 rounded-full bg-brand-cream px-4 py-2 text-sm outline-none ring-brand-gold/40 focus:ring-2" />
        <button type="submit" disabled={loading || !input.trim()} aria-label="Enviar" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-ink text-brand-gold disabled:opacity-40"><Send size={16} /></button>
      </form>
    </div>
  );
}
