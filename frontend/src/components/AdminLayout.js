import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { LayoutDashboard, Package, ShoppingBag, Tags, Settings, LogOut, ArrowLeft, Leaf } from "lucide-react";

const LOGO_URL = "https://customer-assets.emergentagent.com/job_almira-florist/artifacts/ev5r3lqi_WhatsApp%20Image%202026-04-13%20at%2018.43.01.jpeg";

const links = [
  { path: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { path: "/admin/products", label: "Produk", icon: Package },
  { path: "/admin/orders", label: "Pesanan", icon: ShoppingBag },
  { path: "/admin/categories", label: "Kategori", icon: Tags },
  { path: "/admin/settings", label: "Pengaturan", icon: Settings },
];

export default function AdminLayout({ children, title }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();

  return (
    <div className="flex min-h-screen bg-background" data-testid="admin-layout">
      <aside className="w-64 border-r bg-card hidden md:flex flex-col" data-testid="admin-sidebar">
        <div className="p-5 border-b">
          <div className="flex items-center gap-3">
            <img src={LOGO_URL} alt="Almira Florist" className="h-10 w-auto rounded-lg" />
            <div>
              <p className="font-semibold text-sm" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Almira Florist</p>
              <p className="text-xs text-muted-foreground">Admin Panel</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {links.map(l => (
            <Link key={l.path} to={l.path} data-testid={`admin-nav-${l.label.toLowerCase()}`}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${location.pathname === l.path ? "bg-primary text-primary-foreground font-medium" : "text-foreground/70 hover:bg-muted hover:text-foreground"}`}>
              <l.icon className="h-4 w-4" /> {l.label}
            </Link>
          ))}
        </nav>
        <div className="p-3 border-t space-y-1">
          <Link to="/" className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-foreground/70 hover:bg-muted hover:text-foreground transition-all">
            <ArrowLeft className="h-4 w-4" /> Kembali ke Toko
          </Link>
          <button onClick={() => { logout(); navigate("/"); }} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-destructive/70 hover:bg-destructive/10 hover:text-destructive w-full transition-all" data-testid="admin-logout">
            <LogOut className="h-4 w-4" /> Keluar
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b px-6 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight" style={{ fontFamily: "'Cormorant Garamond', serif" }}>{title}</h1>
          <div className="flex items-center gap-2 md:hidden">
            {links.map(l => (
              <Link key={l.path} to={l.path} className={`p-2 rounded-lg ${location.pathname === l.path ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
                <l.icon className="h-4 w-4" />
              </Link>
            ))}
          </div>
        </header>
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
