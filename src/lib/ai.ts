import { listTiendaProductos } from "@/lib/tienda";

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const MODEL = process.env.DEEPSEEK_MODEL?.trim() || "deepseek-v4-flash";

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

export async function transcribirImagen(_input: {
  base64: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
}): Promise<string> {
  throw new Error(
    "La transcripción de imágenes no está disponible con DeepSeek. Cargá el detalle del comprobante manualmente."
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
