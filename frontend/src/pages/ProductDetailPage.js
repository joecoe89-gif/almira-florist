import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import api, { formatRupiah, getImageUrl } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ShoppingCart, Heart, Minus, Plus, ArrowLeft, Truck, ShieldCheck, Package } from "lucide-react";

export default function ProductDetailPage() {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [inWishlist, setInWishlist] = useState(false);
  const [loading, setLoading] = useState(true);
  const { user, refreshCart } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    api.get(`/products/${id}`)
      .then(r => {
        setProduct(r.data);
        const variants = Array.isArray(r.data.variants) ? r.data.variants : [];
        if (variants.length > 0) setSelectedVariant(variants[0]);
        else setSelectedVariant(null);
      })
      .catch(() => navigate("/catalog"))
      .finally(() => setLoading(false));
    api.get(`/wishlist/check/${id}`).then(r => setInWishlist(r.data.in_wishlist)).catch(() => {});
  }, [id, navigate]);

  const variants = useMemo(() => (Array.isArray(product?.variants) ? product.variants : []), [product]);
  const hasVariants = variants.length > 0;
  const currentPrice = hasVariants ? (selectedVariant?.price ?? product?.price ?? 0) : (product?.price ?? 0);
  const totalUnitWeight = (product?.weight || 0) + (product?.packaging_weight || 0);

  const handleAddToCart = async () => {
    if (hasVariants && !selectedVariant) {
      toast.error("Pilih variasi terlebih dahulu");
      return;
    }
    try {
      await api.post("/cart/add", {
        product_id: id,
        quantity,
        variant_name: hasVariants ? selectedVariant?.name : null,
      });
      toast.success("Ditambahkan ke keranjang");
      refreshCart();
    } catch {
      toast.error("Gagal menambahkan");
    }
  };

  const handleToggleWishlist = async () => {
    if (!user) { toast.info("Login untuk menambahkan ke wishlist"); navigate("/login"); return; }
    try {
      const r = await api.post(`/wishlist/toggle/${id}`);
      setInWishlist(r.data.in_wishlist);
      toast.success(r.data.in_wishlist ? "Ditambahkan ke wishlist" : "Dihapus dari wishlist");
    } catch { toast.error("Gagal"); }
  };

  if (loading) return <div className="min-h-screen pt-24 flex items-center justify-center"><div className="animate-pulse text-muted-foreground">Memuat...</div></div>;
  if (!product) return null;

  const image = product.images?.[0] || "";

  return (
    <div className="min-h-screen pt-20 md:pt-24" data-testid="product-detail-page">
      <div className="px-6 md:px-12 lg:px-24 py-8">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors" data-testid="back-btn">
          <ArrowLeft className="h-4 w-4" /> Kembali
        </button>
        <div className="grid md:grid-cols-2 gap-8 lg:gap-16">
          <div className="rounded-2xl overflow-hidden bg-muted aspect-square">
            <img src={getImageUrl(image)} alt={product.name} className="w-full h-full object-cover" data-testid="product-image" />
          </div>
          <div className="flex flex-col justify-center">
            {product.category_name && (
              <Link to={`/catalog/${product.category_id}`}>
                <Badge variant="secondary" className="mb-3 rounded-full w-fit" data-testid="product-category-badge">{product.category_name}</Badge>
              </Link>
            )}
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight" style={{ fontFamily: "'Cormorant Garamond', serif" }} data-testid="product-detail-name">{product.name}</h1>
            <p className="text-2xl font-semibold text-primary mt-4" data-testid="product-detail-price">
              {hasVariants && !selectedVariant ? `Mulai ${formatRupiah(product.price)}` : formatRupiah(currentPrice)}
            </p>
            <p className="text-muted-foreground mt-4 leading-relaxed" data-testid="product-detail-desc">{product.description}</p>

            {hasVariants && (
              <div className="mt-6" data-testid="product-variant-section">
                <p className="text-sm font-medium mb-2">
                  Variasi: <span className="text-muted-foreground font-normal">{selectedVariant?.name || "Pilih variasi"}</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {variants.map((v, idx) => {
                    const active = selectedVariant?.name === v.name;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setSelectedVariant(v)}
                        data-testid={`variant-option-${idx}`}
                        className={`px-4 py-2 rounded-full border-2 text-sm transition-all ${
                          active
                            ? "border-primary bg-primary/10 text-primary font-medium"
                            : "border-border hover:border-primary/40"
                        }`}
                      >
                        <span>{v.name}</span>
                        <span className="ml-2 text-xs opacity-70">{formatRupiah(v.price)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 mt-6">
              <span className={`text-sm font-medium ${product.stock > 0 ? "text-green-600" : "text-destructive"}`} data-testid="product-stock">
                {product.stock > 0 ? `Stok: ${product.stock}` : "Habis"}
              </span>
              {totalUnitWeight > 0 && (
                <span className="text-xs text-muted-foreground ml-3 flex items-center gap-1" data-testid="product-weight-info">
                  <Package className="h-3.5 w-3.5" /> {totalUnitWeight} g/unit
                </span>
              )}
            </div>

            <div className="flex items-center gap-4 mt-8">
              <div className="flex items-center gap-2 border rounded-full px-2">
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => setQuantity(Math.max(1, quantity - 1))} data-testid="qty-minus"><Minus className="h-4 w-4" /></Button>
                <span className="w-8 text-center text-sm font-medium" data-testid="qty-value">{quantity}</span>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => setQuantity(Math.min(product.stock, quantity + 1))} data-testid="qty-plus"><Plus className="h-4 w-4" /></Button>
              </div>
              <Button className="rounded-full px-8 py-3 flex-1 hover:scale-[1.02] transition-transform" onClick={handleAddToCart} disabled={product.stock <= 0 || (hasVariants && !selectedVariant)} data-testid="add-to-cart-btn">
                <ShoppingCart className="h-4 w-4 mr-2" /> Tambah ke Keranjang
              </Button>
              <Button variant="outline" size="icon" className={`rounded-full h-12 w-12 ${inWishlist ? "text-red-500 border-red-200" : ""}`} onClick={handleToggleWishlist} data-testid="wishlist-toggle-btn">
                <Heart className={`h-5 w-5 ${inWishlist ? "fill-current" : ""}`} />
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-10 border-t pt-8">
              <div className="flex items-start gap-3"><Truck className="h-5 w-5 text-muted-foreground mt-0.5" /><div><p className="text-sm font-medium">Pengiriman Aman</p><p className="text-xs text-muted-foreground">Dikemas dengan hati-hati</p></div></div>
              <div className="flex items-start gap-3"><ShieldCheck className="h-5 w-5 text-muted-foreground mt-0.5" /><div><p className="text-sm font-medium">Garansi Kualitas</p><p className="text-xs text-muted-foreground">Tanaman segar terjamin</p></div></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
