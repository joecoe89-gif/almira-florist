import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api, { formatRupiah, getImageUrl, STATUS_LABELS, STATUS_COLORS } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { ArrowLeft, Upload, Building2, CreditCard, CheckCircle2 } from "lucide-react";

export default function OrderDetailPage() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [settings, setSettings] = useState({});
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([api.get(`/orders/${id}`), api.get("/settings")])
      .then(([o, s]) => { setOrder(o.data); setSettings(s.data); })
      .catch(() => navigate("/orders"))
      .finally(() => setLoading(false));
  }, [id, navigate]);

  const handleUploadProof = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      await api.post(`/orders/${id}/payment-proof`, formData, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Bukti pembayaran berhasil diunggah!");
      const { data } = await api.get(`/orders/${id}`);
      setOrder(data);
    } catch { toast.error("Gagal mengunggah bukti pembayaran"); }
    finally { setUploading(false); }
  };

  if (loading) return <div className="min-h-screen pt-24 flex items-center justify-center"><div className="animate-pulse text-muted-foreground">Memuat...</div></div>;
  if (!order) return null;

  const showPaymentInfo = order.status === "pending_payment";
  const showUpload = order.status === "pending_payment" || order.status === "payment_uploaded";

  return (
    <div className="min-h-screen pt-20 md:pt-24" data-testid="order-detail-page">
      <div className="px-6 md:px-12 lg:px-24 py-8 max-w-4xl mx-auto">
        <button onClick={() => navigate("/orders")} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6" data-testid="order-back-btn">
          <ArrowLeft className="h-4 w-4" /> Kembali ke Pesanan
        </button>

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Detail Pesanan</h1>
            <p className="text-sm text-muted-foreground font-mono mt-1">#{order.id.slice(0, 8)}</p>
          </div>
          <Badge className={`status-badge rounded-full px-3 py-1 ${STATUS_COLORS[order.status]}`} data-testid="order-status-badge">
            {STATUS_LABELS[order.status] || order.status}
          </Badge>
        </div>

        <div className="space-y-6">
          {/* Payment Instructions */}
          {showPaymentInfo && (
            <Card className="rounded-2xl border-primary/30 bg-accent/30">
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                  {order.payment_method === "qris" ? <CreditCard className="h-5 w-5" /> : <Building2 className="h-5 w-5" />}
                  Instruksi Pembayaran
                </h3>
                {order.payment_method === "transfer" ? (
                  <div className="space-y-3" data-testid="transfer-info">
                    <p className="text-sm">Silakan transfer ke rekening berikut:</p>
                    <div className="bg-card rounded-xl p-4 space-y-2">
                      <div className="flex justify-between text-sm"><span className="text-muted-foreground">Bank</span><span className="font-semibold">{settings.bank_name || "BCA"}</span></div>
                      <div className="flex justify-between text-sm"><span className="text-muted-foreground">No. Rekening</span><span className="font-semibold font-mono">{settings.account_number || "1234567890"}</span></div>
                      <div className="flex justify-between text-sm"><span className="text-muted-foreground">Atas Nama</span><span className="font-semibold">{settings.account_holder || "Almira Florist"}</span></div>
                      <div className="flex justify-between text-sm"><span className="text-muted-foreground">Jumlah</span><span className="font-semibold text-primary">{formatRupiah(order.total)}</span></div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center space-y-3" data-testid="qris-info">
                    <p className="text-sm">Scan kode QRIS berikut untuk melakukan pembayaran:</p>
                    {settings.qris_image ? (
                      <img src={getImageUrl(settings.qris_image)} alt="QRIS" className="max-w-xs mx-auto rounded-xl border" />
                    ) : (
                      <div className="bg-card rounded-xl p-8 text-muted-foreground text-sm">QRIS belum tersedia. Silakan hubungi admin via WhatsApp.</div>
                    )}
                    <p className="text-sm font-semibold text-primary">Total: {formatRupiah(order.total)}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Upload Proof */}
          {showUpload && (
            <Card className="rounded-2xl">
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold mb-3" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Bukti Pembayaran</h3>
                {order.payment_proof ? (
                  <div className="flex items-center gap-2 text-sm text-green-600" data-testid="proof-uploaded">
                    <CheckCircle2 className="h-4 w-4" /> Bukti pembayaran telah diunggah. Menunggu konfirmasi admin.
                  </div>
                ) : (
                  <div>
                    <p className="text-sm text-muted-foreground mb-3">Upload bukti transfer atau screenshot pembayaran Anda.</p>
                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-xl cursor-pointer hover:bg-muted/50 transition-colors" data-testid="checkout-transfer-proof-upload">
                      <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                      <span className="text-sm text-muted-foreground">{uploading ? "Mengunggah..." : "Pilih file"}</span>
                      <input type="file" accept="image/*" className="hidden" onChange={handleUploadProof} disabled={uploading} />
                    </label>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Order Items */}
          <Card className="rounded-2xl">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold mb-4" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Item Pesanan</h3>
              <div className="space-y-3">
                {order.items.map((item, i) => (
                  <div key={i} className="flex gap-3" data-testid={`order-item-${item.product_id}`}>
                    <div className="w-14 h-14 rounded-lg overflow-hidden bg-muted shrink-0">
                      <img src={getImageUrl(item.image)} alt={item.name} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1"><p className="text-sm font-medium">{item.name}</p><p className="text-xs text-muted-foreground">{item.quantity}x {formatRupiah(item.price)}</p></div>
                    <span className="text-sm font-semibold">{formatRupiah(item.price * item.quantity)}</span>
                  </div>
                ))}
              </div>
              <div className="border-t mt-4 pt-4 flex justify-between text-lg font-semibold" data-testid="order-total">
                <span>Total</span><span className="text-primary">{formatRupiah(order.total)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Shipping */}
          <Card className="rounded-2xl">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold mb-3" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Info Pengiriman</h3>
              <div className="space-y-1 text-sm">
                <p><span className="text-muted-foreground">Penerima:</span> {order.shipping_name}</p>
                <p><span className="text-muted-foreground">Telepon:</span> {order.shipping_phone}</p>
                <p><span className="text-muted-foreground">Alamat:</span> {order.shipping_address}</p>
                {order.notes && <p><span className="text-muted-foreground">Catatan:</span> {order.notes}</p>}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
