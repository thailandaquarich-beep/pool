import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type CartItem = { productId: number; name: string; price: number; imageUrl?: string | null; qty: number };

type CartContextType = {
  items: CartItem[];
  add: (item: Omit<CartItem, "qty">, qty?: number) => void;
  setQty: (productId: number, qty: number) => void;
  remove: (productId: number) => void;
  clear: () => void;
  count: number;
  total: number;
};

const CartContext = createContext<CartContextType | undefined>(undefined);
const KEY = "aquarich_cart";

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => {
    try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
  });

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(items));
  }, [items]);

  const add: CartContextType["add"] = (item, qty = 1) =>
    setItems((s) => {
      const existing = s.find((x) => x.productId === item.productId);
      if (existing) return s.map((x) => (x.productId === item.productId ? { ...x, qty: x.qty + qty } : x));
      return [...s, { ...item, qty }];
    });

  const setQty: CartContextType["setQty"] = (productId, qty) =>
    setItems((s) => (qty <= 0 ? s.filter((x) => x.productId !== productId) : s.map((x) => (x.productId === productId ? { ...x, qty } : x))));

  const remove: CartContextType["remove"] = (productId) => setItems((s) => s.filter((x) => x.productId !== productId));
  const clear = () => setItems([]);

  const count = items.reduce((n, i) => n + i.qty, 0);
  const total = items.reduce((n, i) => n + i.price * i.qty, 0);

  return <CartContext.Provider value={{ items, add, setQty, remove, clear, count, total }}>{children}</CartContext.Provider>;
}

export function useCart() {
  const c = useContext(CartContext);
  if (!c) throw new Error("useCart must be used within CartProvider");
  return c;
}
