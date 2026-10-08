interface EcoMindMarkProps {
  size?: number;
  className?: string;
}

/** Shared compact leaf/current mark; the surrounding wordmark supplies its accessible name. */
export function EcoMindMark({ size = 32, className }: EcoMindMarkProps) {
  return (
    <img
      aria-hidden="true"
      alt=""
      className={className ? `ecomind-mark ${className}` : "ecomind-mark"}
      src="/ecomind-mark.svg"
      width={size}
      height={size}
      decoding="async"
      draggable={false}
    />
  );
}
