import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

const socket = io(import.meta.env.VITE_SOCKET_URL, {
  auth: { token: import.meta.env.VITE_ADMIN_TOKEN },
});

export default function ChatPanel() {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    socket.on("incoming_message", (msg) => {
      setMessages((prev) => [...prev, { ...msg, from: "customer" }]);
    });
    return () => socket.off("incoming_message");
  }, []);

  const sendMessage = () => {
    if (!to || !text) return;
    socket.emit("admin_send_message", { to, text });
    setMessages((prev) => [...prev, { text, from: "admin", to }]);
    setText("");
  };

  return (
    <div className="h-screen flex items-center justify-center bg-gray-100 p-4">
      <Card className="w-full max-w-md h-full flex flex-col">
        <CardContent className="flex flex-col flex-1 p-0">
          <ScrollArea className="flex-1 p-4">
            {messages.map((m, i) => (
              <div key={i} className={`mb-2 ${m.from === "admin" ? "text-right" : "text-left"}`}>
                <span
                  className={`inline-block px-3 py-2 rounded-lg ${
                    m.from === "admin" ? "bg-blue-500 text-white" : "bg-gray-200"
                  }`}
                >
                  {m.text}
                </span>
              </div>
            ))}
          </ScrollArea>
          <div className="p-4 border-t flex gap-2">
            <Input
              placeholder="Customer number (e.g. 919148330016)"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <div className="p-4 border-t flex gap-2">
            <Input
              placeholder="Type your reply..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            />
            <Button onClick={sendMessage}>Send</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
