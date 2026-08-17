// Manager singleton de WhatsApp (Baileys).
//
// Baileys mantiene una conexión WebSocket persistente con WhatsApp. En Next.js
// el proceso del servidor es de larga vida en dev, pero los módulos se re-evalúan
// con el HMR de Turbopack. Para no abrir varias sesiones guardamos la instancia
// en `globalThis`. Todas las server actions y la ruta SSE comparten este proceso,
// así que pueden acceder al mismo socket.

import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";
import pino from "pino";
import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} from "baileys";
import { eq, asc, and, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { waContactos, waEtapas, waMensajes } from "@/db/schema";

export type WaStatus = "idle" | "connecting" | "qr" | "open" | "close";

// DTOs serializables (timestamps en ms) — misma forma en carga inicial y en SSE.
export type ContactoDTO = {
  id: number;
  jid: string;
  telefono: string;
  numeroLead: string;
  nombre: string;
  avatar: string;
  responsableId: number | null;
  tienePresupuesto: boolean;
  etapaId: number | null;
  orden: number;
  ultimoMensaje: string;
  ultimoMensajeEn: number;
  noLeidos: number;
};

export type MensajeDTO = {
  id: number;
  contactoId: number;
  desdeMi: boolean;
  texto: string;
  tipo: string;
  timestamp: number;
};

export type WaSnapshot = {
  status: WaStatus;
  qr: string | null;
  me: { id: string; nombre: string } | null;
};

// Configuración / presupuesto del lead (compartido entre actions y UI)
export type PresupuestoItemInput = {
  productoId: number | null;
  descripcion: string;
  cantidad: number;
  precioUnit: number;
};

export type DetalleContacto = {
  id: number;
  nombre: string;
  telefono: string;
  numeroLead: string;
  email: string;
  notas: string;
  responsableId: number | null;
  etapaId: number | null;
  avatar: string;
  creadoEn: number | null;
  presupuestoTotal: number;
  items: (PresupuestoItemInput & { id: number })[];
};

const AUTH_DIR = path.join(process.cwd(), ".wa-auth");

// --- Helpers de extracción de mensajes --------------------------------------
function unwrap(m: any): any {
  if (!m) return m;
  return (
    m.ephemeralMessage?.message ||
    m.viewOnceMessage?.message ||
    m.viewOnceMessageV2?.message ||
    m.documentWithCaptionMessage?.message ||
    m
  );
}

function extractText(message: any): string {
  const m = unwrap(message);
  if (!m) return "";
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    m.buttonsResponseMessage?.selectedDisplayText ||
    m.listResponseMessage?.title ||
    ""
  );
}

function messageType(message: any): string {
  const m = unwrap(message);
  if (!m) return "otro";
  if (m.conversation || m.extendedTextMessage) return "texto";
  if (m.imageMessage) return "imagen";
  if (m.audioMessage) return "audio";
  if (m.videoMessage) return "video";
  if (m.documentMessage) return "documento";
  if (m.stickerMessage) return "sticker";
  if (m.locationMessage) return "ubicacion";
  if (m.contactMessage || m.contactsArrayMessage) return "contacto";
  return "otro";
}

const placeholders: Record<string, string> = {
  imagen: "📷 Imagen",
  audio: "🎵 Audio",
  video: "🎬 Video",
  documento: "📄 Documento",
  sticker: "🟡 Sticker",
  ubicacion: "📍 Ubicación",
  contacto: "👤 Contacto",
};

// Resuelve la identidad de la OTRA parte a partir del jid del chat y su jid
// alterno. Cualquiera de los dos puede ser la forma @lid (cuentas con identidad
// LID de WhatsApp) o la forma @s.whatsapp.net (teléfono real). Devolvemos el
// teléfono real (sin sufijo) si lo conocemos y el jid @lid si aparece. Esto
// permite matchear de forma consistente aunque WhatsApp mande el alterno o no.
function resolverIdentidad(
  jid: string,
  altJid?: string
): { telefono: string; lidJid?: string } {
  let telefono = "";
  let lidJid: string | undefined;
  for (const j of [jid, altJid]) {
    if (!j) continue;
    if (j.endsWith("@lid")) lidJid = j;
    else telefono = j.split("@")[0].split(":")[0];
  }
  return { telefono, lidJid };
}

