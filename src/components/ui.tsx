/** Minimal UI primitives (Tailwind). shadcn/ui deferred - see sprint-05 log. */
import { type ComponentProps, forwardRef } from "react";

export function cn(...parts: (string | false | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export const Button = forwardRef<
  HTMLButtonElement,
  ComponentProps<"button"> & { variant?: "primary" | "ghost" | "danger" }
>(function Button({ className, variant = "primary", ...props }, ref) {
  const styles = {
    primary:
      "bg-indigo-600 text-white hover:bg-indigo-500 disabled:bg-indigo-300",
    ghost:
      "bg-transparent text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800",
    danger: "bg-red-600 text-white hover:bg-red-500 disabled:bg-red-300",
  }[variant];
  return (
    <button
      ref={ref}
      className={cn(
        "rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed",
        styles,
        className
      )}
      {...props}
    />
  );
});

export const Input = forwardRef<HTMLInputElement, ComponentProps<"input">>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm placeholder:text-neutral-400 focus:border-indigo-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900",
          className
        )}
        {...props}
      />
    );
  }
);

export function Field({
  label,
  error,
  children,
  hint,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
        {label}
      </span>
      {children}
      {hint && !error && (
        <span className="block text-xs text-neutral-400">{hint}</span>
      )}
      {error && (
        <span role="alert" className="block text-xs text-red-600">
          {error}
        </span>
      )}
    </label>
  );
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900",
        className
      )}
      {...props}
    />
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
    >
      {message}
    </div>
  );
}
