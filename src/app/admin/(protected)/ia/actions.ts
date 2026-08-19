"use server";

import { and, asc, desc, eq, isNull, type SQL } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { iaConversaciones, iaMensajes } from "@/db/schema";
import { requireAcceso } from "@/lib/auth";
import { chatNegocio } from "@/lib/ai";
import { getContextoNegocio } from "@/lib/queries";

export type MensajeChat = { id: number; rol: "user" | "assistant"; texto: string; creadoEn: Date | null };
export type ConversacionResumen = { id: number; titulo: string; actualizadoEn: Date | null };

// Toda operación valida acceso al módulo y ata la conversación al usuario en
// sesión: el historial de uno no tiene por qué ser visible para otro.
async function usuarioIA() {
  return requireAcceso("ia");
}

// El admin de respaldo por .env no existe en la tabla usuarios y viene con id 0.
// Como hay FK real sobre usuario_id, para ese caso guardamos NULL (y filtramos
// por NULL), en vez de un id que no existe.
const dueño = (id: number) => (id ? id : null);
const esDelUsuario = (id: number): SQL =>
  id ? eq(iaConversaciones.usuarioId, id) : isNull(iaConversaciones.usuarioId);

function tituloDesde(texto: string) {
  const limpio = texto.replace(/\s+/g, " ").trim();
  return limpio.length > 48 ? `${limpio.slice(0, 48)}…` : limpio || "Nueva conversación";
}

export async function listarConversaciones(): Promise<ConversacionResumen[]> {
  const u = await usuarioIA();
  return db
    .select({
      id: iaConversaciones.id,
      titulo: iaConversaciones.titulo,
      actualizadoEn: iaConversaciones.actualizadoEn,
    })
    .from(iaConversaciones)
    .where(esDelUsuario(u.id))
    .orderBy(desc(iaConversaciones.actualizadoEn))
    .limit(50);
}

export async function crearConversacion(): Promise<number> {
  const u = await usuarioIA();
  const [c] = await db
    .insert(iaConversaciones)
    .values({ usuarioId: dueño(u.id), titulo: "Nueva conversación" })
    .returning({ id: iaConversaciones.id });
  revalidatePath("/ia");
  return c.id;
}

export async function obtenerMensajes(conversacionId: number): Promise<MensajeChat[]> {
  const u = await usuarioIA();
  const [conv] = await db
    .select({ id: iaConversaciones.id })
    .from(iaConversaciones)
    .where(and(eq(iaConversaciones.id, conversacionId), esDelUsuario(u.id)));
  if (!conv) return [];

  const filas = await db
    .select({ id: iaMensajes.id, rol: iaMensajes.rol, texto: iaMensajes.texto, creadoEn: iaMensajes.creadoEn })
    .from(iaMensajes)
    .where(eq(iaMensajes.conversacionId, conversacionId))
    .orderBy(asc(iaMensajes.id));

  return filas.map((f) => ({ ...f, rol: f.rol === "assistant" ? "assistant" : "user" }));
}

export async function eliminarConversacion(conversacionId: number) {
  const u = await usuarioIA();
  const [conv] = await db
    .select({ id: iaConversaciones.id })
    .from(iaConversaciones)
    .where(and(eq(iaConversaciones.id, conversacionId), esDelUsuario(u.id)));
  if (!conv) return { ok: false as const, error: "La conversación no existe." };

  // Primero los mensajes: son los que referencian a la conversación.
  await db.delete(iaMensajes).where(eq(iaMensajes.conversacionId, conversacionId));
  await db.delete(iaConversaciones).where(eq(iaConversaciones.id, conversacionId));
  revalidatePath("/ia");
  return { ok: true as const };
}

/**
 * Guarda la pregunta, consulta a la IA con TODO el historial y guarda la
 * respuesta. Devuelve los dos mensajes nuevos para pintarlos sin recargar.
 * Si no había conversación, crea una al vuelo.
 */
export async function enviarMensaje(conversacionId: number | null, texto: string) {
  const u = await usuarioIA();
  const pregunta = texto.trim();
  if (!pregunta) return { ok: false as const, error: "Escribí una pregunta." };

  let convId = conversacionId;
  if (convId) {
    const [conv] = await db
      .select({ id: iaConversaciones.id })
      .from(iaConversaciones)
      .where(and(eq(iaConversaciones.id, convId), esDelUsuario(u.id)));
    if (!conv) convId = null;
  }
  if (!convId) {
    const [c] = await db
      .insert(iaConversaciones)
      .values({ usuarioId: dueño(u.id), titulo: tituloDesde(pregunta) })
      .returning({ id: iaConversaciones.id });
    convId = c.id;
  }

  const [msgUsuario] = await db
    .insert(iaMensajes)
    .values({ conversacionId: convId, rol: "user", texto: pregunta })
    .returning({ id: iaMensajes.id, creadoEn: iaMensajes.creadoEn });

  const historial = await db
    .select({ rol: iaMensajes.rol, texto: iaMensajes.texto })
    .from(iaMensajes)
    .where(eq(iaMensajes.conversacionId, convId))
    .orderBy(asc(iaMensajes.id));

  let respuesta: string;
  try {
    const contexto = await getContextoNegocio();
    respuesta = await chatNegocio({ mensajes: historial, contexto });
  } catch (e) {
    // La pregunta ya quedó guardada: la devolvemos igual para que no se pierda
    // lo que el usuario escribió y pueda reintentar.
    return {
      ok: false as const,
      error: (e as Error).message,
      conversacionId: convId,
      usuario: { id: msgUsuario.id, rol: "user" as const, texto: pregunta, creadoEn: msgUsuario.creadoEn },
    };
  }

  const [msgIA] = await db
    .insert(iaMensajes)
    .values({ conversacionId: convId, rol: "assistant", texto: respuesta })
    .returning({ id: iaMensajes.id, creadoEn: iaMensajes.creadoEn });

  // Un título derivado del primer mensaje hace la lista mucho más navegable.
  const [conv] = await db
    .select({ titulo: iaConversaciones.titulo })
    .from(iaConversaciones)
    .where(eq(iaConversaciones.id, convId));
  await db
    .update(iaConversaciones)
    .set({
      actualizadoEn: new Date(),
      ...(conv?.titulo === "Nueva conversación" ? { titulo: tituloDesde(pregunta) } : {}),
    })
    .where(eq(iaConversaciones.id, convId));

  revalidatePath("/ia");
  return {
    ok: true as const,
    conversacionId: convId,
    usuario: { id: msgUsuario.id, rol: "user" as const, texto: pregunta, creadoEn: msgUsuario.creadoEn },
    asistente: { id: msgIA.id, rol: "assistant" as const, texto: respuesta, creadoEn: msgIA.creadoEn },
  };
}
