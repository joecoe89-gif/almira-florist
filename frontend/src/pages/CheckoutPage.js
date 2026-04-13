import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api, { formatRupiah, getImageUrl } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { CreditCard, Building2 } from "lucide-react";

export default function CheckoutPage() {
  const [cart, setCart] = useState({ items: [], total: 0 });
  const [form, setForm] = useState({ shipping_name: "", shipping_phone: "", shipping_address: "", payment_method: "transfer", notes: "" });
  const [loading, setLoading] = useState(false);
  const { user, refreshCart } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/cart").then(r => {
      if (!r.data.items?.length) { navigate("/cart"); return; }
      setCart(r.data);
    }).catch(() => navigate("/cart"));
    if (user) setForm(f => ({ ...f, shipping_name: user.name || "", shipping_phone: user.phone || "" }));
  }, [navigate, user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.shipping_name || !form.shipping_phone || !form.shipping_address) { toast.error("Lengkapi semua data pengiriman"); return; }
    setLoading(true);
    try {
      const { data } = await api.post("/orders", form);
      toast.success("Pesanan berhasil dibuat!");
      refreshCart();
      navigate(`/orders/${data.id}`);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Gagal membuat pesanan");
    } finally { setLoading(false); }
  };

  const update = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  return (
    <div className="min-h-screen pt-20 md:pt-24" data-testid="checkout-page">
      <div className="px-6 md:px-12 lg:px-24 py-8">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-8" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Checkout</h1>
        <form onSubmit={handleSubmit}>
          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              {/* Shipping */}
              <Card className="rounded-2xl">
                <CardContent className="p-6 space-y-4">
                  <h3 className="text-lg font-semibold" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Data Pengiriman</h3>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div><Label>Nama Penerima</Label><Input value={form.shipping_name} onChange={e => update("shipping_name", e.target.value)} required className="mt-1" data-testid="checkout-name" /></div>
                    <div><Label>No. Telepon</Label><Input value={form.shipping_phone} onChange={e => update("shipping_phone", e.target.value)} required className="mt-1" data-testid="checkout-phone" /></div>
                  </div>
                  <div><Label>Alamat Lengkap</Label><Textarea value={form.shipping_address} onChange={e => update("shipping_address", e.target.value)} required rows={3} className="mt-1" data-testid="checkout-address" /></div>
                  <div><Label>Catatan (opsional)</Label><Textarea value={form.notes} onChange={e => update("notes", e.target.value)} rows={2} className="mt-1" data-testid="checkout-notes" placeholder="Pesan tambahan untuk penjual..." /></div>
                </CardContent>
              </Card>

              {/* Payment */}
              <Card className="rounded-2xl">
                <CardContent className="p-6 space-y-4">
                  <h3 className="text-lg font-semibold" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Metode Pembayaran</h3>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <button type="button" onClick={() => update("payment_method", "transfer")} data-testid="payment-transfer"
                      className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${form.payment_method === "transfer" ? "border-primary bg-accent" : "border-border hover:border-primary/50"}`}>
                      <Building2 className="h-5 w-5" /><div className="text-left"><p className="text-sm font-medium">Transfer Bank</p><p className="text-xs text-muted-foreground">BCA, BNI, Mandiri, dll</p></div>
                    </button>
                    <button type="button" onClick={() => update("payment_method", "qris")} data-testid="payment-qris"
                      className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${form.payment_method === "qris" ? "border-primary bg-accent" : "border-border hover:border-primary/50"}`}>
                      <CreditCard className="h-5 w-5" /><div className="text-left"><p className="text-sm font-medium">QRIS</p><p className="text-xs text-muted-foreground">Scan & bayar</p></div>
                    </button>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Summary */}
            <div>
              <Card className="rounded-2xl sticky top-24">
                <CardContent className="p-6">
                  <h3 className="text-lg font-semibold mb-4" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Ringkasan Pesanan</h3>
                  <div className="space-y-3 mb-4">
                    {cart.items.map(item => (
                      <div key={item.product_id} className="flex gap-3" data-testid={`checkout-item-${item.product_id}`}>
                        <div className="w-12 h-12 rounded-lg overflow-hidden bg-muted shrink-0">
                          <img src={getImageUrl(item.image)} alt={item.name} className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium line-clamp-1">{item.name}</p>
                          <p className="text-xs text-muted-foreground">{item.quantity}x {formatRupiah(item.price)}</p>
                        </div>
                        <span className="text-sm font-medium">{formatRupiah(item.price * item.quantity)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="border-t pt-4 mt-4 flex justify-between text-lg font-semibold" data-testid="checkout-total">
                    <span>Total</span><span className="text-primary">{formatRupiah(cart.total)}</span>
                  </div>
                  <Button type="submit" className="w-full rounded-full py-3 mt-6 hover:scale-[1.02] transition-transform" disabled={loading} data-testid="place-order-btn">
                    {loading ? "Memproses..." : "Buat Pesanan"}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
