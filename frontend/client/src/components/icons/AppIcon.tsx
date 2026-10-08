import type { LucideIcon, LucideProps } from "lucide-react";

type IconScale = "xs" | "sm" | "md" | "lg";

type AppIconProps = Omit<LucideProps, "size" | "strokeWidth" | "aria-label" | "aria-hidden" | "role"> & {
  icon: LucideIcon;
  size?: IconScale;
  /** Add a label only when the icon itself conveys information outside a named control. */
  label?: string;
};

const iconSizes: Record<IconScale, number> = {
  xs: 12,
  sm: 16,
  md: 18,
  lg: 22,
};

/**
 * EcoMind's icon contract: lucide-react outline icons, a consistent 1.75px stroke,
 * aligned to the text baseline, and decorative by default. Icon-only controls must
 * label the containing control; pass `label` only for a standalone informative icon.
 */
export function AppIcon({ icon: Icon, size = "md", label, className, ...props }: AppIconProps) {
  const iconClassName = className ? `app-icon ${className}` : "app-icon";

  return (
    <Icon
      {...props}
      className={iconClassName}
      size={iconSizes[size]}
      strokeWidth={1.75}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
      focusable="false"
    />
  );
}

export type { IconScale };
