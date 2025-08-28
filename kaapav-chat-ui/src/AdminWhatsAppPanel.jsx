import React, { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Sun, Moon, MessageCircle, Send, Users } from "lucide-react";

export default function AdminWhatsAppPanel() {
  const [darkMode, setDarkMode] = useState(localStorage.getItem("darkMode") === "true");
  const [sessions, setSessions] = useState([]);
  const [messages, setMessages] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [composerText, setComposerText] = useState("");
  const [connected, setConnected] = useState(false);
  const [showSessionsPanel, setShowSessionsPanel] = useState(false);
  const [showActionsPanel, setShowActionsPanel] = useState(false);

  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);

  const socketUrl = import.meta.env?.VITE_SOCKET_URL || "http://kaapavchatbot.duckdns.org:5555";
  const apiBase = import.meta.env?.VITE_API_URL || "http://140.245.237.152";
  const token = "YOUR_ADMIN_TOKEN"; // later replace with input

  // Dark mode toggle
  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    localStorage.setItem("darkMode", darkMode);
  }, [darkMode]);

  // Scroll chat
  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(scrollToBottom, [messages]);

  // Connect socket
  useEffect(() => {
    if (!token) return;
    const sock = io(socketUrl, { auth: { token }, transports: ["websocket"] });

    sock.on("connect", () => setConnected(true));
    sock.on("disconnect", () => setConnected(false));

    sock.on("sessions_snapshot", setSessions);
    sock.on("incoming_message", (m) => {
      setMessages((prev) => [...prev, { ...m, direction: "in" }]);
    });
    sock.on("outgoing_message", (m) => {
      setMessages((prev) => [...prev, { ...m, direction: "out" }]);
    });

    socketRef.current = sock;
    return () => sock.disconnect();
  }, []);

  const sendMessage = () => {
    if (!composerText.trim() || !selectedSession) return;
    const msg = { to: selectedSession, text: composerText };
    socketRef.current?.emit("admin_send_message", msg);
    setMessages((prev) => [...prev, { ...msg, from: "admin", direction: "out", ts: Date.now() }]);
    setComposerText("");
  };

  return (
    <div className="h-screen flex flex-col bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <MessageCircle className="text-yellow-400" />
          <span className="font-serif font-bold text-lg">KAAPAV Concierge</span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowSessionsPanel(true)}>
            <Users size={16} /> Sessions
          </Button>
          <Button className="bg-yellow-400 text-black" size="sm" onClick={() => setShowActionsPanel(true)}>
            Actions
          </Button>
          <Button variant="outline" size="sm" onClick={() => setDarkMode(!darkMode)}>
            {darkMode ? <Sun size={16} /> : <Moon size={16} />}
          </Button>
        </div>
      </header>

      {/* Chat window */}
      <Card className="flex-1 m-3 flex flex-col">
        <CardContent className="flex-1 overflow-auto space-y-3 p-4">
          {messages.map((m, i) => {
            const isOut = m.direction === "out" || m.from === "admin";
            return (
              <div
                key={i}
                className={`max-w-[70%] p-3 rounded-2xl shadow ${
                  isOut
                    ? "self-end bg-gradient-to-r from-yellow-400 to-yellow-500 text-black"
                    : "self-start bg-gray-200 dark:bg-gray-700"
                }`}
              >
                <div className="text-xs opacity-70 mb-1">
                  {isOut ? "You" : m.from || "User"} •{" "}
                  {new Date(m.ts || Date.now()).toLocaleTimeString()}
                </div>
                <div className="text-sm">{m.text}</div>
              </div>
            );
          })}
          <div ref={messagesEndRef}></div>
        </CardContent>

        {/* Composer */}
        <div className="flex items-center gap-2 border-t p-3">
          <Input
            placeholder="Type a reply..."
            value={composerText}
            onChange={(e) => setComposerText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
          />
          <Button onClick={sendMessage} className="bg-yellow-400 text-black">
            <Send size={16} />
          </Button>
        </div>
      </Card>

      {/* Sessions side panel */}
      <Sheet open={showSessionsPanel} onOpenChange={setShowSessionsPanel}>
        <SheetContent side="left" className="w-80">
          <SheetHeader className="font-semibold mb-3">Sessions</SheetHeader>
          <div className="space-y-2">
            {sessions.map((s) => (
              <Card
                key={s.userId}
                className={`p-3 cursor-pointer ${
                  selectedSession === s.userId ? "border-yellow-400" : ""
                }`}
                onClick={() => setSelectedSession(s.userId)}
              >
                <div className="text-sm font-medium">{s.userId}</div>
                <div className="text-xs text-gray-500">{s.lastMessage}</div>
              </Card>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {/* Actions side panel */}
      <Sheet open={showActionsPanel} onOpenChange={setShowActionsPanel}>
        <SheetContent side="right" className="w-80">
          <SheetHeader className="font-semibold mb-3">Actions</SheetHeader>
          <div className="space-y-2">
            <Button className="bg-pink-500 w-full">Send Payment Options</Button>
            <Button className="bg-teal-500 w-full">Send Chat Menu</Button>
            <Button className="bg-gray-800 text-white w-full">Simulate Incoming</Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
