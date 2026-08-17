/**
 * Reglas y textos de la entrega a domicilio (única modalidad: no hay retiro
 * por sucursal). Centralizado acá para que el carrito, el checkout, el panel
 * y las etiquetas usen exactamente los mismos rangos y las mismas leyendas.
 */

/** Rangos horarios en los que se puede recibir el pedido. */
export const DELIVERY_SLOTS = [
  { id: "08-12", label: "08:00 a 12:00", detalle: "Mañana", cutoffMinutes: 21 * 60 },
  { id: "17-20", label: "17:00 a 20:00", detalle: "Tarde", cutoffMinutes: 12 * 60 },
] as const;

export type DeliverySlotId = (typeof DELIVERY_SLOTS)[number]["id"];

/** ¿El valor recibido es uno de los rangos válidos? */
export function isDeliverySlot(value: unknown): value is DeliverySlotId {
  return DELIVERY_SLOTS.some((s) => s.id === value);
}

/** Etiqueta legible de un rango ("08:00 a 12:00"), o null si no es válido. */
export function deliverySlotLabel(id?: string | null): string | null {
  return DELIVERY_SLOTS.find((s) => s.id === id)?.label ?? null;
}

export const ARGENTINA_TIME_ZONE = "America/Argentina/Buenos_Aires";

export interface EstimatedDeliveryOption {
  /** Identificador único de la opción, incluso si dos fechas usan la misma franja. */
  key: string;
  id: DeliverySlotId;
  /** Fecha calendario de Argentina, en formato YYYY-MM-DD. */
  date: string;
  /** Ejemplo: "Viernes 1/8 · 8:00–12:00". */
  label: string;
}

interface ArgentinaDateTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function argentinaDateTime(now: Date): ArgentinaDateTime {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ARGENTINA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
  };
}

function isDeliveryDay(date: Date, slotId: DeliverySlotId): boolean {
  const weekday = date.getUTCDay();
  if (weekday === 0) return false;
  return slotId === "08-12" || weekday !== 6;
}

function firstDeliveryDay(date: Date, slotId: DeliverySlotId): Date {
  const target = new Date(date);
  while (!isDeliveryDay(target, slotId)) target.setUTCDate(target.getUTCDate() + 1);
  return target;
}

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Etiqueta de una fecha YYYY-MM-DD sin depender de la zona horaria del equipo. */
export function deliveryDateLabel(date?: string | null): string | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || dateOnly(parsed) !== date) return null;
  const weekday = new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    timeZone: "UTC",
  }).format(parsed);
  const capitalized = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  return `${capitalized} ${parsed.getUTCDate()}/${parsed.getUTCMonth() + 1}`;
}

/** Fecha y franja completas; en pedidos anteriores, conserva al menos la franja. */
export function deliveryEstimateLabel(
  slotId?: string | null,
  date?: string | null
): string | null {
  const slot = DELIVERY_SLOTS.find((item) => item.id === slotId);
  const dateLabel = deliveryDateLabel(date);
  if (!slot) return null;
  if (!dateLabel) return slot.label;
  return `${dateLabel} · ${slot.label.replace(/^0/, "").replace(" a ", "–")}`;
}

/**
 * Calcula las próximas entregas usando siempre hora Argentina.
 *
 * - Mañana: se entrega de lunes a sábado; el cambio de fecha cierra a las 21:00.
 * - Tarde: se entrega de lunes a viernes; el turno del día cierra a las 12:00.
 * - Al alcanzar cada corte, esa franja pasa al próximo día disponible.
 */
export function estimatedDeliveryOptions(now = new Date()): EstimatedDeliveryOption[] {
  const local = argentinaDateTime(now);
  const today = new Date(Date.UTC(local.year, local.month - 1, local.day));
  const minutes = local.hour * 60 + local.minute;

  const options = DELIVERY_SLOTS.map((slot) => {
    const candidate = new Date(today);
    // La mañana siempre se agenda desde el día siguiente. La tarde puede ser
    // el mismo día hasta las 12:00. Después de cada corte se avanza un día.
    if (slot.id === "08-12") candidate.setUTCDate(candidate.getUTCDate() + 1);
    if (minutes >= slot.cutoffMinutes) candidate.setUTCDate(candidate.getUTCDate() + 1);
    const target = firstDeliveryDay(candidate, slot.id);
    const date = dateOnly(target);
    return {
      key: `${slot.id}:${date}`,
      id: slot.id,
      date,
      label: deliveryEstimateLabel(slot.id, date)!,
    };
  });

  // Los viernes, desde el cierre del turno de la tarde hasta las 21:00,
  // se ofrecen dos mañanas: sábado y lunes.
  if (today.getUTCDay() === 5 && minutes >= 12 * 60 && minutes < 21 * 60) {
    const saturdayMorning = options[0];
    const mondayDate = options[1].date;
    return [
      saturdayMorning,
      {
        key: `08-12:${mondayDate}`,
        id: "08-12",
        date: mondayDate,
        label: deliveryEstimateLabel("08-12", mondayDate)!,
      },
    ];
  }

  return options;
}

/** Aviso principal de cuándo se recibe cada compra. */
export const AVISO_TURNOS =
  "Las compras realizadas por la mañana se reciben por la tarde. Las compras realizadas por la tarde se reciben por la mañana del día siguiente.";

/**
 * El mismo aviso separado por turno, para mostrarlo como dos reglas claras
 * (cada una con su ícono) en vez de un párrafo largo.
 */
export const AVISO_TURNOS_REGLAS = [
  { turno: "manana", compra: "Comprás por la mañana", entrega: "lo recibís por la tarde" },
  {
    turno: "tarde",
    compra: "Comprás por la tarde",
    entrega: "lo recibís a la mañana del día siguiente",
  },
] as const;

/** Recordatorio de cómo se debe cargar la dirección. */
export const AVISO_DIRECCION =
  "Importante: solo podemos reconocer calle y altura. No cargues piso, departamento, barrio ni referencias.";

/** Leyenda del paso del mapa. */
export const AVISO_MAPA =
  "Confirmá nuevamente que la ubicación marcada en el mapa sea la correcta: el repartidor va a ese punto exacto.";
