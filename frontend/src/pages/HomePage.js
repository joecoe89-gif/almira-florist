import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import ProductCard from "@/components/ProductCard";
import api, { formatRupiah } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { ArrowRight, Leaf, Truck, ShieldCheck } from "lucide-react";

const HERO_BG = "https://static.prod-images.emergentagent.com/jobs/85cf351f-9636-499b-b53f-2ffe911a1148/images/aa1d442173cb1e39ec77cccd5ed8b31e986562a88320f9942c8c73ba4e789e41.png";

export default function HomePage() {
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const { user, refreshCart } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/categories").then(r => setCategories(r.data)).catch(() => {});
    api.get("/products?limit=8").then(r => setProducts(r.data.products || [])).catch(() => {});
  }, []);

  const handleAddToCart = async (productId) => {
    if (!user) { toast.info("Silakan masuk terlebih dahulu"); navigate("/login"); return; }
    try {
      await api.post("/cart/add", { product_id: productId, quantity: 1 });
      toast.success("Ditambahkan ke keranjang");
      refreshCart();
    } catch (e) { toast.error("Gagal menambahkan ke keranjang"); }
  };

  return (
    <div data-testid="home-page">
      {/* Hero */}
      <section className="hero-section" data-testid="hero-section">
        <img src={HERO_BG} alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="hero-content px-6 md:px-12 lg:px-24 w-full">
          <div className="max-w-xl pt-20">
            <p className="text-sm uppercase tracking-[0.3em] text-white/70 mb-4 animate-fade-up" style={{ fontFamily: "'Manrope', sans-serif" }}>
              Tanaman Hias Pilihan
            </p>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight tracking-tight animate-fade-up" style={{ animationDelay: "0.1s", fontFamily: "'Cormorant Garamond', serif" }}>
              Hijau yang Membawa Ketenangan
            </h1>
            <p className="text-base text-white/80 mt-6 leading-relaxed animate-fade-up" style={{ animationDelay: "0.2s" }}>
              Temukan koleksi tanaman hias terbaik untuk mempercantik ruangan dan taman Anda bersama Almira Florist.
            </p>
            <div className="flex gap-4 mt-8 animate-fade-up" style={{ animationDelay: "0.3s" }}>
              <Link to="/catalog">
                <Button className="rounded-full px-8 py-3 text-sm hover:scale-105 transition-transform" data-testid="hero-shop-btn">
                  Belanja Sekarang <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="px-6 md:px-12 lg:px-24 py-16 md:py-24" data-testid="categories-section">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Kategori Pilihan</h2>
          <p className="text-muted-foreground mt-2 text-sm md:text-base">Jelajahi koleksi kami berdasarkan kategori</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 md:gap-6">
          {categories.map((cat, i) => (
            <Link key={cat.id} to={`/catalog/${cat.id}`} data-testid={`category-card-${cat.id}`}
              className="group relative rounded-2xl overflow-hidden aspect-[4/5] animate-fade-up" style={{ animationDelay: `${i * 0.1}s` }}>
              <img src={cat.image_url} alt={cat.name} className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-4">
                <h3 className="text-white font-semibold text-base md:text-lg" style={{ fontFamily: "'Cormorant Garamond', serif" }}>{cat.name}</h3>
                <p className="text-white/70 text-xs mt-1">{cat.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Featured Products */}
      <section className="px-6 md:px-12 lg:px-24 py-16 bg-muted/30" data-testid="featured-products">
        <div className="flex items-end justify-between mb-10">
          <div>
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Produk Unggulan</h2>
            <p className="text-muted-foreground mt-2 text-sm md:text-base">Tanaman pilihan terbaik untuk Anda</p>
          </div>
          <Link to="/catalog">
            <Button variant="outline" className="rounded-full hidden md:flex hover:scale-105 transition-transform" data-testid="view-all-btn">
              Lihat Semua <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
          {products.map(p => <ProductCard key={p.id} product={p} onAddToCart={handleAddToCart} />)}
        </div>
        <div className="mt-8 text-center md:hidden">
          <Link to="/catalog"><Button variant="outline" className="rounded-full" data-testid="view-all-mobile-btn">Lihat Semua Produk</Button></Link>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 md:px-12 lg:px-24 py-16 md:py-24" data-testid="features-section">
        <div className="grid md:grid-cols-3 gap-8 md:gap-12">
          {[
            { icon: Leaf, title: "Kualitas Terjamin", desc: "Setiap tanaman dipilih langsung oleh ahli kami untuk memastikan kesegaran dan keindahan." },
            { icon: Truck, title: "Pengiriman Aman", desc: "Dikemas dengan hati-hati agar tanaman sampai di tangan Anda dalam kondisi prima." },
            { icon: ShieldCheck, title: "Pembayaran Mudah", desc: "Transfer bank atau QRIS, proses cepat dan aman untuk kenyamanan Anda." },
          ].map((f, i) => (
            <div key={i} className="text-center p-8 rounded-2xl bg-card border hover:shadow-md transition-shadow" style={{ animationDelay: `${i * 0.1}s` }}>
              <div className="w-12 h-12 rounded-full bg-accent flex items-center justify-center mx-auto mb-4">
                <f.icon className="h-6 w-6 text-accent-foreground" />
              </div>
              <h3 className="text-xl font-semibold" style={{ fontFamily: "'Cormorant Garamond', serif" }}>{f.title}</h3>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
