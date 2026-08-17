// Integración con MercadoPago — Checkout Pro vía API REST (sin SDK, solo fetch),
// para no sumar dependencias nativas. El comprador paga en la página de MP
// (link + QR + tarjetas) y el pago se confirma por webhook.
// Docs: https://www.mercadopago.com.ar/developers/es/reference/preferences/_checkout_preferences/post

const MP_API = "https://api.mercadopago.com";

// ¿Hay credencial cargada? Permite que la tienda muestre un estado amigable
// cuando todavía no se configuró MercadoPago.
export function mercadopagoConfigurado(): boolean {
  return Boolean(process.env.MP_ACCESS_TOKEN);
}

function token(): string {
  const t = process.env.MP_ACCESS_TOKEN;
  if (!t) throw new Error("MP_ACCESS_TOKEN no está configurado en el entorno.");
  return t;
}

// URL pública del sitio (VPS) para back_urls y notification_url. Sin barra final.
function baseUrl(): string {
  return (process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
}

export type ItemPreferencia = {
  title: string;
  quantity: number;
  unit_price: number;
};

// Crea una preferencia de Checkout Pro y devuelve el link al que redirigir al
// comprador. external_reference = id de la venta pendiente, para reconciliar en
// el webhook.
export async function crearPreferencia(opts: {
  items: ItemPreferencia[];
  ventaId: number;
}): Promise<{ id: string; initPoint: string }> {
  const base = baseUrl();
  const esHttps = base.startsWith("https://");

  const body: Record<string, unknown> = {
    items: opts.items.map((it) => ({
      title: it.title,
      quantity: it.quantity,
      unit_price: it.unit_price,
      currency_id: "ARS",
    })),
    external_reference: String(opts.ventaId),
    back_urls: {
      success: `${base}/tienda/checkout/resultado?status=approved`,
      pending: `${base}/tienda/checkout/resultado?status=pending`,
      failure: `${base}/tienda/checkout/resultado?status=rejected`,
    },
    notification_url: `${base}/api/mp/webhook`,
  };
  // auto_return exige back_urls válidas (HTTPS). En http (dev) lo omitimos para
  // que la creación de la preferencia no falle.
  if (esHttps) body.auto_return = "approved";

  const res = await fetch(`${MP_API}/checkout/preferences`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token()}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detalle = await res.text().catch(() => "");
    throw new Error(`MercadoPago rechazó la preferencia (${res.status}): ${detalle}`);
  }

  // Con token TEST la API ya devuelve init_point apuntando al sandbox.
  const data = (await res.json()) as { id: string; init_point: string };
  return { id: data.id, initPoint: data.init_point };
}

// Consulta el estado de un pago. Devuelve null si no se pudo obtener.
export async function obtenerPago(
  paymentId: string
): Promise<{ status: string; externalReference: string | null } | null> {
  const res = await fetch(`${MP_API}/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${token()}` },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { status: string; external_reference: string | null };
  return { status: data.status, externalReference: data.external_reference ?? null };
}
