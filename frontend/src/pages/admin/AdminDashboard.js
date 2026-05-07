import { useState, useEffect } from "react";
import AdminLayout from "@/components/AdminLayout";
import api, { formatRupiah, STATUS_LABELS, STATUS_COLORS } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { Package, ShoppingBag, TrendingUp, AlertCircle, ArrowRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export default function AdminDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({});
  const [recentOrders, setRecentOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [s, o] = await Promise.all([
          api.get("/admin/dashboard"),
          api.get("/admin/orders?limit=5"),
        ]);
        setStats(s.data || {});
        setRecentOrders(o.data?.orders || []);
      } catch (e) {
        // ignore — protected route will redirect on 401
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const cards = [
    {
      label: "Total Produk",
      value: stats.total_products ?? 0,
      hint: "Produk aktif di katalog",
      icon: Package,
      gradient: "from-emerald-500 to-emerald-600",
      iconBg: "bg-emerald-100 text-emerald-700",
    },
    {
      label: "Pesanan Hari Ini",
      value: stats.orders_today ?? 0,
      hint: "Order baru masuk hari ini",
      icon: ShoppingBag,
      gradient: "from-blue-500 to-blue-600",
      iconBg: "bg-blue-100 text-blue-700",
    },
    {
      label: `Pendapatan ${stats.month_label || "Bulan Ini"}`,
      value: formatRupiah(stats.revenue_month ?? 0),
      hint: "Order terkonfirmasi & selesai",
      icon: TrendingUp,
      gradient: "from-amber-500 to-amber-600",
      iconBg: "bg-amber-100 text-amber-700",
    },
  ];

  return (
    <AdminLayout title="Beranda Admin">
      <div data-testid="admin-dashboard">
        {/* Welcome */}
        <div className="mb-6">
          <h2
            className="text-3xl font-semibold tracking-tight"
            style={{ fontFamily: "'Cormorant Garamond', serif" }}
          >
            Halo, {user?.name || "Admin"} 👋
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Berikut ringkasan toko BeliBunga.com hari ini.
          </p>
        </div>

        {stats.pending_orders > 0 && (
          <div
            className="mb-6 p-4 rounded-xl bg-yellow-50 border border-yellow-200 flex items-center gap-3"
            data-testid="pending-alert"
          >
            <AlertCircle className="h-5 w-5 text-yellow-600 shrink-0" />
            <p className="text-sm text-yellow-800 flex-1">
              <strong>{stats.pending_orders}</strong> pesanan menunggu konfirmasi pembayaran
            </p>
            <Link
              to="/admin/orders"
              className="text-sm font-medium text-yellow-700 hover:underline whitespace-nowrap"
            >
              Lihat
            </Link>
          </div>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {cards.map((c, i) => (
            <Card
              key={i}
              className="rounded-2xl overflow-hidden border hover:shadow-md transition-shadow"
              data-testid={`stat-card-${i}`}
            >
              <CardContent className="p-0">
                <div className={`bg-gradient-to-br ${c.gradient} h-1.5`} />
                <div className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {c.label}
                    </span>
                    <div className={`p-2 rounded-xl ${c.iconBg}`}>
                      <c.icon className="h-4 w-4" />
                    </div>
                  </div>
                  <p
                    className="text-3xl font-bold"
                    style={{ fontFamily: "'Cormorant Garamond', serif" }}
                  >
                    {loading ? "…" : c.value}
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">{c.hint}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {[
            { to: "/admin/products", label: "Kelola Produk", desc: "Tambah / edit produk", icon: Package },
            { to: "/admin/orders", label: "Lihat Pesanan", desc: "Kelola order customer", icon: ShoppingBag },
            { to: "/admin/settings", label: "Pengaturan Toko", desc: "Bank & pembayaran", icon: TrendingUp },
          ].map((q) => (
            <Link
              key={q.to}
              to={q.to}
              className="group p-4 rounded-2xl border bg-card hover:bg-muted/40 transition-colors flex items-center gap-3"
            >
              <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                <q.icon className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">{q.label}</p>
                <p className="text-xs text-muted-foreground">{q.desc}</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
            </Link>
          ))}
        </div>

        {/* Recent orders */}
        <Card className="rounded-2xl">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3
                className="text-lg font-semibold"
                style={{ fontFamily: "'Cormorant Garamond', serif" }}
              >
                Pesanan Terbaru
              </h3>
              <Link
                to="/admin/orders"
                className="text-sm text-primary hover:underline"
              >
                Lihat Semua
              </Link>
            </div>
            {loading ? (
              <p className="text-sm text-muted-foreground text-center py-8">Memuat…</p>
            ) : recentOrders.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Belum ada pesanan</p>
            ) : (
              <div className="space-y-2">
                {recentOrders.map((order) => (
                  <Link
                    key={order.id}
                    to="/admin/orders"
                    className="flex items-center justify-between p-3 rounded-xl hover:bg-muted/50 transition-colors"
                    data-testid={`recent-order-${order.id}`}
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {order.user_name || order.user_email}
                      </p>
                      <p className="text-xs text-muted-foreground font-mono">
                        #{order.id.slice(0, 8)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">{formatRupiah(order.total)}</p>
                      <Badge
                        className={`status-badge rounded-full px-2 py-0.5 ${STATUS_COLORS[order.status]}`}
                      >
                        {STATUS_LABELS[order.status]}
                      </Badge>
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
