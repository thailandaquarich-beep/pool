import { FC } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCart } from "@/hooks/use-cart";
import { useToast } from "@/hooks/use-toast";
import { ShoppingBag, Sparkles, ShoppingCart, Plus } from "lucide-react";

type Product = {
  id: number; name: string; nameEn: string | null; category: string | null;
  description: string | null; price: number; imageUrl: string | null; stock: number | null;
};

export const Products: FC = () => {
  const token = localStorage.getItem("pool_token");
  const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");
  const { add, count, items } = useCart();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { data: products, isLoading } = useQuery<Product[]>({
    queryKey: ["products", "active"],
    refetchInterval: 15000, // real-time stock/price updates from admin
    queryFn: async () => {
      const res = await fetch(`${baseUrl}/api/products`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const inCart = (id: number) => items.find((i) => i.productId === id)?.qty ?? 0;
  const addToCart = (p: Product) => {
    if (p.stock != null && inCart(p.id) >= p.stock) {
      toast({ title: `มีสินค้าในสต็อกเพียง ${p.stock} ชิ้น`, variant: "destructive" });
      return;
    }
    add({ productId: p.id, name: p.name, price: p.price, imageUrl: p.imageUrl });
    toast({ title: `เพิ่ม "${p.name}" ลงตะกร้าแล้ว` });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-cyan-600 flex items-center gap-2">
            <ShoppingBag className="w-7 h-7 text-fuchsia-500" /> ร้านค้าสโมสร
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-cyan-500" /> สินค้าและอุปกรณ์ของ Aquarich
          </p>
        </div>
        <Button variant="outline" className="relative gap-2 shrink-0" onClick={() => navigate("/cart")}>
          <ShoppingCart className="w-4 h-4" /> ตะกร้า
          {count > 0 && <span className="absolute -top-2 -right-2 min-w-5 h-5 px-1 rounded-full bg-primary text-white text-[11px] font-bold flex items-center justify-center">{count}</span>}
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">{[1, 2, 3, 4].map(i => <div key={i} className="h-56 rounded-xl bg-muted animate-pulse" />)}</div>
      ) : !products?.length ? (
        <div className="text-center py-20 text-muted-foreground">
          <ShoppingBag className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p>ยังไม่มีผลิตภัณฑ์ในขณะนี้</p>
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => (
            <Card key={p.id} className="overflow-hidden card-lift">
              {p.imageUrl ? (
                <img src={p.imageUrl} alt={p.name} className="w-full h-40 object-cover" />
              ) : (
                <div className="w-full h-40 bg-gradient-to-br from-primary/10 to-cyan-100/40 dark:to-cyan-900/20 flex items-center justify-center">
                  <ShoppingBag className="w-12 h-12 text-primary/30" />
                </div>
              )}
              <CardContent className="p-4 space-y-1.5">
                {p.category && <Badge variant="outline" className="text-[10px]">{p.category}</Badge>}
                <div className="font-bold leading-tight">{p.name}</div>
                {p.description && <p className="text-xs text-muted-foreground line-clamp-2">{p.description}</p>}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-lg font-bold text-primary">฿{p.price.toLocaleString()}</span>
                  {p.stock != null && p.stock <= 0
                    ? <span className="text-xs text-destructive font-medium">สินค้าหมด</span>
                    : <span className="text-xs text-muted-foreground">{p.stock != null ? `เหลือ ${p.stock}` : "พร้อมขาย"}</span>}
                </div>
                <Button
                  size="sm"
                  className="w-full gap-1.5 mt-1"
                  disabled={p.stock != null && p.stock <= 0}
                  onClick={() => addToCart(p)}
                >
                  <Plus className="w-3.5 h-3.5" /> {p.stock != null && p.stock <= 0 ? "สินค้าหมด" : "ใส่ตะกร้า"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
