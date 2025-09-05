import { useState } from "react";
import AdminWhatsAppPanel from "./AdminWhatsAppPanel";

export default function App() {
  const [theme, setTheme] = useState("light");

  return (
    <div
      className={`min-h-screen ${
        theme === "light" ? "bg-white text-black" : "bg-zinc-900 text-white"
      }`}
    >
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b">
        <div>
          <h1 className="text-3xl font-serif font-semibold gold-text">
            KAAPAV Concierge
          </h1>
          <p className="text-sm opacity-70">Admin WhatsApp Panel</p>
        </div>
        <button
          onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
          className="btn btn-outline"
        >
          {theme === "light" ? "Dark" : "Light"}
        </button>
      </header>

      {/* Main Panel */}
      <main className="p-6">
        <AdminWhatsAppPanel />
      </main>
    </div>
  );
}