function toContactoDTO(
  c: typeof waContactos.$inferSelect,
  tienePresupuesto = false
): ContactoDTO {
  return {
    id: c.id,
    jid: c.jid,
    telefono: c.telefono,
    numeroLead: c.numeroLead,
    nombre: c.nombre,
    avatar: c.avatar ?? "",
    responsableId: c.responsableId ?? null,
    tienePresupuesto,
    etapaId: c.etapaId ?? null,
    orden: c.orden,
    ultimoMensaje: c.ultimoMensaje,
    ultimoMensajeEn: c.ultimoMensajeEn ? c.ultimoMensajeEn.getTime() : Date.now(),
    noLeidos: c.noLeidos,
  };
}

function toMensajeDTO(m: typeof waMensajes.$inferSelect): MensajeDTO {
  return {
    id: m.id,
    contactoId: m.contactoId,
    desdeMi: m.desdeMi,
    texto: m.texto,
    tipo: m.tipo,
    timestamp: m.timestamp ? m.timestamp.getTime() : Date.now(),
  };
}

// ---------------------------------------------------------------------------
class WhatsAppManager extends EventEmitter {
  private sock: ReturnType<typeof makeWASocket> | null = null;
  status: WaStatus = "idle";
  qr: string | null = null;
  me: { id: string; nombre: string } | null = null;
  private starting = false;

  constructor() {
    super();
    this.setMaxListeners(50); // varias pestañas/SSE pueden suscribirse
  }

  snapshot(): WaSnapshot {
    return { status: this.status, qr: this.qr, me: this.me };
  }

  hasSession(): boolean {
    return existsSync(path.join(AUTH_DIR, "creds.json"));
  }

  private setStatus(s: WaStatus) {
    this.status = s;
    this.emit("status", this.snapshot());
  }

  async connect(): Promise<WaSnapshot> {
    if (this.sock || this.starting) return this.snapshot();
    this.starting = true;
    try {
      const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
      const logger = pino({ level: "silent" });
      let version: [number, number, number] | undefined;
      try {
        ({ version } = await fetchLatestBaileysVersion());
      } catch {
        /* sin conexión a la lista de versiones: Baileys usa la integrada */
      }

      const sock = makeWASocket({
        version,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        logger,
        browser: ["GestorIA", "Chrome", "120.0.0"],
        markOnlineOnConnect: false,
        syncFullHistory: false,
        generateHighQualityLinkPreview: false,
      });
      this.sock = sock;
      this.setStatus("connecting");

      sock.ev.on("creds.update", saveCreds);

      sock.ev.on("connection.update", async (u: any) => {
        const { connection, lastDisconnect, qr } = u;
        if (qr) {
          try {
            this.qr = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
            this.setStatus("qr");
          } catch {
            /* ignore */
          }
        }
        if (connection === "open") {
          this.qr = null;
          const u = sock.user as any;
          this.me = { id: u?.id ?? "", nombre: u?.name || u?.verifiedName || u?.notify || "" };
          this.setStatus("open");
          console.log("[whatsapp] conectado como", this.me?.nombre || this.me?.id);
        }
        if (connection === "close") {
          this.sock = null;
          const code = (lastDisconnect?.error as any)?.output?.statusCode;
          if (code === DisconnectReason.loggedOut) {
            this.me = null;
            this.qr = null;
            await rm(AUTH_DIR, { recursive: true, force: true }).catch(() => {});
            this.setStatus("idle");
          } else {
            this.setStatus("close");
            setTimeout(() => this.connect().catch(() => {}), 3000); // reconexión
          }
        }
      });

      sock.ev.on("messages.upsert", async (up: any) => {
        console.log(`[whatsapp] messages.upsert tipo=${up.type} n=${up.messages?.length ?? 0}`);
        if (up.type !== "notify") return; // solo mensajes en vivo, no sync histórico
        for (const m of up.messages) {
          try {
            await this.handleIncoming(m);
          } catch (e) {
            console.error("[whatsapp] error procesando mensaje", e);
          }
        }
      });

      return this.snapshot();
    } finally {
      this.starting = false;
    }
  }

