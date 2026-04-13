import { useState, useEffect } from "react";
import AdminLayout from "@/components/AdminLayout";
import api, { formatRupiah, STATUS_LABELS, STATUS_COLORS } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { Package, ShoppingBag, Users, DollarSign, AlertCircle } from "lucide-react";

export default function AdminDashboard() {
  const [stats, setStats] = useState({});
  const [recentOrders, setRecentOrders] = useState([]);

  useEffect(() => {
    api.get("/admin/stats").then(r => setStats(r.data)).catch(() => {});
    api.get("/admin/orders?limit=5").then(r => setRecentOrders(r.data.orders || [])).catch(() => {});
  }, []);

  const statCards = [
    { label: "Total Produk", value: stats.total_products || 0, icon: Package, color: "text-emerald-600 bg-emerald-100" },
    { label: "Total Pesanan", value: stats.total_orders || 0, icon: ShoppingBag, color: "text-blue-600 bg-blue-100" },
    { label: "Total Customer", value: stats.total_users || 0, icon: Users, color: "text-purple-600 bg-purple-100" },
    { label: "Pendapatan", value: formatRupiah(stats.revenue || 0), icon: DollarSign, color: "text-amber-600 bg-amber-100" },
  ];

  return (
    <AdminLayout title="Dashboard">
      <div data-testid="admin-dashboard">
        {stats.pending_orders > 0 && (
          <div className="mb-6 p-4 rounded-xl bg-yellow-50 border border-yellow-200 flex items-center gap-3" data-testid="pending-alert">
            <AlertCircle className="h-5 w-5 text-yellow-600" />
            <p className="text-sm text-yellow-800"><strong>{stats.pending_orders}</strong> pesanan menunggu konfirmasi pembayaran</p>
            <Link to="/admin/orders" className="ml-auto text-sm font-medium text-yellow-700 hover:underline">Lihat</Link>
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {statCards.map((s, i) => (
            <Card key={i} className="rounded-2xl" data-testid={`stat-card-${i}`}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{s.label}</span>
                  <div className={`p-2 rounded-xl ${s.color}`}><s.icon className="h-4 w-4" /></div>
                </div>
                <p className="text-2xl font-bold" style={{ fontFamily: "'Cormorant Garamond', serif" }}>{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="rounded-2xl">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Pesanan Terbaru</h3>
              <Link to="/admin/orders" className="text-sm text-primary hover:underline">Lihat Semua</Link>
            </div>
            {recentOrders.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Belum ada pesanan</p>
            ) : (
              <div className="space-y-3">
                {recentOrders.map(order => (
                  <Link key={order.id} to="/admin/orders" className="flex items-center justify-between p-3 rounded-xl hover:bg-muted/50 transition-colors" data-testid={`recent-order-${order.id}`}>
                    <div>
                      <p className="text-sm font-medium">{order.user_name || order.user_email}</p>
                      <p className="text-xs text-muted-foreground font-mono">#{order.id.slice(0, 8)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">{formatRupiah(order.total)}</p>
                      <Badge className={`status-badge rounded-full px-2 py-0.5 ${STATUS_COLORS[order.status]}`}>{STATUS_LABELS[order.status]}</Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
