import Link from "next/link";
import { Clock } from "lucide-react";

export default function PendientePage() {
  return (
    <div className="card mx-auto max-w-md p-8 text-center">
      <Clock className="mx-auto h-12 w-12 text-amber-500" />
      <h1 className="mt-3 text-xl font-bold">Pago en proceso</h1>
      <p className="mt-2 text-sm text-slate-500">
        Tu pago está siendo procesado. Cuando se acredite, confirmamos tu pedido.
      </p>
      <Link href="/store" className="btn-primary mt-5 inline-flex">
        Volver a la tienda
      </Link>
    </div>
  );
}
