import { FC } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles, Clock, Users, Waves, Ruler, MapPin, Phone, Tag, ListChecks, ScrollText, Building2, ExternalLink,
} from "lucide-react";

type Facility = {
  id: number; name: string; nameEn: string | null; description: string | null;
  capacity: number; openTime: string; closeTime: string; imageUrl: string | null;
  rules: string | null; location: string | null; phone: string | null; mapUrl: string | null;
  amenities: string | null; depth: string | null; lanes: number | null; priceInfo: string | null;
};

const splitList = (s?: string | null) =>
  (s || "").split(/[,\n·]/).map((x) => x.trim()).filter(Boolean);

export const Services: FC = () => {
  const token = localStorage.getItem("pool_token");
  const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");

  const { data: facilities, isLoading } = useQuery<Facility[]>({
    queryKey: ["facilities", "public"],
    queryFn: async () => {
      const res = await fetch(`${baseUrl}/api/facilities`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return [];
      return res.json();
    },
  });

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl sm:text-3xl font-display font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-cyan-600 flex items-center gap-2">
          <Sparkles className="w-7 h-7 text-cyan-500" /> บริการอื่นๆ
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">สิ่งอำนวยความสะดวกและบริการทั้งหมดของ Aquarich</p>
      </div>

      {isLoading ? (
        <div className="space-y-4">{[1, 2].map((i) => <div key={i} className="h-60 rounded-2xl bg-muted animate-pulse" />)}</div>
      ) : !facilities?.length ? (
        <div className="text-center py-20 text-muted-foreground">
          <Building2 className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p>ยังไม่มีข้อมูลบริการในขณะนี้</p>
        </div>
      ) : (
        <div className="space-y-5">
          {facilities.map((f) => {
            const amenities = splitList(f.amenities);
            return (
              <Card key={f.id} className="overflow-hidden">
                <div className="md:flex">
                  {/* Image */}
                  <div className="md:w-64 shrink-0">
                    {f.imageUrl ? (
                      <img src={f.imageUrl} alt={f.name} className="w-full h-48 md:h-full object-cover" />
                    ) : (
                      <div className="w-full h-48 md:h-full min-h-[12rem] bg-gradient-to-br from-primary/15 to-cyan-100/40 dark:to-cyan-900/20 flex items-center justify-center">
                        <Waves className="w-14 h-14 text-primary/30" />
                      </div>
                    )}
                  </div>

                  {/* Details */}
                  <CardContent className="p-5 flex-1 space-y-3">
                    <div>
                      <h2 className="text-lg font-bold leading-tight">{f.name}</h2>
                      {f.nameEn && <p className="text-xs text-muted-foreground">{f.nameEn}</p>}
                      {f.description && <p className="text-sm text-muted-foreground mt-1.5">{f.description}</p>}
                    </div>

                    {/* Key facts */}
                    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
                      <span className="flex items-center gap-1.5"><Clock className="w-4 h-4 text-primary" />{f.openTime}–{f.closeTime} น.</span>
                      <span className="flex items-center gap-1.5"><Users className="w-4 h-4 text-primary" />รองรับ {f.capacity} คน</span>
                      {f.lanes != null && <span className="flex items-center gap-1.5"><ListChecks className="w-4 h-4 text-primary" />{f.lanes} เลน</span>}
                      {f.depth && <span className="flex items-center gap-1.5"><Ruler className="w-4 h-4 text-primary" />ลึก {f.depth}</span>}
                    </div>

                    {f.priceInfo && (
                      <div className="flex items-start gap-1.5 text-sm">
                        <Tag className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                        <span className="text-emerald-700 dark:text-emerald-400 font-medium">{f.priceInfo}</span>
                      </div>
                    )}

                    {amenities.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {amenities.map((a, i) => <Badge key={i} variant="secondary" className="font-normal">{a}</Badge>)}
                      </div>
                    )}

                    {(f.location || f.phone || f.mapUrl) && (
                      <div className="space-y-1 text-sm text-muted-foreground border-t border-border pt-2.5">
                        {f.location && <div className="flex items-start gap-1.5"><MapPin className="w-4 h-4 mt-0.5 shrink-0 text-rose-500" />{f.location}</div>}
                        {f.phone && <div className="flex items-center gap-1.5"><Phone className="w-4 h-4 text-sky-500" /><a href={`tel:${f.phone}`} className="hover:text-foreground">{f.phone}</a></div>}
                        {f.mapUrl && <a href={f.mapUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-primary hover:underline"><ExternalLink className="w-4 h-4" />ดูแผนที่</a>}
                      </div>
                    )}

                    {f.rules && (
                      <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40 p-2.5">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300 mb-1"><ScrollText className="w-3.5 h-3.5" />ข้อปฏิบัติ / กฎการใช้บริการ</div>
                        <p className="text-xs text-amber-700 dark:text-amber-200/80 whitespace-pre-line">{f.rules}</p>
                      </div>
                    )}
                  </CardContent>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
