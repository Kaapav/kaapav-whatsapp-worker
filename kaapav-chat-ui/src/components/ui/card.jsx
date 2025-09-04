import * as React from "react";

export function Card({ children, className = "", ...props }) {
  return (
    <div
      className={`rounded-2xl border border-[#C4952F]/30 bg-white shadow-sm ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardContent({ children, className = "" }) {
  return <div className={`p-4 ${className}`}>{children}</div>;
}
