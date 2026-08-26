import Image from "next/image";

export function Avatar({ src, alt, size = 36 }: { src?: string | null; alt: string; size?: number }) {
  if (!src) {
    return (
      <div
        className="flex shrink-0 items-center justify-center rounded-full bg-brand-light text-sm font-medium text-brand"
        style={{ width: size, height: size }}
      >
        {alt.charAt(0).toUpperCase()}
      </div>
    );
  }
  return (
    <Image
      src={src}
      alt={alt}
      width={size}
      height={size}
      className="shrink-0 rounded-full object-cover"
    />
  );
}