  async logout(): Promise<WaSnapshot> {
    try {
      await this.sock?.logout();
    } catch {
      /* ignore */
    }
    this.sock = null;
    this.me = null;
    this.qr = null;
    await rm(AUTH_DIR, { recursive: true, force: true }).catch(() => {});
    this.setStatus("idle");
    return this.snapshot();
  }

  async sendText(contactoId: number, texto: string): Promise<MensajeDTO> {
    if (!this.sock || this.status !== "open") {
      throw new Error("WhatsApp no está conectado");
    }
    const [contacto] = await db
      .select()
      .from(waContactos)
      .where(eq(waContactos.id, contactoId));
    if (!contacto) throw new Error("Contacto no encontrado");

    // Si el contacto quedó identificado sólo por @lid pero conocemos su
    // teléfono, enviamos a la forma @s.whatsapp.net (más fiable).
    const dest =
      contacto.jid.endsWith("@lid") && contacto.telefono
        ? `${contacto.telefono}@s.whatsapp.net`
        : contacto.jid;

    const sent = await this.sock.sendMessage(dest, { text: texto });
    const waId = sent?.key?.id ?? "";
    const res = await this.persist({
      remoteJid: contacto.jid,
      lidJid: contacto.lid || undefined,
      telefono: contacto.telefono,
      fromMe: true,
      texto,
      tipo: "texto",
      ts: Math.floor(Date.now() / 1000),
      waId,
    });
    if (!res) throw new Error("No se pudo guardar el mensaje");
    return res.mensaje;
  }

  // Trae la foto de perfil en segundo plano: NUNCA bloquea el envío/recepción.
  // Si la consigue, actualiza el contacto y emite el cambio por SSE.
  private async ensureAvatar(contactoId: number, jid: string, telefono: string) {
    try {
      const avatar = await this.fetchAvatar(jid, telefono);
      if (!avatar) return;
      const [upd] = await db
        .update(waContactos)
        .set({ avatar })
        .where(eq(waContactos.id, contactoId))
        .returning();
      if (upd) this.emit("contact", toContactoDTO(upd));
    } catch {
      /* ignore */
    }
  }

  async marcarLeido(contactoId: number) {
    const [c] = await db
      .update(waContactos)
      .set({ noLeidos: 0 })
      .where(eq(waContactos.id, contactoId))
      .returning();
    if (c) this.emit("contact", toContactoDTO(c));
  }

  // Foto de perfil del contacto (URL de WhatsApp). La privacidad puede bloquearla
  // → devolvemos "" y la card cae a las iniciales.
  private async fetchAvatar(jid: string, telefono?: string): Promise<string> {
    // Probamos el jid del chat y, si falla (típico en cuentas @lid), el jid
    // derivado del número real. La privacidad puede bloquearla → "".
    const intentos = [jid];
    if (telefono) intentos.push(`${telefono}@s.whatsapp.net`);
    for (const j of intentos) {
      try {
        const url = await this.sock?.profilePictureUrl(j, "image");
        if (url) return url;
      } catch {
        /* probar siguiente */
      }
    }
    return "";
  }

  // Refresca la foto de un contacto a pedido (botón en la config del lead).
  async refreshAvatar(contactoId: number): Promise<string> {
    const [c] = await db.select().from(waContactos).where(eq(waContactos.id, contactoId));
    if (!c) return "";
    const avatar = await this.fetchAvatar(c.jid, c.telefono);
    const [upd] = await db
      .update(waContactos)
      .set({ avatar })
      .where(eq(waContactos.id, contactoId))
      .returning();
    if (upd) this.emit("contact", toContactoDTO(upd));
    return avatar;
  }

