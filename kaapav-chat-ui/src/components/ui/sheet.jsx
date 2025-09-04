import * as React from "react";

export function Sheet({ open, onOpenChange, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
      <div className="w-full max-w-lg rounded-t-2xl bg-white shadow-lg">
        <div className="border-b border-[#C4952F]/40 p-3 font-semibold text-[#C4952F]">
          KAAPAV Panel
        </div>
        <div className="p-4">{children}</div>
        <button
          className="absolute top-2 right-2 text-gray-500 hover:text-[#C4952F]"
          onClick={() => onOpenChange(false)}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export function SheetContent({ children }) {
  return <div>{children}</div>;
}

export function SheetHeader({ children }) {
  return <div className="mb-2">{children}</div>;
}

export function SheetTitle({ children }) {
  return <h2 className="text-lg font-semibold">{children}</h2>;
}
