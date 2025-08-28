import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import AdminWhatsAppPanel from "./AdminWhatsAppPanel.jsx";

/*
  MAXED-OUT WHATSAPP-LIKE ADMIN DASHBOARD
  + Autoresponder menu for incoming messages
  + Full mobile-first UI
  + Dark/light toggle
  + User-wise sessions & messages
  + Socket.IO real-time + REST fallback
  + Optimistic UI updates
  + Actions & raw API integration
*/

export default function App() {
  const [token, setToken] = useState("");
  const [darkMode, setDarkMode] = useState(localStorage.getItem('darkMode') === 'true');
  const [sessions, setSessions] = useState([]);
  const [messages, setMessages] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [connected, setConnected] = useState(false);
  const [composerText, setComposerText] = useState("");
  const [showSessionsPanel, setShowSessionsPanel] = useState(false);
  const [showActionsPanel, setShowActionsPanel] = useState(false);

  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);

  const socketUrl = import.meta.env?.VITE_SOCKET_URL || "http://kaapavchatbot.duckdns.org:5555";
  const apiBase = import.meta.env?.VITE_API_URL || "http://140.245.237.152";

 // Dark mode
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('darkMode', darkMode);
  }, [darkMode]);

  // Auto-scroll
  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(scrollToBottom, [messages]);

  // Fetch sessions
  const fetchSessions = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${apiBase}/admin/sessions`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return console.warn(await res.text());
      const data = await res.json();
      setSessions(data || []);
      if (data?.length && !selectedSession) {
        setSelectedSession(data[0].userId);
        loadMessages(data[0].userId);
      }
    } catch (e) { console.error(e); }
  };

  // Fetch messages per session
  const loadMessages = async (userId) => {
    if (!token) return;
    try {
      const res = await fetch(`${apiBase}/admin/messages/${userId}`, { headers: { Authorization: `Bearer ${token}` } });
      const msgs = await res.json();
      setMessages(Array.isArray(msgs) ? msgs.reverse() : []);
    } catch (e) { console.error("Failed to load messages", e); }
  };

  // Send admin message (with optimistic UI)
  const sendAdminText = async (payloadOverride) => {
    if (!selectedSession) return alert("Select a session first");
    const text = payloadOverride || composerText.trim();
    if (!text) return;

    const payload = { to: selectedSession, text };

    setMessages(prev => [{ from: "admin", to: selectedSession, text, ts: Date.now(), direction: 'out' }, ...prev]);

    try {
      if (socketRef.current?.connected) socketRef.current.emit('admin_send_message', payload);
      else {
        const res = await fetch(`${apiBase}/admin/send`, {
          method:'POST',
          headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` },
          body: JSON.stringify(payload)
        });
        if (!res.ok) alert('Fallback send failed: '+await res.text());
      }
    } catch (e) { console.error(e); alert('Send failed: ' + e.message); }
    finally { if(!payloadOverride) setComposerText(''); }
  };

  // Socket connection
  const connect = () => {
    if (!token) return alert("Enter admin token");
    if (socketRef.current) socketRef.current.disconnect();

    const sock = io(socketUrl, { auth: { token }, transports:["websocket"], reconnectionAttempts:5 });

    sock.on("connect", () => { setConnected(true); fetchSessions(); });
    sock.on("disconnect", () => setConnected(false));

    sock.on("sessions_snapshot", arr => setSessions(arr));
    sock.on("session_update", s => {
      setSessions(prev => {
        const map = new Map(prev.map(p => [p.userId, p]));
        map.set(s.userId, { ...(map.get(s.userId) || {}), ...s });
        return Array.from(map.values()).sort((a,b) => a.updatedAt < b.updatedAt ? 1 : -1);
      });
    });

    // Incoming message handler + autoresponder menu trigger
    sock.on("incoming_message", m => {
      setMessages(prev => [{ ...m, direction: "in" }, ...prev]);
      if (m.from) setTimeout(() => sendAdminText("📜 Here is the menu: Option 1, Option 2, Option 3"), 500);
    });

    sock.on("outgoing_message", m => setMessages(prev => [{ ...m, direction: "out" }, ...prev]));

    socketRef.current = sock;
  };

  const doAction = async (action, to) => {
    if (!token) return alert("Missing admin token");
    try {
      const res = await fetch(`${apiBase}/admin/send`, {
        method:'POST',
        headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` },
        body: JSON.stringify({ to, action })
      });
      if (!res.ok) alert(await res.text());
      else alert(`Action sent: ${action}`);
    } catch(e) { console.error(e); alert(e.message); }
  };

  const simulateIncoming = async () => {
    if (!selectedSession || !token) return alert('Pick a session / provide token');
    const text = prompt('Message text to simulate incoming:');
    if (!text) return;
    try {
      const res = await fetch(`${apiBase}/admin/simulate`, {
        method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` },
        body: JSON.stringify({ to:selectedSession, text })
      });
      if (!res.ok) return alert(await res.text());
      alert('Simulated message sent');
    } catch(e){ console.error(e); }
  };

  const onSelectSession = (userId) => { setSelectedSession(userId); loadMessages(userId); setShowSessionsPanel(false); };

  // UI
  return (
    <div className={`min-h-screen flex flex-col bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100`}>
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <img src="/KAAPAV LOGO_HD FULL PNG.jpg" alt="Kaapav" className="h-9 w-9 object-contain" />
          <div>
            <div className="text-lg font-serif font-semibold">KAAPAV</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Concierge</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={()=>setShowSessionsPanel(true)} className="px-3 py-2 rounded-full border border-gray-200 text-sm">Sessions</button>
          <button onClick={()=>setShowActionsPanel(true)} className="px-3 py-2 rounded-full bg-yellow-400 text-black font-medium">Actions</button>
          <button onClick={()=>setDarkMode(!darkMode)} className="px-3 py-2 rounded-full border border-gray-200 text-sm">{darkMode?'Light':'Dark'}</button>
        </div>
      </header>

      {/* Selected session */}
      <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex justify-between">
        <div>
          <div className="text-sm font-medium">{selectedSession || "No session selected"}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">{sessions.find(s=>s.userId===selectedSession)?.lastMenu||''}</div>
        </div>
        <div className="text-xs text-gray-400">{connected?'Connected':'Disconnected'}</div>
      </div>

      {/* Chat */}
      <main className="flex-1 overflow-auto p-4 bg-gray-50 dark:bg-gray-800">
        <div className="flex flex-col gap-3">
          {messages.length===0 && <div className="text-center text-gray-400 mt-12">No messages yet</div>}
          {messages.map((m,i)=>{
            const isOut = m.direction==='out'||m.from==='admin';
            return (
              <div key={i} className={`max-w-10/12 p-3 rounded-2xl shadow ${isOut?'self-end bg-gradient-to-r from-yellow-400 to-yellow-500 text-black':'self-start bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-600'}`}>
                <div className="text-xs opacity-70 mb-1">{isOut?'You':(m.from||'User')} • {new Date(m.ts||m.createdAt||Date.now()).toLocaleTimeString()}</div>
                <div className="text-sm whitespace-pre-wrap">{m.text||JSON.stringify(m.payload||m)}</div>
              </div>
            );
          })}
          <div ref={messagesEndRef}></div>
        </div>
      </main>

      {/* Composer */}
      <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex gap-3 items-center">
        <textarea rows={1} className="flex-1 resize-none px-4 py-3 rounded-full border border-gray-200 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-yellow-400" placeholder={selectedSession?"Type your reply...":"Select a session first"} value={composerText} onChange={e=>setComposerText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendAdminText();}}} disabled={!selectedSession}/>
        <button onClick={sendAdminText} disabled={!selectedSession||!composerText.trim()} className={`px-4 py-2 rounded-full ${(!selectedSession||!composerText.trim())?'bg-gray-300 text-gray-600':'bg-yellow-400 text-black font-medium'}`}>Send</button>
      </div>

      {/* Sessions Panel */}
      {showSessionsPanel && (
        <div className="fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowSessionsPanel(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-4/5 max-w-xs bg-white p-4 overflow-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Sessions</h3>
              <button onClick={() => setShowSessionsPanel(false)} className="text-gray-500">Close</button>
            </div>
            <div className="space-y-2">
              {sessions.map((s) => (
                <div key={s.userId} onClick={()=>onSelectSession(s.userId)} className={`p-3 rounded-lg cursor-pointer ${selectedSession===s.userId?'bg-yellow-100 border border-yellow-200':'hover:bg-gray-50'}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">{s.userId}</div>
                      <div className="text-xs text-gray-500">{s.lastMenu||'—'}</div>
                      {s.lastMessage && <div className="text-xs text-gray-400 truncate max-w-[180px]">💬 {s.lastMessage}</div>}
                    </div>
                    <div className="text-xs text-gray-400">{new Date(s.updatedAt).toLocaleTimeString()}</div>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      )}

      {/* Actions Panel */}
      {showActionsPanel && (
        <div className="fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowActionsPanel(false)} />
          <aside className="absolute right-0 top-0 bottom-0 w-4/5 max-w-xs bg-white p-4 overflow-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Actions</h3>
              <button onClick={() => setShowActionsPanel(false)} className="text-gray-500">Close</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500">Selected session</label>
                <div className="mt-1 text-sm p-2 bg-gray-50 rounded">{selectedSession || 'Pick a session'}</div>
              </div>
              <div>
                <label className="text-xs text-gray-500">Quick send</label>
                <div className="mt-2 flex flex-col gap-2">
                  <button onClick={()=>{doAction('sendPaymentMenu', selectedSession); setShowActionsPanel(false)}} className="w-full px-3 py-2 rounded bg-pink-600 text-white">Send Payment Options</button>
                  <button onClick={()=>{doAction('sendChatMenu', selectedSession); setShowActionsPanel(false)}} className="w-full px-3 py-2 rounded bg-teal-600 text-white">Send Chat Menu</button>
                  <button onClick={()=>{simulateIncoming(); setShowActionsPanel(false)}} className="w-full px-3 py-2 rounded bg-gray-800 text-white">Simulate Incoming</button>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500">Raw API</label>
                <div className="mt-2 grid grid-cols-1 gap-2">
                  <SendRawAction token={token} apiBase={apiBase} />
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

// Raw API sender
function SendRawAction({ token, apiBase }) {
  const [to,setTo]=useState(""); const [payload,setPayload]=useState("");
  const call = async ()=>{
    if(!token)return alert('Missing token');
    try{
      const res = await fetch(`${apiBase}/admin/raw`,{
        method:'POST',
        headers:{'Content-Type':'lication/json',Authorization:`Bearer ${token}`},
        body:JSON.stringify({to,payload:payload?JSON.parse(payload):{}})
      });
      if(!res.ok)return alert('Raw call failed: '+(await res.text()));
      alert('Raw call sent');
    }catch(e){alert('Invalid JSON or request error');}
  };
  return (
    <div className="flex flex-col gap-2">
      <input className="border px-2 py-1 rounded" placeholder="to (919...)" value={to} onChange={e=>setTo(e.target.value)} />
      <textarea className="border px-2 py-1 rounded h-24" placeholder='payload JSON (optional)' value={payload} onChange={e=>setPayload(e.target.value)} />
      <button onClick={call} className="px-3 py-2 bg-gray-800 text-white rounded">Send Raw</button>
    </div>
  );
}
