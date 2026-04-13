import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import api, { formatRupiah, STATUS_LABELS, STATUS_COLORS } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Package, ArrowRight, ShoppingCart } from "lucide-react";

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/orders").then(r => setOrders(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="min-h-screen pt-24 flex items-center justify-center"><div className="animate-pulse text-muted-foreground">Memuat...</div></div>;

  return (
    <div className="min-h-screen pt-20 md:pt-24" data-testid="orders-page">
      <div className="px-6 md:px-12 lg:px-24 py-8">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-8" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Pesanan Saya</h1>

        {orders.length === 0 ? (
          <div className="text-center py-20 bg-card rounded-2xl border">
            <Package className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-lg text-muted-foreground">Belum ada pesanan</p>
            <Link to="/catalog"><Button className="rounded-full mt-4" data-testid="orders-shop-btn"><ShoppingCart className="h-4 w-4 mr-2" />Mulai Belanja</Button></Link>
          </div>
        ) : (
          <div className="space-y-4" data-testid="orders-list">
            {orders.map(order => (
              <Link key={order.id} to={`/orders/${order.id}`} className="block" data-testid={`order-item-${order.id}`}>
                <div className="bg-card rounded-2xl border p-5 hover:shadow-md transition-shadow">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <span className="text-sm font-mono text-muted-foreground">#{order.id.slice(0, 8)}</span>
                        <Badge className={`status-badge rounded-full px-2.5 py-0.5 ${STATUS_COLORS[order.status] || "bg-muted text-muted-foreground"}`}>
                          {STATUS_LABELS[order.status] || order.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{new Date(order.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</p>
                      <p className="text-sm mt-1">{order.items.length} item</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-lg font-semibold text-primary">{formatRupiah(order.total)}</span>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
