import { useState, useEffect } from "react";
import AdminLayout from "@/components/AdminLayout";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";

export default function AdminCategories() {
  const [categories, setCategories] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ name: "", description: "", image_url: "" });

  const fetchCategories = () => api.get("/categories/all").then(r => setCategories(r.data)).catch(() => {});
  useEffect(() => { fetchCategories(); }, []);

  const openNew = () => { setEditId(null); setForm({ name: "", description: "", image_url: "" }); setDialogOpen(true); };
  const openEdit = (c) => { setEditId(c.id); setForm({ name: c.name, description: c.description || "", image_url: c.image_url || "" }); setDialogOpen(true); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editId) { await api.put(`/categories/${editId}`, form); toast.success("Kategori diperbarui"); }
      else { await api.post("/categories", form); toast.success("Kategori ditambahkan"); }
      setDialogOpen(false); fetchCategories();
    } catch { toast.error("Gagal menyimpan"); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Nonaktifkan kategori ini?")) return;
    try { await api.delete(`/categories/${id}`); toast.success("Kategori dinonaktifkan"); fetchCategories(); }
    catch { toast.error("Gagal"); }
  };

  return (
    <AdminLayout title="Kelola Kategori">
      <div data-testid="admin-categories">
        <div className="flex justify-between items-center mb-6">
          <p className="text-sm text-muted-foreground">{categories.length} kategori</p>
          <Button className="rounded-full" onClick={openNew} data-testid="add-category-btn"><Plus className="h-4 w-4 mr-2" /> Tambah Kategori</Button>
        </div>

        <div className="bg-card rounded-2xl border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow><TableHead>Nama</TableHead><TableHead>Slug</TableHead><TableHead>Status</TableHead><TableHead className="w-24">Aksi</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {categories.map(c => (
                <TableRow key={c.id} data-testid={`category-row-${c.id}`}>
                  <TableCell className="font-medium text-sm">{c.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{c.slug}</TableCell>
                  <TableCell><Badge variant={c.is_active ? "default" : "secondary"} className="rounded-full text-xs">{c.is_active ? "Aktif" : "Nonaktif"}</Badge></TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(c)} data-testid={`edit-cat-${c.id}`}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(c.id)} data-testid={`delete-cat-${c.id}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle style={{ fontFamily: "'Cormorant Garamond', serif" }}>{editId ? "Edit Kategori" : "Tambah Kategori"}</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div><Label>Nama Kategori</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required className="mt-1" data-testid="cat-name-input" /></div>
              <div><Label>Deskripsi</Label><Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="mt-1" data-testid="cat-desc-input" /></div>
              <div><Label>URL Gambar</Label><Input value={form.image_url} onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))} className="mt-1" data-testid="cat-image-input" /></div>
              <Button type="submit" className="w-full rounded-full" data-testid="save-cat-btn">{editId ? "Perbarui" : "Simpan"}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
