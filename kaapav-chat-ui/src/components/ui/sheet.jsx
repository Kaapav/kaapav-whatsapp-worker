import React from "react";

export function Sheet({ open, onOpenChange, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/40 z-40 flex" onClick={() => onOpenChange(false)}>
      {children}
    </div>
  );
}

export function SheetContent({ side = "right", children, className = "" }) {
  const sideClasses = {
    bottom: "mt-auto w-full rounded-t-2xl",
    right: "ml-auto h-full w-96 rounded-l-2xl",
  };

  return (
    <div
      className={`${sideClasses[side]} bg-white dark:bg-gray-900 p-4 shadow-lg z-50 ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}

export function SheetHeader({ children }) {
  return <div className="mb-2">{children}</div>;
}

export function SheetTitle({ children }) {
  return <h2 className="text-lg font-semibold">{children}</h2>;
}
