import Image from "next/image";
import Link from "next/link";

const SIZES = {
  hero: {
    wrap: "w-[min(78vw,20rem)] sm:w-80",
    radius: "rounded-[1.25rem] sm:rounded-3xl",
    shadow: "shadow-[0_20px_50px_rgba(0,0,0,0.55)]",
    sizes: "(max-width: 640px) 78vw, 20rem",
    priority: true,
  },
  welcome: {
    wrap: "w-[min(58vw,14rem)] sm:w-56",
    radius: "rounded-2xl sm:rounded-3xl",
    shadow: "shadow-[0_14px_36px_rgba(0,0,0,0.5)]",
    sizes: "(max-width: 640px) 58vw, 14rem",
    priority: false,
  },
  header: {
    wrap: "h-10 w-10 sm:h-11 sm:w-11",
    radius: "rounded-xl",
    shadow: "shadow-md shadow-black/40",
    sizes: "44px",
    priority: false,
  },
  compact: {
    wrap: "h-8 w-8",
    radius: "rounded-lg",
    shadow: "shadow-sm shadow-black/30",
    sizes: "32px",
    priority: false,
  },
} as const;

type BrandLogoProps = {
  size?: keyof typeof SIZES;
  href?: string | null;
  className?: string;
};

export function BrandLogo({ size = "header", href = "/", className = "" }: BrandLogoProps) {
  const cfg = SIZES[size];
  const body = (
    <span
      className={`relative block shrink-0 overflow-hidden ring-1 ring-white/10 ${cfg.wrap} ${cfg.radius} ${cfg.shadow} ${className}`}
    >
      <Image
        src="/brand/fantasy-bros-logo.jpg"
        alt="Fantasy Bros"
        width={1024}
        height={1024}
        priority={cfg.priority}
        sizes={cfg.sizes}
        className="h-full w-full object-cover"
      />
    </span>
  );

  if (!href) return body;
  return (
    <Link href={href} aria-label="Fantasy Bros — inicio" className="inline-flex shrink-0">
      {body}
    </Link>
  );
}
