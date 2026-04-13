import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ShoppingCart, Heart, User, Menu, X, LogOut, Package, LayoutDashboard, Search } from "lucide-react";

const LOGO_URL = "https://customer-assets.emergentagent.com/job_almira-florist/artifacts/ev5r3lqi_WhatsApp%20Image%202026-04-13%20at%2018.43.01.jpeg";

export default function Navbar() {
  const { user, logout, cartCount } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/catalog?search=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery("");
      setSearchOpen(false);
    }
  };

  return (
    <header data-testid="main-navbar" className="fixed top-0 w-full z-50 glass-nav bg-background/80 border-b border-border/50">
      <div className="px-6 md:px-12 lg:px-24 flex items-center justify-between h-16 md:h-20">
        <Link to="/" className="flex items-center gap-3" data-testid="nav-logo">
          <img src={LOGO_URL} alt="Almira Florist" className="h-10 md:h-12 w-auto rounded-lg" />
          <span className="text-lg md:text-xl font-semibold tracking-tight" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
            Almira Florist
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          <Link to="/" className="text-sm font-medium text-foreground/80 hover:text-foreground transition-colors" data-testid="nav-home">Beranda</Link>
          <Link to="/catalog" className="text-sm font-medium text-foreground/80 hover:text-foreground transition-colors" data-testid="nav-catalog">Katalog</Link>
        </nav>

        <div className="flex items-center gap-2">
          {searchOpen ? (
            <form onSubmit={handleSearch} className="flex items-center gap-2">
              <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Cari tanaman..." autoFocus
                className="h-9 w-40 md:w-56 rounded-full border bg-muted/50 px-4 text-sm focus:outline-none focus:ring-1 focus:ring-primary" data-testid="search-input" />
              <Button type="button" variant="ghost" size="icon" onClick={() => setSearchOpen(false)} className="rounded-full"><X className="h-4 w-4" /></Button>
            </form>
          ) : (
            <Button variant="ghost" size="icon" onClick={() => setSearchOpen(true)} className="rounded-full" data-testid="search-toggle"><Search className="h-4 w-4" /></Button>
          )}

          {user && (
            <>
              <Link to="/wishlist" data-testid="nav-wishlist">
                <Button variant="ghost" size="icon" className="rounded-full"><Heart className="h-4 w-4" /></Button>
              </Link>
              <Link to="/cart" className="relative" data-testid="nav-cart">
                <Button variant="ghost" size="icon" className="rounded-full"><ShoppingCart className="h-4 w-4" /></Button>
                {cartCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-semibold" data-testid="cart-badge">{cartCount}</span>
                )}
              </Link>
            </>
          )}

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full" data-testid="user-menu-trigger"><User className="h-4 w-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <div className="px-3 py-2 border-b"><p className="text-sm font-medium">{user.name}</p><p className="text-xs text-muted-foreground">{user.email}</p></div>
                {user.role === "admin" && <DropdownMenuItem onClick={() => navigate("/admin")} data-testid="nav-admin"><LayoutDashboard className="h-4 w-4 mr-2" />Admin Panel</DropdownMenuItem>}
                <DropdownMenuItem onClick={() => navigate("/orders")} data-testid="nav-orders"><Package className="h-4 w-4 mr-2" />Pesanan Saya</DropdownMenuItem>
                <DropdownMenuItem onClick={() => { logout(); navigate("/"); }} data-testid="nav-logout"><LogOut className="h-4 w-4 mr-2" />Keluar</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Link to="/login"><Button className="rounded-full px-6 text-sm hover:scale-105 transition-transform" data-testid="nav-login-btn">Masuk</Button></Link>
          )}

          <Button variant="ghost" size="icon" className="md:hidden rounded-full" onClick={() => setMobileOpen(!mobileOpen)} data-testid="mobile-menu-toggle">
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t bg-background/95 glass-nav animate-fade-in">
          <nav className="flex flex-col p-4 gap-3">
            <Link to="/" onClick={() => setMobileOpen(false)} className="text-sm font-medium py-2">Beranda</Link>
            <Link to="/catalog" onClick={() => setMobileOpen(false)} className="text-sm font-medium py-2">Katalog</Link>
            {user && <Link to="/orders" onClick={() => setMobileOpen(false)} className="text-sm font-medium py-2">Pesanan Saya</Link>}
          </nav>
        </div>
      )}
    </header>
  );
}
