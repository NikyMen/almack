import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
export function hashClaveAdministrador(clave: string) {
  if (typeof clave !== "string" || clave.length < 6 || clave.length > 64 || clave.trim() !== clave) throw new Error("La clave debe tener entre 6 y 64 caracteres, sin espacios al principio ni al final.");
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(clave, salt, 64).toString("hex")}`;
}
export function verificarClaveAdministrador(clave: string, hash: string) {
  if (typeof clave !== "string" || clave.length < 6 || clave.length > 64) return false;
  const [salt, digest] = hash.split(":");
  if (!salt || !digest) return false;
  const esperado = Buffer.from(digest, "hex");
  const recibido = scryptSync(clave, salt, 64);
  return esperado.length === recibido.length && timingSafeEqual(esperado, recibido);
}