  private async handleIncoming(m: any) {
    const jid: string | undefined = m.key?.remoteJid;
    if (!jid) return;
    // Ignoramos grupos, estados/difusión y newsletters. Aceptamos chats
    // personales, que pueden venir como @s.whatsapp.net o como @lid (cuentas
    // con identidad LID de WhatsApp).
    if (
      jid.endsWith("@g.us") ||
      jid.endsWith("@broadcast") ||
      jid.endsWith("@newsletter") ||
      jid === "status@broadcast"
    ) {
      return;
    }

    const tipo = messageType(m.message);
    const texto = extractText(m.message) || placeholders[tipo] || "";
    if (!texto) return; // mensaje de protocolo / reacción → ignorar

    const fromMe = !!m.key?.fromMe;
    // Número real de la OTRA parte. `remoteJidAlt` es el alterno del chat (la
    // otra parte, sin importar dirección). `senderPn`/`participantAlt` refieren
    // al REMITENTE: en un saliente el remitente sos vos, así que sólo los
    // usamos cuando el mensaje es entrante (si no, el contacto se guardaría con
    // TU número y los entrantes nunca matchearían).
    const altJid: string | undefined =
      m.key?.remoteJidAlt || (!fromMe ? m.key?.senderPn || m.key?.participantAlt : undefined);

    const { telefono, lidJid } = resolverIdentidad(jid, altJid);

    console.log(
      `[whatsapp] entrante fromMe=${fromMe} tipo=${tipo} remoteJid=${jid} alt=${altJid ?? "-"} tel=${telefono || "-"} lid=${lidJid ?? "-"}`
    );

    await this.persist({
      remoteJid: jid,
      lidJid,
      telefono,
      fromMe,
      texto,
      tipo,
      ts: Number(m.messageTimestamp) || Math.floor(Date.now() / 1000),
      waId: m.key.id ?? "",
      pushName: m.pushName ?? undefined,
    });
  }

