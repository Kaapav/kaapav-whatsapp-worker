import React from "react";

export const Input = React.forwardRef(
  ({ className = "", ...props }, ref) => (
    <input
      ref={ref}
      className={`w-full rounded-2xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 ${className}`}
      {...props}
    />
  )
);
Input.displayName = "Input";
