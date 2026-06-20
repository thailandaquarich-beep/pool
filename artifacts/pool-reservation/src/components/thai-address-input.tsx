import { useState } from "react";
import { searchAddressByDistrict, searchAddressByAmphoe, searchAddressByProvince, searchAddressByZipcode } from "thai-address-database";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type ThaiAddress = { subdistrict: string; district: string; province: string; zipcode: string };

type Result = { district: string; amphoe: string; province: string; zipcode: string | number };

// Thai address autofill (like jquery.Thailand.js): type a subdistrict/district/province/zip
// and pick a suggestion to fill all four fields.
export function ThaiAddressInput({ value, onChange }: { value: ThaiAddress; onChange: (a: ThaiAddress) => void }) {
  const [active, setActive] = useState<string | null>(null);
  const [results, setResults] = useState<Result[]>([]);

  const fields: { key: keyof ThaiAddress; label: string; search: (q: string) => Result[]; numeric?: boolean }[] = [
    { key: "subdistrict", label: "ตำบล/แขวง", search: searchAddressByDistrict as any },
    { key: "district", label: "อำเภอ/เขต", search: searchAddressByAmphoe as any },
    { key: "province", label: "จังหวัด", search: searchAddressByProvince as any },
    { key: "zipcode", label: "รหัสไปรษณีย์", search: searchAddressByZipcode as any, numeric: true },
  ];

  const onType = (f: (typeof fields)[number], q: string) => {
    onChange({ ...value, [f.key]: q });
    if (q.trim().length >= 2) {
      try { setResults((f.search(q) || []).slice(0, 8)); setActive(String(f.key)); }
      catch { setResults([]); }
    } else { setResults([]); setActive(null); }
  };

  const pick = (r: Result) => {
    onChange({ subdistrict: r.district, district: r.amphoe, province: r.province, zipcode: String(r.zipcode) });
    setResults([]); setActive(null);
  };

  return (
    <div className="grid grid-cols-2 gap-3">
      {fields.map((f) => (
        <div key={String(f.key)} className="space-y-1.5 relative">
          <Label className="text-xs">{f.label}</Label>
          <Input
            value={value[f.key]}
            onChange={(e) => onType(f, e.target.value)}
            onBlur={() => setTimeout(() => setActive(null), 150)}
            inputMode={f.numeric ? "numeric" : "text"}
            autoComplete="off"
            placeholder={f.label}
          />
          {active === String(f.key) && results.length > 0 && (
            <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-52 overflow-y-auto">
              {results.map((r, i) => (
                <button
                  key={i}
                  type="button"
                  onMouseDown={() => pick(r)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-accent border-b border-border last:border-0"
                >
                  {r.district} » {r.amphoe} » {r.province} » {r.zipcode}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
