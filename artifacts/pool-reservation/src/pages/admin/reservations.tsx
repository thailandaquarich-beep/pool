import { useState } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import {
  useListReservations,
  useDeleteReservation,
  getListReservationsQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Search, XCircle, ChevronLeft, ChevronRight, Calendar, CalendarDays, Clock, Users, CheckCircle2, Ticket } from "lucide-react";
import { PageHeader } from "@/components/page-header";

type Reservation = {
  id: number;
  date: string;
  startTime: string;
  endTime: string;
  numberOfPeople: number;
  status: string;
  notes?: string | null;
  userId: number;
  price?: number;
  user?: { firstName: string; lastName: string; houseNumber?: string | null };
  instructor?: { firstName: string; lastName: string } | null;
};

const formatBaht = (n: number) =>
  new Intl.NumberFormat("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);

const StatusBadge = ({ status }: { status: string }) => {
  const map: Record<string, { label: string; dot: string; bg: string; text: string }> = {
    confirmed: { label: "ยืนยันแล้ว", dot: "bg-emerald-500", bg: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-700 dark:text-emerald-300" },
    pending: { label: "รอดำเนินการ", dot: "bg-amber-500", bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-300" },
    cancelled: { label: "ยกเลิกแล้ว", dot: "bg-red-400", bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-600 dark:text-red-400" },
    maintenance: { label: "ปิดปรับปรุง", dot: "bg-slate-400", bg: "bg-slate-100 dark:bg-slate-800", text: "text-slate-600 dark:text-slate-400" },
  };
  const s = map[status] ?? map.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
};

export function AdminReservations() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [cancelTarget, setCancelTarget] = useState<Reservation | null>(null);

  const params = {
    page,
    limit: 20,
    ...(statusFilter !== "all" ? { status: statusFilter } : {}),
  };

  const { data, isLoading } = useListReservations(params);
  const reservations: Reservation[] = (Array.isArray(data) ? data : (data as any)?.reservations ?? []);
  const total: number = (data as any)?.total ?? reservations.length;
  const totalPages: number = Math.ceil(total / 20) || 1;

  const cancelMutation = useDeleteReservation({
    mutation: {
      onSuccess: () => {
        toast({ title: "ยกเลิกการจองสำเร็จ" });
        setCancelTarget(null);
        qc.invalidateQueries({ queryKey: getListReservationsQueryKey() });
      },
      onError: (e: any) =>
        toast({ title: "เกิดข้อผิดพลาด", description: e?.message, variant: "destructive" }),
    },
  });

  const apiToken = localStorage.getItem("pool_token");
  const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");

  // Confirming a pending booking deducts 1 use from the member's package.
  const confirmMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${baseUrl}/api/reservations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiToken}` },
        body: JSON.stringify({ status: "confirmed" }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "ยืนยันไม่สำเร็จ");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "ยืนยันการจองสำเร็จ", description: "หักสิทธิ์การใช้งาน 1 ครั้ง" });
      qc.invalidateQueries({ queryKey: getListReservationsQueryKey() });
    },
    onError: (e: any) => toast({ title: "ยืนยันไม่สำเร็จ", description: e?.message, variant: "destructive" }),
  });

  // Client-side search on rendered rows
  const filtered = search
    ? reservations.filter((r) => {
        const name = `${r.user?.firstName ?? ""} ${r.user?.lastName ?? ""}`.toLowerCase();
        const house = (r.user?.houseNumber ?? "").toLowerCase();
        const q = search.toLowerCase();
        return name.includes(q) || house.includes(q);
      })
    : reservations;

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <PageHeader
        title="การจองทั้งหมด"
        subtitle="จัดการและตรวจสอบรายการจองของสมาชิกทั้งหมด"
        icon={CalendarDays}
        gradient="from-cyan-400 to-blue-600"
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="ค้นหาชื่อสมาชิก, บ้านเลขที่..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="search-input"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => { setStatusFilter(v); setPage(1); }}
        >
          <SelectTrigger className="w-[160px]" data-testid="status-filter">
            <SelectValue placeholder="สถานะทั้งหมด" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ทุกสถานะ</SelectItem>
            <SelectItem value="confirmed">ยืนยันแล้ว</SelectItem>
            <SelectItem value="pending">รอดำเนินการ</SelectItem>
            <SelectItem value="cancelled">ยกเลิกแล้ว</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="space-y-3 p-6">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center">
            <Calendar className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">ไม่พบรายการจอง</p>
            <p className="text-sm text-muted-foreground/70 mt-1">ลองเปลี่ยนตัวกรองหรือค้นหาใหม่</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">สมาชิก</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">วันที่</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">เวลา</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">จำนวน</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">ครูฝึก</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">สถานะ</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">หมายเหตุ</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground">การดำเนินการ</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">
                        {r.user?.firstName} {r.user?.lastName}
                      </p>
                      {r.user?.houseNumber && (
                        <p className="text-xs text-muted-foreground">บ้านเลขที่ {r.user.houseNumber}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-foreground">
                        <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                        {formatDate(r.date)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-foreground">
                        <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                        {r.startTime} – {r.endTime}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-foreground">
                        <Users className="w-3.5 h-3.5 text-muted-foreground" />
                        {r.numberOfPeople} คน
                      </div>
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      {r.instructor ? `${r.instructor.firstName} ${r.instructor.lastName}` : <span className="text-muted-foreground">–</span>}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs max-w-[160px] truncate">
                      {r.notes ?? "–"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {r.status === "pending" && (
                          <Button
                            size="sm"
                            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                            disabled={confirmMutation.isPending}
                            onClick={() => confirmMutation.mutate(r.id)}
                            data-testid={`confirm-btn-${r.id}`}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            ยืนยัน
                          </Button>
                        )}
                        {r.status !== "cancelled" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive gap-1.5"
                            onClick={() => setCancelTarget(r)}
                            data-testid={`cancel-btn-${r.id}`}
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            ยกเลิก
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            แสดง {(page - 1) * 20 + 1}–{Math.min(page * 20, total)} จาก {total} รายการ
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Cancel Confirm */}
      <AlertDialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ยืนยันการยกเลิกการจอง</AlertDialogTitle>
            <AlertDialogDescription>
              คุณต้องการยกเลิกการจองของ{" "}
              <span className="font-semibold">
                {cancelTarget?.user?.firstName} {cancelTarget?.user?.lastName}
              </span>{" "}
              วันที่ {cancelTarget?.date ? formatDate(cancelTarget.date) : ""} เวลา{" "}
              {cancelTarget?.startTime}–{cancelTarget?.endTime}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ไม่ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => cancelTarget && cancelMutation.mutate({ id: cancelTarget.id })}
            >
              {cancelMutation.isPending ? "กำลังยกเลิก..." : "ยืนยันยกเลิก"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
