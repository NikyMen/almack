"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MODULOS, MODULOS_VISIBLES, PERMISOS_DEFAULT, type ModuloKey } from "@/lib/permisos";
import {
  crearUsuario,
  actualizarUsuario,
  eliminarUsuario,
  type UsuarioInput,
} from "@/app/(app)/equipo/actions";
import { Plus, Pencil, Trash2, Loader2, X, ShieldCheck } from "lucide-react";

type UsuarioRow = {
  id: number;
  nombre: string;
  usuario: string;
  email: string;
  rol: "admin" | "miembro";
  permisos: ModuloKey[];
  activo: boolean;
};

const labelDe = (k: ModuloKey) => MODULOS.find((m) => m.key === k)?.label ?? k;

const formVacio = (): UsuarioInput => ({
  nombre: "",
  usuario: "",
  email: "",
  rol: "miembro",
  permisos: [...PERMISOS_DEFAULT],
  activo: true,
  password: "",
});

export function EquipoManager({ items }: { items: UsuarioRow[] }) {
  const router = useRouter();
  // null = panel cerrado · 0 = creando · >0 = editando ese id
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<UsuarioInput>(formVacio());
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  function abrirNuevo() {
    setForm(formVacio());
    setEditId(0);
    setError(null);
  }
  function abrirEditar(u: UsuarioRow) {
    setForm({
      nombre: u.nombre,
      usuario: u.usuario,
      email: u.email,
      rol: u.rol,
      permisos: [...u.permisos],
      activo: u.activo,
      password: "",
    });
    setEditId(u.id);
    setError(null);
  }
  function cerrar() {
    setEditId(null);
    setError(null);
  }

  function togglePermiso(key: ModuloKey) {
    setForm((f) => ({
      ...f,
      permisos: f.permisos.includes(key)
        ? f.permisos.filter((p) => p !== key)
        : [...f.permisos, key],
    }));
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    const res =
      editId && editId > 0
        ? await actualizarUsuario(editId, form)
        : await crearUsuario(form);
    setGuardando(false);
    if (res.ok) {
      cerrar();
      router.refresh();
    } else {
      setError(res.error);
    }
  }

  async function borrar(u: UsuarioRow) {
    if (!confirm(`¿Eliminar a ${u.nombre}? Quedará desvinculado como responsable de sus leads.`))
      return;
    await eliminarUsuario(u.id);
    router.refresh();
  }

  const esAdmin = form.rol === "admin";

  return (
    <>
      <div className="mb-4 flex justify-end">
        <button className="btn-primary" onClick={editId === null ? abrirNuevo : cerrar}>
          {editId === null ? (
            <>
              <Plus className="h-4 w-4" /> Nuevo miembro
            </>
          ) : (
            <>
              <X className="h-4 w-4" /> Cerrar
            </>
          )}
        </button>
      </div>

      {/* Formulario alta/edición */}
      {editId !== null && (
        <form onSubmit={guardar} className="card mb-6 grid gap-4 p-5 md:grid-cols-2">
          <div>
            <label className="label">Nombre completo *</label>
            <input
              className="input"
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="label">Usuario (acceso) *</label>
            <input
              className="input"
              value={form.usuario}
              onChange={(e) => setForm({ ...form, usuario: e.target.value })}
              placeholder="ej: maria"
              required
            />
          </div>
          <div>
            <label className="label">Email</label>
            <input
              type="email"
              className="input"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div>
            <label className="label">
              Contraseña {editId && editId > 0 ? "(dejar vacío para no cambiar)" : "*"}
            </label>
            <input
              type="password"
              className="input"
              value={form.password ?? ""}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="••••••"
            />
          </div>
          <div>
            <label className="label">Rol</label>
            <select
              className="input"
              value={form.rol}
              onChange={(e) => setForm({ ...form, rol: e.target.value as "admin" | "miembro" })}
            >
              <option value="miembro">Miembro</option>
              <option value="admin">Administrador</option>
            </select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
              <input
                type="checkbox"
                className="h-4 w-4 accent-lime"
                checked={form.activo}
                onChange={(e) => setForm({ ...form, activo: e.target.checked })}
              />
              Usuario activo (puede iniciar sesión)
            </label>
          </div>

          {/* Permisos por módulo */}
          <div className="md:col-span-2">
            <label className="label">Acceso a módulos</label>
            {esAdmin ? (
              <p className="flex items-center gap-2 rounded-lg bg-lime/10 px-3 py-2 text-sm text-slate-600">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                Los administradores tienen acceso total a todos los módulos.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {MODULOS_VISIBLES.filter((m) => m.key !== "equipo").map((m) => (
                  <label
                    key={m.key}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-lime"
                      checked={form.permisos.includes(m.key)}
                      onChange={() => togglePermiso(m.key)}
                    />
                    {m.label}
                  </label>
                ))}
              </div>
            )}
            <p className="mt-1 text-xs text-slate-400">
              El módulo <b>Equipo</b> es exclusivo de administradores.
            </p>
          </div>

          {error && <p className="md:col-span-2 text-sm text-rose-500">{error}</p>}

          <div className="md:col-span-2">
            <button className="btn-primary" disabled={guardando}>
              {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {editId && editId > 0 ? "Guardar cambios" : "Crear miembro"}
            </button>
          </div>
        </form>
      )}

      {/* Tabla de usuarios */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Usuario</th>
              <th className="px-4 py-3 font-medium">Rol</th>
              <th className="px-4 py-3 font-medium">Accesos</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((u) => (
              <tr key={u.id} className="align-top">
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-800">{u.nombre}</p>
                  {u.email && <p className="text-xs text-slate-400">{u.email}</p>}
                </td>
                <td className="px-4 py-3 text-slate-500">{u.usuario}</td>
                <td className="px-4 py-3">
                  <span className={`badge ${u.rol === "admin" ? "bg-violet-50 text-violet-700" : "bg-slate-100 text-slate-600"}`}>
                    {u.rol === "admin" ? "Administrador" : "Miembro"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {u.rol === "admin" ? (
                    <span className="text-xs text-slate-500">Acceso total</span>
                  ) : u.permisos.length === 0 ? (
                    <span className="text-xs text-slate-400">Sin accesos</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {u.permisos.map((p) => (
                        <span key={p} className="badge bg-blue-50 text-blue-700">
                          {labelDe(p)}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`badge ${u.activo ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                    {u.activo ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <button
                      onClick={() => abrirEditar(u)}
                      className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                      title="Editar"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => borrar(u)}
                      className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-500"
                      title="Eliminar"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">
                  Todavía no hay miembros. Creá el primero con “Nuevo miembro”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
