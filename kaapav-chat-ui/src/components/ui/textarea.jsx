import * as React from "react";

export const Textarea = React.forwardRef(function Textarea(
  { className = "", ...props },
  ref
) {
  return (
    <textarea
      ref={ref}
      className={`w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[#C4952F] focus:ring focus:ring-[#C4952F]/40 ${className}`}
      {...props}
    />
  );
});
