/**
 * WhatsApp del local. Se usa SOLO para consultas o problemas: las compras se
 * cierran en el carrito con Mercado Pago, no por WhatsApp.
 */

/** Número en formato internacional, sin signos. */
export const WHATSAPP_NUMERO = "543794525617";

/** Cómo se muestra el número en pantalla. */
export const WHATSAPP_VISIBLE = "3794 525617";

/** Texto del botón/llamado a la acción de soporte. */
export const WHATSAPP_SOPORTE_TEXTO = "Si tenés un problema, comunicate con nosotros.";

/** Mensaje con el que arranca el chat de soporte. */
const MENSAJE_INICIAL = "¡Hola! Tengo una consulta sobre mi pedido.";

export const WHATSAPP_SOPORTE_URL = `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(
  MENSAJE_INICIAL
)}`;
