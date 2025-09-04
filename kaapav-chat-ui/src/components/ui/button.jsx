import * as React from "react";

export function Button({ children, variant = "default", className = "", ...props }) {
  let base =
    "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2";
  let styles = {
    default: "bg-[#C4952F] text-white hover:bg-[#b18228] focus:ring-[#C4952F]",
    outline:
      "border border-[#C4952F] text-[#C4952F] bg-white hover:bg-[#C4952F]/10 focus:ring-[#C4952F]",
    ghost: "text-[#C4952F] hover:bg-[#C4952F]/10",
  };
  return (
    <button className={`${base} ${styles[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}
