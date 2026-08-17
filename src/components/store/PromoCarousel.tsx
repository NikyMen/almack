"use client";

import { useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import AutoScroll from "embla-carousel-auto-scroll";
import { Pause, Play } from "lucide-react";
import type { Product } from "@/lib/types";
import { ProductCard } from "@/components/store/ProductCard";

export function PromoCarousel({ products }: { products: Product[] }) {
  const [emblaRef, emblaApi] = useEmblaCarousel(
    { loop: true, align: "start", dragFree: true },
    [
      AutoScroll({
        speed: 1,
        startDelay: 0,
        stopOnInteraction: false,
        stopOnMouseEnter: false,
        stopOnFocusIn: false,
      }),
    ]
  );
  const [paused, setPaused] = useState(false);

  // Mantener el estado del botón en sincronía con el plugin.
  useEffect(() => {
    if (!emblaApi) return;
    const autoScroll = emblaApi.plugins().autoScroll;
    if (!autoScroll) return;
    const update = () => setPaused(!autoScroll.isPlaying());
    emblaApi.on("autoScroll:play", update).on("autoScroll:stop", update);
    return () => {
      emblaApi.off("autoScroll:play", update).off("autoScroll:stop", update);
    };
  }, [emblaApi]);

  const togglePlay = useCallback(() => {
    const autoScroll = emblaApi?.plugins().autoScroll;
    if (!autoScroll) return;
    if (autoScroll.isPlaying()) autoScroll.stop();
    else autoScroll.play();
  }, [emblaApi]);

  return (
    <div className="relative">
      <div ref={emblaRef} className="overflow-hidden" aria-label="Promos del día">
        <div className="-ml-3 flex touch-pan-y md:-ml-5">
          {products.map((p) => (
            <div
              key={p.id}
              className="flex min-w-0 shrink-0 basis-1/2 pl-3 sm:basis-1/3 md:pl-5 lg:basis-1/4"
            >
              <ProductCard product={p} />
            </div>
          ))}
        </div>
      </div>
      <button
        type="button"
        onClick={togglePlay}
        aria-label={paused ? "Reanudar carrusel" : "Pausar carrusel"}
        className="absolute bottom-2 right-2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-brand-ink/70 shadow-soft backdrop-blur transition hover:bg-brand-red hover:text-white"
      >
        {paused ? <Play size={15} /> : <Pause size={15} />}
      </button>
    </div>
  );
}
