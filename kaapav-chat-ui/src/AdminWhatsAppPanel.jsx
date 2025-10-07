// File: src/AdminWhatsAppPanel.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import {
  Menu,
  Search,
  Send,
  Upload,
  LogOut,
  CreditCard,
  Package,
  Truck,
  X,
  ChevronLeft,
  ChevronRight,
  Check,
  CheckCheck,
  UserCircle2,
  Lock,
  Megaphone,
  Settings,
} from "lucide-react";

export default function AdminWhatsAppPanel() {
  // ======= THEME =======
  const GOLD = "#C4952F";
  const WHITE = "#FFFFFF";
  const PAPER = "#FAFAFA";
  const TEXT = "#1F1C17";

  // ======= ENV (same-origin) =======
  const socketUrl = import.meta.env?.VITE_SOCKET_URL ?? "/socket.io";
  const apiBase = import.meta.env?.VITE_API_URL ?? "/api";

  // ======= AUTH =======
  const [token, setToken] = useState(() => (localStorage.getItem("ADMIN_TOKEN") || "").trim());
  const [loginView, setLoginView] = useState(() => !token);
  const [authBusy, setAuthBusy] = useState(false);
  const [login, setLogin] = useState({ username: "", password: "" });

  // Signup
  const [showSignup, setShowSignup] = useState(false);
  const [signup, setSignup] = useState({ username: "", password: "", confirm: "", role: "admin" });

  // ======= SETTINGS =======
  const [autoHideActions, setAutoHideActions] = useState(
    () => (localStorage.getItem("autoHideActions") ?? "true") === "true"
  );
  useEffect(() => localStorage.setItem("autoHideActions", String(autoHideActions)), [autoHideActions]);

  // ======= DATA =======
  const [sessions, setSessions] = useState([]);
  const [sessionFilter, setSessionFilter] = useState("");
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [composer, setComposer] = useState("");
  const [connected, setConnected] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [menuOpen, setMenuOpen] = useState(true);

  const socketRef = useRef(null);
  const typingTimeout = useRef(null);

  // ======= ACTION DRAWER =======
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeAction, setActiveAction] = useState(null); // 'pay' | 'catalogue' | 'ship' | 'broadcast'
  const [toast, setToast] = useState(null);

  // Pay Link
  const [amount, setAmount] = useState("");
  const [payNote, setPayNote] = useState("");

  // Catalogue
  const [catalogQuery, setCatalogQuery] = useState("");
  const [products, setProducts] = useState([]);
  const [catalogRecipients, setCatalogRecipients] = useState("");

  // Shiprocket
  const [awb, setAwb] = useState("");

  // Broadcast
  const [broadcastText, setBroadcastText] = useState("");
  const [broadcastTag, setBroadcastTag] = useState("ALL");

  // ======= HELPERS =======
  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };
  const authHeader = token ? { Authorization: `Bearer ${token}` } : {};

  const normalizeMsg = (m, direction) => ({
    id: m.id || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    from: m.from,
    to: m.to,
    text: m.text || "",
    media: m.media,
    ts: m.ts || Date.now(),
    status: m.status || (direction === "out" ? "sent" : "delivered"),
    direction: direction === "out" ? "out" : "in",
  });

  const filteredSessions = useMemo(() => {
    const q = sessionFilter.toLowerCase();
    return (sessions || []).filter(
      (s) =>
        !q ||
        (s.name || s.userId || "").toLowerCase().includes(q) ||
        (s.lastMessage || "").toLowerCase().includes(q)
    );
  }, [sessions, sessionFilter]);

  // ======= SOCKET =======
  useEffect(() => {
    if (!token) return;
    const sock = io(socketUrl, {
      auth: { token },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });
    socketRef.current = sock;

    sock.on("connect", () => setConnected(true));
    sock.on("disconnect", () => setConnected(false));
    sock.on("sessions_snapshot", (list) => setSessions(list || []));

    sock.on("incoming_message", (m) => {
      setMessages((p) => [...p, { ...m, direction: "in" }]);
      setIsTyping(false);
    });
    sock.on("outgoing_message", (m) =>
      setMessages((p) => [...p, { ...m, direction: "out" }])
    );

    sock.on("session_messages", (list = []) => {
      setMessages(
        list.map((m) =>
          normalizeMsg({ ...m, text: m.text || m.message?.text || "" }, m.direction)
        )
      );
    });

    sock.on("typing", () => {
      setIsTyping(true);
      clearTimeout(typingTimeout.current);
      typingTimeout.current = setTimeout(() => setIsTyping(false), 2500);
    });

    return () => sock.disconnect();
  }, [token, socketUrl]);

  // ======= AUTH ACTIONS =======
  const doLogin = async (e) => {
    e?.preventDefault?.();
    setAuthBusy(true);
    try {
      const res = await fetch(`${apiBase}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: login.username.trim(), password: login.password }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      const t = (j?.token || j?.accessToken || "").trim();
      if (!t) throw new Error("No token returned");
      localStorage.setItem("ADMIN_TOKEN", t);
      setToken(t);
      setLoginView(false);
      showToast("Logged in");
    } catch (err) {
      console.error(err);
      showToast("Login failed");
    } finally {
      setAuthBusy(false);
    }
  };

  const doSignup = async (e) => {
    e?.preventDefault?.();
    if (!signup.username.trim() || !signup.password.trim()) {
      showToast("Username and password required");
      return;
    }
    if (signup.password !== signup.confirm) {
      showToast("Passwords do not match");
      return;
    }
    setAuthBusy(true);
    try {
      const res = await fetch(`${apiBase}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: signup.username.trim(),
          password: signup.password,
          role: signup.role || "admin",
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json().catch(() => ({}));
      const t = (j?.token || j?.accessToken || "").trim();
      if (t) {
        localStorage.setItem("ADMIN_TOKEN", t);
        setToken(t);
        setLoginView(false);
        showToast("Account created & logged in");
      } else {
        setLogin({ username: signup.username, password: signup.password });
        setShowSignup(false);
        showToast("Account created. Please login");
      }
    } catch (err) {
      console.error(err);
      showToast("Signup failed");
    } finally {
      setAuthBusy(false);
    }
  };

  const doLogout = () => {
    localStorage.removeItem("ADMIN_TOKEN");
    setToken("");
    setLoginView(true);
  };

  // ======= CHAT ACTIONS =======
  const sendMessage = () => {
    const text = (composer || "").trim();
    if (!text || !selected) return;
    const msg = { to: selected, text };
    socketRef.current?.emit("admin_send_message", msg);
    setMessages((prev) => [
      ...prev,
      {
        ...msg,
        from: "admin",
        direction: "out",
        ts: Date.now(),
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      },
    ]);
    setComposer("");
  };

  const uploadMedia = async (file) => {
    if (!file || !selected) return;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("to", selected);
    try {
      const res = await fetch(`${apiBase}/messages/upload`, {
        method: "POST",
        headers: { ...authHeader },
        body: fd,
      });
      const msg = await res.json();
      setMessages((p) => [...p, normalizeMsg(msg, "out")]);
      showToast("Media sent");
    } catch {
      showToast("Upload failed");
    }
  };

  // ======= ACTIONS (drawer) =======
  const openAction = (a) => {
    setActiveAction(a);
    setDrawerOpen(true);
  };
  const closeDrawer = () => {
    setDrawerOpen(false);
    setActiveAction(null);
  };

  const submitPayment = async () => {
    const to =
      selected ||
      (catalogRecipients || "")
        .split(",")
        .map((n) => n.trim())
        .filter(Boolean);
    if (!to || (Array.isArray(to) && to.length === 0)) {
      showToast("Pick a chat or add a number");
      return;
    }
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      showToast("Enter valid amount");
      return;
    }
    try {
      await fetch(`${apiBase}/razorpay/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ to, amount: n, note: payNote || "" }),
      });
      showToast("Payment link sent");
      setAmount("");
      setPayNote("");
      setCatalogRecipients("");
      if (autoHideActions) closeDrawer();
    } catch {
      showToast("Failed to send link");
    }
  };

  const searchCatalog = async () => {
    try {
      const r = await fetch(
        `${apiBase}/catalog/search?q=${encodeURIComponent(catalogQuery || "")}`,
        { headers: { ...authHeader } }
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      setProducts(Array.isArray(j) ? j : j?.items || []);
    } catch {
      setProducts([]);
    }
  };

  const sendCatalogue = async (pid) => {
    try {
      const to = selected
        ? [selected]
        : (catalogRecipients || "")
            .split(",")
            .map((n) => n.trim())
            .filter(Boolean);
      if (!to.length) {
        showToast("Add at least one number");
        return;
      }
      await fetch(`${apiBase}/messages/catalogue`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ to, productId: pid }),
      });
      showToast("Catalogue sent");
      if (autoHideActions) closeDrawer();
    } catch {
      showToast("Failed to send catalogue");
    }
  };

  const trackShipment = async () => {
    if (!awb.trim()) return;
    try {
      await fetch(`${apiBase}/shiprocket/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ to: selected, awb: awb.trim() }),
      });
      showToast("Tracking pushed");
      setAwb("");
      if (autoHideActions) closeDrawer();
    } catch {
      showToast("Failed to track");
    }
  };

  const doBroadcast = async () => {
    if (!broadcastText.trim()) return;
    try {
      await fetch(`${apiBase}/broadcast`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ tag: broadcastTag, text: broadcastText }),
      });
      showToast("Broadcast queued");
      setBroadcastText("");
      if (autoHideActions) closeDrawer();
    } catch {
      showToast("Broadcast failed");
    }
  };

  // ======= RENDER =======
  // 1) Login/Signup screen ONLY
  if (loginView) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: PAPER }}>
        <div
          className="w-full max-w-sm rounded-2xl shadow p-5"
          style={{ background: WHITE, border: `1px solid ${GOLD}33` }}
        >
          <div className="flex items-center gap-2 mb-4">
            <div className="w-9 h-9 rounded-full grid place-items-center text-white" style={{ background: GOLD }}>
              <Lock size={18} />
            </div>
            <div className="text-lg font-semibold" style={{ color: TEXT }}>
              Kaapav Admin Login
            </div>
          </div>

          {/* Tabs */}
          <div className="flex text-sm mb-4 border rounded-lg overflow-hidden" style={{ borderColor: `${GOLD}33` }}>
            <button
              type="button"
              className={`flex-1 py-2 ${!showSignup ? "bg-[#FFF8EB] font-medium" : ""}`}
              onClick={() => setShowSignup(false)}
            >
              Login
            </button>
            <button
              type="button"
              className={`flex-1 py-2 ${showSignup ? "bg-[#FFF8EB] font-medium" : ""}`}
              onClick={() => setShowSignup(true)}
            >
              Create User
            </button>
          </div>

          {/* Forms */}
          {!showSignup ? (
            <form onSubmit={doLogin} className="space-y-3">
              <div>
                <label className="text-xs opacity-70">Username</label>
                <input
                  className="mt-1 w-full px-3 py-2 rounded-md border"
                  value={login.username}
                  onChange={(e) => setLogin({ ...login, username: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="text-xs opacity-70">Password</label>
                <input
                  type="password"
                  className="mt-1 w-full px-3 py-2 rounded-md border"
                  value={login.password}
                  onChange={(e) => setLogin({ ...login, password: e.target.value })}
                  required
                />
              </div>
              <button
                disabled={authBusy}
                className="w-full py-2 rounded-md text-white font-medium"
                style={{ background: GOLD }}
              >
                {authBusy ? "Signing in…" : "Login"}
              </button>
            </form>
          ) : (
            <form onSubmit={doSignup} className="space-y-3">
              <div>
                <label className="text-xs opacity-70">Username</label>
                <input
                  className="mt-1 w-full px-3 py-2 rounded-md border"
                  value={signup.username}
                  onChange={(e) => setSignup({ ...signup, username: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="text-xs opacity-70">Password</label>
                <input
                  type="password"
                  className="mt-1 w-full px-3 py-2 rounded-md border"
                  value={signup.password}
                  onChange={(e) => setSignup({ ...signup, password: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="text-xs opacity-70">Confirm Password</label>
                <input
                  type="password"
                  className="mt-1 w-full px-3 py-2 rounded-md border"
                  value={signup.confirm}
                  onChange={(e) => setSignup({ ...signup, confirm: e.target.value })}
                  required
                />
              </div>
              <div className="flex items-center gap-3 text-xs">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="role"
                    checked={signup.role === "admin"}
                    onChange={() => setSignup({ ...signup, role: "admin" })}
                  />
                  Admin
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="role"
                    checked={signup.role === "agent"}
                    onChange={() => setSignup({ ...signup, role: "agent" })}
                  />
                  Agent
                </label>
              </div>
              <button
                disabled={authBusy}
                className="w-full py-2 rounded-md text-white font-medium"
                style={{ background: GOLD }}
              >
                {authBusy ? "Creating…" : "Create User"}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  // 2) MAIN APP (post-login only)
  return (
    <div
      className="min-h-screen h-screen grid grid-rows-[auto,1fr]"
      style={{ background: PAPER, color: TEXT }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 sm:px-4 py-2 border-b"
        style={{ background: WHITE, borderColor: `${GOLD}66` }}
      >
        <div className="flex items-center gap-2">
          <button
            className="p-2 rounded-md border sm:hidden"
            style={{ borderColor: `${GOLD}66` }}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
          </button>
          <div className="text-lg font-semibold">Kaapav Chats</div>
          <span
            className={`ml-2 text-xs px-2 py-0.5 rounded-full text-white ${
              connected ? "bg-emerald-600" : "bg-red-600"
            }`}
          >
            {connected ? "Online" : "Offline"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <label
            className="text-xs flex items-center gap-2 px-2 py-1 rounded-md border"
            style={{ borderColor: `${GOLD}55`, background: WHITE }}
          >
            <Settings size={14} /> Auto-hide actions
            <input
              type="checkbox"
              className="accent-current"
              checked={autoHideActions}
              onChange={(e) => setAutoHideActions(e.target.checked)}
            />
          </label>
          <button
            onClick={doLogout}
            title="Logout"
            className="px-3 py-1 rounded-md text-white"
            style={{ background: GOLD }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="grid grid-cols-12 gap-0 sm:gap-3 p-0 sm:p-3 overflow-hidden min-h-0 h-full">
        {/* Left: Sessions */}
        <div
          id="sessionPane"
          className={`h-full min-h-0 sm:rounded-xl overflow-hidden transition-all duration-200 ${
            menuOpen ? "col-span-12 sm:col-span-3" : "col-span-0 sm:col-span-0"
          }`}
          style={{ background: WHITE, border: `1px solid ${GOLD}33` }}
        >
          <div
            className="p-3 flex gap-2 items-center sticky top-0 z-10 border-b"
            style={{ background: WHITE, borderColor: `${GOLD}33` }}
          >
            <div className="relative flex-1">
              <Search size={16} className="absolute left-2 top-2.5 opacity-50" />
              <input
                className="w-full pl-7 pr-2 py-2 rounded-md border"
                style={{ background: PAPER, borderColor: `${GOLD}55` }}
                placeholder="Search or start new chat"
                value={sessionFilter}
                onChange={(e) => setSessionFilter(e.target.value)}
              />
            </div>
            <button
              className="p-2 rounded-md sm:hidden text-white"
              onClick={() => setMenuOpen(false)}
              style={{ background: GOLD }}
            >
              Go
            </button>
          </div>
          <div className="overflow-auto h-full divide-y" style={{ borderColor: `${GOLD}22` }}>
            {filteredSessions.map((s) => (
              <div
                key={s.userId}
                className="px-3 py-3 cursor-pointer hover:bg-[#00000005]"
                onClick={() => {
                  setSelected(s.userId);
                  socketRef.current?.emit("fetch_session_messages", s.userId);
                }}
                style={{ background: selected === s.userId ? `#FFF8EB` : WHITE }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#FFF3DF] grid place-items-center">
                    <UserCircle2 size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{s.name || s.userId}</div>
                    <div className="text-xs opacity-70 truncate">{s.lastMessage}</div>
                  </div>
                  {s.unread > 0 && (
                    <span className="text-xs text-white px-2 py-0.5 rounded-full" style={{ background: GOLD }}>
                      {s.unread}
                    </span>
                  )}
                </div>
              </div>
            ))}
            {filteredSessions.length === 0 && <div className="p-6 text-sm opacity-60">No sessions</div>}
          </div>
        </div>

        {/* Middle: Chat */}
        <div
          id="chatPane"
          className={`${
            menuOpen ? "col-span-12 sm:col-span-6" : "col-span-12 sm:col-span-9"
          } flex flex-col h-full min-h-0 sm:rounded-xl overflow-hidden`}
          style={{ background: PAPER, border: `1px solid ${GOLD}33` }}
        >
          {/* Chat Header */}
          <div className="px-3 py-2 flex items-center justify-between border-b" style={{ background: WHITE, borderColor: `${GOLD}33` }}>
            <div className="flex items-center gap-2">
              <button
                className="p-2 rounded-md border hidden sm:inline-flex"
                style={{ borderColor: `${GOLD}66` }}
                onClick={() => setMenuOpen(!menuOpen)}
              >
                {menuOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
              </button>
              <div className="w-8 h-8 rounded-full bg-[#FFF3DF] grid place-items-center">
                <UserCircle2 size={16} />
              </div>
              <div className="font-medium">{selected || "Select a conversation"}</div>
            </div>
            <button
              onClick={() => setDrawerOpen(true)}
              className="px-3 py-1 rounded-md text-white"
              title="Actions"
              style={{ background: GOLD }}
            >
              <Menu size={16} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-auto p-3 space-y-2">
            {isTyping && <div className="text-[11px] opacity-60 pl-1">typing…</div>}
            {messages.map((m) => {
              const isOut = m.direction === "out" || m.from === "admin";
              return (
                <div key={m.id} className={`flex ${isOut ? "justify-end" : "justify-start"}`}>
                  <div
                    className="max-w-[78%] p-2 sm:p-3 rounded-2xl shadow"
                    style={{
                      background: isOut ? GOLD : WHITE,
                      color: isOut ? "#ffffff" : TEXT,
                      border: isOut ? "none" : `1px solid ${GOLD}22`,
                    }}
                  >
                    <div className="text-[10px] opacity-80 mb-1 flex items-center gap-1">
                      {isOut ? "You" : m.from || "User"} •{" "}
                      {new Date(m.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      {isOut && <StatusTick status={m.status} />}
                    </div>
                    {m.media ? (
                      <div className="text-sm">[media] {m.media?.name || m.media?.url}</div>
                    ) : (
                      <div className="text-sm whitespace-pre-wrap">{m.text}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Composer */}
          <div className="p-2 sm:p-3 flex items-center gap-2 border-t" style={{ background: WHITE, borderColor: `${GOLD}33` }}>
            <label className="px-2 py-2 rounded-lg border cursor-pointer text-xs flex items-center gap-2" style={{ borderColor: `${GOLD}55`, background: PAPER }}>
              <Upload size={16} /> Attach
              <input type="file" className="hidden" onChange={(e) => uploadMedia(e.target.files?.[0])} />
            </label>
            <textarea
              rows={1}
              className="flex-1 resize-none px-3 py-2 rounded-lg border"
              style={{ background: PAPER, borderColor: `${GOLD}55` }}
              placeholder={selected ? "Type a message" : "Select a chat first"}
              disabled={!selected}
              value={composer}
              onChange={(e) => setComposer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
            />
            <button
              onClick={sendMessage}
              disabled={!selected}
              className="p-3 rounded-full text-white"
              style={{ background: selected ? GOLD : "#CFCFCF" }}
            >
              <Send size={16} />
            </button>
          </div>
        </div>

        {/* Right spacer (3rd pane) */}
        <div className="hidden sm:block sm:col-span-3 h-full min-h-0 sm:rounded-xl" style={{ background: WHITE, border: `1px solid ${GOLD}11` }} />
      </div>

      {/* Mobile FAB */}
      <button
        className="sm:hidden fixed bottom-4 right-4 p-4 rounded-full shadow text-white"
        onClick={() => setDrawerOpen(true)}
        style={{ background: GOLD }}
      >
        <Menu size={18} />
      </button>

      {/* Actions Drawer */}
      <div className={`fixed inset-0 z-40 transition ${drawerOpen ? "pointer-events-auto" : "pointer-events-none"}`}>
        <div
          className={`absolute inset-0 transition-opacity ${drawerOpen ? "opacity-100" : "opacity-0"}`}
          style={{ background: "#00000066" }}
          onClick={closeDrawer}
        />
        <div
          className={`absolute right-0 top-0 h-full w-full sm:w-[420px] shadow-xl transform transition-transform ${
            drawerOpen ? "translate-x-0" : "translate-x-full"
          }`}
          style={{ background: WHITE }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: `${GOLD}33`, background: PAPER }}>
            <div className="font-semibold" style={{ color: TEXT }}>Actions</div>
            <button onClick={closeDrawer} className="p-2 rounded" style={{ background: "#0000000d" }}>
              <X size={18} />
            </button>
          </div>

          <div className="p-4 space-y-4">
            {/* Tiles */}
            <div className="grid grid-cols-4 gap-2 text-sm">
              <button onClick={() => openAction("pay")} className={`p-3 rounded-xl border flex flex-col items-center gap-2 ${activeAction === "pay" ? "shadow" : ""}`} style={{ borderColor: `${GOLD}55`, background: WHITE }}>
                <CreditCard size={18} /> Pay
              </button>
              <button onClick={() => openAction("catalogue")} className={`p-3 rounded-xl border flex flex-col items-center gap-2 ${activeAction === "catalogue" ? "shadow" : ""}`} style={{ borderColor: `${GOLD}55`, background: WHITE }}>
                <Package size={18} /> Catalogue
              </button>
              <button onClick={() => openAction("ship")} className={`p-3 rounded-xl border flex flex-col items-center gap-2 ${activeAction === "ship" ? "shadow" : ""}`} style={{ borderColor: `${GOLD}55`, background: WHITE }}>
                <Truck size={18} /> Ship
              </button>
              <button onClick={() => openAction("broadcast")} className={`p-3 rounded-xl border flex flex-col items-center gap-2 ${activeAction === "broadcast" ? "shadow" : ""}`} style={{ borderColor: `${GOLD}55`, background: WHITE }}>
                <Megaphone size={18} /> Broadcast
              </button>
            </div>

            {/* Pay */}
            {activeAction === "pay" && (
              <div className="space-y-3">
                <div className="text-xs opacity-70">Send Razorpay payment link {selected ? `to ${selected}` : "(enter numbers below if no chat selected)"}.</div>
                {!selected && (
                  <input
                    className="w-full px-3 py-2 rounded-md border"
                    style={{ borderColor: `${GOLD}55` }}
                    placeholder="Numbers (comma separated, intl format)"
                    value={catalogRecipients}
                    onChange={(e) => setCatalogRecipients(e.target.value)}
                  />
                )}
                <div className="flex gap-2">
                  <input className="w-32 px-3 py-2 rounded-md border" style={{ borderColor: `${GOLD}55` }} placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
                  <input className="flex-1 px-3 py-2 rounded-md border" style={{ borderColor: `${GOLD}55` }} placeholder="Note (optional)" value={payNote} onChange={(e) => setPayNote(e.target.value)} />
                </div>
                <button onClick={submitPayment} className="w-full py-2 rounded-md text-white font-medium" style={{ background: GOLD }}>
                  Send Link
                </button>
              </div>
            )}

            {/* Catalogue */}
            {activeAction === "catalogue" && (
              <div className="space-y-3">
                <div className="text-xs opacity-70">Search products and send as WhatsApp product card(s).</div>
                {!selected && (
                  <input
                    className="w-full px-3 py-2 rounded-md border"
                    style={{ borderColor: `${GOLD}55` }}
                    placeholder="Numbers (comma separated, intl format)"
                    value={catalogRecipients}
                    onChange={(e) => setCatalogRecipients(e.target.value)}
                  />
                )}
                <div className="flex gap-2">
                  <input className="flex-1 px-3 py-2 rounded-md border" style={{ borderColor: `${GOLD}55` }} placeholder="Search product or SKU" value={catalogQuery} onChange={(e) => setCatalogQuery(e.target.value)} />
                  <button onClick={searchCatalog} className="px-3 rounded-md text-white" style={{ background: GOLD }}>
                    Search
                  </button>
                </div>
                <div className="max-h-64 overflow-auto space-y-2">
                  {products.map((p) => (
                    <div key={p.id} className="flex items-center gap-2 p-2 rounded-lg border" style={{ borderColor: `${GOLD}44`, background: WHITE }}>
                      {p.imageUrl ? (
                        <img src={p.imageUrl} alt={p.title} className="w-10 h-10 rounded object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded" style={{ background: PAPER }} />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{p.title}</div>
                        <div className="text-[11px] opacity-70">
                          {p.sku} • ₹{Number(p.price || 0).toFixed(0)} {p.stock > 0 ? `• ${p.stock} in stock` : "• OOS"}
                        </div>
                      </div>
                      <button onClick={() => sendCatalogue(p.id)} className="px-3 py-1 rounded-md text-white" style={{ background: GOLD }}>
                        Send
                      </button>
                    </div>
                  ))}
                  {products.length === 0 && <div className="text-xs opacity-60">No products. Search to load catalogue.</div>}
                </div>
              </div>
            )}

            {/* Ship */}
            {activeAction === "ship" && (
              <div className="space-y-3">
                <div className="text-xs opacity-70">Push Shiprocket tracking update to the chat or to a number.</div>
                <input className="w-full px-3 py-2 rounded-md border" style={{ borderColor: `${GOLD}55` }} placeholder="AWB" value={awb} onChange={(e) => setAwb(e.target.value)} />
                <button onClick={trackShipment} className="w-full py-2 rounded-md text-white font-medium" style={{ background: GOLD }}>
                  Send Tracking
                </button>
              </div>
            )}

            {/* Broadcast */}
            {activeAction === "broadcast" && (
              <div className="space-y-3">
                <div className="text-xs opacity-70">Send a one-shot broadcast to a tag/segment (e.g., ALL / COD / HOT).</div>
                <input className="w-full px-3 py-2 rounded-md border" style={{ borderColor: `${GOLD}55` }} placeholder="Segment tag (e.g., ALL)" value={broadcastTag} onChange={(e) => setBroadcastTag(e.target.value)} />
                <textarea rows={4} className="w-full px-3 py-2 rounded-md border" style={{ borderColor: `${GOLD}55`, background: PAPER }} placeholder="Message…" value={broadcastText} onChange={(e) => setBroadcastText(e.target.value)} />
                <button onClick={doBroadcast} className="w-full py-2 rounded-md text-white font-medium" style={{ background: GOLD }}>
                  Queue Broadcast
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full shadow text-white" style={{ background: TEXT }}>
          {toast}
        </div>
      )}
    </div>
  );
}

function StatusTick({ status }) {
  if (status === "read") return <CheckCheck size={14} className="opacity-80" />;
  if (status === "delivered") return <Check size={14} className="opacity-80" />;
  if (status === "sent") return <Check size={14} className="opacity-50" />;
  return null;
}
