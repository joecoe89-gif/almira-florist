import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import api, { formatRupiah, getImageUrl } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Heart, ShoppingCart, Trash2 } from "lucide-react";

export default function WishlistPage() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user, refreshCart } = useAuth();
  const navigate = useNavigate();

  const fetchWishlist = async () => {
    try { const { data } = await api.get("/wishlist"); setProducts(data.products || []); }
    catch {} finally { setLoading(false); }
  };

  useEffect(() => { fetchWishlist(); }, []);

  const handleRemove = async (productId) => {
    try { await api.post(`/wishlist/toggle/${productId}`); toast.success("Dihapus dari wishlist"); fetchWishlist(); }
    catch { toast.error("Gagal menghapus"); }
  };

  const handleAddToCart = async (productId) => {
    try { await api.post("/cart/add", { product_id: productId, quantity: 1 }); toast.success("Ditambahkan ke keranjang"); refreshCart(); }
    catch { toast.error("Gagal menambahkan"); }
  };

  if (loading) return <div className="min-h-screen pt-24 flex items-center justify-center"><div className="animate-pulse text-muted-foreground">Memuat...</div></div>;

  return (
    <div className="min-h-screen pt-20 md:pt-24" data-testid="wishlist-page">
      <div className="px-6 md:px-12 lg:px-24 py-8">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-8" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Wishlist</h1>
        {products.length === 0 ? (
          <div className="text-center py-20 bg-card rounded-2xl border">
            <Heart className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-lg text-muted-foreground">Wishlist Anda kosong</p>
            <Link to="/catalog"><Button className="rounded-full mt-4">Jelajahi Produk</Button></Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6" data-testid="wishlist-grid">
            {products.map(p => (
              <div key={p.id} className="bg-card rounded-2xl border overflow-hidden group" data-testid={`wishlist-item-${p.id}`}>
                <Link to={`/product/${p.id}`} className="block aspect-square overflow-hidden bg-muted">
                  <img src={getImageUrl(p.images?.[0])} alt={p.name} className="w-full h-full object-cover product-image-hover" />
                </Link>
                <div className="p-4">
                  <Link to={`/product/${p.id}`}><h3 className="text-sm font-semibold line-clamp-1" style={{ fontFamily: "'Cormorant Garamond', serif" }}>{p.name}</h3></Link>
                  <p className="text-sm font-medium text-primary mt-1">{formatRupiah(p.price)}</p>
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" className="rounded-full flex-1 text-xs" onClick={() => handleAddToCart(p.id)}>
                      <ShoppingCart className="h-3 w-3 mr-1" /> Keranjang
                    </Button>
                    <Button size="sm" variant="outline" className="rounded-full" onClick={() => handleRemove(p.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
