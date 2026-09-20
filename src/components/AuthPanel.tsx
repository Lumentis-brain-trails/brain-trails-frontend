import { cn } from "@/components/ui";

/**
 * The glass pane the auth forms sit on: translucent over the brand ground so the
 * ribbons still read through it, a hairline edge, the sheet radius.
 */
export function AuthPanel({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-sheet)] border border-hairline bg-white/[0.04] p-8 backdrop-blur-2xl",
        className
      )}
      {...props}
    />
  );
}
