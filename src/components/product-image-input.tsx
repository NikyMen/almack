"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Camera, ImagePlus, Loader2, Trash2, UploadCloud } from "lucide-react";

const MAX_BYTES = 8 * 1024 * 1024;
const TIPOS_OK = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
// Lado máximo de la imagen que se guarda. Alcanza de sobra para la tienda y
// evita subir los 4-8 MB que sale una foto del celular.
const LADO_MAX = 1400;

/**
 * Achica y recomprime la foto en el navegador antes de mandarla al server.
 * Sin esto, subir desde el celular con datos móviles es lentísimo (y una foto
 * de 12 MP se pasa del límite del server). Si algo falla, se manda el original.
 */
async function optimizar(archivo: File): Promise<File> {
  // El GIF puede estar animado: recomprimirlo lo dejaría en un solo cuadro.
  if (archivo.type === "image/gif") return archivo;
  if (typeof createImageBitmap !== "function") return archivo;

  try {
    // `from-image` respeta el EXIF: si no, las fotos verticales del celular
    // quedan acostadas.
    const bitmap = await createImageBitmap(archivo, { imageOrientation: "from-image" });
    const escala = Math.min(1, LADO_MAX / Math.max(bitmap.width, bitmap.height));
    if (escala === 1 && archivo.size <= 900_000) {
      bitmap.close();
      return archivo;
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * escala);
    canvas.height = Math.round(bitmap.height * escala);
    const ctx = canvas.getContext("2d");
    if (!ctx) return archivo;
    // Fondo blanco: un PNG con transparencia pasado a JPG saldría con el fondo
    // negro.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.85));
    if (!blob || blob.size >= archivo.size) return archivo;

    const nombre = archivo.name.replace(/\.[^.]+$/, "") || "foto";
    return new File([blob], `${nombre}.jpg`, { type: "image/jpeg" });
  } catch {
    return archivo;
  }
}

/**
 * Campo de imagen del producto: se puede arrastrar un archivo, elegirlo del
 * disco/galería o sacar la foto con la cámara del celular.
 *
 * Deja dos cosas en el formulario:
 *  - `imagen`: hidden con la ruta ya guardada (vacío si la sacaron).
 *  - el archivo elegido, que el form suma como `imagenArchivo` vía `onArchivo`.
 */
export function CampoImagenProducto({
  valorInicial = "",
  onArchivo,
}: {
  valorInicial?: string;
  onArchivo: (archivo: File | null) => void;
}) {
  const id = useId();
  const inputArchivo = useRef<HTMLInputElement>(null);
  const inputCamara = useRef<HTMLInputElement>(null);
  const [guardada, setGuardada] = useState(valorInicial);
  const [preview, setPreview] = useState("");
  const [procesando, setProcesando] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const [error, setError] = useState("");
  const [esTactil, setEsTactil] = useState(false);

  useEffect(() => {
    setEsTactil(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  // El objectURL del preview hay que liberarlo o queda el blob en memoria.
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function tomar(archivo: File | undefined | null) {
    if (!archivo) return;
    if (!TIPOS_OK.includes(archivo.type)) {
      return setError("Formato no soportado. Usá JPG, PNG, WEBP o GIF.");
    }
    setError("");
    setProcesando(true);
    const listo = await optimizar(archivo);
    setProcesando(false);

    if (listo.size > MAX_BYTES) {
      return setError("La imagen no puede superar los 8 MB.");
    }

    setPreview((anterior) => {
      if (anterior) URL.revokeObjectURL(anterior);
      return URL.createObjectURL(listo);
    });
    onArchivo(listo);
  }

  function quitar() {
    setPreview((anterior) => {
      if (anterior) URL.revokeObjectURL(anterior);
      return "";
    });
    setGuardada("");
    setError("");
    onArchivo(null);
    if (inputArchivo.current) inputArchivo.current.value = "";
    if (inputCamara.current) inputCamara.current.value = "";
  }

  const mostrada = preview || guardada;

  return (
    <div>
      <label className="label" htmlFor={id}>Imagen para la tienda</label>
      <input type="hidden" name="imagen" value={guardada} />

      <div
        onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastrando(false);
          tomar(e.dataTransfer.files?.[0]);
        }}
        className={`flex flex-col items-center gap-3 rounded-xl border-2 border-dashed p-4 text-center transition sm:flex-row sm:text-left ${
          arrastrando ? "border-sky-400 bg-sky-50" : "border-slate-200 bg-slate-50"
        }`}
      >
        {mostrada ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={mostrada}
            alt="Vista previa del producto"
            className="h-24 w-24 shrink-0 rounded-lg border border-slate-200 bg-white object-cover"
          />
        ) : (
          <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-300">
            <ImagePlus className="h-8 w-8" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p className="text-sm text-slate-600">
            {procesando ? (
              <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Preparando la imagen…</span>
            ) : (
              <>Arrastrá la foto acá o <span className="font-medium">elegila de tus archivos</span>.</>
            )}
          </p>
          <p className="mt-0.5 text-xs text-slate-400">JPG, PNG, WEBP o GIF · hasta 8 MB</p>

          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              id={id}
              className="btn-ghost px-3 py-1.5 text-xs"
              onClick={() => inputArchivo.current?.click()}
              disabled={procesando}
            >
              <UploadCloud className="h-3.5 w-3.5" /> Elegir archivo
            </button>
            {esTactil && (
              <button
                type="button"
                className="btn-ghost px-3 py-1.5 text-xs"
                onClick={() => inputCamara.current?.click()}
                disabled={procesando}
              >
                <Camera className="h-3.5 w-3.5" /> Sacar foto
              </button>
            )}
            {mostrada && (
              <button type="button" className="btn-ghost px-3 py-1.5 text-xs text-rose-600" onClick={quitar}>
                <Trash2 className="h-3.5 w-3.5" /> Quitar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Los dos inputs quedan fuera del flujo: el archivo viaja por `onArchivo`. */}
      <input
        ref={inputArchivo}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => tomar(e.target.files?.[0])}
      />
      <input
        ref={inputCamara}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => tomar(e.target.files?.[0])}
      />

      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
    </div>
  );
}
