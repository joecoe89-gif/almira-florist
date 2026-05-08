import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api, { formatRupiah, getImageUrl } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import LocationSearch from "@/components/LocationSearch";
import { toast } from "sonner";
import { CreditCard, Building2, Truck, Loader2 } from "lucide-react";

export default function CheckoutPage() {
  const [cart, setCart] = useState({ items: [], total: 0, total_weight: 0 });
  const [form, setForm] = useState({
    shipping_name: "", shipping_phone: "", shipping_address: "", shipping_email: "",
    payment_method: "transfer", notes: "",
  });
  const [destination, setDestination] = useState(null);
  const [origin, setOrigin] = useState({ origin_id: null, origin_label: "" });
  const [services, setServices] = useState([]);
  const [selectedService, setSelectedService] = useState(null);
  const [calcLoading, setCalcLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { user, refreshCart } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/cart").then(r => {
      if (!r.data.items?.length) { navigate("/cart"); return; }
      setCart(r.data);
    }).catch(() => navigate("/cart"));
    api.get("/shipping/origin").then(r => setOrigin(r.data || {})).catch(() => {});
    if (user) setForm(f => ({ ...f, shipping_name: user.name || "", shipping_phone: user.phone || "", shipping_email: user.email || "" }));
  }, [navigate, user]);

  const totalWeight = Math.max(1000, cart.total_weight || 1000); // minimum 1kg fallback for couriers
  const shippingCost = selectedService?.cost || 0;
  const grandTotal = (cart.total || 0) + shippingCost;

  const calculateShipping = async () => {
    if (!origin?.origin_id) {
      toast.error("Lokasi asal toko belum diatur. Hubungi admin.");
      return;
    }
    if (!destination?.id) {
      toast.error("Pilih lokasi tujuan terlebih dahulu");
      return;
    }
    setCalcLoading(true);
    setServices([]);
    setSelectedService(null);
    try {
      const { data } = await api.post("/shipping/cost", {
        origin: origin.origin_id,
        destination: destination.id,
        weight: totalWeight,
        courier: "jne:tiki:pos:sicepat:jnt",
        price: "lowest",
      });
      const list = data.services || [];
      setServices(list);
      if (list.length > 0) setSelectedService(list[0]);
      else toast.info("Tidak ada layanan tersedia untuk rute ini");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal menghitung ongkir");
    } finally {
      setCalcLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.shipping_name || !form.shipping_phone || !form.shipping_address) { toast.error("Lengkapi semua data pengiriman"); return; }
    if (!user && !form.shipping_email) { toast.error("Email wajib diisi untuk guest checkout"); return; }
    if (!destination?.id) { toast.error("Pilih lokasi tujuan"); return; }
    if (!selectedService) { toast.error("Pilih layanan pengiriman"); return; }
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        shipping_destination_id: destination.id,
        shipping_destination_label: destination.label,
        shipping_courier: selectedService.courier,
        shipping_service: selectedService.service,
        shipping_etd: selectedService.etd,
        shipping_cost: selectedService.cost,
      };
      const { data } = await api.post("/orders", payload);
      toast.success("Pesanan berhasil dibuat!");
      refreshCart();
      navigate(`/orders/${data.id}`);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Gagal membuat pesanan");
    } finally { setSubmitting(false); }
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
                  {!user && (
                    <div><Label>Email</Label><Input type="email" value={form.shipping_email} onChange={e => update("shipping_email", e.target.value)} required className="mt-1" placeholder="Untuk konfirmasi pesanan" data-testid="checkout-email" /></div>
                  )}
                  <div><Label>Alamat Lengkap</Label><Textarea value={form.shipping_address} onChange={e => update("shipping_address", e.target.value)} required rows={3} className="mt-1" data-testid="checkout-address" placeholder="Jalan, RT/RW, nomor rumah, patokan..." /></div>
                  <div><Label>Catatan (opsional)</Label><Textarea value={form.notes} onChange={e => update("notes", e.target.value)} rows={2} className="mt-1" data-testid="checkout-notes" placeholder="Pesan tambahan untuk penjual..." /></div>
                </CardContent>
              </Card>

              {/* Shipping Cost */}
              <Card className="rounded-2xl" data-testid="shipping-cost-card">
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-center gap-2">
                    <Truck className="h-5 w-5 text-primary" />
                    <h3 className="text-lg font-semibold" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Pengiriman & Ongkir</h3>
                  </div>
                  {origin?.origin_label && (
                    <p className="text-xs text-muted-foreground">
                      Asal: <span className="text-foreground/80 font-medium">{origin.origin_label}</span>
                    </p>
                  )}
                  <div>
                    <Label className="mb-1 block">Tujuan (kecamatan/kelurahan)</Label>
                    <LocationSearch
                      value={destination}
                      onChange={(v) => { setDestination(v); setServices([]); setSelectedService(null); }}
                      placeholder="Cari kecamatan tujuan..."
                      testId="destination-search"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={calculateShipping}
                      disabled={!destination || calcLoading || !origin?.origin_id}
                      className="rounded-full"
                      data-testid="calc-shipping-btn"
                    >
                      {calcLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Menghitung...</> : "Hitung Ongkir"}
                    </Button>
                    <span className="text-xs text-muted-foreground">Berat: {totalWeight} g</span>
                  </div>
                  {!origin?.origin_id && (
                    <p className="text-xs text-amber-600">Admin belum mengatur lokasi asal toko di Pengaturan.</p>
                  )}

                  {services.length > 0 && (
                    <div className="space-y-2 pt-2" data-testid="shipping-services">
                      {services.map((s, idx) => {
                        const active = selectedService === s;
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setSelectedService(s)}
                            data-testid={`shipping-option-${idx}`}
                            className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all ${
                              active ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                            }`}
                          >
                            <div className="flex justify-between items-start gap-3">
                              <div>
                                <p className="text-sm font-semibold">{s.courier} — {s.service}</p>
                                <p className="text-xs text-muted-foreground">{s.description || "—"} • Estimasi {s.etd || "-"}</p>
                              </div>
                              <span className="text-sm font-semibold text-primary">{formatRupiah(s.cost)}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
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
                      <div key={`${item.product_id}-${item.variant_name || ""}`} className="flex gap-3" data-testid={`checkout-item-${item.product_id}`}>
                        <div className="w-12 h-12 rounded-lg overflow-hidden bg-muted shrink-0">
                          <img src={getImageUrl(item.image)} alt={item.name} className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium line-clamp-1">{item.name}</p>
                          {item.variant_name && (
                            <p className="text-[0.65rem] text-muted-foreground">Variasi: {item.variant_name}</p>
                          )}
                          <p className="text-xs text-muted-foreground">{item.quantity}x {formatRupiah(item.price)}</p>
                        </div>
                        <span className="text-sm font-medium">{formatRupiah(item.price * item.quantity)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="border-t pt-4 space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatRupiah(cart.total)}</span></div>
                    <div className="flex justify-between" data-testid="checkout-shipping-cost">
                      <span className="text-muted-foreground">Ongkir{selectedService ? ` (${selectedService.courier} ${selectedService.service})` : ""}</span>
                      <span>{selectedService ? formatRupiah(shippingCost) : "—"}</span>
                    </div>
                  </div>
                  <div className="border-t pt-4 mt-4 flex justify-between text-lg font-semibold" data-testid="checkout-total">
                    <span>Total</span><span className="text-primary">{formatRupiah(grandTotal)}</span>
                  </div>
                  <Button type="submit" className="w-full rounded-full py-3 mt-6 hover:scale-[1.02] transition-transform" disabled={submitting || !selectedService} data-testid="place-order-btn">
                    {submitting ? "Memproses..." : "Buat Pesanan"}
                  </Button>
                  {!selectedService && (
                    <p className="text-xs text-muted-foreground text-center mt-2">Hitung ongkir dulu untuk melanjutkan</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
