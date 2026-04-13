import { Link } from "react-router-dom";
import { Phone, MapPin, Mail, Leaf } from "lucide-react";
import Logo from "@/components/Logo";

export default function Footer() {
  return (
    <footer data-testid="main-footer" className="bg-primary text-primary-foreground">
      <div className="px-6 md:px-12 lg:px-24 py-12 md:py-16">
        <div className="grid md:grid-cols-3 gap-12">
          <div>
            <div className="mb-4 [&_*]:text-primary-foreground [&_span]:!text-primary-foreground/70">
              <Logo size="large" />
            </div>
            <p className="text-sm opacity-80 leading-relaxed">
              Menyediakan tanaman hias berkualitas untuk mempercantik ruangan dan taman Anda. Setiap tanaman dipilih dengan penuh kasih sayang.
            </p>
          </div>

          <div>
            <h4 className="text-lg font-semibold mb-4" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Navigasi</h4>
            <nav className="flex flex-col gap-2">
              <Link to="/" className="text-sm opacity-80 hover:opacity-100 transition-opacity">Beranda</Link>
              <Link to="/catalog" className="text-sm opacity-80 hover:opacity-100 transition-opacity">Katalog</Link>
              <Link to="/catalog/cat-indoor" className="text-sm opacity-80 hover:opacity-100 transition-opacity">Tanaman Indoor</Link>
              <Link to="/catalog/cat-bunga" className="text-sm opacity-80 hover:opacity-100 transition-opacity">Bunga</Link>
            </nav>
          </div>

          <div>
            <h4 className="text-lg font-semibold mb-4" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Hubungi Kami</h4>
            <div className="flex flex-col gap-3">
              <a href="https://wa.me/6287784841084" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm opacity-80 hover:opacity-100 transition-opacity">
                <Phone className="h-4 w-4" /> 087784841084
              </a>
              <span className="flex items-center gap-2 text-sm opacity-80"><Mail className="h-4 w-4" /> info@almiraflorist.com</span>
              <span className="flex items-center gap-2 text-sm opacity-80"><MapPin className="h-4 w-4" /> Indonesia</span>
            </div>
          </div>
        </div>

        <div className="border-t border-primary-foreground/20 mt-12 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-xs opacity-60 flex items-center gap-1">
            <Leaf className="h-3 w-3" /> 2026 Almira Florist. All rights reserved.
          </p>
          <p className="text-xs opacity-60">Tanaman dengan kasih sayang</p>
        </div>
      </div>
    </footer>
  );
}
