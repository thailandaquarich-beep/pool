import { FC, useState, useRef, useEffect, KeyboardEvent } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Sparkles, X, Send, Headset, Trash2, Waves } from "lucide-react";

// Calls the local Aquarich AI gateway. In dev, Vite proxies "/ai" -> http://127.0.0.1:8787.
// Override in prod with VITE_ASSISTANT_BASE.
const BASE = (import.meta.env.VITE_ASSISTANT_BASE as string | undefined) || "/ai";
// Conversation memory: signed-in members are stored server-side (DB, follows them across
// devices); guests fall back to this browser-local key. Cap mirrors the server.
const GUEST_KEY = "aqua_chat_guest";
const HISTORY_MAX = 50;
const apiBase = import.meta.env.BASE_URL.replace(/\/$/, "");

const SUGGESTIONS = ["การจองของฉันวันไหน", "ยอดเงินเหลือเท่าไหร่", "สระเปิดกี่โมง", "แพ็กเกจมีอะไรบ้าง"];

type Msg = { role: "user" | "assistant"; content: string };

// น้องอควา's round mascot avatar (brand gradient + water icon).
const AquaAvatar: FC<{ className?: string }> = ({ className }) => (
  <div className={cn("rounded-full bg-brand bg-brand-animated text-white flex items-center justify-center shrink-0 ring-1 ring-white/40 shadow", className)}>
    <Waves className="w-1/2 h-1/2" />
  </div>
);

const TypingDots: FC = () => (
  <span className="inline-flex items-center gap-1 py-1">
    {[0, 150, 300].map((d) => (
      <span key={d} className="w-1.5 h-1.5 rounded-full bg-current opacity-60 animate-bounce" style={{ animationDelay: `${d}ms` }} />
    ))}
  </span>
);

