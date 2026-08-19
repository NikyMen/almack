import Image from "next/image";
import dynamic from "next/dynamic";
import { redirect } from "next/navigation";
import { getUsuarioActual } from "@/lib/auth";
import { LoginForm } from "./login-form";

const DotField = dynamic(() => import("@/components/fx/dot-field"));

export default async function LoginPage() {
  // Si el token es válido no hace falta mostrar el formulario. El chequeo vive
  // acá y no en el middleware para que una cookie inservible caiga siempre en
  // esta página (que la puede reemplazar) en vez de rebotar contra /admin.
  if (await getUsuarioActual()) redirect("/admin");

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-navy px-4 py-10">
      <div className="absolute inset-0 bg-[url('/brand/almack-portada.png')] bg-cover bg-center bg-no-repeat" />
      <div className="absolute inset-0 bg-navy/75" />
      <div className="absolute inset-0">
        <DotField />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(197,237,27,0.14),transparent_55%)]" />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Image
            src="/brand/logo-almack-horizontal.png"
            alt="Almack"
            width={720}
            height={360}
            priority
            className="h-auto w-60 rounded-2xl object-contain shadow-lg shadow-black/40 ring-1 ring-white/10"
          />
          <p className="mt-2 text-sm text-slate-400">
            <span className="font-semibold text-lime">Almack</span> · Tu kiosco amigo
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/30 backdrop-blur-md">
          <h1 className="mb-1 text-lg font-semibold text-white">Iniciar sesión</h1>
          <p className="mb-5 text-xs text-slate-400">Ingresá con tus credenciales para acceder al panel.</p>
          <LoginForm />
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          © {new Date().getFullYear()} · Hecho por Nicolas Mendez
        </p>
      </div>
    </div>
  );
}
