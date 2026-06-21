import { FC, useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { LifeBuoy, Plus, Send, ArrowLeft, Clock, Image as ImageIcon, ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { MemberAvatar } from "@/components/member-avatar";
import { ImageUpload } from "@/components/image-upload";

type Ticket = {
  id: number; subject: string; type: string; priority: string; status: string;
  createdAt: string; updatedAt: string; closedAt: string | null;
  messageCount: number; unread: number;
  opener?: { id: number; firstName: string; lastName: string; role: string; profileImageUrl?: string | null };
};
type Message = {
  id: number; ticketId: number; message: string; imageUrl?: string | null; fromDev: boolean; createdAt: string;
  sender: { firstName: string; lastName: string; role: string; profileImageUrl?: string | null };
};

const statusColor: Record<string, string> = {
  open: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  in_progress: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  resolved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  closed: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};
const statusLabel: Record<string, string> = { open: "เปิดอยู่", in_progress: "กำลังดำเนินการ", resolved: "แก้ไขแล้ว", closed: "ปิดแล้ว" };
const typeLabel: Record<string, string> = { bug: "แจ้งบั๊ก/ปัญหา", question: "คำถาม", feature: "ขอฟีเจอร์", other: "อื่นๆ" };
const priorityLabel: Record<string, string> = { low: "ต่ำ", normal: "ปกติ", high: "สูง", urgent: "ด่วนมาก" };
const priorityColor: Record<string, string> = {
  low: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  normal: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  urgent: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

export const AdminHelpCenter: FC = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const token = localStorage.getItem("pool_token");
  const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");
  const isDev = user?.role === "super_admin"; // super_admin acts as the DEV team
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [replyText, setReplyText] = useState("");
  const [replyImage, setReplyImage] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [newForm, setNewForm] = useState({ subject: "", type: "bug", priority: "normal", message: "", imageUrl: null as string | null });

  const auth = { Authorization: `Bearer ${token}` };
  const jsonAuth = { "Content-Type": "application/json", ...auth };

  const fetchTickets = async () => {
    const res = await fetch(`${baseUrl}/api/dev-support/tickets`, { headers: auth });
    if (res.ok) setTickets(await res.json());
    setLoading(false);
  };

  const fetchMessages = async (ticketId: number) => {
    const res = await fetch(`${baseUrl}/api/dev-support/tickets/${ticketId}/messages`, { headers: auth });
    if (res.ok) { const d = await res.json(); setMessages(d.messages || []); setActiveTicket(d.ticket); }
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  useEffect(() => { fetchTickets(); }, []);
  useEffect(() => {
    if (!activeTicket) return;
    const id = activeTicket.id;
    fetchMessages(id);
    const iv = setInterval(() => fetchMessages(id), 10000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTicket?.id]);

  const handleNewTicket = async () => {
    if (!newForm.subject || !newForm.message) { toast({ title: "กรุณากรอกหัวข้อและรายละเอียด", variant: "destructive" }); return; }
    setSending(true);
    try {
      const res = await fetch(`${baseUrl}/api/dev-support/tickets`, { method: "POST", headers: jsonAuth, body: JSON.stringify(newForm) });
      if (!res.ok) throw new Error("Failed");
      const d = await res.json();
      toast({ title: "ส่งตั๋วถึงทีม DEV แล้ว" });
      setShowNew(false);
      setNewForm({ subject: "", type: "bug", priority: "normal", message: "", imageUrl: null });
      await fetchTickets();
      setActiveTicket(d.ticket);
    } catch { toast({ title: "เกิดข้อผิดพลาด", variant: "destructive" }); }
    finally { setSending(false); }
  };

  const handleSend = async () => {
    if (!activeTicket || (!replyText.trim() && !replyImage)) return;
    setSending(true);
    try {
      const res = await fetch(`${baseUrl}/api/dev-support/tickets/${activeTicket.id}/messages`, {
        method: "POST", headers: jsonAuth, body: JSON.stringify({ message: replyText, imageUrl: replyImage }),
      });
      if (!res.ok) throw new Error("Failed");
      setReplyText(""); setReplyImage(null);
      await fetchMessages(activeTicket.id);
    } catch { toast({ title: "เกิดข้อผิดพลาด", variant: "destructive" }); }
    finally { setSending(false); }
  };

  const patchTicket = async (body: Record<string, string>) => {
    if (!activeTicket) return;
    const res = await fetch(`${baseUrl}/api/dev-support/tickets/${activeTicket.id}`, { method: "PATCH", headers: jsonAuth, body: JSON.stringify(body) });
    if (res.ok) { const d = await res.json(); setActiveTicket(t => t ? { ...t, ...d } : d); fetchTickets(); }
  };

  if (loading) return <div className="flex items-center justify-center min-h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  // ===== Thread view =====
  if (activeTicket) {
    const closed = activeTicket.status === "closed";
    return (
      <div className="flex flex-col h-[calc(100vh-9rem)] max-w-2xl mx-auto">
        <div className="flex items-center gap-3 pb-3 border-b mb-3">
          <Button variant="ghost" size="icon" onClick={() => { setActiveTicket(null); fetchTickets(); }}><ArrowLeft className="w-5 h-5" /></Button>
          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate">{activeTicket.subject}</p>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <Badge variant="outline" className="text-[10px]">{typeLabel[activeTicket.type] || activeTicket.type}</Badge>
              <Badge className={cn("text-[10px]", priorityColor[activeTicket.priority])} variant="secondary">{priorityLabel[activeTicket.priority] || activeTicket.priority}</Badge>
              {isDev && activeTicket.opener && <span className="text-xs text-muted-foreground">· จาก {activeTicket.opener.firstName} {activeTicket.opener.lastName}</span>}
            </div>
          </div>
          <Badge className={statusColor[activeTicket.status] || ""}>{statusLabel[activeTicket.status] || activeTicket.status}</Badge>
        </div>

        {/* DEV controls */}
        {isDev && (
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="text-xs text-muted-foreground">สถานะ:</span>
            <Select value={activeTicket.status} onValueChange={v => patchTicket({ status: v })}>
              <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{["open", "in_progress", "resolved", "closed"].map(s => <SelectItem key={s} value={s}>{statusLabel[s]}</SelectItem>)}</SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground ml-1">ความสำคัญ:</span>
            <Select value={activeTicket.priority} onValueChange={v => patchTicket({ priority: v })}>
              <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{["low", "normal", "high", "urgent"].map(p => <SelectItem key={p} value={p}>{priorityLabel[p]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}
        {!isDev && !closed && activeTicket.status !== "resolved" && (
          <div className="mb-3"><Button variant="outline" size="sm" onClick={() => patchTicket({ status: "resolved" })}>ทำเครื่องหมายว่าแก้ไขแล้ว</Button></div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-3 pb-2">
          {messages.map(msg => {
            const isMe = isDev ? msg.fromDev : !msg.fromDev;
            return (
              <div key={msg.id} className={cn("flex items-end gap-2", isMe ? "justify-end" : "justify-start")}>
                {!isMe && (
                  msg.fromDev
                    ? <span className="w-7 h-7 mb-1 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-white grid place-items-center shrink-0"><ShieldCheck className="w-4 h-4" /></span>
                    : <MemberAvatar firstName={msg.sender.firstName} lastName={msg.sender.lastName} src={msg.sender.profileImageUrl} className="w-7 h-7 text-[10px] mb-1" />
                )}
                <div className={cn("max-w-[78%] rounded-2xl px-4 py-2 text-sm", isMe ? "bg-primary text-white rounded-br-sm" : "bg-muted rounded-bl-sm")}>
                  {!isMe && <p className="text-xs font-medium opacity-70 mb-1">{msg.fromDev ? "ทีม DEV 🛠️" : `${msg.sender.firstName} ${msg.sender.lastName}`}</p>}
                  {msg.message && <p className="leading-relaxed whitespace-pre-wrap">{msg.message}</p>}
                  {msg.imageUrl && (
                    <a href={msg.imageUrl} target="_blank" rel="noreferrer">
                      <img src={msg.imageUrl} alt="แนบรูป" className="mt-1.5 rounded-lg max-h-60 border border-black/10" />
                    </a>
                  )}
                  <p className={cn("text-xs mt-1 opacity-60", isMe ? "text-right" : "")}>{new Date(msg.createdAt).toLocaleString("th-TH", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Reply */}
        {closed ? (
          <div className="pt-3 border-t text-center text-sm text-muted-foreground">ตั๋วนี้ถูกปิดแล้ว</div>
        ) : (
          <div className="pt-3 border-t space-y-2">
            {replyImage && (
              <div className="relative inline-block">
                <img src={replyImage} alt="แนบ" className="h-20 rounded-lg border" />
                <button onClick={() => setReplyImage(null)} className="absolute -top-2 -right-2 bg-destructive text-white rounded-full w-5 h-5 text-xs leading-none">×</button>
              </div>
            )}
            <div className="flex gap-2 items-center">
              <label className="cursor-pointer text-muted-foreground hover:text-primary shrink-0" title="แนบรูปภาพ/สกรีนช็อต">
                <ImageIcon className="w-5 h-5" />
                <input type="file" accept="image/*" className="hidden" onChange={e => {
                  const f = e.target.files?.[0]; e.target.value = "";
                  if (!f) return;
                  if (f.size > 4 * 1024 * 1024) { toast({ title: "รูปใหญ่เกินไป (สูงสุด 4MB)", variant: "destructive" }); return; }
                  const reader = new FileReader();
                  reader.onload = ev => setReplyImage((ev.target?.result as string) || null);
                  reader.readAsDataURL(f);
                }} />
              </label>
              <Input value={replyText} onChange={e => setReplyText(e.target.value)} placeholder={isDev ? "ตอบกลับในฐานะทีม DEV..." : "พิมพ์ข้อความถึงทีม DEV..."}
                onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSend()} />
              <Button size="icon" onClick={handleSend} disabled={(!replyText.trim() && !replyImage) || sending}><Send className="w-4 h-4" /></Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ===== Ticket list =====
  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-extrabold flex items-center gap-3">
          <span className="icon-tile rounded-xl p-2 bg-gradient-to-br from-violet-500 to-indigo-600 text-white"><LifeBuoy className="w-5 h-5" /></span>
          <span className="text-gradient">ศูนย์ช่วยเหลือ</span>
        </h1>
        <Button onClick={() => setShowNew(true)}><Plus className="w-4 h-4 mr-2" />เปิดตั๋วใหม่</Button>
      </div>
      <p className="text-sm text-muted-foreground -mt-2">
        {isDev ? "กล่องตั๋วจากแอดมินถึงทีม DEV — ตอบกลับและจัดการสถานะได้ที่นี่" : "เปิดตั๋วเพื่อแจ้งปัญหา ถามคำถาม หรือขอฟีเจอร์กับทีม DEV"}
      </p>

      {/* New ticket form */}
      {showNew && (
        <Card>
          <CardHeader><CardTitle className="text-base">เปิดตั๋วใหม่ถึงทีม DEV</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>หัวข้อ</Label>
              <Input value={newForm.subject} onChange={e => setNewForm(f => ({ ...f, subject: e.target.value }))} placeholder="สรุปสั้นๆ เช่น หน้าจองค้างเมื่อกดยืนยัน" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>ประเภท</Label>
                <Select value={newForm.type} onValueChange={v => setNewForm(f => ({ ...f, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["bug", "question", "feature", "other"].map(t => <SelectItem key={t} value={t}>{typeLabel[t]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>ความสำคัญ</Label>
                <Select value={newForm.priority} onValueChange={v => setNewForm(f => ({ ...f, priority: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["low", "normal", "high", "urgent"].map(p => <SelectItem key={p} value={p}>{priorityLabel[p]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>รายละเอียด</Label>
              <Textarea value={newForm.message} onChange={e => setNewForm(f => ({ ...f, message: e.target.value }))} placeholder="อธิบายปัญหา/คำขอ ขั้นตอนที่ทำ และสิ่งที่คาดหวัง" rows={4} />
            </div>
            <div className="space-y-1">
              <Label>แนบรูป/สกรีนช็อต (ถ้ามี)</Label>
              <ImageUpload value={newForm.imageUrl} onChange={v => setNewForm(f => ({ ...f, imageUrl: v }))} shape="wide" maxMb={4} label="แนบสกรีนช็อต" />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowNew(false)}>ยกเลิก</Button>
              <Button onClick={handleNewTicket} disabled={sending}>{sending ? "กำลังส่ง..." : "ส่งตั๋ว"}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* List */}
      <div className="space-y-2">
        {tickets.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <LifeBuoy className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>{isDev ? "ยังไม่มีตั๋วจากแอดมิน" : "ยังไม่มีตั๋ว — กด 'เปิดตั๋วใหม่' เพื่อติดต่อทีม DEV"}</p>
          </div>
        ) : tickets.map(ticket => (
          <Card key={ticket.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setActiveTicket(ticket)}>
            <CardContent className="p-4 flex items-center gap-3">
              {isDev && ticket.opener && (
                <MemberAvatar firstName={ticket.opener.firstName} lastName={ticket.opener.lastName} src={ticket.opener.profileImageUrl} className="w-10 h-10 text-sm" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium truncate">{ticket.subject}</p>
                  {ticket.unread > 0 && <span className="bg-red-500 text-white text-[10px] rounded-full px-1.5 py-0.5 leading-none">{ticket.unread} ใหม่</span>}
                </div>
                <div className="flex items-center gap-1 mt-1 flex-wrap">
                  <Badge className={cn("text-[10px]", priorityColor[ticket.priority])} variant="secondary">{priorityLabel[ticket.priority]}</Badge>
                  <Badge className={cn("text-[10px]", statusColor[ticket.status])} variant="secondary">{statusLabel[ticket.status]}</Badge>
                  {isDev && ticket.opener && <span className="text-xs text-muted-foreground">{ticket.opener.firstName} {ticket.opener.lastName}</span>}
                </div>
                <div className="flex items-center gap-1 mt-1">
                  <Clock className="w-3 h-3 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">{new Date(ticket.updatedAt).toLocaleDateString("th-TH")} · {ticket.messageCount} ข้อความ</p>
                </div>
              </div>
              <Badge variant="outline">{typeLabel[ticket.type] || ticket.type}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
