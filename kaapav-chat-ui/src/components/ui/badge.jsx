import * as React from "react";

export function Badge({ children, variant = "default", className = "" }) {
  const styles = {
    default: "bg-[#C4952F] text-white",
    secondary: "bg-gray-100 text-gray-800",
    outline: "border border-[#C4952F] text-[#C4952F] bg-transparent",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styles[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