  // Punto único de persistencia (entrantes y salientes). Devuelve null si es
  // un mensaje duplicado (ya guardado por waId).
  private async persist(data: {
    remoteJid: string; // jid del chat (puede ser @lid o @s.whatsapp.net)
    lidJid?: string; // jid @lid si se conoce
    telefono: string; // teléfono real (sin sufijo) o "" si no se conoce
    fromMe: boolean;
    texto: string;
    tipo: string;
    ts: number;
    waId: string;
    pushName?: string;
  }): Promise<{ contacto: ContactoDTO; mensaje: MensajeDTO } | null> {
    const fecha = new Date(data.ts * 1000);
    const telefono = data.telefono;
    const lidJid = data.lidJid;
    // jid canónico para guardar/enviar: preferimos la forma @s.whatsapp.net.
    const phoneJid = telefono ? `${telefono}@s.whatsapp.net` : undefined;
    const canonicalJid = phoneJid ?? data.remoteJid;

    // Buscamos el contacto por CUALQUIERA de sus identificadores conocidos:
    // teléfono, jid @lid, o el jid del chat. Así una respuesta que llega como
    // @lid matchea el contacto que se creó al enviar (guardado como
    // @s.whatsapp.net) y viceversa, sin depender de que WhatsApp mande el
    // alterno en cada mensaje. Sólo cruzamos por teléfono/lid si los conocemos.
    const ors = [eq(waContactos.jid, data.remoteJid)];
    if (phoneJid) ors.push(eq(waContactos.jid, phoneJid));
    if (telefono) ors.push(eq(waContactos.telefono, telefono));
    if (lidJid) ors.push(eq(waContactos.lid, lidJid));
    const [existente] = await db.select().from(waContactos).where(or(...ors));

    let contactoRow: typeof waContactos.$inferSelect;
    if (existente) {
      // Dedup por waId (evita doble inserción del eco de mensajes propios)
      if (data.waId) {
        const [dup] = await db
          .select({ id: waMensajes.id })
          .from(waMensajes)
          .where(
            and(eq(waMensajes.contactoId, existente.id), eq(waMensajes.waId, data.waId))
          )
          .limit(1);
        if (dup) return null;
      }
      const nombre =
        !data.fromMe && data.pushName && (!existente.nombre || existente.nombre === existente.telefono)
          ? data.pushName
          : existente.nombre;
      // Aprendemos identificadores que antes no teníamos (lid/teléfono): así el
      // matcheo se vuelve consistente para los próximos mensajes. No tocamos el
      // jid (es UNIQUE) para no arriesgar choques.
      const [upd] = await db
        .update(waContactos)
        .set({
          lid: existente.lid || lidJid || "",
          telefono: existente.telefono || telefono || "",
          nombre,
          ultimoMensaje: data.texto.slice(0, 120),
          ultimoMensajeEn: fecha,
          noLeidos: data.fromMe ? 0 : existente.noLeidos + 1,
        })
        .where(eq(waContactos.id, existente.id))
        .returning();
      contactoRow = upd;
      // Si todavía no hay foto, la traemos en segundo plano (sin bloquear).
      if (!upd.avatar) void this.ensureAvatar(upd.id, upd.jid, upd.telefono);
    } else {
      // Nuevo contacto → entra en la primera etapa (Leads entrantes)
      const [etapa] = await db
        .select()
        .from(waEtapas)
        .orderBy(asc(waEtapas.orden))
        .limit(1);
      const [{ n }] = await db
        .select({ n: sql<number>`count(*)` })
        .from(waContactos)
        .where(etapa ? eq(waContactos.etapaId, etapa.id) : sql`1=1`);
      const [ins] = await db
        .insert(waContactos)
        .values({
          jid: canonicalJid,
          lid: lidJid ?? "",
          telefono,
          // Sólo los entrantes traen el nombre real del contacto. En los
          // salientes el pushName es el del dueño de la cuenta → usamos el nº.
          nombre: !data.fromMe && data.pushName ? data.pushName : telefono || canonicalJid.split("@")[0],
          avatar: "",
          etapaId: etapa?.id ?? null,
          orden: Number(n) || 0,
          ultimoMensaje: data.texto.slice(0, 120),
          ultimoMensajeEn: fecha,
          noLeidos: data.fromMe ? 0 : 1,
        })
        .returning();
      // Nº de lead único derivado del id (estable, 1 por teléfono/jid)
      const numeroLead = `L-${String(ins.id).padStart(4, "0")}`;
      await db.update(waContactos).set({ numeroLead }).where(eq(waContactos.id, ins.id));
      contactoRow = { ...ins, numeroLead };
      // Foto en segundo plano: no bloquea el primer mensaje.
      void this.ensureAvatar(ins.id, canonicalJid, telefono);
    }

    const [msgRow] = await db
      .insert(waMensajes)
      .values({
        contactoId: contactoRow.id,
        waId: data.waId,
        desdeMi: data.fromMe,
        texto: data.texto,
        tipo: data.tipo,
        timestamp: fecha,
      })
      .returning();

    const contacto = toContactoDTO(contactoRow);
    const mensaje = toMensajeDTO(msgRow);
    this.emit("contact", contacto);
    this.emit("message", mensaje);
    return { contacto, mensaje };
  }
}

// --- Singleton en globalThis (sobrevive al HMR) -----------------------------
const globalForWa = globalThis as unknown as { __waManager?: WhatsAppManager };

export function getManager(): WhatsAppManager {
  if (!globalForWa.__waManager) {
    globalForWa.__waManager = new WhatsAppManager();
  }
  return globalForWa.__waManager;
}

export { toContactoDTO, toMensajeDTO };
