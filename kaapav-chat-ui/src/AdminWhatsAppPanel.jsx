import React, { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Sun, Moon, MessageCircle, Send, Search, Check, CheckCheck,
  Upload, UserCircle2, Sparkles, Clock, Megaphone, Tags, NotebookPen,
  ShoppingCart, CreditCard, Truck, BarChart3, BadgeCheck, Star, Package,
  ListPlus, Users, Trophy, Plus, Minus, AlertTriangle, Mic, MicOff, Bot,
  ClipboardList, Database, Filter, CalendarClock, BadgeInfo
} from "lucide-react";

/**
 * KAAPAV Cockpit — MAX v2 (All Planned Inserts wired as placeholders)
 * Style: shadcn/ui + Tailwind + lucide-react
 * Backends (placeholders only):
 * - POST   /csat/submit
 * - GET    /ai/shifthandover
 * - SOCKET /socket.io/internal
 * - GET    /alerts/feed
 * - POST   /followup/schedule
 * - POST   /ai/transcribe
 * - GET    /audit/logs
 * - GET    /crm/360?user=...
 * - GET    /ai/knowledge?q=...
 * - GET    /ai/upsell?user=...
 * - GET    /analytics/kpi-embed (returns { url }) OR set dashboardUrl below
 */

export default function AdminWhatsAppPanel() {
  
  // ===== CONFIG =====
  const socketUrl = "https://kaapav.chickenkiller.com";           // main customer chat
  const internalSocketUrl = "https://kaapav.chickenkiller.com"; // internal agent chat
  const apiBase = "https://kaapav.chickenkiller.com";                  // REST base
  const token = "KAAPAV_ADMIN_123";         // TODO: replace with real JWT
  const defaultDashboardUrl = "";           // Optional: static Metabase embed URL

  // ===== TENANT & ROLE =====
  const [tenant, setTenant] = useState(localStorage.getItem("tenant") || "kaapav-default");
  const [role, setRole] = useState(localStorage.getItem("role") || "admin"); // admin | agent | viewer

  // ===== THEME/CONN =====
  const [dark, setDark] = useState(localStorage.getItem("darkMode") === "true");
  const [connected, setConnected] = useState(false);
  const [alerts, setAlerts] = useState([]); // /alerts/feed

  // ===== SESSIONS & CHAT =====
  const [sessions, setSessions] = useState([]);
  const [sessionFilter, setSessionFilter] = useState("");
  const [selected, setSelected] = useState(null);
  const [profile, setProfile] = useState(null);
  const [messages, setMessages] = useState([]);
  const [composer, setComposer] = useState("");
  const [isCustomerTyping, setIsCustomerTyping] = useState(false);

  // AI + Assist
  const [suggestions, setSuggestions] = useState([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [sentiment, setSentiment] = useState(null);
  const [autoAssist, setAutoAssist] = useState(true);
  const [leadScore, setLeadScore] = useState({ label: "", score: 0 });
  const [upsell, setUpsell] = useState([]); // /ai/upsell suggestions for selected

  // CRM quick fields
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState([]);
  const [assignTo, setAssignTo] = useState("");
  const [view360, setView360] = useState(null); // /crm/360

  // Broadcast / Campaigns
  const [broadcastText, setBroadcastText] = useState("");
  const [broadcastTag, setBroadcastTag] = useState("ALL");
  const [dripEnabled, setDripEnabled] = useState(false);

  // Commerce helpers
  const [amount, setAmount] = useState("");
  const [payNote, setPayNote] = useState("");
  const [awb, setAwb] = useState("");

  // Catalog
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [products, setProducts] = useState([]);

  // NEW: Send Catalogue recipients (multi-number)
  const [catalogRecipients, setCatalogRecipients] = useState("");

  // Polls
  const [pollQ, setPollQ] = useState("");
  const [pollOptions, setPollOptions] = useState(["Yes", "No"]);
  const [pollMulti, setPollMulti] = useState(false);

  // Leaderboard / Gamification
  const [agents, setAgents] = useState([]);
  const [boardPeriod, setBoardPeriod] = useState("day");

  // Internal Agent Chat
  const [internalMsgs, setInternalMsgs] = useState([]);
  const [internalComposer, setInternalComposer] = useState("");

  // CSAT Modal
  const [showCSAT, setShowCSAT] = useState(false);
  const [csat, setCsat] = useState(5);
  const [csatNote, setCsatNote] = useState("");

  // Follow-up scheduler
  const [fuWhen, setFuWhen] = useState(""); // ISO string
  const [fuNote, setFuNote] = useState("");

  // Knowledge Base
  const [kbQuery, setKbQuery] = useState("");
  const [kbResults, setKbResults] = useState([]);

  // Audit Logs & Shift Handover
  const [auditLogs, setAuditLogs] = useState([]);
  const [shiftText, setShiftText] = useState("");

  // KPI Dashboard
  const [dashboardUrl, setDashboardUrl] = useState(defaultDashboardUrl);

  // Offline Outbox
  const outboxKey = "kaapav_outbox";

  const socketRef = useRef(null);
  const internalSockRef = useRef(null);
  const messagesEndRef = useRef(null);
  const typingTimeout = useRef(null);

  // ===== EFFECTS =====
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("darkMode", String(dark));
  }, [dark]);

  useEffect(() => { localStorage.setItem("tenant", tenant); }, [tenant]);
  useEffect(() => { localStorage.setItem("role", role); }, [role]);

  // Alerts polling
  useEffect(() => {
    let stop = false;
    const poll = async () => {
      try {
        const r = await fetch(`${apiBase}/alerts/feed?tenant=${tenant}`);
        const j = await r.json();
        if (!stop) setAlerts(Array.isArray(j) ? j : []);
      } catch {}
    };
    poll();
    const t = setInterval(poll, 20000);
    return () => { stop = true; clearInterval(t); };
  }, [tenant]);

  // Main socket (customer chat)
  useEffect(() => {
    if (!token) return;
    const sock = io(socketUrl, { auth: { token, tenant }, transports: ["websocket"] });
    socketRef.current = sock;

    sock.on("connect", () => { setConnected(true); flushOutbox(); });
    sock.on("disconnect", () => setConnected(false));
    sock.on("sessions_snapshot", (list) => setSessions(list || []));

    sock.on("incoming_message", (m) => {
      const nm = normalizeMsg(m, "in");
      setMessages((prev) => [...prev, nm]);
      setIsCustomerTyping(false);
      safeRunSentiment(nm);
      if (autoAssist) { safeSuggest(nm); safeLeadScore(nm); }
    });

    sock.on("outgoing_message", (m) => setMessages((prev) => [...prev, normalizeMsg(m, "out")]));

    sock.on("typing", () => {
      setIsCustomerTyping(true);
      clearTimeout(typingTimeout.current);
      typingTimeout.current = setTimeout(() => setIsCustomerTyping(false), 2500);
    });

    // Load KPI embed URL (optional)
    (async () => {
      try {
        if (!defaultDashboardUrl) {
          const r = await fetch(`${apiBase}/analytics/kpi-embed?tenant=${tenant}`);
          const j = await r.json();
          if (j?.url) setDashboardUrl(j.url);
        }
      } catch {}
    })();

    return () => sock.disconnect();
  }, [token, autoAssist, tenant]);

  // Internal agent chat socket
  useEffect(() => {
    const isAllowed = role === "admin" || role === "agent";
    if (!token || !isAllowed) return;
    const sock = io(internalSocketUrl, { auth: { token, tenant }, transports: ["websocket"] });
    internalSockRef.current = sock;
    sock.on("internal_message", (m) => setInternalMsgs((p) => [...p, { ...m, ts: m.ts || Date.now() }]));
    return () => sock.disconnect();
  }, [token, role, tenant]);

  // Load convo + profile + 360 + upsell on select
  useEffect(() => {
    if (!selected) return;
    (async () => {
      try {
        const [h, p, v, u] = await Promise.all([
          fetch(`${apiBase}/messages/history?tenant=${tenant}&user=${selected}`).then(r=>r.json()).catch(()=>[]),
          fetch(`${apiBase}/crm/profile?tenant=${tenant}&user=${selected}`).then(r=>r.json()).catch(()=>({})),
          fetch(`${apiBase}/crm/360?tenant=${tenant}&user=${selected}`).then(r=>r.json()).catch(()=>null),
          fetch(`${apiBase}/ai/upsell?tenant=${tenant}&user=${selected}`).then(r=>r.json()).catch(()=>[]),
        ]);
        setMessages((h||[]).map(x => normalizeMsg(x, x.direction)));
        setProfile(p || {});
        setNotes(p?.notes || "");
        setTags(p?.tags || []);
        setAssignTo(p?.assignedTo || "");
        setView360(v);
        setUpsell(Array.isArray(u) ? u : []);
      } catch {}
    })();
  }, [selected, tenant]);

  // Leaderboard auto-refresh (also returns streaks/badges)
  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const res = await fetch(`${apiBase}/analytics/agents?tenant=${tenant}&period=${boardPeriod}`);
        const data = await res.json();
        if (!stop) setAgents(Array.isArray(data) ? data : []);
      } catch {}
    };
    load();
    const t = setInterval(load, 30000);
    return () => { stop = true; clearInterval(t); };
  }, [boardPeriod, tenant]);

  // ===== HELPERS =====
  const normalizeMsg = (m, direction) => ({
    id: m.id || `${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
    from: m.from,
    to: m.to,
    text: m.text || "",
    media: m.media,
    ts: m.ts || Date.now(),
    status: m.status || (direction === "out" ? "sent" : "delivered"),
    direction: direction === "out" ? "out" : "in",
    internal: !!m.internal,
  });

  const safeRunSentiment = async (msg) => {
    try {
      const res = await fetch(`${apiBase}/ai/sentiment?tenant=${tenant}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: msg.text })
      });
      const data = await res.json();
      setSentiment(data.label);
    } catch (e) { console.warn("sentiment failed", e); }
  };

  const safeLeadScore = async (msg) => {
    const text = (msg?.text || "").toLowerCase();
    let score = 0; let label = "Cold";
    if (/(buy|price|order|payment|cod|deliver)/.test(text)) score += 60;
    if (/(today|now|urgent|immediately)/.test(text)) score += 30;
    if (/(discount|offer)/.test(text)) score += 10;
    if (score >= 75) label = "Hot"; else if (score >= 40) label = "Warm";
    setLeadScore({ label, score });
  };

  const safeSuggest = async (msg) => {
    setAiBusy(true);
    try {
      const res = await fetch(`${apiBase}/ai/suggest?tenant=${tenant}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: selected, last: msg.text })
      });
      const data = await res.json();
      setSuggestions(Array.isArray(data) ? data : []);
    } catch (e) { console.warn("suggest failed", e); }
    finally { setAiBusy(false); }
  };

  // Offline queue helpers
  const enqueueOutbox = (item) => {
    try {
      const cur = JSON.parse(localStorage.getItem(outboxKey) || "[]");
      localStorage.setItem(outboxKey, JSON.stringify([...cur, item]));
    } catch {}
  };
  const flushOutbox = () => {
    try {
      const cur = JSON.parse(localStorage.getItem(outboxKey) || "[]");
      if (!cur.length) return;
      cur.forEach((it) => socketRef.current?.emit("admin_send_message", it));
      localStorage.removeItem(outboxKey);
    } catch {}
  };

  const sendMessage = () => {
    if (!composer.trim() || !selected) return;
    const payload = { to: selected, text: composer };
    if (!connected) { enqueueOutbox(payload); }
    socketRef.current?.emit("admin_send_message", payload);
    setMessages((prev) => [...prev, normalizeMsg({ ...payload, from: "admin" }, "out")]);
    setComposer("");
  };

  const uploadMedia = async (file) => {
    if (!file || !selected) return;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("to", selected);
    const res = await fetch(`${apiBase}/messages/upload?tenant=${tenant}`, { method: "POST", body: fd });
    const msg = await res.json();
    setMessages((prev)=>[...prev, normalizeMsg(msg, "out")]);
  };

  const saveNotes = async () => {
    await fetch(`${apiBase}/crm/notes?tenant=${tenant}`, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ user: selected, notes }) });
  };
  const saveTags = async () => {
    await fetch(`${apiBase}/crm/tags?tenant=${tenant}`, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ user: selected, tags }) });
  };
  const saveAssign = async () => {
    await fetch(`${apiBase}/crm/assign?tenant=${tenant}`, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ user: selected, assignedTo: assignTo }) });
  };

  const createPaymentLink = async () => {
    if (!selected || !amount) return;
    await fetch(`${apiBase}/razorpay/link?tenant=${tenant}`, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ to: selected, amount: Number(amount), note: payNote }) });
  };
  const checkShipment = async () => {
    if (!selected || !awb) return;
    await fetch(`${apiBase}/shiprocket/status?tenant=${tenant}`, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ to: selected, awb }) });
  };

  const doBroadcast = async () => {
    if (!broadcastText.trim()) return;
    await fetch(`${apiBase}/broadcast?tenant=${tenant}`, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ tag: broadcastTag, text: broadcastText, drip: dripEnabled }) });
    setBroadcastText("");
  };

  // Catalog
  const searchCatalog = async () => {
    setCatalogLoading(true);
    try {
      const res = await fetch(`${apiBase}/catalog/search?tenant=${tenant}&q=${encodeURIComponent(catalogQuery || "")}`);
      const data = await res.json();
      setProducts(Array.isArray(data) ? data : []);
    } catch (e) { setProducts([]); } finally { setCatalogLoading(false); }
  };
  const sendProductCard = async (pid) => {
    if (!selected) return;
    await fetch(`${apiBase}/messages/product?tenant=${tenant}`, {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ to: selected, productId: pid })
    });
  };

  // Polls
  const addPollOpt = () => setPollOptions((o)=>[...o, "Option "+(o.length+1)]);
  const remPollOpt = (i) => setPollOptions((o)=> o.length>2 ? o.filter((_,idx)=>idx!==i) : o);
  const updatePollOpt = (i, val) => setPollOptions((o)=> o.map((oo,idx)=> idx===i ? val : oo));
  const sendPoll = async () => {
    if (!selected || !pollQ.trim() || pollOptions.some(o=>!o.trim())) return;
    await fetch(`${apiBase}/messages/poll?tenant=${tenant}`, {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ to: selected, question: pollQ, options: pollOptions, multi: pollMulti })
    });
    setPollQ("");
  };

  // CSAT submit
  const submitCSAT = async () => {
    try {
      await fetch(`${apiBase}/csat/submit?tenant=${tenant}`, {
        method: "POST", headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ user: selected, score: Number(csat), note: csatNote })
      });
      setShowCSAT(false); setCsat(5); setCsatNote("");
    } catch {}
  };

  // Shift handover
  const loadShift = async () => {
    try {
      const r = await fetch(`${apiBase}/ai/shifthandover?tenant=${tenant}`);
      const j = await r.json();
      setShiftText(j?.summary || JSON.stringify(j, null, 2));
    } catch { setShiftText("(failed to load)"); }
  };

  // Knowledge search
  const runKnowledge = async () => {
    try {
      const r = await fetch(`${apiBase}/ai/knowledge?tenant=${tenant}&q=${encodeURIComponent(kbQuery)}`);
      const j = await r.json();
      setKbResults(Array.isArray(j) ? j : (j?.results || []));
    } catch { setKbResults([]); }
  };

  // Audit logs
  const loadAudit = async () => {
    try {
      const r = await fetch(`${apiBase}/audit/logs?tenant=${tenant}`);
      const j = await r.json();
      setAuditLogs(Array.isArray(j) ? j : []);
    } catch { setAuditLogs([]); }
  };

  // Transcription
  const sendVoiceNote = async (file) => {
    if (!file || !selected) return;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("user", selected);
    try {
      const r = await fetch(`${apiBase}/ai/transcribe?tenant=${tenant}`, { method: "POST", body: fd });
      const j = await r.json();
      if (j?.text) setComposer((prev) => prev ? prev + "\n" + j.text : j.text);
    } catch {}
  };

  const sendInternal = () => {
    if (!internalComposer.trim()) return;
    internalSockRef.current?.emit("internal_send", { text: internalComposer });
    setInternalMsgs((p) => [...p, { from: "me", text: internalComposer, ts: Date.now() }]);
    setInternalComposer("");
  };

  const filteredSessions = useMemo(() => {
    const q = sessionFilter.toLowerCase();
    return (sessions || []).filter(s => !q || (s.name||s.userId||"").toLowerCase().includes(q) || (s.tags||[]).join(",").toLowerCase().includes(q));
  }, [sessions, sessionFilter]);

  const fmt = (n) => new Intl.NumberFormat(undefined,{style:'currency',currency:'INR'}).format(Number(n||0));

  const canSee = (feature) => {
    // simple role gate
    if (role === "admin") return true;
    if (role === "agent") return !["analytics","smartCampaigns"].includes(feature);
    if (role === "viewer") return ["leaderboard","analytics"].includes(feature) === false ? false : true;
    return true;
  };

  // ===== UI =====
  return (
    <div className="h-screen grid grid-rows-[auto,auto,1fr] bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <MessageCircle className="text-[#C4952F]" />
          <div className="font-semibold">KAAPAV Cockpit</div>
          <Badge variant={connected ? "default" : "secondary"} className={connected ? "bg-green-500" : ""}>
            {connected ? "Connected" : "Offline"}
          </Badge>
          {sentiment && (<Badge variant="outline" className="ml-2">Mood: {sentiment}</Badge>)}
          {leadScore?.label && (
            <Badge variant="outline" className="ml-2 flex items-center gap-1">
              <Star className="w-3 h-3" /> {leadScore.label} ({leadScore.score})
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* Tenant & Role */}
          <div className="flex items-center gap-2">
            <Label className="text-xs">Tenant</Label>
            <select className="px-2 py-1 rounded border dark:border-gray-800 bg-transparent" value={tenant} onChange={(e)=>setTenant(e.target.value)}>
              <option value="kaapav-default">kaapav-default</option>
              <option value="kaapav-fashion">kaapav-fashion</option>
              <option value="kaapav-foods">kaapav-foods</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs">Role</Label>
            <select className="px-2 py-1 rounded border dark:border-gray-800 bg-transparent" value={role} onChange={(e)=>setRole(e.target.value)}>
              <option value="admin">admin</option>
              <option value="agent">agent</option>
              <option value="viewer">viewer</option>
            </select>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2 top-2.5 opacity-50" />
            <Input className="pl-8 w-64" placeholder="Search sessions…" value={sessionFilter} onChange={(e)=>setSessionFilter(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="autoAssist" className="text-xs opacity-70">Auto-Assist</Label>
            <Switch id="autoAssist" checked={autoAssist} onCheckedChange={setAutoAssist} />
          </div>
          <Button variant="outline" size="sm" onClick={()=>setDark(!dark)}>
            {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* Alerts banner */}
      {alerts && alerts.length>0 && (
        <div className="px-3 py-2 bg-red-600 text-white text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4"/>
          <div className="font-medium">Anomalies detected</div>
          <div className="opacity-90 truncate">{alerts.slice(0,3).map(a=>a.title||a.message).join(" • ")}{alerts.length>3?` (+${alerts.length-3})`:''}</div>
        </div>
      )}

      {/* Main */}
      <div className="grid grid-cols-12 gap-3 p-3 overflow-hidden">
        {/* Left — Sessions */}
        <div className="col-span-3 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="h-full overflow-auto divide-y divide-gray-100 dark:divide-gray-800">
            {filteredSessions.map((s) => (
              <div key={s.userId}
                   className={`px-3 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 ${selected===s.userId? 'bg-gray-50 dark:bg-gray-800' : ''}`}
                   onClick={()=>setSelected(s.userId)}>
                <div className="flex items-center justify-between">
                  <div className="font-medium flex items-center gap-2"><UserCircle2 className="w-4 h-4 opacity-70" />{s.name||s.userId}</div>
                  {s.unread>0 && <Badge className="bg-[#C4952F] text-white">{s.unread}</Badge>}
                </div>
                <div className="text-xs opacity-70 truncate">{s.lastMessage}</div>
                <div className="mt-1 flex gap-1 flex-wrap">
                  {(s.tags||[]).slice(0,4).map((t,i)=>(<Badge key={i} variant="outline" className="text-[10px]">{t}</Badge>))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Middle — Chat */}
        <div className="col-span-6 flex flex-col rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="p-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BadgeCheck className="w-4 h-4 text-emerald-500" />
              <div className="font-semibold">{selected || 'No session selected'}</div>
            </div>
            <div className="flex items-center gap-2 text-xs opacity-70">
              <Clock className="w-3 h-3" /> {new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}
              <Button size="sm" variant="outline" onClick={()=>setShowCSAT(true)} className="ml-2"><BadgeInfo className="w-3 h-3 mr-1"/>End & CSAT</Button>
            </div>
          </div>

          <div className="flex-1 overflow-auto p-4 space-y-3">
            {isCustomerTyping && <div className="text-xs opacity-70 pl-2">Customer is typing…</div>}
            {messages.map((m)=>{
              const isOut = m.direction === 'out' || m.from === 'admin';
              const bubble = (
                <div className={`max-w-[78%] p-3 rounded-2xl shadow ${isOut? 'ml-auto bg-gradient-to-r from-[#D4AF37] to-[#C4952F] text-white' : 'mr-auto bg-gray-200 dark:bg-gray-800'}`}>
                  <div className="text-[10px] opacity-60 mb-1 flex items-center gap-1">
                    {isOut? 'You' : (m.from||'User')} • {new Date(m.ts).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                    {isOut && <StatusTick status={m.status} />}
                  </div>
                  {m.media ? (
                    <div className="text-sm">[media] {m.media?.name || m.media?.url}</div>
                  ) : (
                    <div className="text-sm whitespace-pre-wrap">{m.text}</div>
                  )}
                </div>
              );
              return <div key={m.id}>{bubble}</div>
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Composer */}
          <div className="p-3 border-t border-gray-100 dark:border-gray-800 flex items-center gap-2">
            <label className="px-2 py-2 rounded-lg border cursor-pointer text-xs flex items-center gap-2">
              <Upload className="w-4 h-4" /> Attach
              <input type="file" className="hidden" onChange={(e)=>uploadMedia(e.target.files?.[0])} />
            </label>
            <label className="px-2 py-2 rounded-lg border cursor-pointer text-xs flex items-center gap-2">
              <Mic className="w-4 h-4" /> Voice
              <input type="file" accept="audio/*" className="hidden" onChange={(e)=>sendVoiceNote(e.target.files?.[0])} />
            </label>
            <Textarea rows={2} className="flex-1" placeholder={selected? 'Type a reply…' : 'Select a session to chat'} disabled={!selected}
                      value={composer}
                      onChange={(e)=>setComposer(e.target.value)}
                      onKeyDown={(e)=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); sendMessage(); } }} />
            <Button onClick={sendMessage} disabled={!selected} className="bg-[#C4952F] text-white"><Send className="w-4 h-4" /></Button>
          </div>

          {/* AI Suggestions */}
          {suggestions.length>0 && (
            <div className="px-3 pb-3 flex flex-wrap gap-2">
              {suggestions.map((sug,idx)=>(
                <Button key={idx} size="sm" variant="outline" onClick={()=>setComposer(sug)} className="text-xs">
                  <Sparkles className="w-3 h-3 mr-1"/> {sug}
                </Button>
              ))}
              {aiBusy && <span className="text-xs opacity-60">Thinking…</span>}
            </div>
          )}
        </div>

        {/* Right — CRM & Actions */}
        <div className="col-span-3 flex flex-col gap-3 overflow-auto">
          {/* CRM Card */}
          <Card className="overflow-hidden">
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="font-semibold flex items-center gap-2"><UserCircle2 className="w-4 h-4 opacity-70"/>CRM</div>
                {sentiment && <Badge variant="outline">Mood: {sentiment}</Badge>}
              </div>
              <div className="text-xs opacity-70">{profile?.name || selected || '—'}</div>
              <div className="flex gap-1 flex-wrap">
                {tags.map((t,i)=>(<Badge key={i} variant="secondary" className="text-[10px]">{t}</Badge>))}
              </div>
              <div className="flex gap-2">
                <Input placeholder="Assign to" value={assignTo} onChange={(e)=>setAssignTo(e.target.value)} />
                <Button size="sm" variant="outline" onClick={saveAssign}>Save</Button>
              </div>
              <div>
                <Label className="text-xs">Notes</Label>
                <Textarea rows={3} value={notes} onChange={(e)=>setNotes(e.target.value)} />
                <div className="mt-1 flex gap-2">
                  <Button size="sm" variant="outline" onClick={saveNotes}><NotebookPen className="w-3 h-3 mr-1"/>Save</Button>
                  <Button size="sm" variant="outline" onClick={saveTags}><Tags className="w-3 h-3 mr-1"/>Save Tags</Button>
                </div>
              </div>
              {/* 360 */}
              <div className="rounded-lg border dark:border-gray-800 p-2 text-xs">
                <div className="font-medium mb-1">Customer 360°</div>
                {!view360 && <div className="opacity-60">No data</div>}
                {view360 && (
                  <div className="space-y-1">
                    <div>Orders: <b>{view360.orders||0}</b> • Revenue: <b>{fmt(view360.revenue||0)}</b></div>
                    <div>Last Seen: {view360.lastSeen||'-'}</div>
                    <div>Tags: {(view360.tags||[]).join(', ')||'-'}</div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Commerce Card */}
          {canSee("commerce") && (
          <Card>
            <CardContent className="p-3 space-y-2">
              <div className="font-semibold flex items-center gap-2"><ShoppingCart className="w-4 h-4"/> Sales</div>
              <div className="flex gap-2 items-center">
                <Input placeholder="Amount" value={amount} onChange={(e)=>setAmount(e.target.value)} className="w-24" />
                <Input placeholder="Note" value={payNote} onChange={(e)=>setPayNote(e.target.value)} />
                <Button size="sm" onClick={createPaymentLink}><CreditCard className="w-3 h-3 mr-1"/>Pay Link</Button>
              </div>
              <div className="flex gap-2 items-center">
                <Input placeholder="AWB" value={awb} onChange={(e)=>setAwb(e.target.value)} />
                <Button size="sm" variant="outline" onClick={checkShipment}><Truck className="w-3 h-3 mr-1"/>Track</Button>
              </div>
            </CardContent>
          </Card>
          )}

          {/* Broadcast */}
          {canSee("broadcast") && (
          <Card>
            <CardContent className="p-3 space-y-2">
              <div className="font-semibold flex items-center gap-2"><Megaphone className="w-4 h-4"/> Broadcast</div>
              <div className="flex items-center gap-2">
                <Label className="text-xs">Segment</Label>
                <Input placeholder="Tag e.g. ALL / COD / Hot" value={broadcastTag} onChange={(e)=>setBroadcastTag(e.target.value)} />
              </div>
              <Textarea rows={3} placeholder="Message…" value={broadcastText} onChange={(e)=>setBroadcastText(e.target.value)} />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Switch checked={dripEnabled} onCheckedChange={setDripEnabled} id="drip"/>
                  <Label htmlFor="drip" className="text-xs">Drip (multi-step)</Label>
                </div>
                <Button size="sm" onClick={doBroadcast}><Send className="w-3 h-3 mr-1"/>Send</Button>
              </div>
            </CardContent>
          </Card>
          )}

          {/* Catalog */}
          <Card>
            <CardContent className="p-3 space-y-2">
              <div className="font-semibold flex items-center gap-2"><Package className="w-4 h-4"/> Catalog</div>
              <div className="flex items-center gap-2">
                <Input placeholder="Search product or SKU" value={catalogQuery} onChange={(e)=>setCatalogQuery(e.target.value)} />
                <Button size="sm" variant="outline" onClick={searchCatalog}>Search</Button>
              </div>
              <div className="grid grid-cols-1 gap-2 max-h-40 overflow-auto">
                {catalogLoading && <div className="text-xs opacity-60">Loading…</div>}
                {!catalogLoading && products.length===0 && <div className="text-xs opacity-60">No products</div>}
                {products.map(p=> (
                  <div key={p.id} className="flex items-center gap-2 p-2 rounded-lg border dark:border-gray-800">
                    {p.imageUrl ? <img src={p.imageUrl} alt={p.title} className="w-10 h-10 rounded object-cover"/> : <div className="w-10 h-10 rounded bg-gray-200"/>}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{p.title}</div>
                      <div className="text-[11px] opacity-70">{p.sku} • {fmt(p.price)} • {p.stock>0? `${p.stock} in stock` : 'OOS'}</div>
                    </div>
                    <Button size="sm" onClick={()=>sendProductCard(p.id)}>Send</Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* NEW: Send Catalogue (multi-number, WhatsApp-friendly) */}
          <Card>
            <CardContent className="p-3 space-y-2">
              <div className="font-semibold flex items-center gap-2">
                <Package className="w-4 h-4" /> Send Catalogue
              </div>
              <div className="text-xs opacity-70">
                Enter one or multiple WhatsApp numbers (comma-separated). Must be in international format (e.g., 919876543210).
              </div>
              <Textarea
                rows={2}
                placeholder="e.g. 919812345678, 919876543210"
                value={catalogRecipients}
                onChange={(e) => setCatalogRecipients(e.target.value)}
              />
              <div className="grid grid-cols-1 gap-2 max-h-32 overflow-auto">
                {products.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 p-2 rounded-lg border dark:border-gray-800"
                  >
                    {p.imageUrl ? (
                      <img
                        src={p.imageUrl}
                        alt={p.title}
                        className="w-8 h-8 rounded object-cover"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded bg-gray-200" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{p.title}</div>
                      <div className="text-[11px] opacity-70">
                        {p.sku} • {fmt(p.price)}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={async () => {
                        // Basic client-side validation for numbers
                        const nums = catalogRecipients
                          .split(",")
                          .map((n) => n.trim())
                          .filter(Boolean);

                        if (nums.length === 0) {
                          window.alert("Please enter at least one number.");
                          return;
                        }

                        try {
                          const res = await fetch(`${apiBase}/messages/catalogue?tenant=${tenant}`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              to: nums,          // array of numbers; backend should loop & send
                              productId: p.id,   // product to include (product card / catalogue msg)
                            }),
                          });
                          if (!res.ok) throw new Error(`HTTP ${res.status}`);
                          window.alert("Catalogue sent ✅ (server will deliver via WhatsApp API)");
                        } catch (e) {
                          console.error(e);
                          window.alert("Failed to send catalogue. Please try again.");
                        }
                      }}
                    >
                      Send
                    </Button>
                  </div>
                ))}
                {products.length === 0 && (
                  <div className="text-xs opacity-60">
                    Search products above, then send catalogue to selected numbers.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Polls */}
          <Card>
            <CardContent className="p-3 space-y-2">
              <div className="font-semibold flex items-center gap-2"><ListPlus className="w-4 h-4"/> Poll</div>
              <Input placeholder="Question" value={pollQ} onChange={(e)=>setPollQ(e.target.value)} />
              <div className="space-y-2">
                {pollOptions.map((opt,idx)=> (
                  <div key={idx} className="flex items-center gap-2">
                    <Input value={opt} onChange={(e)=>updatePollOpt(idx, e.target.value)} />
                    <Button size="icon" variant="outline" onClick={()=>remPollOpt(idx)}><Minus className="w-4 h-4"/></Button>
                  </div>
                ))}
                <Button size="sm" variant="outline" onClick={addPollOpt}><Plus className="w-4 h-4 mr-1"/>Add option</Button>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Switch checked={pollMulti} onCheckedChange={setPollMulti} id="multi"/>
                  <Label htmlFor="multi" className="text-xs">Allow multiple</Label>
                </div>
                <Button size="sm" onClick={sendPoll} disabled={!selected}>Send</Button>
              </div>
            </CardContent>
          </Card>

          {/* Internal Agent Chat */}
          {(role === 'admin' || role === 'agent') && (
          <Card>
            <CardContent className="p-3 space-y-2">
              <div className="font-semibold flex items-center gap-2"><Users className="w-4 h-4"/> Internal Chat</div>
              <div className="max-h-28 overflow-auto text-xs space-y-1">
                {internalMsgs.map((m,i)=> (
                  <div key={i} className={`p-2 rounded ${m.from==='me'?'bg-[#F8F5EF] text-[#3A2F16] ml-auto':'bg-gray-200 dark:bg-gray-800'} max-w-[85%]`}>{m.text}</div>
                ))}
                {internalMsgs.length===0 && <div className="opacity-60">No internal messages</div>}
              </div>
              <div className="flex gap-2">
                <Input value={internalComposer} onChange={(e)=>setInternalComposer(e.target.value)} placeholder="Type note to team…" />
                <Button size="sm" onClick={sendInternal}>Send</Button>
              </div>
            </CardContent>
          </Card>
          )}

          {/* Follow-ups scheduler */}
          <Card>
            <CardContent className="p-3 space-y-2">
              <div className="font-semibold flex items-center gap-2"><CalendarClock className="w-4 h-4"/> Proactive Follow-up</div>
              <Input type="datetime-local" value={fuWhen} onChange={(e)=>setFuWhen(e.target.value)} />
              <Input placeholder="Follow-up note" value={fuNote} onChange={(e)=>setFuNote(e.target.value)} />
              <Button size="sm" onClick={async ()=>{
                if (!selected || !fuWhen) return;
                await fetch(`${apiBase}/followup/schedule?tenant=${tenant}`, { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ user: selected, when: fuWhen, note: fuNote }) });
                setFuWhen(''); setFuNote('');
              }}>Schedule</Button>
            </CardContent>
          </Card>

          {/* Knowledge Base AI */}
          <Card>
            <CardContent className="p-3 space-y-2">
              <div className="font-semibold flex items-center gap-2"><Bot className="w-4 h-4"/> Knowledge Base</div>
              <div className="flex gap-2">
                <Input placeholder="Search question…" value={kbQuery} onChange={(e)=>setKbQuery(e.target.value)} />
                <Button size="sm" variant="outline" onClick={runKnowledge}>Search</Button>
              </div>
              <div className="max-h-28 overflow-auto text-xs space-y-2">
                {kbResults.map((r,i)=>(<div key={i} className="p-2 rounded border dark:border-gray-800"><div className="font-medium">{r.title||`Result ${i+1}`}</div><div className="opacity-80">{r.snippet||r.text||''}</div></div>))}
                {kbResults.length===0 && <div className="opacity-60 text-xs">No results</div>}
              </div>
            </CardContent>
          </Card>

          {/* Leaderboard / Gamification */}
          <Card>
            <CardContent className="p-3 space-y-2">
              <div className="font-semibold flex items-center gap-2"><Trophy className="w-4 h-4"/> Agent Leaderboard</div>
              <div className="flex items-center gap-2 text-xs">
                <Label>Period</Label>
                <select className="px-2 py-1 rounded border dark:border-gray-800 bg-transparent" value={boardPeriod} onChange={(e)=>setBoardPeriod(e.target.value)}>
                  <option value="day">Today</option>
                  <option value="week">This Week</option>
                  <option value="month">This Month</option>
                </select>
              </div>
              <div className="max-h-48 overflow-auto text-sm">
                <table className="w-full text-left">
                  <thead className="text-[11px] opacity-70">
                    <tr>
                      <th className="py-1">Agent</th>
                      <th className="py-1">Chats</th>
                      <th className="py-1">FRT</th>
                      <th className="py-1">CSAT</th>
                      <th className="py-1">Streak</th>
                      <th className="py-1">Badges</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agents.map((a, i)=> (
                      <tr key={i} className="border-t dark:border-gray-800">
                        <td className="py-1">{a.name}</td>
                        <td className="py-1">{a.chats}</td>
                        <td className="py-1">{a.firstResp || '-'}m</td>
                        <td className="py-1">{a.csat ? a.csat+"%" : '-'}</td>
                        <td className="py-1">{a.streak || '-'}</td>
                        <td className="py-1 text-xs">{(a.badges||[]).join(', ')||'-'}</td>
                      </tr>
                    ))}
                    {agents.length===0 && (
                      <tr><td colSpan={6} className="py-2 text-xs opacity-60">No data</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Audit & Shift & KPI Tabs */}
          <Tabs defaultValue="audit" className="w-full">
            <TabsList className="grid grid-cols-3">
              <TabsTrigger value="audit">Audit</TabsTrigger>
              <TabsTrigger value="shift">Shift</TabsTrigger>
              <TabsTrigger value="kpi">KPI</TabsTrigger>
            </TabsList>
            <TabsContent value="audit">
              <Card>
                <CardContent className="p-3 space-y-2">
                  <div className="font-semibold flex items-center gap-2"><ClipboardList className="w-4 h-4"/> Audit Logs</div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={loadAudit}>Refresh</Button>
                  </div>
                  <div className="max-h-40 overflow-auto text-xs">
                    <table className="w-full text-left">
                      <thead className="opacity-70">
                        <tr><th>Time</th><th>User</th><th>Action</th><th>Meta</th></tr>
                      </thead>
                      <tbody>
                        {(auditLogs||[]).map((l,i)=> (
                          <tr key={i} className="border-t dark:border-gray-800">
                            <td className="py-1">{new Date(l.ts||Date.now()).toLocaleString()}</td>
                            <td className="py-1">{l.user||'-'}</td>
                            <td className="py-1">{l.action||'-'}</td>
                            <td className="py-1 truncate">{typeof l.meta==='string'?l.meta:JSON.stringify(l.meta||{})}</td>
                          </tr>
                        ))}
                        {(!auditLogs||auditLogs.length===0) && (<tr><td colSpan={4} className="py-2 opacity-60">No logs</td></tr>)}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="shift">
              <Card>
                <CardContent className="p-3 space-y-2">
                  <div className="font-semibold flex items-center gap-2"><BadgeCheck className="w-4 h-4"/> Shift Handover</div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={loadShift}>Generate</Button>
                  </div>
                  <Textarea rows={8} value={shiftText} onChange={(e)=>setShiftText(e.target.value)} placeholder="Shift summary will appear here…" />
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="kpi">
              <Card>
                <CardContent className="p-0 overflow-hidden">
                  {dashboardUrl ? (
                    <iframe title="KPI" src={dashboardUrl} className="w-full h-64 border-0" />
                  ) : (
                    <div className="p-3 text-xs opacity-70">No KPI dashboard URL configured</div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Smart Campaigns (skeleton) */}
          {canSee("smartCampaigns") && (
          <Card>
            <CardContent className="p-3 space-y-2">
              <div className="font-semibold flex items-center gap-2"><Filter className="w-4 h-4"/> Smart Campaigns</div>
              <div className="text-xs opacity-70">Flow builder (placeholder). Drag blocks in future; for now just a stub list.</div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                {['Segment','Delay','Message','If CTR < X','Add Tag','Stop'].map((b,i)=>(
                  <div key={i} className="p-2 rounded-lg border dark:border-gray-800 text-center">{b}</div>
                ))}
              </div>
            </CardContent>
          </Card>
          )}

          {/* Analytics quick note */}
          <Card>
            <CardContent className="p-3 space-y-2">
              <div className="font-semibold flex items-center gap-2"><BarChart3 className="w-4 h-4"/> Analytics</div>
              <div className="text-xs opacity-70">Live KPIs via Metabase iframe (see KPI tab).</div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* CSAT MODAL */}
      <Sheet open={showCSAT} onOpenChange={setShowCSAT}>
        <SheetContent side="bottom" className="max-w-2xl mx-auto rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>CSAT Survey</SheetTitle>
          </SheetHeader>
          <div className="py-3 space-y-3">
            <div className="flex items-center gap-2">
              <Label className="text-sm">Score</Label>
              <select className="px-2 py-1 rounded border dark:border-gray-800 bg-transparent" value={csat} onChange={(e)=>setCsat(e.target.value)}>
                {[1,2,3,4,5].map(n=> <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <Textarea rows={3} placeholder="Any notes…" value={csatNote} onChange={(e)=>setCsatNote(e.target.value)} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={()=>setShowCSAT(false)}>Cancel</Button>
              <Button className="bg-[#C4952F] text-white" onClick={submitCSAT}>Submit</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function StatusTick({ status }){
  if (status === 'read') return <CheckCheck className="w-4 h-4 text-sky-500"/>;
  if (status === 'delivered') return <CheckCheck className="w-4 h-4 opacity-70"/>;
  return <Check className="w-4 h-4 opacity-70"/>;
}
