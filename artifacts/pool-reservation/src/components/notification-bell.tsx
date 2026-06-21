import { FC, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Bell, Calendar, Wallet, MessageCircle, Megaphone, Check, ShoppingBag } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type Notif = {
  id: string; kind: "announcement" | "reservation" | "topup" | "chat" | "order";
  level: "info" | "success" | "warning" | "maintenance"; title: string; body: string;
  at: string; href: string | null; pinned?: boolean;
};

const SEEN_KEY = "notif_last_seen";
const kindIcon = { announcement: Megaphone, reservation: Calendar, topup: Wallet, chat: MessageCircle, order: ShoppingBag } as const;
const levelColor: Record<string, string> = {
  info: "text-sky-500", success: "text-emerald-500", warning: "text-amber-500", maintenance: "text-rose-500",
};

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "เมื่อสักครู่";
  if (diff < 3600) return `${Math.floor(diff / 60)} นาทีที่แล้ว`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ชม.ที่แล้ว`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} วันก่อน`;
  return new Date(iso).toLocaleDateString("th-TH");
}

export const NotificationBell: FC = () => {
  const [, setLocation] = useLocation();
  const [items, setItems] = useState<Notif[]>([]);
  const [open, setOpen] = useState(false);
  const [lastSeen, setLastSeen] = useState<string>(() => localStorage.getItem(SEEN_KEY) || "");
  const serverTimeRef = useRef<string>("");
  const token = localStorage.getItem("pool_token");
  const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");

  useEffect(() => {
    if (!token) return;
    let alive = true;
    const ctrl = new AbortController();
    const headers = { Authorization: `Bearer ${token}` };
    const apply = (data: { items?: Notif[]; serverTime?: string }) => {
      if (!alive) return;
      setItems(data.items || []);
      if (data.serverTime) serverTimeRef.current = data.serverTime;
    };
    const poll = async () => {
      try { const r = await fetch(`${baseUrl}/api/notifications`, { headers }); if (r.ok) apply(await r.json()); } catch { /* ignore */ }
    };
    // SSE push (fetch-reader so the Bearer header works); falls back to polling on error/end
    const startSSE = async () => {
      try {
        const r = await fetch(`${baseUrl}/api/notifications/stream`, { headers, signal: ctrl.signal });
        if (!r.ok || !r.body) throw new Error("no stream");
        const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = "";
        for (;;) {
          const { value, done } = await reader.read(); if (done) break;
          buf += dec.decode(value, { stream: true });
          let i: number;
          while ((i = buf.indexOf("\n\n")) >= 0) {
            const line = buf.slice(0, i).trim(); buf = buf.slice(i + 2);
            if (line.startsWith("data:")) { try { apply(JSON.parse(line.slice(5).trim())); } catch { /* ignore */ } }
          }
        }
      } catch { /* fall back to polling interval below */ }
    };
    poll();
    startSSE();
    const iv = setInterval(poll, 25000);
    return () => { alive = false; clearInterval(iv); ctrl.abort(); };
  }, [token]);

  const unread = items.filter((i) => !lastSeen || i.at > lastSeen).length;

  const markAllSeen = () => {
    // Mark everything currently shown as seen by storing the NEWEST notification's
    // timestamp. Using the max item `at` (rather than serverTime) guarantees the badge
    // clears even when some `at` values are clock-skewed ahead of the server clock.
    const newest = items.reduce((m, i) => (i.at > m ? i.at : m), "");
    const t = newest || serverTimeRef.current || new Date().toISOString();
    localStorage.setItem(SEEN_KEY, t); setLastSeen(t);
  };
  const onOpenChange = (o: boolean) => { setOpen(o); if (o) markAllSeen(); };

  // While the panel is open, keep newly-arrived notifications marked as seen too.
  useEffect(() => {
    if (!open || items.length === 0) return;
    const newest = items.reduce((m, i) => (i.at > m ? i.at : m), "");
    if (newest && newest > lastSeen) { localStorage.setItem(SEEN_KEY, newest); setLastSeen(newest); }
  }, [open, items, lastSeen]);
  const go = (href: string | null) => { if (href) { setLocation(href); setOpen(false); } };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button className="relative p-2 rounded-md hover:bg-accent transition-colors" aria-label="การแจ้งเตือน" data-testid="button-notifications">
          <Bell className="w-5 h-5" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[calc(100vw-1.5rem)] sm:w-80 p-0 overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <span className="font-semibold text-sm">การแจ้งเตือน</span>
          {items.length > 0 && <span className="text-xs text-muted-foreground flex items-center gap-1"><Check className="w-3 h-3" /> อ่านแล้ว</span>}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />ยังไม่มีการแจ้งเตือน
            </div>
          ) : items.map((n) => {
            const Icon = kindIcon[n.kind] || Bell;
            const isNew = !lastSeen || n.at > lastSeen;
            return (
              <button key={n.id} onClick={() => go(n.href)}
                className={cn("w-full text-left px-4 py-3 border-b last:border-0 flex gap-3 hover:bg-accent/60 transition-colors",
                  n.href ? "cursor-pointer" : "cursor-default", isNew && "bg-primary/5")}>
                <Icon className={cn("w-4 h-4 mt-0.5 shrink-0", levelColor[n.level] || "text-muted-foreground")} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {n.pinned && <span className="text-[10px]">📌</span>}
                    <p className="text-sm font-medium truncate">{n.title}</p>
                    {isNew && <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0 ml-auto" />}
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">{n.body}</p>
                  <p className="text-[11px] text-muted-foreground/70 mt-0.5">{timeAgo(n.at)}</p>
                </div>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
};
