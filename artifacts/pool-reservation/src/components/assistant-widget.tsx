import { FC, useState, useRef, useEffect, KeyboardEvent } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Sparkles, X, Send, Headset, Trash2 } from "lucide-react";

// Calls the local Aquarich AI gateway. In dev, Vite proxies "/ai" -> http://127.0.0.1:8787.
// Override in prod with VITE_ASSISTANT_BASE.
const BASE = (import.meta.env.VITE_ASSISTANT_BASE as string | undefined) || "/ai";
// Conversation memory: signed-in members are stored server-side (DB, follows them across
// devices); guests fall back to this browser-local key. Cap mirrors the server.
const GUEST_KEY = "aqua_chat_guest";
const HISTORY_MAX = 50;
const apiBase = import.meta.env.BASE_URL.replace(/\/$/, "");

type Msg = { role: "user" | "assistant"; content: string };

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

  const send = async () => {
    const msg = text.trim();
    if (!msg || streaming) return;
    setText("");
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
      let buf = "", acc = "", errored = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i: number;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 2);
          if (!line.startsWith("data:")) continue;
          const o = JSON.parse(line.slice(5).trim());
          if (o.t) { acc += o.t; setMessages((m) => patchLast(m, acc)); }
          if (o.escalate) setEscalated(true);
          if (o.error) { errored = true; setMessages((m) => patchLast(m, `⚠ ${o.error}`)); }
        }
      }
      // Stream finished cleanly — remember this turn server-side (signed-in members only).
      if (!errored && acc.trim()) void persistTurn(msg, acc);
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
        className="fixed bottom-5 right-5 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-primary to-cyan-400 text-white shadow-lg flex items-center justify-center hover:scale-105 transition-transform"
        aria-label="ผู้ช่วย AI"
        data-testid="button-assistant"
      >
        {open ? <X className="w-6 h-6" /> : <Sparkles className="w-6 h-6" />}
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-24 right-5 z-50 w-[min(92vw,380px)] h-[min(70vh,560px)] bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-primary/5 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <div className="flex-1">
              <p className="font-semibold text-sm leading-tight">น้องอควา</p>
              <p className="text-xs text-muted-foreground">ผู้ช่วย AI · ดูข้อมูลการจอง/ยอดเงินของคุณได้</p>
            </div>
            {!enabled && <span className="text-xs text-destructive">ปิดชั่วคราว</span>}
            {messages.length > 0 && (
              <button
                onClick={clearChat}
                disabled={streaming}
                className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40"
                aria-label="ล้างประวัติการสนทนา"
                title="ล้างประวัติการสนทนา"
                data-testid="button-assistant-clear"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {messages.length === 0 && (
              <div className="text-center text-xs text-muted-foreground py-8 px-4">
                สวัสดีค่ะ ถามน้องอควาได้เลย เช่น<br />
                "การจองของฉันวันไหน", "ยอดเงินเหลือเท่าไหร่", "สระเปิดกี่โมง"
              </div>
            )}
            {messages.map((m, idx) => (
              <div key={idx} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div className={cn(
                  "max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words",
                  m.role === "user" ? "bg-primary text-white rounded-br-sm" : "bg-muted rounded-bl-sm"
                )}>
                  {m.content || (streaming && idx === messages.length - 1 ? "…" : "")}
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>

          {escalated && (
            <div className="px-3 py-2 border-t border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30">
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

          <div className="p-3 border-t border-border flex gap-2 items-end">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKey}
              placeholder="พิมพ์ข้อความ…"
              rows={1}
              className="resize-none min-h-9 max-h-28"
              disabled={!enabled}
              data-testid="input-assistant"
            />
            <Button size="icon" onClick={send} disabled={!text.trim() || streaming || !enabled} data-testid="button-assistant-send">
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
