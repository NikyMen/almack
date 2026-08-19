"use server";

import { db } from "@/db";
import {
  waContactos,
  waEtapas,
  waMensajes,
  waPresupuestos,
  waPresupuestoItems,
} from "@/db/schema";
import { eq, and, asc, desc, gt, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
  getManager,
  toMensajeDTO,
  toContactoDTO,
  type DetalleContacto,
  type PresupuestoItemInput,
} from "@/lib/whatsapp/manager";

// --- Conexión ----------------------------------------------------------------
export async function iniciarConexion() {
  return getManager().connect();
}

export async function cerrarSesion() {
  const snap = await getManager().logout();
  revalidatePath("/whatsapp");
  return snap;
}

// --- Chat --------------------------------------------------------------------
export async function abrirChat(contactoId: number) {
  await getManager().marcarLeido(contactoId);
  const rows = await db
    .select()
    .from(waMensajes)
    .where(eq(waMensajes.contactoId, contactoId))
    .orderBy(asc(waMensajes.timestamp), asc(waMensajes.id));
  return rows.map(toMensajeDTO);
}

export async function enviarMensaje(contactoId: number, texto: string) {
  const t = texto.trim();
  if (!t) return { ok: false as const, error: "El mensaje está vacío" };
  try {
    const mensaje = await getManager().sendText(contactoId, t);
    return { ok: true as const, mensaje };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

// --- Sincronización (red de seguridad sobre el SSE) --------------------------
// El SSE empuja los mensajes en vivo, pero si un evento se pierde (proxy,
// reconexión, buffering), estas dos acciones reconcilian por polling para que
// NUNCA se pierda un mensaje ni una respuesta entrante.

// Mensajes del chat abierto con id mayor a `desdeId` (incremental y barato).
export async function sincronizarChat(contactoId: number, desdeId: number) {
  const rows = await db
    .select()
    .from(waMensajes)
    .where(and(eq(waMensajes.contactoId, contactoId), gt(waMensajes.id, desdeId)))
    .orderBy(asc(waMensajes.id));
  return rows.map(toMensajeDTO);
}

// Snapshot liviano de contactos (para detectar respuestas que llegan a otras
// cards y contactos nuevos). El cliente fusiona sólo los campos de mensajería,
// preservando la posición local del kanban.
export async function sincronizarContactos() {
  const rows = await db
    .select()
    .from(waContactos)
    .orderBy(asc(waContactos.id));
  const conPres = await idsConPresupuesto();
  return rows.map((c) => toContactoDTO(c, conPres.has(c.id)));
}

// --- Kanban: mover / reordenar cards -----------------------------------------
// Persiste el orden completo de una columna: cada contacto recibe la etapa
// destino y su índice como `orden`. Cubre mover entre columnas y reordenar
// dentro de la misma.
export async function reordenarColumna(etapaId: number, contactoIds: number[]) {
  // Backstop del gate de "venta exitosa": si la etapa destino es la de éxito,
  // sólo movemos ahí a los contactos que tienen un presupuesto cargado.
  let ids = contactoIds;
  const [etapa] = await db.select().from(waEtapas).where(eq(waEtapas.id, etapaId));
  if (etapa?.esExito) {
    const conPres = await idsConPresupuesto();
    ids = contactoIds.filter((id) => conPres.has(id));
  }
  for (let i = 0; i < ids.length; i++) {
    await db
      .update(waContactos)
      .set({ etapaId, orden: i })
      .where(eq(waContactos.id, ids[i]));
  }
  revalidatePath("/whatsapp");
}

// Set de contactos que tienen al menos un presupuesto con total > 0.
async function idsConPresupuesto(): Promise<Set<number>> {
  const rows = await db
    .select({ contactoId: waPresupuestos.contactoId })
    .from(waPresupuestos)
    .where(gt(waPresupuestos.total, 0));
  return new Set(rows.map((r) => r.contactoId));
}

// --- Kanban: etapas (columnas) -----------------------------------------------
export async function reordenarEtapas(etapaIds: number[]) {
  for (let i = 0; i < etapaIds.length; i++) {
    await db.update(waEtapas).set({ orden: i }).where(eq(waEtapas.id, etapaIds[i]));
  }
  revalidatePath("/whatsapp");
}

export async function crearEtapa(nombre: string, color = "slate") {
  const n = nombre.trim();
  if (!n) return;
  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${waEtapas.orden}), -1)` })
    .from(waEtapas);
  await db.insert(waEtapas).values({ nombre: n, color, orden: Number(max) + 1 });
  revalidatePath("/whatsapp");
}

export async function renombrarEtapa(etapaId: number, nombre: string) {
  const n = nombre.trim();
  if (!n) return;
  await db.update(waEtapas).set({ nombre: n }).where(eq(waEtapas.id, etapaId));
  revalidatePath("/whatsapp");
}

export async function eliminarEtapa(etapaId: number) {
  // Reasigna las cards a la primera etapa restante para no perderlas.
  const etapas = await db.select().from(waEtapas).orderBy(asc(waEtapas.orden));
  if (etapas.length <= 1) return; // siempre dejamos al menos una columna
  const destino = etapas.find((e) => e.id !== etapaId);
  await db
    .update(waContactos)
    .set({ etapaId: destino?.id ?? null })
    .where(eq(waContactos.etapaId, etapaId));
  await db.delete(waEtapas).where(eq(waEtapas.id, etapaId));
  revalidatePath("/whatsapp");
}

// --- Configuración / datos del lead ------------------------------------------
export async function obtenerDetalleContacto(
  contactoId: number
): Promise<DetalleContacto | null> {
  const [c] = await db.select().from(waContactos).where(eq(waContactos.id, contactoId));
  if (!c) return null;
  const [pres] = await db
    .select()
    .from(waPresupuestos)
    .where(eq(waPresupuestos.contactoId, contactoId))
    .orderBy(desc(waPresupuestos.id))
    .limit(1);
  const items = pres
    ? await db
        .select()
        .from(waPresupuestoItems)
        .where(eq(waPresupuestoItems.presupuestoId, pres.id))
        .orderBy(asc(waPresupuestoItems.id))
    : [];
  return {
    id: c.id,
    nombre: c.nombre,
    telefono: c.telefono,
    numeroLead: c.numeroLead,
    email: c.email,
    notas: c.notas,
    responsableId: c.responsableId ?? null,
    etapaId: c.etapaId ?? null,
    avatar: c.avatar ?? "",
    creadoEn: c.creadoEn ? c.creadoEn.getTime() : null,
    presupuestoTotal: pres?.total ?? 0,
    items: items.map((i) => ({
      id: i.id,
      productoId: i.productoId ?? null,
      descripcion: i.descripcion,
      cantidad: i.cantidad,
      precioUnit: i.precioUnit,
    })),
  };
}

export async function actualizarContacto(
  contactoId: number,
  data: {
    nombre: string;
    email: string;
    notas: string;
    responsableId: number | null;
    etapaId: number | null;
  }
) {
  // Si intenta mover a la etapa de éxito, exige presupuesto (gate).
  if (data.etapaId != null) {
    const [etapa] = await db.select().from(waEtapas).where(eq(waEtapas.id, data.etapaId));
    if (etapa?.esExito) {
      const conPres = await idsConPresupuesto();
      if (!conPres.has(contactoId)) {
        return {
          ok: false as const,
          error: "Cargá un presupuesto antes de mover el lead a venta exitosa.",
        };
      }
    }
  }
  await db
    .update(waContactos)
    .set({
      nombre: data.nombre.trim(),
      email: data.email.trim(),
      notas: data.notas,
      responsableId: data.responsableId ?? null,
      etapaId: data.etapaId ?? null,
    })
    .where(eq(waContactos.id, contactoId));
  revalidatePath("/whatsapp");
  return { ok: true as const };
}

// Guarda (reemplaza) el presupuesto del lead con la lista de ítems dada.
export async function guardarPresupuesto(
  contactoId: number,
  items: PresupuestoItemInput[]
) {
  const limpios = items
    .map((i) => ({
      productoId: i.productoId ?? null,
      descripcion: (i.descripcion || "").trim(),
      cantidad: Math.max(1, Math.floor(Number(i.cantidad) || 1)),
      precioUnit: Math.max(0, Number(i.precioUnit) || 0),
    }))
    .filter((i) => i.descripcion || i.productoId);
  const total = limpios.reduce((a, i) => a + i.cantidad * i.precioUnit, 0);

  let [pres] = await db
    .select()
    .from(waPresupuestos)
    .where(eq(waPresupuestos.contactoId, contactoId))
    .orderBy(desc(waPresupuestos.id))
    .limit(1);
  if (!pres) {
    [pres] = await db
      .insert(waPresupuestos)
      .values({ contactoId, total })
      .returning();
  } else {
    await db.update(waPresupuestos).set({ total }).where(eq(waPresupuestos.id, pres.id));
    await db.delete(waPresupuestoItems).where(eq(waPresupuestoItems.presupuestoId, pres.id));
  }
  if (limpios.length) {
    await db
      .insert(waPresupuestoItems)
      .values(limpios.map((i) => ({ presupuestoId: pres.id, ...i })));
  }
  revalidatePath("/whatsapp");
  return { ok: true as const, total };
}

// Mueve el lead a la etapa de "venta exitosa" si tiene presupuesto cargado.
export async function marcarVentaExitosa(contactoId: number) {
  const [etapa] = await db.select().from(waEtapas).where(eq(waEtapas.esExito, true)).limit(1);
  if (!etapa) {
    return { ok: false as const, error: "No hay una etapa de venta exitosa configurada." };
  }
  const [pres] = await db
    .select()
    .from(waPresupuestos)
    .where(eq(waPresupuestos.contactoId, contactoId))
    .orderBy(desc(waPresupuestos.id))
    .limit(1);
  if (!pres || pres.total <= 0) {
    return {
      ok: false as const,
      error: "Cargá un presupuesto (con monto) antes de marcar la venta como exitosa.",
    };
  }
  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${waContactos.orden}), -1)` })
    .from(waContactos)
    .where(eq(waContactos.etapaId, etapa.id));
  await db
    .update(waContactos)
    .set({ etapaId: etapa.id, orden: Number(max) + 1 })
    .where(eq(waContactos.id, contactoId));
  revalidatePath("/whatsapp");
  return { ok: true as const, etapaId: etapa.id };
}

export async function refrescarAvatar(contactoId: number) {
  const avatar = await getManager().refreshAvatar(contactoId);
  revalidatePath("/whatsapp");
  return { ok: true as const, avatar };
}
