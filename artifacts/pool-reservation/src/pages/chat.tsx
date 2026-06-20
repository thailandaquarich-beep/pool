import { FC, useState, useEffect, useRef } from "react";
import { useTranslation } from "@/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { MessageCircle, Plus, Send, ArrowLeft, Clock } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

type Ticket = { id: number; subject: string; type: string; status: string; createdAt: string; updatedAt: string; messageCount: number; user?: any };
type Message = { id: number; ticketId: number; message: string; isAdminMessage: boolean; createdAt: string; sender: { firstName: string; lastName: string; role: string } };

const statusColor: Record<string, string> = {
  open: "bg-blue-100 text-blue-700",
  in_progress: "bg-amber-100 text-amber-700",
  resolved: "bg-emerald-100 text-emerald-700",
  closed: "bg-gray-100 text-gray-700",
};

export const ChatPage: FC = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuth();
  const token = localStorage.getItem("pool_token");
  const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [replyText, setReplyText] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [newForm, setNewForm] = useState({ subject: "", type: "question", message: "" });

  const fetchTickets = async () => {
    setLoading(true);
    const res = await fetch(`${baseUrl}/api/chat/tickets`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setTickets(await res.json());
    setLoading(false);
  };

  const fetchMessages = async (ticketId: number) => {
    const res = await fetch(`${baseUrl}/api/chat/tickets/${ticketId}/messages`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) { const d = await res.json(); setMessages(d.messages || []); }
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  useEffect(() => { fetchTickets(); }, []);
  useEffect(() => {
    if (!activeTicket) return;
    fetchMessages(activeTicket.id);
    const iv = setInterval(() => fetchMessages(activeTicket.id), 10000);
    return () => clearInterval(iv);
  }, [activeTicket]);

  const handleNewTicket = async () => {
    if (!newForm.subject || !newForm.message) { toast({ title: "กรุณากรอกข้อมูลให้ครบ", variant: "destructive" }); return; }
    setSending(true);
    try {
      const res = await fetch(`${baseUrl}/api/chat/tickets`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(newForm),
      });
      if (!res.ok) throw new Error("Failed");
      const d = await res.json();
      toast({ title: "ส่งข้อความสำเร็จ" });
      setShowNew(false);
      setNewForm({ subject: "", type: "question", message: "" });
      await fetchTickets();
      setActiveTicket(d.ticket);
    } catch { toast({ title: "เกิดข้อผิดพลาด", variant: "destructive" }); }
    finally { setSending(false); }
  };

  const handleSend = async () => {
    if (!activeTicket || !replyText.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`${baseUrl}/api/chat/tickets/${activeTicket.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: replyText }),
      });
      if (!res.ok) throw new Error("Failed");
      setReplyText("");
      await fetchMessages(activeTicket.id);
    } catch { toast({ title: "เกิดข้อผิดพลาด", variant: "destructive" }); }
    finally { setSending(false); }
  };

  const handleClose = async () => {
    if (!activeTicket) return;
    const res = await fetch(`${baseUrl}/api/chat/tickets/${activeTicket.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status: "resolved" }),
    });
    if (res.ok) { const d = await res.json(); setActiveTicket(d); fetchTickets(); }
  };

  const typeLabel: Record<string, string> = { question: t("chat.type.question"), complaint: t("chat.type.complaint"), suggestion: t("chat.type.suggestion"), support: t("chat.type.support") };

  if (loading) return <div className="flex items-center justify-center min-h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  // Chat view
  if (activeTicket) return (
    <div className="flex flex-col h-[calc(100vh-10rem)] max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 pb-3 border-b mb-3">
        <Button variant="ghost" size="icon" onClick={() => { setActiveTicket(null); fetchTickets(); }}><ArrowLeft className="w-5 h-5" /></Button>
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate">{activeTicket.subject}</p>
          <p className="text-xs text-muted-foreground">{typeLabel[activeTicket.type]}</p>
        </div>
        <Badge className={statusColor[activeTicket.status] || ""}>{activeTicket.status}</Badge>
        {isAdmin && activeTicket.status !== "resolved" && activeTicket.status !== "closed" && (
          <Button variant="outline" size="sm" onClick={handleClose}>ปิดเรื่อง</Button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 pb-2">
        {messages.map(msg => {
          const isMe = (!isAdmin && !msg.isAdminMessage) || (isAdmin && msg.isAdminMessage);
          return (
            <div key={msg.id} className={cn("flex", isMe ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[75%] rounded-2xl px-4 py-2 text-sm", isMe ? "bg-primary text-white rounded-br-sm" : "bg-muted rounded-bl-sm")}>
                {!isMe && <p className="text-xs font-medium opacity-70 mb-1">{msg.isAdminMessage ? (msg.sender.firstName === "น้องอควา" ? "น้องอควา 🤖 (ผู้ช่วย AI)" : "ทีมงาน") : `${msg.sender.firstName} ${msg.sender.lastName}`}</p>}
                <p className="leading-relaxed whitespace-pre-wrap">{msg.message}</p>
                <p className={cn("text-xs mt-1 opacity-60", isMe ? "text-right" : "")}>{new Date(msg.createdAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}</p>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      {activeTicket.status !== "resolved" && activeTicket.status !== "closed" && (
        <div className="flex gap-2 pt-3 border-t">
          <Input value={replyText} onChange={e => setReplyText(e.target.value)} placeholder="พิมพ์ข้อความ..." onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSend()} />
          <Button size="icon" onClick={handleSend} disabled={!replyText.trim() || sending}><Send className="w-4 h-4" /></Button>
        </div>
      )}
    </div>
  );

  // Ticket list
  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-extrabold flex items-center gap-3">
          <span className="icon-tile rounded-xl p-2 bg-gradient-to-br from-sky-400 to-indigo-600"><MessageCircle className="w-5 h-5" /></span>
          <span className="text-gradient">{isAdmin ? t("chat.allTickets") : t("chat.title")}</span>
        </h1>
        {!isAdmin && <Button onClick={() => setShowNew(true)}><Plus className="w-4 h-4 mr-2" />{t("chat.newTicket")}</Button>}
      </div>

      {/* New ticket form */}
      {showNew && (
        <Card>
          <CardHeader><CardTitle className="text-base">{t("chat.newTicket")}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>{t("chat.subject")}</Label>
              <Input value={newForm.subject} onChange={e => setNewForm(f => ({ ...f, subject: e.target.value }))} placeholder="หัวข้อ" />
            </div>
            <div className="space-y-1">
              <Label>{t("chat.type")}</Label>
              <Select value={newForm.type} onValueChange={v => setNewForm(f => ({ ...f, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["question", "complaint", "suggestion", "support"].map(t2 => (
                    <SelectItem key={t2} value={t2}>{typeLabel[t2]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{t("chat.message")}</Label>
              <Textarea value={newForm.message} onChange={e => setNewForm(f => ({ ...f, message: e.target.value }))} placeholder="รายละเอียด" rows={3} />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowNew(false)}>ยกเลิก</Button>
              <Button onClick={handleNewTicket} disabled={sending}>{sending ? "กำลังส่ง..." : t("common.send")}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Ticket list */}
      <div className="space-y-2">
        {tickets.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>{t("chat.noTickets")}</p>
          </div>
        ) : tickets.map(ticket => (
          <Card key={ticket.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => { setActiveTicket(ticket); }}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium truncate">{ticket.subject}</p>
                  <Badge className={statusColor[ticket.status] || ""} variant="secondary">{ticket.status}</Badge>
                </div>
                {isAdmin && ticket.user && <p className="text-xs text-muted-foreground">{ticket.user.firstName} {ticket.user.lastName}</p>}
                <div className="flex items-center gap-1 mt-1">
                  <Clock className="w-3 h-3 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">{new Date(ticket.updatedAt).toLocaleDateString("th-TH")} · {ticket.messageCount} ข้อความ</p>
                </div>
              </div>
              <Badge variant="outline">{typeLabel[ticket.type]}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
