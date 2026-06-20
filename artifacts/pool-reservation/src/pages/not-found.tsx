import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/brand";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center p-6 bg-aurora bg-aurora-animated relative overflow-hidden">
      <div className="pointer-events-none absolute -top-24 -left-24 w-96 h-96 rounded-full bg-brand-from/25 blur-3xl animate-float" />
      <div className="pointer-events-none absolute -bottom-24 -right-20 w-80 h-80 rounded-full bg-brand-to/20 blur-3xl animate-float-slow" />

      <div className="relative z-10 text-center space-y-6 animate-rise">
        <div className="flex justify-center">
          <BrandMark size="md" />
        </div>
        <div className="space-y-2">
          <h1 className="text-7xl font-display font-extrabold text-gradient glow-text">404</h1>
          <p className="text-lg font-medium text-foreground">ไม่พบหน้าที่คุณกำลังมองหา</p>
          <p className="text-sm text-muted-foreground">หน้านี้อาจถูกย้ายหรือไม่มีอยู่จริง</p>
        </div>
        <Button asChild size="lg">
          <Link href="/"><Compass className="w-4 h-4 mr-2" />กลับสู่หน้าหลัก</Link>
        </Button>
      </div>
    </div>
  );
}
