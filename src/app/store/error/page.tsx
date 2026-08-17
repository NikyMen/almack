import Link from "next/link";
import { XCircle } from "lucide-react";

export default function ErrorPage() {
  return (
    <div className="card mx-auto max-w-md p-8 text-center">
      <XCircle className="mx-auto h-12 w-12 text-rose-500" />
      <h1 className="mt-3 text-xl font-bold">No se pudo completar el pago</h1>
      <p className="mt-2 text-sm text-slate-500">
        Tu pago no se procesó. Podés volver a la tienda e intentarlo de nuevo.
      </p>
      <Link href="/store" className="btn-primary mt-5 inline-flex">
        Volver a la tienda
      </Link>
    </div>
  );
}
