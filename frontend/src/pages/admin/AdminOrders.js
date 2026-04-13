import { useState, useEffect } from "react";
import AdminLayout from "@/components/AdminLayout";
import api, { formatRupiah, getImageUrl, STATUS_LABELS, STATUS_COLORS } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Eye, Image } from "lucide-react";

const ALL_STATUSES = ["pending_payment", "payment_uploaded", "confirmed", "processing", "shipped", "delivered", "cancelled"];

export default function AdminOrders() {
  const [orders, setOrders] = useState([]);
  const [filterStatus, setFilterStatus] = useState("all");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [proofOpen, setProofOpen] = useState(false);
  const [proofUrl, setProofUrl] = useState("");

  const fetchOrders = () => {
    const params = filterStatus !== "all" ? `?status=${filterStatus}` : "";
    api.get(`/admin/orders${params}`).then(r => setOrders(r.data.orders || [])).catch(() => {});
  };

  useEffect(() => { fetchOrders(); }, [filterStatus]);

  const updateStatus = async (orderId, status) => {
    try { await api.put(`/admin/orders/${orderId}/status`, { status }); toast.success("Status diperbarui"); fetchOrders(); }
    catch { toast.error("Gagal memperbarui status"); }
  };

  const viewProof = (path) => {
    setProofUrl(getImageUrl(path));
    setProofOpen(true);
  };

  return (
    <AdminLayout title="Kelola Pesanan">
      <div data-testid="admin-orders">
        <div className="flex items-center gap-4 mb-6">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-48" data-testid="order-status-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Status</SelectItem>
              {ALL_STATUSES.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">{orders.length} pesanan</p>
        </div>

        <div className="bg-card rounded-2xl border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow><TableHead>ID</TableHead><TableHead>Customer</TableHead><TableHead>Total</TableHead><TableHead>Status</TableHead><TableHead>Bukti</TableHead><TableHead>Ubah Status</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {orders.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">Tidak ada pesanan</TableCell></TableRow>
              ) : orders.map(order => (
                <TableRow key={order.id} data-testid={`admin-order-${order.id}`}>
                  <TableCell className="font-mono text-xs">#{order.id.slice(0, 8)}</TableCell>
                  <TableCell>
                    <p className="text-sm font-medium">{order.user_name || order.shipping_name}</p>
                    <p className="text-xs text-muted-foreground">{new Date(order.created_at).toLocaleDateString("id-ID")}</p>
                  </TableCell>
                  <TableCell className="text-sm font-medium">{formatRupiah(order.total)}</TableCell>
                  <TableCell><Badge className={`status-badge rounded-full px-2 py-0.5 ${STATUS_COLORS[order.status]}`}>{STATUS_LABELS[order.status]}</Badge></TableCell>
                  <TableCell>
                    {order.payment_proof ? (
                      <Button variant="ghost" size="sm" className="text-xs" onClick={() => viewProof(order.payment_proof)} data-testid={`view-proof-${order.id}`}>
                        <Image className="h-3.5 w-3.5 mr-1" /> Lihat
                      </Button>
                    ) : <span className="text-xs text-muted-foreground">-</span>}
                  </TableCell>
                  <TableCell>
                    <Select value={order.status} onValueChange={v => updateStatus(order.id, v)}>
                      <SelectTrigger className="h-8 text-xs w-40" data-testid={`status-select-${order.id}`}><SelectValue /></SelectTrigger>
                      <SelectContent>{ALL_STATUSES.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}</SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <Dialog open={proofOpen} onOpenChange={setProofOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Bukti Pembayaran</DialogTitle></DialogHeader>
            <img src={proofUrl} alt="Payment proof" className="w-full rounded-xl" data-testid="payment-proof-image" />
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
