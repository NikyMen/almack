import { recientes } from "@/lib/queries";
import { requireAcceso } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { FacturasTabla } from "@/components/facturas-tabla";
import { money } from "@/lib/format";

export default async function FacturacionPage() {
  await requireAcceso("facturacion");
  const facturas = await recientes.facturas();
  const total = facturas.reduce((a, f) => a + (f.estado !== "anulada" ? f.total : 0), 0);
  return (
    <>
      <PageHeader title="Facturación" subtitle={`${facturas.length} comprobantes · ${money(total)} emitido`} />
      <FacturasTabla facturas={facturas} />
    </>
  );
}
