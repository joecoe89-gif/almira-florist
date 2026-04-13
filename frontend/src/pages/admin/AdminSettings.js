import { useState, useEffect } from "react";
import AdminLayout from "@/components/AdminLayout";
import api, { getImageUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Save, Upload } from "lucide-react";

export default function AdminSettings() {
  const [form, setForm] = useState({ bank_name: "", account_number: "", account_holder: "", qris_image: "" });
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    api.get("/settings").then(r => setForm({ bank_name: r.data.bank_name || "", account_number: r.data.account_number || "", account_holder: r.data.account_holder || "", qris_image: r.data.qris_image || "" })).catch(() => {});
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    try { await api.put("/settings", form); toast.success("Pengaturan disimpan"); }
    catch { toast.error("Gagal menyimpan"); }
    finally { setLoading(false); }
  };

  const handleUploadQris = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData(); fd.append("file", file);
    try { const { data } = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } }); setForm(f => ({ ...f, qris_image: data.path })); toast.success("QRIS diunggah"); }
    catch { toast.error("Gagal upload"); }
    finally { setUploading(false); }
  };

  const update = (key, val) => setForm(f => ({ ...f, [key]: val }));

  return (
    <AdminLayout title="Pengaturan Toko">
      <form onSubmit={handleSave} data-testid="admin-settings">
        <div className="grid md:grid-cols-2 gap-6">
          <Card className="rounded-2xl">
            <CardContent className="p-6 space-y-4">
              <h3 className="text-lg font-semibold" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Informasi Bank Transfer</h3>
              <div><Label>Nama Bank</Label><Input value={form.bank_name} onChange={e => update("bank_name", e.target.value)} className="mt-1" data-testid="setting-bank-name" placeholder="BCA, BNI, Mandiri..." /></div>
              <div><Label>Nomor Rekening</Label><Input value={form.account_number} onChange={e => update("account_number", e.target.value)} className="mt-1" data-testid="setting-account-number" /></div>
              <div><Label>Atas Nama</Label><Input value={form.account_holder} onChange={e => update("account_holder", e.target.value)} className="mt-1" data-testid="setting-account-holder" /></div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardContent className="p-6 space-y-4">
              <h3 className="text-lg font-semibold" style={{ fontFamily: "'Cormorant Garamond', serif" }}>QRIS</h3>
              <p className="text-sm text-muted-foreground">Upload gambar QRIS Anda untuk pembayaran melalui scan.</p>
              {form.qris_image ? (
                <div className="space-y-3">
                  <img src={getImageUrl(form.qris_image)} alt="QRIS" className="max-w-xs rounded-xl border" data-testid="qris-preview" />
                  <label className="flex items-center gap-2 text-sm text-primary cursor-pointer hover:underline">
                    <Upload className="h-4 w-4" /> {uploading ? "Mengunggah..." : "Ganti gambar QRIS"}
                    <input type="file" accept="image/*" className="hidden" onChange={handleUploadQris} disabled={uploading} />
                  </label>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed rounded-xl cursor-pointer hover:bg-muted/50 transition-colors" data-testid="qris-upload">
                  <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                  <span className="text-sm text-muted-foreground">{uploading ? "Mengunggah..." : "Pilih gambar QRIS"}</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleUploadQris} disabled={uploading} />
                </label>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="mt-6">
          <Button type="submit" className="rounded-full px-8" disabled={loading} data-testid="save-settings-btn">
            <Save className="h-4 w-4 mr-2" /> {loading ? "Menyimpan..." : "Simpan Pengaturan"}
          </Button>
        </div>
      </form>
    </AdminLayout>
  );
}
