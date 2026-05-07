import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Home, Package, ShoppingBag, Settings, LogOut, ArrowLeft, Menu, X } from "lucide-react";
import Logo from "@/components/Logo";

const links = [
  { path: "/admin", label: "Beranda", icon: Home, exact: true },
  { path: "/admin/products", label: "Kelola Produk", icon: Package },
  { path: "/admin/orders", label: "Pesanan", icon: ShoppingBag },
  { path: "/admin/settings", label: "Pengaturan", icon: Settings },
];

export default function AdminLayout({ children, title }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (link) =>
    link.exact ? location.pathname === link.path : location.pathname.startsWith(link.path);

  const handleLogout = async () => {
    await logout();
    navigate("/admin/login", { replace: true });
  };

  const SidebarContent = () => (
    <>
      <div className="p-5 border-b">
        <Logo />
        <p className="text-[0.6rem] text-muted-foreground mt-1 ml-[3.125rem] tracking-wider uppercase">Admin Panel</p>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {links.map((l) => (
          <Link
            key={l.path}
            to={l.path}
            onClick={() => setMobileOpen(false)}
            data-testid={`admin-nav-${l.label.toLowerCase().replace(/\s+/g, "-")}`}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
              isActive(l)
                ? "bg-primary text-primary-foreground font-medium shadow-sm"
                : "text-foreground/70 hover:bg-muted hover:text-foreground"
            }`}
          >
            <l.icon className="h-4 w-4" /> {l.label}
          </Link>
        ))}
      </nav>
      <div className="p-3 border-t space-y-1">
        <Link
          to="/"
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-foreground/70 hover:bg-muted hover:text-foreground transition-all"
        >
          <ArrowLeft className="h-4 w-4" /> Kembali ke Toko
        </Link>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-destructive/80 hover:bg-destructive/10 hover:text-destructive w-full transition-all"
          data-testid="admin-logout"
        >
          <LogOut className="h-4 w-4" /> Keluar
        </button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-background" data-testid="admin-layout">
      {/* Desktop sidebar */}
      <aside
        className="w-64 border-r bg-card hidden md:flex flex-col sticky top-0 h-screen"
        data-testid="admin-sidebar"
      >
        <SidebarContent />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative w-64 bg-card flex flex-col shadow-xl animate-fade-in">
            <SidebarContent />
          </aside>
        </div>
      )}

      <main className="flex-1 overflow-auto">
        <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              className="md:hidden p-2 rounded-lg hover:bg-muted"
              onClick={() => setMobileOpen(true)}
              data-testid="admin-mobile-menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1
              className="text-2xl font-semibold tracking-tight"
              style={{ fontFamily: "'Cormorant Garamond', serif" }}
            >
              {title}
            </h1>
          </div>
        </header>
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
