import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden rounded-xl bg-white shadow-hero",
        className,
      )}
    >
      <img
        src="/technet-logo.svg"
        alt="Logo TechNET"
        width={48}
        height={48}
        loading="eager"
        decoding="async"
        className="size-full object-cover"
      />
    </span>
  );
}
