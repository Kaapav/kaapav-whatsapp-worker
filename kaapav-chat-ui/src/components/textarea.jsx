import React from "react";

export const Textarea = React.forwardRef(
  ({ className = "", rows = 3, ...props }, ref) => (
    <textarea
      ref={ref}
      rows={rows}
      className={`w-full rounded-2xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 ${className}`}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";
