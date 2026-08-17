import Image from "next/image";
import { cn } from "@/lib/cn";

/** Logo oficial de Consultoría Digital, recortado visualmente sin duplicar el asset. */
export function Logo({ className }: { className?: string; dark?: boolean }) {
  return (
    <div className={cn("relative h-10 w-[212px] overflow-hidden rounded-lg bg-brand-ink", className)}>
      <Image
        src="/brand/logo-cd.webp"
        alt="Consultoría Digital"
        width={600}
        height={400}
        priority
        unoptimized
        className="absolute left-2 top-1/2 h-auto w-[calc(100%-1rem)] -translate-y-1/2"
      />
    </div>
  );
}
