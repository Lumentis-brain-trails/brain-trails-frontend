/**
 * UI primitives of the Brain Trails design system.
 *
 * Everything here is built on the tokens in globals.css: monochrome surfaces, one
 * accent for interaction, hairline separators, press feedback on pointer-down.
 * Components stay deliberately small; composition happens in the pages.
 */
import { type ComponentProps, forwardRef } from "react";

export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-on-accent hover:bg-accent-hover disabled:opacity-40 disabled:hover:bg-accent",
  secondary:
    "bg-surface-2 text-ink hover:bg-surface-3 disabled:opacity-40 disabled:hover:bg-surface-2",
  ghost: "bg-transparent text-accent hover:bg-accent-soft disabled:opacity-40",
  danger:
    "bg-danger-soft text-danger hover:bg-danger hover:text-white disabled:opacity-40",
};

const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: "h-8 px-3.5 text-[13px]",
  md: "h-10 px-5 text-[15px]",
  lg: "h-12 px-7 text-[17px]",
};

export const Button = forwardRef<
  HTMLButtonElement,
  ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }
>(function Button(
  { className, variant = "primary", size = "md", type = "button", ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "pressable inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap select-none disabled:cursor-not-allowed",
        BUTTON_VARIANT[variant],
        BUTTON_SIZE[size],
        className
      )}
      {...props}
    />
  );
});

const CONTROL =
  "w-full rounded-[var(--radius-control)] border border-hairline-strong bg-surface px-3.5 text-[15px] text-ink placeholder:text-ink-3 transition-[border-color,box-shadow] duration-(--m-fast) focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent-soft disabled:opacity-50";

export const Input = forwardRef<HTMLInputElement, ComponentProps<"input">>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          CONTROL,
          "h-11 file:mr-3 file:rounded-full file:border-0 file:bg-surface-2 file:px-3 file:py-1 file:text-[13px] file:font-medium file:text-ink",
          className
        )}
        {...props}
      />
    );
  }
);

export const Select = forwardRef<HTMLSelectElement, ComponentProps<"select">>(
  function Select({ className, children, ...props }, ref) {
    return (
      <div className="relative">
        <select
          ref={ref}
          className={cn(CONTROL, "h-11 appearance-none pr-10", className)}
          {...props}
        >
          {children}
        </select>
        <svg
          aria-hidden
          viewBox="0 0 16 16"
          className="pointer-events-none absolute top-1/2 right-3.5 h-4 w-4 -translate-y-1/2 text-ink-3"
        >
          <path
            d="M4 6l4 4 4-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    );
  }
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  ComponentProps<"textarea">
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(CONTROL, "min-h-24 py-2.5", className)}
      {...props}
    />
  );
});

/** Label + control + inline validation. Errors replace the hint, never stack. */
export function Field({
  label,
  error,
  hint,
  children,
  className,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-[13px] font-medium text-ink-2">
        {label}
      </span>
      {children}
      {hint && !error && (
        <span className="mt-1.5 block text-[13px] text-ink-3">{hint}</span>
      )}
      {error && (
        <span role="alert" className="mt-1.5 block text-[13px] text-danger">
          {error}
        </span>
      )}
    </label>
  );
}

/** A surface. `inset` removes the padding for lists and tables. */
export function Card({
  className,
  inset = false,
  ...props
}: ComponentProps<"div"> & { inset?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] border border-hairline bg-surface shadow-(--shadow-card)",
        inset ? "overflow-hidden" : "p-6",
        className
      )}
      {...props}
    />
  );
}

export function SectionTitle({
  children,
  action,
  className,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex items-end justify-between gap-4", className)}>
      <h2 className="type-heading">{children}</h2>
      {action}
    </div>
  );
}

/** Grouped list in the style of settings screens: hairline-separated rows. */
export function ListRow({
  className,
  ...props
}: ComponentProps<"div"> & { as?: never }) {
  return (
    <div
      className={cn(
        "flex items-center gap-4 border-b border-hairline px-5 py-3.5 last:border-b-0",
        className
      )}
      {...props}
    />
  );
}

/** Key/value pair for detail lists. */
export function KeyValue({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <ListRow className="justify-between">
      <span className="text-ink-2">{label}</span>
      <span
        className={cn(
          "text-right text-ink",
          mono && "font-mono text-[13px] tabular-nums"
        )}
      >
        {value}
      </span>
    </ListRow>
  );
}

/** Large number with a caption. */
export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <Card className="p-5">
      <p className="type-caption text-ink-3">{label}</p>
      <p className="mt-1 text-[28px] leading-none font-semibold tracking-[-0.02em] tabular-nums">
        {value}
      </p>
      {hint && <p className="type-caption mt-2 text-ink-3">{hint}</p>}
    </Card>
  );
}

/** iOS-style segmented control. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  size = "sm",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
  size?: "sm" | "md";
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-full bg-surface-2 p-0.5"
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "pressable rounded-full font-medium whitespace-nowrap",
              size === "sm" ? "h-7 px-3 text-[13px]" : "h-9 px-4 text-[15px]",
              active
                ? "bg-surface text-ink shadow-[0_1px_3px_rgba(0,0,0,0.12)]"
                : "text-ink-2 hover:text-ink"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="enter-fade rounded-[var(--radius-control)] bg-danger-soft px-4 py-3 text-[14px] text-danger"
    >
      {message}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton rounded-xl", className)} />;
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={cn("h-4 w-4 animate-[m-spin_0.9s_linear_infinite]", className)}
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeOpacity="0.2"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function EmptyState({
  title,
  text,
  action,
}: {
  title: string;
  text?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="enter-up flex flex-col items-center px-6 py-16 text-center">
      <h3 className="type-heading">{title}</h3>
      {text && <p className="mt-2 max-w-sm text-ink-2">{text}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

/** Small inline glyphs, stroke-based, 16px grid. */
export function Icon({
  name,
  className,
}: {
  name: "chevron" | "back" | "plus" | "download" | "trash" | "check" | "copy";
  className?: string;
}) {
  const paths: Record<typeof name, string> = {
    chevron: "M6 3l5 5-5 5",
    back: "M10 3L5 8l5 5",
    plus: "M8 3v10M3 8h10",
    download: "M8 2v8m0 0l3-3M8 10L5 7M3 13h10",
    trash: "M3 4h10M6 4V2.5h4V4M5 4l.6 9h4.8L11 4",
    check: "M3 8.5l3 3 7-7",
    copy: "M6 6h7v7H6zM3 10V3h7",
  };
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className={cn("h-4 w-4 shrink-0", className)}
    >
      <path
        d={paths[name]}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
