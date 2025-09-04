import React from "react";
import clsx from "clsx";

export function Button({
  children,
  className = "",
  variant = "default",
  size = "default",
  ...props
}) {
  const base = "inline-flex items-center justify-center rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2";

  const variants = {
    default: "bg-[#C4952F] text-white hover:bg-[#A37B24]",
    outline: "border border-gray-300 dark:border-gray-700 bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800",
    ghost: "bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800",
  };

  const sizes = {
    default: "px-4 py-2 text-sm",
    sm: "px-2 py-1 text-xs",
    icon: "p-2 rounded-full",
  };

  return (
    <button
      className={clsx(base, variants[variant], sizes[size], className)}
      {...props}
    >
      {children}
    </button>
  );
}
