import { listTiendaProductos } from "@/lib/tienda";
import type { ItemRemito, LecturaRemito } from "@/lib/recepcion";

// API compatible con el formato OpenAI. DEEPSEEK_BASE_URL sólo hace falta si
// se apunta a otro proveedor compatible o a un proxy.
const BASE_URL = (process.env.DEEPSEEK_BASE_URL?.trim() || "https://api.deepseek.com").replace(/\/+$/, "");
const DEEPSEEK_URL = `${BASE_URL}/chat/completions`;
const MODEL = process.env.DEEPSEEK_MODEL?.trim() || "deepseek-v4-flash";
const TIMEOUT_MS = 60_000;

export const MAX_HISTORY = 12;
export const MAX_MESSAGE_CHARS = 500;

type Message = { role: "system" | "user" | "assistant"; content: string };

function apiKey(): string {
  const key = process.env.DEEPSEEK_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "Falta DEEPSEEK_API_KEY. Agregá tu clave de DeepSeek al archivo .env del servidor."
    );
  }
  return key;
}

async function complete(messages: Message[], maxTokens = 1024): Promise<string> {
  const res = await fetch(DEEPSEEK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey()}`,
    },
    body: JSON.stringify({ model: MODEL, messages, max_tokens: maxTokens, temperature: 0.7 }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch((e: Error) => {
    throw new Error(
      e.name === "TimeoutError"
        ? "DeepSeek tardó demasiado en responder. Probá de nuevo."
        : `No se pudo conectar con DeepSeek: ${e.message}`
    );
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`DeepSeek rechazó la solicitud (${res.status}): ${detail}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("DeepSeek devolvió una respuesta vacía.");
  return text;
}

export function aiHabilitado(): boolean {
  return Boolean(process.env.DEEPSEEK_API_KEY?.trim());
}

export async function generarDescripcionProducto(input: {
  nombre: string;
  categoria?: string;
  detalles?: string;
}): Promise<string> {
  return complete(
    [
      {
        role: "system",
        content:
          "Sos un copywriter experto en e-commerce. Escribís descripciones persuasivas, claras y breves en español rioplatense neutro. Devolvé solo la descripción, sin títulos ni comillas.",
      },
      {
        role: "user",
        content:
          `Producto: ${input.nombre}\nCategoría: ${input.categoria ?? "General"}\nDetalles: ${input.detalles || "(sin detalles adicionales)"}\n\nEscribí una descripción de venta de 2-3 párrafos cortos, con beneficios concretos y un cierre que invite a la compra.`,
      },
    ],
    1024
  );
}

export async function generarPublicacionRedes(input: {
  nombre: string;
  red: "instagram" | "facebook" | "tiktok" | "whatsapp";
  promo?: string;
}): Promise<string> {
  return complete(
    [
      {
        role: "system",
        content:
          "Sos community manager de un comercio. Creá publicaciones atractivas con gancho, emojis con criterio y llamado a la acción. Usá español rioplatense neutro.",
      },
      {
        role: "user",
        content: `Producto: ${input.nombre}\nRed social: ${input.red}\nPromoción/ángulo: ${input.promo || "destacar el producto"}\n\nGenerá una publicación lista para copiar y pegar, con 5-8 hashtags relevantes al final.`,
      },
    ],
    1024
  );
}

export async function chatNegocio(input: {
  mensajes: { rol: string; texto: string }[];
  contexto: string;
}): Promise<string> {
  const messages = input.mensajes
    .filter((m) => m.texto.trim())
    .map((m) => ({
      role: m.rol === "assistant" ? ("assistant" as const) : ("user" as const),
      content: m.texto,
    }));
  if (messages.length === 0) throw new Error("No hay ningún mensaje para responder.");

  return complete(
    [
      {
        role: "system",
        content:
          "Sos un asistente de negocios integrado a un ERP argentino. Respondé exclusivamente usando el contexto. Sé breve, directo y no inventes datos.\n\nDATOS DEL NEGOCIO:\n" +
          input.contexto,
      },
      ...messages,
    ],
    900
  );
}

export async function askDeepSeek(
  messages: { role: "user" | "assistant"; content: string }[]
): Promise<string> {
  const products = await listTiendaProductos();
  const catalog = products
    .map(
      (p) =>
        `- ${p.name}: $${p.price} ${p.available && p.stock > 0 ? `(stock ${p.stock})` : "(sin stock)"}`
    )
    .join("\n");

  return complete(
    [
      {
        role: "system",
        content:
          "Sos el asistente virtual de una tienda online argentina. Respondé en español rioplatense, cordial y breve. Hablá solo de productos, precios, stock y compras. No inventes datos.\n\nCATÁLOGO ACTUAL:\n" +
          catalog,
      },
      ...messages,
    ],
    700
  );
}

