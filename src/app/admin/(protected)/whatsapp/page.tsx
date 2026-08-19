import { db } from "@/db";
import { waEtapas, waContactos, waPresupuestos, usuarios, productos } from "@/db/schema";
import { asc, eq, gt } from "drizzle-orm";
import { requireAcceso } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { WhatsappBoard } from "@/components/whatsapp-board";
import { getManager, toContactoDTO } from "@/lib/whatsapp/manager";

export const dynamic = "force-dynamic";

export default async function WhatsappPage() {
  await requireAcceso("whatsapp");

  const etapas = await db.select().from(waEtapas).orderBy(asc(waEtapas.orden));
  const contactos = await db
    .select()
    .from(waContactos)
    .orderBy(asc(waContactos.orden), asc(waContactos.id));

  // Contactos con presupuesto cargado (para el gate de "venta exitosa")
  const presRows = await db
    .select({ contactoId: waPresupuestos.contactoId })
    .from(waPresupuestos)
    .where(gt(waPresupuestos.total, 0));
  const conPresupuesto = new Set(presRows.map((r) => r.contactoId));

  const equipo = await db
    .select({ id: usuarios.id, nombre: usuarios.nombre })
    .from(usuarios)
    .where(eq(usuarios.activo, true))
    .orderBy(asc(usuarios.nombre));

  const prods = await db
    .select({ id: productos.id, nombre: productos.nombre, precioVenta: productos.precioVenta })
    .from(productos)
    .orderBy(asc(productos.nombre));

  const snap = getManager().snapshot();

  return (
    <>
      <PageHeader
        title="WhatsApp"
        subtitle="CRM de conversaciones — vinculá tu WhatsApp y gestioná tus leads en un tablero kanban."
      />
      <WhatsappBoard
        etapas={etapas.map((e) => ({
          id: e.id,
          nombre: e.nombre,
          color: e.color,
          orden: e.orden,
          esExito: e.esExito,
        }))}
        contactosIniciales={contactos.map((c) => toContactoDTO(c, conPresupuesto.has(c.id)))}
        equipo={equipo}
        productos={prods}
        snapInicial={snap}
      />
    </>
  );
}
