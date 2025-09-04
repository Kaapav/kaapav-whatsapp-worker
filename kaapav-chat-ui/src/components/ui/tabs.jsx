import React, { useState } from "react";

export function Tabs({ defaultValue, children, className = "" }) {
  const [value, setValue] = useState(defaultValue);
  return (
    <div className={className}>
      {React.Children.map(children, (child) =>
        React.cloneElement(child, { value, onValueChange: setValue })
      )}
    </div>
  );
}

export function TabsList({ children }) {
  return <div className="flex border-b">{children}</div>;
}

export function TabsTrigger({ value: tabValue, value, onValueChange, children }) {
  const isActive = value === tabValue;
  return (
    <button
      onClick={() => onValueChange(tabValue)}
      className={`px-3 py-1 text-sm font-medium ${
        isActive
          ? "border-b-2 border-[#C4952F] text-[#C4952F]"
          : "text-gray-500 hover:text-gray-800"
      }`}
    >
      {children}
    </button>
  );
}

export function TabsContent({ value: tabValue, value, children }) {
  if (value !== tabValue) return null;
  return <div className="pt-2">{children}</div>;
}
