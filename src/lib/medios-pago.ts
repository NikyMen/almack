// Catálogo de medios de pago. Vive en lib (y no en las server actions) para
// poder importarse desde componentes de cliente sin arrastrar código de servidor.

import { Banknote, QrCode, CreditCard, type LucideIcon } from "lucide-react";

export type MedioPago = "efectivo" | "qr" | "tarjeta" | "mercadopago";

export const MEDIOS_PAGO: MedioPago[] = ["efectivo", "qr", "tarjeta", "mercadopago"];

export const ETIQUETA_MEDIO: Record<MedioPago, string> = {
  efectivo: "Efectivo",
  qr: "QR",
  tarjeta: "Tarjeta",
  mercadopago: "MercadoPago",
};

// Los que se ofrecen en el mostrador. MercadoPago no está: lo cobra la tienda
// online por su propio checkout.
export const MEDIOS_PAGO_UI: { id: MedioPago; label: string; icon: LucideIcon }[] = [
  { id: "efectivo", label: "Efectivo", icon: Banknote },
  { id: "qr", label: "QR", icon: QrCode },
  { id: "tarjeta", label: "Tarjeta", icon: CreditCard },
];
