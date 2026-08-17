import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

export default function ExitoPage() {
  return (
    <div className="card mx-auto max-w-md p-8 text-center">
      <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
      <h1 className="mt-3 text-xl font-bold">¡Pago aprobado!</h1>
      <p className="mt-2 text-sm text-slate-500">
        Recibimos tu pago. Te vamos a contactar para coordinar la entrega.
      </p>
      <Link href="/store" className="btn-primary mt-5 inline-flex">
        Volver a la tienda
      </Link>
    </div>
  );
}
