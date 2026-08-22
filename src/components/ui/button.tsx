import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "ghost" | "line" | "danger";

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }
>(function Button({ className, variant = "primary", ...props }, ref) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-sm px-4 text-sm font-medium transition-transform duration-150 ease-out active:not-disabled:scale-[0.96] disabled:opacity-40",
        variant === "primary" && "bg-accent text-accent-fg hover:opacity-90",
        variant === "ghost" && "bg-transparent text-fg hover:bg-bg-hover",
        variant === "line" && "bg-bg-elevated text-fg shadow-[var(--shadow-border)] hover:bg-bg-hover",
        variant === "danger" && "bg-danger/15 text-danger hover:bg-danger/25",
        className,
      )}
      {...props}
    />
  );
});
