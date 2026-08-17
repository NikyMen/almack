"use client";

// Escáner de códigos de barras con la cámara del teléfono.
// Dos niveles de detección: la API nativa BarcodeDetector cuando existe
// (Android/Chrome, cero peso extra) y ZXing por import dinámico como respaldo
// (iOS Safari, Firefox). ZXing solo se descarga si hace falta.

import { useCallback, useEffect, useRef, useState } from "react";
import { X, Zap, ZapOff, Loader2, CameraOff } from "lucide-react";

const FORMATOS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf", "qr_code"];

type BarcodeDetectorLike = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> };

// Pitido corto de confirmación: en un mostrador ruidoso el feedback sonoro
// vale más que el visual.
function beep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = 1720;
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
    osc.onended = () => ctx.close();
  } catch {
    /* sin audio disponible → seguimos con la vibración */
  }
}

export function BarcodeScanner({
  onDetect,
  onClose,
  titulo = "Escanear código",
}: {
  onDetect: (codigo: string) => void;
  onClose: () => void;
  titulo?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [estado, setEstado] = useState<"iniciando" | "listo" | "error">("iniciando");
  const [error, setError] = useState("");
  const [linterna, setLinterna] = useState(false);
  const [puedeLinterna, setPuedeLinterna] = useState(false);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const ultimoRef = useRef<{ codigo: string; en: number }>({ codigo: "", en: 0 });

  // Antirrebote: la cámara ve el mismo código 30 veces por segundo.
  const emitir = useCallback(
    (codigo: string) => {
      const limpio = codigo.trim();
      if (!limpio) return;
      const ahora = Date.now();
      if (ultimoRef.current.codigo === limpio && ahora - ultimoRef.current.en < 1500) return;
      ultimoRef.current = { codigo: limpio, en: ahora };
      beep();
      navigator.vibrate?.(60);
      onDetect(limpio);
    },
    [onDetect]
  );

  useEffect(() => {
    let cancelado = false;
    let stream: MediaStream | null = null;
    let raf = 0;
    let detenerZxing: (() => void) | null = null;

    async function arrancar() {
      if (!window.isSecureContext) {
        setEstado("error");
        setError("La cámara necesita una conexión segura (HTTPS). Abrí la app por https:// o desde localhost.");
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setEstado("error");
        setError("Este navegador no permite usar la cámara.");
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch (e) {
        if (cancelado) return;
        setEstado("error");
        const nombre = (e as Error).name;
        setError(
          nombre === "NotAllowedError"
            ? "Permiso de cámara denegado. Habilitalo desde los ajustes del navegador y volvé a intentar."
            : nombre === "NotFoundError"
              ? "No se encontró ninguna cámara en este dispositivo."
              : "No se pudo abrir la cámara."
        );
        return;
      }

      if (cancelado) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play().catch(() => {});
      setEstado("listo");

      const track = stream.getVideoTracks()[0];
      trackRef.current = track;
      const caps = track.getCapabilities?.() as MediaTrackCapabilities & { torch?: boolean };
      setPuedeLinterna(Boolean(caps?.torch));

      const Detector = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => BarcodeDetectorLike })
        .BarcodeDetector;

      if (Detector) {
        let soportados = FORMATOS;
        try {
          const disp = await (
            Detector as unknown as { getSupportedFormats?: () => Promise<string[]> }
          ).getSupportedFormats?.();
          if (disp?.length) soportados = FORMATOS.filter((f) => disp.includes(f));
        } catch {
          /* nos quedamos con la lista completa */
        }
        const detector = new Detector({ formats: soportados });
        const loop = async () => {
          if (cancelado) return;
          try {
            const codigos = await detector.detect(video);
            if (codigos[0]?.rawValue) emitir(codigos[0].rawValue);
          } catch {
            /* frame no analizable → seguimos */
          }
          raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return;
      }

      // Respaldo: ZXing sobre el elemento de video.
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      if (cancelado) return;
      const reader = new BrowserMultiFormatReader();
      const control = await reader.decodeFromVideoElement(video, (result) => {
        if (result) emitir(result.getText());
      });
      detenerZxing = () => control.stop();
    }

    arrancar();

    return () => {
      cancelado = true;
      cancelAnimationFrame(raf);
      detenerZxing?.();
      stream?.getTracks().forEach((t) => t.stop());
      trackRef.current = null;
    };
  }, [emitir]);

  // Escape cierra
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function toggleLinterna() {
    const track = trackRef.current;
    if (!track) return;
    try {
      const siguiente = !linterna;
      // `torch` todavía no está en los tipos estándar de MediaTrackConstraintSet.
      await track.applyConstraints({ advanced: [{ torch: siguiente }] } as unknown as MediaTrackConstraints);
      setLinterna(siguiente);
    } catch {
      setPuedeLinterna(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-navy-deep" role="dialog" aria-modal="true" aria-label={titulo}>
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <span className="text-sm font-semibold">{titulo}</span>
        <div className="flex items-center gap-1">
          {puedeLinterna && (
            <button
              onClick={toggleLinterna}
              className="rounded-lg p-2 text-slate-300 transition hover:bg-white/10 hover:text-white"
              aria-label={linterna ? "Apagar linterna" : "Encender linterna"}
            >
              {linterna ? <Zap className="h-5 w-5 text-lime" /> : <ZapOff className="h-5 w-5" />}
            </button>
          )}
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-300 transition hover:bg-white/10 hover:text-white"
            aria-label="Cerrar escáner"
          >
            <X className="h-6 w-6" />
          </button>
        </div>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />

        {estado === "listo" && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative h-40 w-[78%] max-w-sm rounded-2xl border-2 border-lime/80 shadow-[0_0_0_100vmax_rgba(8,11,15,0.55)]">
              <div className="absolute inset-x-3 top-1/2 h-0.5 -translate-y-1/2 animate-pulse bg-lime/80" />
            </div>
          </div>
        )}

        {estado === "iniciando" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-300">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className="text-sm">Abriendo la cámara…</p>
          </div>
        )}

        {estado === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center text-slate-300">
            <CameraOff className="h-8 w-8 text-rose-400" />
            <p className="text-sm">{error}</p>
            <button onClick={onClose} className="btn-primary mt-2">
              Cerrar
            </button>
          </div>
        )}
      </div>

      <p className="safe-b px-6 py-4 text-center text-xs text-slate-400">
        Apuntá al código de barras del producto. Se agrega solo al carrito.
      </p>
    </div>
  );
}