export const AssistantWidget: FC = () => {
  const { user } = useAuth();
  const userId = user?.id ?? null; // null = guest (not signed in)
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(true); // reflects admin on/off from gateway
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [escalated, setEscalated] = useState(false); // show "contact staff" when AI defers
  const [, navigate] = useLocation();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load the active account's conversation: from the DB when signed in, else localStorage.
  useEffect(() => {
    let alive = true;
    const token = localStorage.getItem("pool_token");
    if (userId != null && token) {
      (async () => {
        try {
          const r = await fetch(`${apiBase}/api/ai-chat/history`, { headers: { authorization: `Bearer ${token}` } });
          const rows = r.ok ? await r.json() : [];
          if (alive) setMessages(Array.isArray(rows) ? rows : []);
        } catch { if (alive) setMessages([]); }
      })();
    } else {
      let saved: Msg[] = [];
      try {
        const parsed = JSON.parse(localStorage.getItem(GUEST_KEY) || "[]");
        if (Array.isArray(parsed)) saved = parsed;
      } catch { /* ignore corrupt store */ }
      if (alive) setMessages(saved);
    }
    setEscalated(false);
    return () => { alive = false; };
  }, [userId]);

  // Guests persist to localStorage (signed-in members persist per-turn to the DB instead).
  useEffect(() => {
    if (userId != null || streaming) return;
    try {
      if (messages.length) localStorage.setItem(GUEST_KEY, JSON.stringify(messages.slice(-HISTORY_MAX)));
      else localStorage.removeItem(GUEST_KEY);
    } catch { /* ignore quota */ }
  }, [messages, streaming, userId]);

  // Save one completed turn server-side for signed-in members.
  const persistTurn = async (message: string, reply: string) => {
    const token = localStorage.getItem("pool_token");
    if (userId == null || !token || !reply.trim()) return;
    try {
      await fetch(`${apiBase}/api/ai-chat/turn`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ message, reply }),
      });
    } catch { /* best-effort */ }
  };

  const clearChat = async () => {
    setMessages([]);
    setEscalated(false);
    const token = localStorage.getItem("pool_token");
    if (userId != null && token) {
      try { await fetch(`${apiBase}/api/ai-chat/history`, { method: "DELETE", headers: { authorization: `Bearer ${token}` } }); } catch { /* ignore */ }
    } else {
      try { localStorage.removeItem(GUEST_KEY); } catch { /* ignore */ }
    }
  };

  // poll gateway availability / admin switch
  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const s = await (await fetch(`${BASE}/state`)).json();
        if (alive) setEnabled(!!(s.chatEnabled && s.modelOn));
      } catch {
        if (alive) setEnabled(false);
      }
    };
    check();
    const iv = setInterval(check, 8000);
    return () => { alive = false; clearInterval(iv); };
  }, []);

  const send = async (override?: string) => {
    const msg = (override ?? text).trim();
    if (!msg || streaming) return;
    if (!override) setText("");
    const history = messages.slice(-20);
    setMessages((m) => [...m, { role: "user", content: msg }, { role: "assistant", content: "" }]);
    setStreaming(true);
    setEscalated(false);
    try {
      const token = localStorage.getItem("pool_token");
      const res = await fetch(`${BASE}/assistant`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: msg, history }),
      });
      if (!res.ok || !res.body) {
        const e = await res.json().catch(() => ({ error: res.status }));
        setMessages((m) => patchLast(m, `⚠ ${e.error || "เกิดข้อผิดพลาด"}`));
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "", acc = "", errored = false, navTo: string | null = null;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i: number;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 2);
          if (!line.startsWith("data:")) continue;
          let o: { t?: string; escalate?: boolean; nav?: string; error?: string };
          try { o = JSON.parse(line.slice(5).trim()); } catch { continue; }
          if (o.t) { acc += o.t; setMessages((m) => patchLast(m, acc)); }
          if (o.escalate) setEscalated(true);
          if (o.nav) navTo = o.nav; // น้องอควา is taking the member to a page / after booking
          if (o.error) { errored = true; setMessages((m) => patchLast(m, `⚠ ${o.error}`)); }
        }
      }
      // Stream finished cleanly — remember this turn server-side (signed-in members only).
      if (!errored && acc.trim()) void persistTurn(msg, acc);
      // Agent navigation: take the member to the page น้องอควา chose (e.g. /topup, /reservations).
      if (navTo) { const to = navTo; setTimeout(() => { setOpen(false); navigate(to); }, 700); }
    } catch (err) {
      setMessages((m) => patchLast(m, "⚠ เชื่อมต่อผู้ช่วยไม่ได้"));
    } finally {
      setStreaming(false);
    }
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  if (!enabled && !open) return null;

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-5 right-5 z-50 group"
        aria-label="ผู้ช่วย AI น้องอควา"
        data-testid="button-assistant"
      >
        {!open && <span className="absolute inset-0 rounded-full bg-primary/40 blur-md animate-ping" />}
        <span className={cn(
          "relative w-14 h-14 rounded-full bg-brand bg-brand-animated text-white shadow-xl shadow-primary/40 ring-2 ring-white/40 flex items-center justify-center transition-transform group-hover:scale-110 group-active:scale-95 sheen",
        )}>
          {open ? <X className="w-6 h-6" /> : <Sparkles className="w-6 h-6" />}
        </span>
        {!open && enabled && (
          <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-400 ring-2 ring-background" />
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-24 right-5 z-50 w-[min(92vw,380px)] h-[min(72vh,580px)] bg-card border border-border/60 rounded-3xl shadow-2xl shadow-primary/10 flex flex-col overflow-hidden animate-rise">
          {/* Header */}
          <div className="relative px-4 py-3.5 text-white bg-brand bg-brand-animated sheen flex items-center gap-3 overflow-hidden">
            <div className="pointer-events-none absolute -top-8 -right-6 w-28 h-28 rounded-full bg-white/15 blur-2xl" />
            <AquaAvatar className="w-10 h-10 relative ring-2 ring-white/50" />
            <div className="flex-1 min-w-0 relative">
              <p className="font-display font-bold text-base leading-tight drop-shadow-sm">น้องอควา</p>
              <p className="text-[11px] text-white/85 flex items-center gap-1.5">
                <span className={cn("w-1.5 h-1.5 rounded-full", enabled ? "bg-emerald-300 animate-pulse" : "bg-white/40")} />
                {enabled ? "ผู้ช่วย AI · พร้อมช่วยเหลือ" : "ปิดให้บริการชั่วคราว"}
              </p>
            </div>
            {messages.length > 0 && (
              <button
                onClick={clearChat}
                disabled={streaming}
                className="relative p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition-colors disabled:opacity-40"
                aria-label="ล้างประวัติการสนทนา"
                title="ล้างประวัติการสนทนา"
                data-testid="button-assistant-clear"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button onClick={() => setOpen(false)} className="relative p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition-colors" aria-label="ปิด">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-gradient-to-b from-secondary/20 to-transparent">
            {messages.length === 0 && (
              <div className="flex flex-col items-center text-center gap-3 py-6 px-2">
                <AquaAvatar className="w-16 h-16 shadow-lg" />
                <div>
                  <p className="font-semibold text-sm">สวัสดีค่ะ 🌊 น้องอควายินดีช่วยเหลือ</p>
                  <p className="text-xs text-muted-foreground mt-0.5">ถามเรื่องการจอง ยอดเงิน แพ็กเกจ หรือเวลาเปิด-ปิดได้เลยค่ะ</p>
                </div>
                <div className="flex flex-wrap justify-center gap-1.5 pt-1">
                  {SUGGESTIONS.map((q) => (
                    <button
                      key={q}
                      onClick={() => send(q)}
                      disabled={!enabled || streaming}
                      className="text-xs px-3 py-1.5 rounded-full border border-primary/30 text-primary bg-primary/5 hover:bg-primary/10 transition-colors disabled:opacity-50"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, idx) => {
              const isUser = m.role === "user";
              const isStreamingLast = streaming && idx === messages.length - 1 && !m.content;
              return (
                <div key={idx} className={cn("flex items-end gap-2", isUser ? "justify-end" : "justify-start")}>
                  {!isUser && <AquaAvatar className="w-7 h-7 mb-0.5" />}
                  <div className={cn(
                    "max-w-[78%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words shadow-sm",
                    isUser
                      ? "bg-gradient-to-br from-primary to-cyan-500 text-white rounded-br-md"
                      : "bg-card border border-border/70 rounded-bl-md",
                  )}>
                    {m.content || (isStreamingLast ? <TypingDots /> : "")}
                  </div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>

          {escalated && (
            <div className="px-3 py-2.5 border-t border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30">
              <p className="text-xs text-amber-800 dark:text-amber-300 mb-1.5">ดูเหมือนเรื่องนี้ต้องให้เจ้าหน้าที่ช่วยนะคะ</p>
              <Button
                size="sm"
                className="w-full gap-1.5 bg-amber-500 hover:bg-amber-600 text-white"
                onClick={() => { setOpen(false); navigate("/chat"); }}
              >
                <Headset className="w-4 h-4" /> ติดต่อเจ้าหน้าที่
              </Button>
            </div>
          )}

          {/* Input */}
          <div className="p-3 border-t border-border/60 bg-card/80 backdrop-blur flex gap-2 items-end">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKey}
              placeholder={enabled ? "พิมพ์ข้อความ…" : "ผู้ช่วยปิดให้บริการชั่วคราว"}
              rows={1}
              className="resize-none min-h-10 max-h-28 rounded-2xl bg-secondary/40 border-border/60 focus-visible:ring-primary/40"
              disabled={!enabled}
              data-testid="input-assistant"
            />
            <Button
              size="icon"
              onClick={() => send()}
              disabled={!text.trim() || streaming || !enabled}
              className="h-10 w-10 rounded-full shrink-0 bg-gradient-to-br from-primary to-cyan-500 shadow-md shadow-primary/30 hover:shadow-lg hover:shadow-primary/40 active:scale-95 transition-all"
              data-testid="button-assistant-send"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </>
  );
};

function patchLast(list: Msg[], content: string): Msg[] {
  const copy = list.slice();
  for (let i = copy.length - 1; i >= 0; i--) {
    if (copy[i].role === "assistant") { copy[i] = { ...copy[i], content }; break; }
  }
  return copy;
}
