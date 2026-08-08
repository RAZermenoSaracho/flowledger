import type { ButtonHTMLAttributes } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
};

const variants = {
  primary: "bg-pine text-white hover:bg-ink dark:hover:bg-emerald-700",
  secondary: "bg-white text-ink ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-100 dark:ring-slate-700 dark:hover:bg-slate-800",
  danger: "bg-coral text-white hover:bg-red-600 dark:hover:bg-red-500"
};

/** Styled button with primary/secondary/danger variants. */
export function Button({ className = "", variant = "primary", ...props }: ButtonProps) {
  return (
    <button
      className={`min-h-10 rounded-md px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant]} ${className}`}
      {...props}
    />
  );
}
