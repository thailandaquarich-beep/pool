import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/page-header";
import { Bot, MessageSquare, Users, Headset } from "lucide-react";
import { cn } from "@/lib/utils";
import { MemberAvatar } from "@/components/member-avatar";

const intentLabel: Record<string, string> = {
  booking: "จองสระ", topup: "เติมเงิน", package: "แพ็กเกจ", cancel: "ยกเลิก/คืนเงิน",
  instructor: "ครูฝึก", hours: "เวลาทำการ", price: "ราคา", complaint: "ร้องเรียน",
  human_request: "ขอเจ้าหน้าที่", general: "ทั่วไป",
};

type Customer = {
  userId: number | null; name: string | null; memberCode: string | null; profileImageUrl?: string | null;
  messageCount: number; escalated: boolean; topIntent: string; lastMessage: string; lastAt: string;
  intents: Record<string, number>;
};
type Analytics = {
  totalMessages: number; totalCustomers: number; escalations: number;
  byIntent: Record<string, number>; customers: Customer[];
};
type ConvRow = { atLocal?: string; at: string; message: string; reply: string; intent: string; escalated: boolean };

export function AdminAiChat() {
  const token = localStorage.getItem("pool_token");
  const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");
  const [selected, setSelected] = useState<Customer | null>(null);

  const { data, isLoading } = useQuery<Analytics>({
    queryKey: ["ai-chat", "analytics"],
    queryFn: async () => {
      const r = await fetch(`${baseUrl}/api/ai-chat/analytics`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) return { totalMessages: 0, totalCustomers: 0, escalations: 0, byIntent: {}, customers: [] };
      return r.json();
    },
  });

  const { data: conv } = useQuery<ConvRow[]>({
    queryKey: ["ai-chat", "conversation", selected?.userId],
    enabled: !!selected,
    queryFn: async () => {
      const r = await fetch(`${baseUrl}/api/ai-chat/conversation/${selected?.userId ?? "anonymous"}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) return [];
      return r.json();
    },
  });

  const stats = [
    { label: "ข้อความทั้งหมด", value: data?.totalMessages ?? 0, icon: MessageSquare, grad: "from-sky-500 to-blue-600" },
    { label: "ลูกค้าที่คุย", value: data?.totalCustomers ?? 0, icon: Users, grad: "from-violet-500 to-indigo-600" },
    { label: "ต้องให้เจ้าหน้าที่ช่วย", value: data?.escalations ?? 0, icon: Headset, grad: "from-amber-500 to-orange-600" },
  ];
  const intents = Object.entries(data?.byIntent ?? {}).sort((a, b) => b[1] - a[1]);
  const maxIntent = Math.max(1, ...intents.map(([, n]) => n));

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="วิเคราะห์แชทน้องอควา" subtitle="สรุปสิ่งที่ลูกค้าต้องการ + รายการที่ต้องให้เจ้าหน้าที่ดูแล" icon={Bot} gradient="from-cyan-400 to-blue-600" />

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-3">{[1, 2, 3].map(i => <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />)}</div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            {stats.map((s, i) => (
              <Card key={i} className="relative overflow-hidden">
                <div className={`pointer-events-none absolute -right-6 -top-6 w-24 h-24 rounded-full bg-gradient-to-br ${s.grad} opacity-15 blur-2xl`} />
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm text-muted-foreground">{s.label}</CardTitle>
                  <div className={`p-2 rounded-xl bg-gradient-to-br ${s.grad} text-white`}><s.icon className="h-4 w-4" /></div>
                </CardHeader>
                <CardContent><div className="text-3xl font-bold">{s.value}</div></CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-5">
            {/* Intent breakdown */}
            <Card className="lg:col-span-2">
              <CardHeader><CardTitle className="text-base">ลูกค้าถามเรื่องอะไรบ้าง</CardTitle></CardHeader>
              <CardContent className="space-y-2.5">
                {intents.length === 0 ? <p className="text-sm text-muted-foreground py-4 text-center">ยังไม่มีข้อมูล</p> :
                  intents.map(([key, n]) => (
                    <div key={key}>
                      <div className="flex justify-between text-sm mb-0.5"><span>{intentLabel[key] ?? key}</span><span className="font-semibold">{n}</span></div>
                      <div className="h-2 rounded-full bg-secondary overflow-hidden">
                        <div className={cn("h-full rounded-full", key === "complaint" || key === "human_request" ? "bg-amber-500" : "bg-primary")} style={{ width: `${(n / maxIntent) * 100}%` }} />
                      </div>
                    </div>
                  ))}
              </CardContent>
            </Card>

            {/* Customers */}
            <Card className="lg:col-span-3">
              <CardHeader><CardTitle className="text-base">ลูกค้า ({data?.customers.length ?? 0})</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {!data?.customers.length ? <p className="text-sm text-muted-foreground py-4 text-center">ยังไม่มีบทสนทนา</p> :
                  data.customers.map((c) => (
                    <button key={String(c.userId)} onClick={() => setSelected(c)}
                      className="w-full text-left p-3 rounded-xl border border-border hover:bg-muted/40 transition-colors flex items-center gap-3">
                      <MemberAvatar firstName={c.name?.split(" ")[0]} lastName={c.name?.split(" ")[1]} src={c.profileImageUrl} className="w-10 h-10 text-sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{c.name ?? "ผู้ใช้ไม่ระบุ"}</span>
                          {c.memberCode && <span className="font-mono text-[10px] text-primary bg-primary/10 px-1.5 rounded">{c.memberCode}</span>}
                          <Badge variant="outline" className="text-[10px]">{intentLabel[c.topIntent] ?? c.topIntent}</Badge>
                          {c.escalated && <Badge className="text-[10px] bg-amber-500 text-white ml-auto gap-1"><Headset className="w-3 h-3" />ต้องช่วย</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-1">“{c.lastMessage}”</p>
                        <p className="text-[10px] text-muted-foreground/70 mt-0.5">{c.messageCount} ข้อความ</p>
                      </div>
                    </button>
                  ))}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* Conversation dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5">
              <MemberAvatar firstName={selected?.name?.split(" ")[0]} lastName={selected?.name?.split(" ")[1]} src={selected?.profileImageUrl} className="w-9 h-9 text-xs" />
              <span>{selected?.name ?? "บทสนทนา"} {selected?.memberCode ? `· ${selected.memberCode}` : ""}</span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {(conv ?? []).map((row, i) => (
              <div key={i} className="space-y-1.5">
                <div className="text-[10px] text-muted-foreground">{row.atLocal ?? row.at} · {intentLabel[row.intent] ?? row.intent}{row.escalated ? " · ต้องให้เจ้าหน้าที่ช่วย" : ""}</div>
                <div className="flex justify-end"><div className="max-w-[80%] rounded-2xl rounded-br-sm bg-primary text-white px-3 py-2 text-sm whitespace-pre-wrap">{row.message}</div></div>
                {row.reply && <div className="flex justify-start"><div className="max-w-[80%] rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm whitespace-pre-wrap">{row.reply}</div></div>}
              </div>
            ))}
            {conv && conv.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">ไม่มีบทสนทนา</p>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
