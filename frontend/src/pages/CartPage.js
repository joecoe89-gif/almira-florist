import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import api, { formatRupiah, getImageUrl } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Minus, Plus, Trash2, ShoppingCart, ArrowLeft, ArrowRight } from "lucide-react";

export default function CartPage() {
  const [cart, setCart] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const { refreshCart } = useAuth();
  const navigate = useNavigate();

  const fetchCart = async () => {
    try { const { data } = await api.get("/cart"); setCart(data); }
    catch { toast.error("Gagal memuat keranjang"); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchCart(); }, []);

  const updateQty = async (productId, variantName, qty) => {
    try { await api.put("/cart/update", { product_id: productId, quantity: qty, variant_name: variantName || null }); await fetchCart(); refreshCart(); }
    catch { toast.error("Gagal memperbarui"); }
  };

  const removeItem = async (productId, variantName) => {
    try {
      const v = variantName ? `?variant=${encodeURIComponent(variantName)}` : "";
      await api.delete(`/cart/remove/${productId}${v}`);
      toast.success("Dihapus dari keranjang");
      await fetchCart();
      refreshCart();
    } catch { toast.error("Gagal menghapus"); }
  };

  if (loading) return <div className="min-h-screen pt-24 flex items-center justify-center"><div className="animate-pulse text-muted-foreground">Memuat...</div></div>;

  return (
    <div className="min-h-screen pt-20 md:pt-24" data-testid="cart-page">
      <div className="px-6 md:px-12 lg:px-24 py-8">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6" data-testid="cart-back-btn">
          <ArrowLeft className="h-4 w-4" /> Kembali belanja
        </button>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-8" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Keranjang Belanja</h1>

        {cart.items.length === 0 ? (
          <div className="text-center py-20 bg-card rounded-2xl border">
            <ShoppingCart className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-lg text-muted-foreground">Keranjang Anda kosong</p>
            <Link to="/catalog"><Button className="rounded-full mt-4" data-testid="empty-cart-shop-btn">Mulai Belanja</Button></Link>
          </div>
        ) : (
          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-4">
              {cart.items.map(item => (
                <div key={`${item.product_id}-${item.variant_name || ""}`} className="flex gap-4 p-4 bg-card rounded-2xl border" data-testid={`cart-item-${item.product_id}`}>
                  <Link to={`/product/${item.product_id}`} className="w-20 h-20 rounded-xl overflow-hidden shrink-0 bg-muted">
                    <img src={getImageUrl(item.image)} alt={item.name} className="w-full h-full object-cover" />
                  </Link>
                  <div className="flex-1 min-w-0">
                    <Link to={`/product/${item.product_id}`}><h3 className="font-semibold text-sm line-clamp-1" style={{ fontFamily: "'Cormorant Garamond', serif" }}>{item.name}</h3></Link>
                    {item.variant_name && (
                      <p className="text-[0.7rem] text-muted-foreground mt-0.5" data-testid={`cart-item-variant-${item.product_id}`}>
                        Variasi: <span className="font-medium text-foreground/80">{item.variant_name}</span>
                      </p>
                    )}
                    <p className="text-sm font-medium text-primary mt-1">{formatRupiah(item.price)}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <Button variant="outline" size="icon" className="h-7 w-7 rounded-full" onClick={() => updateQty(item.product_id, item.variant_name, Math.max(1, item.quantity - 1))} data-testid={`cart-minus-${item.product_id}`}><Minus className="h-3 w-3" /></Button>
                      <span className="text-sm w-6 text-center font-medium">{item.quantity}</span>
                      <Button variant="outline" size="icon" className="h-7 w-7 rounded-full" onClick={() => updateQty(item.product_id, item.variant_name, item.quantity + 1)} data-testid={`cart-plus-${item.product_id}`}><Plus className="h-3 w-3" /></Button>
                    </div>
                  </div>
                  <div className="flex flex-col items-end justify-between">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive rounded-full" onClick={() => removeItem(item.product_id, item.variant_name)} data-testid={`cart-remove-${item.product_id}`}><Trash2 className="h-4 w-4" /></Button>
                    <span className="text-sm font-semibold">{formatRupiah(item.price * item.quantity)}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="lg:col-span-1">
              <div className="bg-card rounded-2xl border p-6 sticky top-24">
                <h3 className="text-lg font-semibold mb-4" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Ringkasan</h3>
                <div className="space-y-2 pb-4 border-b">
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal ({cart.items.length} item)</span><span>{formatRupiah(cart.total)}</span></div>
                  {cart.total_weight > 0 && (
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Total berat</span><span>{cart.total_weight} g</span></div>
                  )}
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Ongkir</span><span className="text-muted-foreground">Hitung di checkout</span></div>
                </div>
                <div className="flex justify-between font-semibold text-lg mt-4 mb-6" data-testid="cart-total">
                  <span>Total</span><span className="text-primary">{formatRupiah(cart.total)}</span>
                </div>
                <Button className="w-full rounded-full py-3 hover:scale-[1.02] transition-transform" onClick={() => navigate("/checkout")} data-testid="checkout-btn">
                  Checkout <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
