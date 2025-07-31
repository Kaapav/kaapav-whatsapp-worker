import { useState } from "react";

const kaapavLogo = "https://kaapav.s3.ap-south-1.amazonaws.com/KAAPAV_LOGO_HD_FULL_PNG.jpg";

const App = () => {
  const [messages, setMessages] = useState([
    { from: "bot", text: "🎉 Welcome to KAAPAV Fashion Jewellery! 👋\nWhat can we assist you with today?" }
  ]);
  const [input, setInput] = useState("");

  const handleSend = () => {
    if (!input.trim()) return;
    const userMsg = { from: "user", text: input };
    const botMsg = { from: "bot", text: "🤖 Please wait while we check..." };
    setMessages([...messages, userMsg, botMsg]);
    setInput("");
  };

  return (
    <div className="min-h-screen bg-pink-50 p-4">
      <div className="max-w-md mx-auto bg-white shadow-xl rounded-2xl overflow-hidden">
        <div className="bg-pink-100 p-4 text-center text-xl font-bold">
          <img src={kaapavLogo} alt="Kaapav" className="h-12 mx-auto mb-2" />
          Kaapav WhatsApp Bot
        </div>
        <div className="p-4 space-y-2 max-h-96 overflow-y-auto">
          {messages.map((msg, i) => (
            <div key={i} className={`text-sm p-2 rounded-xl ${msg.from === "bot" ? "bg-pink-100 text-left" : "bg-green-100 text-right"}`}>{msg.text}</div>
          ))}
        </div>
        <div className="p-4 border-t flex">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 p-2 border rounded-l-xl"
          />
          <button onClick={handleSend} className="bg-pink-500 text-white px-4 rounded-r-xl">Send</button>
        </div>
      </div>
    </div>
  );
};

export default App;