export async function consultaNegocio(input: {
  pregunta: string;
  contexto: string;
}): Promise<string> {
  return complete(
    [
      {
        role: "system",
        content:
          "Sos un asistente de negocios integrado a un ERP. Respondé exclusivamente usando los datos del contexto. Sé breve y no inventes datos.\n\nDATOS DEL NEGOCIO:\n" +
          input.contexto,
      },
      { role: "user", content: input.pregunta },
    ],
    700
  );
}

// ---------------------------------------------------------------------------
// Visión (leer fotos de remitos)
// ---------------------------------------------------------------------------
// DeepSeek expone el formato de OpenAI, así que la llamada con imagen es la
// misma en cualquier proveedor compatible: se manda un `content` con partes y
// una de ellas es `image_url` con la foto en base64.
//
// Por defecto usa la misma cuenta/modelo de DeepSeek: si el modelo configurado
// acepta imágenes, no hay nada que tocar. Si no las acepta, se apunta SOLO el
// paso de visión a otro proveedor con VISION_API_KEY / VISION_BASE_URL /
// VISION_MODEL, y todo el resto de la app sigue funcionando con DeepSeek.
const VISION_BASE_URL = (
  process.env.VISION_BASE_URL?.trim() ||
  process.env.DEEPSEEK_BASE_URL?.trim() ||
  "https://api.deepseek.com"
).replace(/\/+$/, "");
const VISION_MODEL = process.env.VISION_MODEL?.trim() || MODEL;

function visionKey(): string {
  return process.env.VISION_API_KEY?.trim() || process.env.DEEPSEEK_API_KEY?.trim() || "";
}

export function visionHabilitada(): boolean {
  return Boolean(visionKey());
}

type ParteContenido =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

type MensajeVision = { role: "system" | "user"; content: string | ParteContenido[] };

export type ImagenEntrada = {
  base64: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
};

const AYUDA_VISION =
  "Puede que el modelo configurado no acepte imágenes. Configurá VISION_API_KEY, VISION_BASE_URL " +
  "y VISION_MODEL con un proveedor compatible con OpenAI que lea imágenes, o cargá el detalle a " +
  "mano y usá Analizar detalle.";

