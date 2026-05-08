import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Search, MapPin, Loader2, X } from "lucide-react";

/**
 * Searchable Indonesian destination picker (province/city/district/subdistrict).
 * Calls GET /api/shipping/destination?search=...
 *
 * Props:
 *   value: { id, label } | null
 *   onChange(value)
 *   placeholder, testId, disabled
 */
export default function LocationSearch({ value, onChange, placeholder = "Cari kecamatan / kota / kelurahan...", testId = "location-search", disabled = false }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    const onClick = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Debounced search
  useEffect(() => {
    if (!query || query.trim().length < 3) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await api.get(`/shipping/destination?search=${encodeURIComponent(query.trim())}&limit=15`);
        setResults(data.data || []);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  const handlePick = (row) => {
    onChange({ id: row.id, label: row.label, raw: row });
    setQuery("");
    setResults([]);
    setOpen(false);
  };

  const handleClear = () => {
    onChange(null);
    setQuery("");
    setResults([]);
  };

  return (
    <div className="relative" ref={wrapperRef} data-testid={testId}>
      {value?.id ? (
        <div className="flex items-center gap-2 rounded-xl border bg-muted/40 px-3 py-2.5" data-testid={`${testId}-selected`}>
          <MapPin className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm flex-1 truncate">{value.label}</span>
          <button type="button" onClick={handleClear} disabled={disabled} className="text-muted-foreground hover:text-destructive" data-testid={`${testId}-clear`}>
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => results.length > 0 && setOpen(true)}
            placeholder={placeholder}
            className="pl-9"
            disabled={disabled}
            data-testid={`${testId}-input`}
          />
          {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
      )}

      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-background rounded-xl border shadow-lg max-h-72 overflow-y-auto" data-testid={`${testId}-results`}>
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => handlePick(r)}
              className="w-full text-left px-3 py-2.5 hover:bg-muted/60 border-b last:border-b-0 transition-colors"
              data-testid={`${testId}-option-${r.id}`}
            >
              <p className="text-sm font-medium truncate">{r.subdistrict_name || r.district_name}</p>
              <p className="text-xs text-muted-foreground truncate">{r.label}</p>
            </button>
          ))}
        </div>
      )}

      {open && !loading && query.trim().length >= 3 && results.length === 0 && (
        <div className="absolute z-50 mt-1 w-full bg-background rounded-xl border shadow-lg p-3 text-sm text-muted-foreground" data-testid={`${testId}-empty`}>
          Tidak ada hasil
        </div>
      )}
      {query.trim().length > 0 && query.trim().length < 3 && (
        <p className="text-xs text-muted-foreground mt-1">Ketik minimal 3 huruf...</p>
      )}
    </div>
  );
}
