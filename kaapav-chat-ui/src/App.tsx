// src/App.tsx (or your top component)
import React from "react";
import { WA, startSession } from "./waBridge";

export default function App() {
  const [, setTick] = React.useState(0);

  React.useEffect(() => {
    // re-render whenever waBridge nudges
    const onUpdate = () => setTick(t => t + 1);
    window.addEventListener("wa:update", onUpdate);
    startSession("9148330016");
    return () => window.removeEventListener("wa:update", onUpdate);
  }, []);

  // guards: never assume arrays
  const contacts = Array.isArray(WA.contacts) ? WA.contacts : [];
  const chats    = Array.isArray(WA.chats)    ? WA.chats    : [];

  return (
    <div className="kp-app min-h-screen">
      {WA.status === "scan" && WA.qr ? (
        <div className="flex items-center justify-center h-screen">
          <img src={WA.qr} alt="Scan QR" style={{ width: 300, height: 300 }} />
        </div>
      ) : (
        // 👇 Replace these with your clone’s real components / props
        <YourSidebar contacts={contacts} chats={chats} />
        // <YourChatPane messages={(id)=>WA.messages.get(id) ?? []} />
      )}
    </div>
  );
}