async function completeVision(messages: MensajeVision[], maxTokens = 2048): Promise<string> {
  const key = visionKey();
  if (!key) {
    throw new Error("Falta DEEPSEEK_API_KEY (o VISION_API_KEY) para poder leer la imagen.");
  }

  const res = await fetch(`${VISION_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: VISION_MODEL, messages, max_tokens: maxTokens, temperature: 0 }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch((e: Error) => {
    throw new Error(
      e.name === "TimeoutError"
        ? "El modelo tardó demasiado en leer la imagen. Probá de nuevo con una foto más liviana."
        : `No se pudo conectar con el servicio de visión: ${e.message}`
    );
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    // Un 4xx acá casi siempre significa "este modelo es de texto": conviene
    // decir cómo se arregla en vez de escupir el error crudo.
    const pista = res.status >= 400 && res.status < 500 ? ` ${AYUDA_VISION}` : "";
    throw new Error(`El servicio de visión rechazó la imagen (${res.status}): ${detail}${pista}`);
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("El modelo no devolvió nada al leer la imagen.");
  return text;
}

function dataUrl(img: ImagenEntrada): string {
  return `data:${img.mediaType};base64,${img.base64}`;
}

export async function transcribirImagen(input: ImagenEntrada): Promise<string> {
  return completeVision([
    {
      role: "user",
      content: [
        {
          type: "text",
          text:
            "Transcribí este comprobante de compra (remito o factura) tal cual está, respetando " +
            "el orden de las líneas. Devolvé solo el texto, sin comentarios. Lo que no se llegue " +
            "a leer, marcalo como [ilegible].",
        },
        { type: "image_url", image_url: { url: dataUrl(input) } },
      ],
    },
  ]);
}

// ---------------------------------------------------------------------------
// Lectura estructurada del remito
// ---------------------------------------------------------------------------
const INSTRUCCIONES_REMITO = `Sos un asistente que digitaliza remitos y facturas de compra de un comercio argentino.
Devolvé EXCLUSIVAMENTE un objeto JSON con esta forma, sin texto alrededor y sin bloques de código:

{"proveedor":"","total":0,"items":[{"descripcion":"","codigo":"","cantidad":1,"precioUnit":0}]}

Reglas:
- Un item por cada renglón de mercadería. No inventes renglones ni completes lo que no está.
- "descripcion": el nombre del producto tal como figura, sin el código ni las cantidades.
- "codigo": código interno, SKU o código de barras si aparece; si no, cadena vacía.
- "cantidad": unidades compradas (número). Si no se indica, 1.
- "precioUnit": precio unitario sin impuestos si se distingue; si solo hay importe total del renglón, dividilo por la cantidad. Si no hay precio, 0.
- Los números van en formato JSON, con punto decimal y sin separador de miles (1234.56).
- Ignorá subtotales, IVA, percepciones, descuentos generales y totales: eso no son items.
- Si un renglón está tachado, roto o ilegible, NO lo adivines: omitilo.
- "total": el total del comprobante si se lee; si no, 0.`;

function extraerJson(raw: string): unknown {
  const limpio = raw
    .replace(/^\s*```(?:json)?/i, "")
    .replace(/```\s*$/, "")
    .trim();
  try {
    return JSON.parse(limpio);
  } catch {
    // El modelo a veces envuelve el JSON en una frase: agarramos del primer { al último }.
    const desde = limpio.indexOf("{");
    const hasta = limpio.lastIndexOf("}");
    if (desde === -1 || hasta <= desde) {
      throw new Error("La IA no devolvió un JSON válido con los items del remito.");
    }
    try {
      return JSON.parse(limpio.slice(desde, hasta + 1));
    } catch {
      throw new Error("La IA no devolvió un JSON válido con los items del remito.");
    }
  }
}

// Acepta 1234.56, "1.234,56" y "1,234.56": el modelo no siempre respeta el
// formato pedido y un precio mal leído se arrastra hasta el costo del producto.
function numero(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v ?? "").replace(/[^\d.,-]/g, "").trim();
  if (!s) return 0;
  const coma = s.lastIndexOf(",");
  const punto = s.lastIndexOf(".");
  let limpio = s;
  if (coma > -1 && punto > -1) {
    // El separador decimal es el que aparece último.
    limpio = coma > punto ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (coma > -1) {
    limpio = s.replace(",", ".");
  }
  const n = Number(limpio);
  return Number.isFinite(n) ? n : 0;
}

function parseLectura(raw: string): LecturaRemito {
  const data = extraerJson(raw) as { proveedor?: unknown; total?: unknown; items?: unknown };
  const crudos = Array.isArray(data.items) ? data.items : [];
  const items: ItemRemito[] = crudos
    .map((it) => {
      const o = (it ?? {}) as Record<string, unknown>;
      const cantidad = Math.round(numero(o.cantidad));
      return {
        descripcion: String(o.descripcion ?? "").trim().slice(0, 200),
        codigo: String(o.codigo ?? "").trim().slice(0, 60),
        cantidad: cantidad > 0 ? cantidad : 1,
        precioUnit: Math.max(0, numero(o.precioUnit)),
      };
    })
    .filter((it) => it.descripcion.length > 1);

  return {
    proveedor: String(data.proveedor ?? "").trim().slice(0, 120),
    total: Math.max(0, numero(data.total)),
    items,
  };
}

/** Lee la foto del remito y devuelve los renglones ya separados. */
export async function leerRemitoImagen(input: ImagenEntrada): Promise<LecturaRemito> {
  const raw = await completeVision(
    [
      {
        role: "user",
        content: [
          { type: "text", text: INSTRUCCIONES_REMITO },
          { type: "image_url", image_url: { url: dataUrl(input) } },
        ],
      },
    ],
    2500
  );
  return parseLectura(raw);
}

/**
 * La misma lectura pero a partir de texto ya cargado (el detalle escrito a mano
 * o transcripto). Esta ruta usa el modelo de texto de DeepSeek, así que funciona
 * siempre, tenga o no visión la cuenta.
 */
export async function leerRemitoTexto(texto: string): Promise<LecturaRemito> {
  const recorte = texto.trim().slice(0, 12_000);
  if (!recorte) throw new Error("No hay detalle para analizar.");
  const raw = await complete(
    [
      { role: "system", content: INSTRUCCIONES_REMITO },
      { role: "user", content: `Detalle del comprobante:\n\n${recorte}` },
    ],
    2500
  );
  return parseLectura(raw);
}
