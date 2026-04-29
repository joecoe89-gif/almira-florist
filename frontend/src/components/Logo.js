import { Flower2 } from "lucide-react";

export default function Logo({ size = "default", showText = true }) {
  const iconSize = size === "large" ? "w-12 h-12" : size === "small" ? "w-8 h-8" : "w-10 h-10";

  return (
    <div className="flex items-center gap-2.5" data-testid="brand-logo">
      <div className={`relative ${iconSize} rounded-xl bg-primary flex items-center justify-center overflow-hidden`}>
        <Flower2 className="w-[60%] h-[60%] text-primary-foreground opacity-90" strokeWidth={1.5} />
        <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent" />
      </div>
      {showText && (
        <div className="flex items-baseline gap-0.5 leading-none">
          <span className="text-lg font-semibold tracking-tight" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
            BeliBunga
          </span>
          <span className="text-sm font-medium text-primary" style={{ fontFamily: "'Manrope', sans-serif" }}>
            .com
          </span>
        </div>
      )}
    </div>
  );
}
