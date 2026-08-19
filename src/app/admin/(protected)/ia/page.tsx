import { requireAcceso } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { AsistenteIA } from "@/components/asistente-ia";
import { listarConversaciones } from "./actions";

export default async function IAPage() {
  await requireAcceso("ia");
  const conversaciones = await listarConversaciones();
  return (
    <>
      <PageHeader
        title="Asistente IA"
        subtitle="Consultá tu negocio en lenguaje natural. Las conversaciones quedan guardadas."
      />
      <AsistenteIA inicial={conversaciones} />
    </>
  );
}
