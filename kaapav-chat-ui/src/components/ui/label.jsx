import * as React from "react";

export function Label({ children, className = "", ...props }) {
  return (
    <label
      className={`text-sm font-medium text-[#3A2F16] ${className}`}
      {...props}
    >
      {children}
    </label>
  );
}
