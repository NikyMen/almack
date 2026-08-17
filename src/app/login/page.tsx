import Image from "next/image";
import dynamic from "next/dynamic";
import { LoginForm } from "./login-form";

const DotField = dynamic(() => import("@/components/fx/dot-field"));

export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-navy px-4 py-10">
      <div className="absolute inset-0">
        <DotField />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(197,237,27,0.14),transparent_55%)]" />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Image
            src="/brand/logo-cd.webp"
            alt="Consultoría Digital"
            width={240}
            height={160}
            priority
            className="h-auto w-52"
          />
          <p className="mt-2 text-sm text-slate-400">
            <span className="font-semibold text-lime">GestorIA</span> · ERP con Inteligencia Artificial
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/30 backdrop-blur-md">
          <h1 className="mb-1 text-lg font-semibold text-white">Iniciar sesión</h1>
          <p className="mb-5 text-xs text-slate-400">Ingresá con tus credenciales para acceder al panel.</p>
          <LoginForm />
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          © {new Date().getFullYear()} Consultoría Digital · Cerebros jóvenes, ideas poderosas
        </p>
      </div>
    </div>
  );
}
