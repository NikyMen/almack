import { db } from "@/db";
import { usuarios } from "@/db/schema";
import { asc } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { parsePermisos } from "@/lib/permisos";
import { PageHeader } from "@/components/ui";
import { EquipoManager } from "@/components/equipo-manager";

export const dynamic = "force-dynamic";

export default async function EquipoPage() {
  await requireAdmin();
  const items = await db.select().from(usuarios).orderBy(asc(usuarios.id));

  return (
    <>
      <PageHeader
        title="Equipo"
        subtitle="Usuarios del sistema: definí qué puede ver y gestionar cada integrante."
      />
      <EquipoManager
        items={items.map((u) => ({
          id: u.id,
          nombre: u.nombre,
          usuario: u.usuario,
          email: u.email,
          rol: u.rol === "admin" ? "admin" : "miembro",
          permisos: parsePermisos(u.permisos),
          activo: u.activo,
        }))}
      />
    </>
  );
}
