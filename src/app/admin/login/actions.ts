"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { checkCredentials, credencialesConfiguradas, createSession, destroySession } from "@/lib/auth";
import { COOKIE_SUCURSAL, getSucursales } from "@/lib/sucursal";

export async function login(_prev: unknown, formData: FormData) {
  const user = String(formData.get("usuario") || "").trim();
  const pass = String(formData.get("password") || "");
  const sucursalId = Number(formData.get("sucursalId"));

  if (!credencialesConfiguradas()) {
    return { error: "La aplicación no está configurada. Definí AUTH_USER, AUTH_PASSWORD y AUTH_SECRET en el servidor." };
  }
  if (!(await checkCredentials(user, pass))) {
    return { error: "Usuario o contraseña incorrectos." };
  }
  const sucursales = await getSucursales();
  if (!Number.isSafeInteger(sucursalId) || !sucursales.some((s) => s.id === sucursalId)) {
    return { error: "Elegí una sucursal activa para ingresar." };
  }
  await createSession(user, sucursalId);
  const store = await cookies();
  store.set(COOKIE_SUCURSAL, String(sucursalId), {
    httpOnly: true, sameSite: "lax", secure: process.env.COOKIE_SECURE === "true",
    path: "/", maxAge: 60 * 60 * 8,
  });
  redirect("/admin");
}

export async function logout() {
  await destroySession();
  (await cookies()).delete(COOKIE_SUCURSAL);
  redirect("/admin/login");
}
