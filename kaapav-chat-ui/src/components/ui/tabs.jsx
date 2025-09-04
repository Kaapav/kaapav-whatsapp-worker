import * as React from "react";

export function Tabs({ children, className = "" }) {
  return <div className={`w-full ${className}`}>{children}</div>;
}

export function TabsList({ children, className = "" }) {
  return (
    <div className={`flex gap-2 border-b border-gray-200 ${className}`}>
      {children}
    </div>
  );
}

export function TabsTrigger({ value, active, onClick, children }) {
  return (
    <button
      onClick={() => onClick(value)}
      className={`px-3 py-2 text-sm font-medium transition ${
        active
          ? "border-b-2 border-[#C4952F] text-[#C4952F]"
          : "text-gray-500 hover:text-[#C4952F]"
      }`}
    >
      {children}
    </button>
  );
}

export function TabsContent({ active, children }) {
  return active ? <div className="mt-2">{children}</div> : null;
}
