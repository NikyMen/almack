"use server";

import { redirect } from "next/navigation";
import { checkCredentials, credencialesConfiguradas, createSession, destroySession } from "@/lib/auth";

export async function login(_prev: unknown, formData: FormData) {
  const user = String(formData.get("usuario") || "").trim();
  const pass = String(formData.get("password") || "");

  if (!credencialesConfiguradas()) {
    return { error: "La aplicación no está configurada. Definí AUTH_USER, AUTH_PASSWORD y AUTH_SECRET en el servidor." };
  }
  if (!(await checkCredentials(user, pass))) {
    return { error: "Usuario o contraseña incorrectos." };
  }
  await createSession(user);
  redirect("/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
