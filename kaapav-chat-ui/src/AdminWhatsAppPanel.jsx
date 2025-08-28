import React, { useEffect, useState } from "react";
import { io } from "socket.io-client";

// KAAPAV Admin WhatsApp Panel — Gold & White Luxury Theme
// Usage: Drop this component into your React app (Vite/CRA). TailwindCSS is
// expected but minimal inline styles are included to ensure the gold/white
// aesthetic even without Tailwind. Pass `socketUrl` and `apiBase` props or set
// env vars.

const GOLD = "#D4AF37"; // primary brand gold
const MUTED = "#F7F3F0"; // soft off-white background

export default function AdminWhatsAppPanel({
  socketUrl = "http://localhost:5555",
  apiBase = "http://localhost:5555",
}) {
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [newMessage, setNewMessage] = useState("");
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    // safe dummy data so UI never crashes
    setConversations([
      { id: "c1", name: "Sophie", lastMessage: "Hi — is this in stock?", unread: 1 },
      { id: "c2", name: "Riya", lastMessage: "Where's my order?", unread: 0 },
    ]);
    setMessages([
      { id: "m1", from: "Sophie", text: "Hello!", timestamp: Date.now(), direction: "in" },
      { id: "m2", from: "Admin", text: "Hi Sophie 👋 — I can help!", timestamp: Date.now(), direction: "out" },
    ]);

    try {
      const s = io(socketUrl, { transports: ["websocket"] });
      s.on("connect", () => console.log("Socket connected"));
      s.on("incoming_message", (msg) => {
        setMessages((prev) => [...prev, { id: Date.now(), from: msg.from, text: msg.text, direction: "in" }]);
        // autoresponder (golden touch)
        const text = (msg.text || "").toLowerCase();
        if (text.includes("hi") || text.includes("hello")) {
          sendAutoReply(msg.from, `Hi ${msg.from.split(' ')[0] || ''}! Thanks for contacting KAAPAV. How can we assist today?`);
        }
      });
      setSocket(s);
      return () => s.close();
    } catch (err) {
      console.warn("Socket init failed, running in offline UI mode", err);
    }
  }, [socketUrl]);

  const sendAutoReply = async (chatId, text) => {
    try {
      await fetch(`${apiBase}/api/conversations/${chatId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      setMessages((prev) => [...prev, { id: Date.now(), from: "KAAPAV", text, direction: "out" }]);
    } catch (e) {
      console.error("auto-reply failed", e);
    }
  };

  const handleSend = async () => {
    if (!selectedChat || !newMessage) return;
    try {
      await fetch(`${apiBase}/api/conversations/${selectedChat}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: newMessage }),
      });
      setMessages((prev) => [...prev, { id: Date.now(), from: "Admin", text: newMessage, direction: "out" }]);
      setNewMessage("");
    } catch (err) {
      console.error("Send failed:", err);
    }
  };

  return (
    <div style={{ fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial' }} className="h-screen flex">
      {/* LEFT: Sidebar */}
      <div style={{ background: '#0b0b0b', color: MUTED }} className="w-1/3 p-6 flex flex-col">
        <div className="flex items-center justify-between mb-6">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 56, height: 56, borderRadius: 8, background: GOLD, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 20 }}>K</div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>KAAPAV</div>
              <div style={{ fontSize: 12, color: '#f3eee9' }}>Fashion Jewellery</div>
            </div>
          </div>
          <div style={{ color: GOLD, fontWeight: 600 }}>Live</div>
        </div>

        <div style={{ borderTop: `1px solid rgba(255,255,255,0.04)`, paddingTop: 12 }}>
          <div style={{ color: GOLD, fontWeight: 700, marginBottom: 8 }}>Conversations</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {conversations.map((c) => (
              <div
                key={c.id}
                onClick={() => setSelectedChat(c.id)}
                style={{
                  background: selectedChat === c.id ? 'rgba(212,175,55,0.08)' : 'transparent',
                  padding: 12,
                  borderRadius: 10,
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ color: '#fff', fontWeight: 600 }}>{c.name}</div>
                  {c.unread ? <div style={{ background: GOLD, color: '#000', padding: '2px 8px', borderRadius: 20, fontSize: 12 }}>{c.unread}</div> : null}
                </div>
                <div style={{ color: '#d9d2c8', fontSize: 13 }}>{c.lastMessage}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 'auto' }}>
          <button style={{ width: '100%', padding: '10px 12px', background: GOLD, color: '#000', borderRadius: 8, fontWeight: 700 }}>New Message</button>
          <div style={{ marginTop: 12, fontSize: 12, color: '#bfb7af' }}>Connected to: <span style={{ color: '#fff' }}>{socket ? 'Socket' : 'Offline UI'}</span></div>
        </div>
      </div>

      {/* RIGHT: Chat Area */}
      <div style={{ flex: 1, background: MUTED, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: 20, borderBottom: '1px solid rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Conversation</div>
            <div style={{ color: '#6b655f', fontSize: 13 }}>Customer replies and quick actions</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ border: `1px solid ${GOLD}`, background: 'transparent', color: '#000', padding: '8px 12px', borderRadius: 8 }}>Orders</button>
            <button style={{ border: `1px solid ${GOLD}`, background: GOLD, color: '#000', padding: '8px 12px', borderRadius: 8 }}>New</button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {messages.map((m) => (
            <div key={m.id} style={{ marginBottom: 12, display: 'flex', justifyContent: m.direction === 'out' ? 'flex-end' : 'flex-start' }}>
              <div style={{ maxWidth: '70%', padding: '10px 14px', borderRadius: 14, background: m.direction === 'out' ? GOLD : '#fff', color: m.direction === 'out' ? '#000' : '#111', boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}>
                <div style={{ fontSize: 14 }}>{m.text}</div>
                <div style={{ fontSize: 11, color: m.direction === 'out' ? '#111' : '#6b655f', marginTop: 6 }}>{new Date(m.timestamp).toLocaleString()}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ padding: 16, borderTop: '1px solid rgba(0,0,0,0.06)', display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type your reply..."
            style={{ flex: 1, padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(0,0,0,0.06)', background: '#fff' }}
          />
          <button onClick={handleSend} style={{ padding: '10px 16px', borderRadius: 10, background: GOLD, color: '#000', fontWeight: 700 }}>Send</button>
        </div>
      </div>
    </div>
  );
}
