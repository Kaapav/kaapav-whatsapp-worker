import * as React from "react";

export const Input = React.forwardRef(function Input(
  { className = "", ...props },
  ref
) {
  return (
    <input
      ref={ref}
      className={`w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[#C4952F] focus:ring focus:ring-[#C4952F]/40 ${className}`}
      {...props}
    />
  );
});
