import { useState, useEffect } from "react";
import AdminLayout from "@/components/AdminLayout";
import api, { formatRupiah, getImageUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Upload, Layers, Weight, Check, X, Sparkles, Loader2, Image as ImageIcon, ChevronLeft, ChevronRight, Search } from "lucide-react";

const emptyForm = {
  name: "",
  description: "",
  price: "",
  stock: "",
  category_id: "",
  images: [],
  variants: [],
  weight: "",
  packaging_weight: "",
};

export default function AdminProducts() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [imageUrl, setImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);

  // Pagination + filters
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [missingOnly, setMissingOnly] = useState(false);

  // AI generation state
  const [aiSingleId, setAiSingleId] = useState(null); // product id currently being generated (per-row)
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkStop, setBulkStop] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, success: 0, failed: 0, remaining: 0, currentName: "" });

  // Variant inline editor state
  const [variantDraft, setVariantDraft] = useState({ name: "", price: "" });
  const [editingVariantIdx, setEditingVariantIdx] = useState(null);

  const fetchProducts = () => {
    const params = new URLSearchParams();
    params.set("page", page);
    params.set("limit", 50);
    if (search.trim()) params.set("search", search.trim());
    if (missingOnly) params.set("missing_images", "true");
    return api.get(`/admin/products?${params}`).then((r) => {
      setProducts(r.data.products || []);
      setPages(r.data.pages || 1);
      setTotal(r.data.total || 0);
    }).catch(() => {});
  };
  useEffect(() => { fetchProducts(); /* eslint-disable-next-line */ }, [page, missingOnly]);
  useEffect(() => { api.get("/categories/all").then((r) => setCategories(r.data)).catch(() => {}); }, []);

  const onSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchProducts();
  };

  const openNew = () => {
    setEditId(null);
    setForm(emptyForm);
    setImageUrl("");
    setVariantDraft({ name: "", price: "" });
    setEditingVariantIdx(null);
    setDialogOpen(true);
  };

  const openEdit = (p) => {
    setEditId(p.id);
    setForm({
      name: p.name,
      description: p.description,
      price: String(p.price ?? ""),
      stock: String(p.stock ?? ""),
      category_id: p.category_id || "",
      images: p.images || [],
      variants: Array.isArray(p.variants) ? p.variants.map((v) => ({ name: v.name, price: v.price })) : [],
      weight: p.weight != null ? String(p.weight) : "",
      packaging_weight: p.packaging_weight != null ? String(p.packaging_weight) : "",
    });
    setImageUrl("");
    setVariantDraft({ name: "", price: "" });
    setEditingVariantIdx(null);
    setDialogOpen(true);
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const { data } = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setForm((f) => ({ ...f, images: [...f.images, data.path] }));
      toast.success("Gambar diunggah");
    } catch {
      toast.error("Gagal upload");
    } finally {
      setUploading(false);
    }
  };

  const addImageUrl = () => {
    if (imageUrl.trim()) {
      setForm((f) => ({ ...f, images: [...f.images, imageUrl.trim()] }));
      setImageUrl("");
    }
  };

  // ===== Variant handlers =====
  const startAddVariant = () => {
    setEditingVariantIdx(-1); // -1 = adding new
    setVariantDraft({ name: "", price: "" });
  };

  const startEditVariant = (idx) => {
    const v = form.variants[idx];
    setEditingVariantIdx(idx);
    setVariantDraft({ name: v.name, price: String(v.price) });
  };

  const cancelVariantEdit = () => {
    setEditingVariantIdx(null);
    setVariantDraft({ name: "", price: "" });
  };

  const saveVariant = () => {
    const name = variantDraft.name.trim();
    const priceNum = parseInt(variantDraft.price, 10);
    if (!name) {
      toast.error("Nama variasi wajib diisi");
      return;
    }
    if (Number.isNaN(priceNum) || priceNum < 0) {
      toast.error("Harga variasi harus angka valid");
      return;
    }
    setForm((f) => {
      const next = [...f.variants];
      const item = { name, price: priceNum };
      if (editingVariantIdx === -1) next.push(item);
      else next[editingVariantIdx] = item;
      return { ...f, variants: next };
    });
    setEditingVariantIdx(null);
    setVariantDraft({ name: "", price: "" });
  };

  const deleteVariant = (idx) => {
    setForm((f) => ({ ...f, variants: f.variants.filter((_, i) => i !== idx) }));
    if (editingVariantIdx === idx) cancelVariantEdit();
  };

  const hasVariants = form.variants.length > 0;

  // ===== Submit =====
  const handleSubmit = async (e) => {
    e.preventDefault();
    const weightNum = parseInt(form.weight, 10);
    if (Number.isNaN(weightNum) || weightNum <= 0) {
      toast.error("Berat produk wajib diisi (gram)");
      return;
    }
    // If variants exist, base price = min variant price (handled also in backend)
    let priceNum = 0;
    if (hasVariants) {
      priceNum = Math.min(...form.variants.map((v) => v.price));
    } else {
      priceNum = parseInt(form.price, 10);
      if (Number.isNaN(priceNum) || priceNum < 0) {
        toast.error("Harga wajib diisi jika tidak ada variasi");
        return;
      }
    }
    const payload = {
      name: form.name,
      description: form.description,
      price: priceNum,
      stock: parseInt(form.stock, 10) || 0,
      category_id: form.category_id,
      images: form.images,
      variants: form.variants,
      weight: weightNum,
      packaging_weight: parseInt(form.packaging_weight, 10) || 0,
    };
    try {
      if (editId) {
        await api.put(`/products/${editId}`, payload);
        toast.success("Produk diperbarui");
      } else {
        await api.post("/products", payload);
        toast.success("Produk ditambahkan");
      }
      setDialogOpen(false);
      fetchProducts();
    } catch {
      toast.error("Gagal menyimpan");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Nonaktifkan produk ini?")) return;
    try {
      await api.delete(`/products/${id}`);
      toast.success("Produk dinonaktifkan");
      fetchProducts();
    } catch {
      toast.error("Gagal");
    }
  };

  // ===== AI image generation =====
  const handleGenerateOne = async (productId) => {
    setAiSingleId(productId);
    try {
      await api.post(`/admin/products/${productId}/generate-image`);
      toast.success("Gambar AI berhasil dibuat");
      await fetchProducts();
    } catch {
      toast.error("Gagal generate gambar AI");
    } finally {
      setAiSingleId(null);
    }
  };

  const openBulkDialog = async () => {
    setBulkOpen(true);
    setBulkStop(false);
    setBulkProgress({ done: 0, success: 0, failed: 0, remaining: 0, currentName: "" });
    // Pre-fetch remaining count
    try {
      const r = await api.get("/admin/products?missing_images=true&limit=1");
      setBulkProgress((p) => ({ ...p, remaining: r.data.total || 0 }));
    } catch {}
  };

  const runBulkGeneration = async () => {
    setBulkRunning(true);
    setBulkStop(false);
    let done = 0, success = 0, failed = 0, remaining = 0;
    try {
      // Process in batches of 3 per call (~60-70s per batch)
      // Loop until remaining === 0 or user stops
      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (bulkStop) break;
        let res;
        try {
          res = await api.post("/admin/products/generate-images-bulk?limit=3");
        } catch {
          toast.error("Batch gagal, mencoba lagi...");
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        const data = res.data || {};
        done += data.processed || 0;
        success += data.success || 0;
        failed += data.failed || 0;
        remaining = data.remaining || 0;
        const lastName = (data.results || []).slice(-1)[0]?.name || "";
        setBulkProgress({ done, success, failed, remaining, currentName: lastName });
        if (!data.processed || data.processed === 0 || remaining === 0) break;
      }
    } finally {
      setBulkRunning(false);
      await fetchProducts();
      toast.success(`Selesai: ${success} berhasil, ${failed} gagal`);
    }
  };

  const update = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const totalWeight =
    (parseInt(form.weight, 10) || 0) + (parseInt(form.packaging_weight, 10) || 0);

  return (
    <AdminLayout title="Kelola Produk">
      <div data-testid="admin-products">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 mb-5">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <p className="text-sm text-muted-foreground">{total} produk total{missingOnly ? " (tanpa gambar)" : ""}</p>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                className="rounded-full border-violet-300 text-violet-700 hover:bg-violet-50"
                onClick={openBulkDialog}
                data-testid="bulk-ai-btn"
              >
                <Sparkles className="h-4 w-4 mr-2" /> Generate AI Bulk
              </Button>
              <Button className="rounded-full" onClick={openNew} data-testid="add-product-btn">
                <Plus className="h-4 w-4 mr-2" /> Tambah Produk
              </Button>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <form onSubmit={onSearchSubmit} className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari nama produk..."
                className="pl-9 rounded-full"
                data-testid="admin-search-input"
              />
            </form>
            <label className="flex items-center gap-2 px-3 py-2 rounded-full border bg-card cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={missingOnly}
                onChange={(e) => { setMissingOnly(e.target.checked); setPage(1); }}
                data-testid="missing-images-filter"
              />
              <ImageIcon className="h-3.5 w-3.5" /> Tanpa gambar saja
            </label>
          </div>
        </div>

        <div className="bg-card rounded-2xl border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Foto</TableHead>
                <TableHead>Nama</TableHead>
                <TableHead>Harga</TableHead>
                <TableHead>Stok</TableHead>
                <TableHead>Berat</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((p) => {
                const variantCount = Array.isArray(p.variants) ? p.variants.length : 0;
                const total = (p.weight || 0) + (p.packaging_weight || 0);
                return (
                  <TableRow key={p.id} data-testid={`product-row-${p.id}`}>
                    <TableCell>
                      <div className="w-10 h-10 rounded-lg overflow-hidden bg-muted">
                        <img src={getImageUrl(p.images?.[0])} alt="" className="w-full h-full object-cover" />
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium text-sm">{p.name}</p>
                      {variantCount > 0 && (
                        <span className="text-[0.65rem] text-muted-foreground">
                          {variantCount} variasi
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {variantCount > 0 ? `Mulai ${formatRupiah(p.price)}` : formatRupiah(p.price)}
                    </TableCell>
                    <TableCell className="text-sm">{p.stock}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {total > 0 ? `${total} g` : "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.is_active ? "default" : "secondary"} className="rounded-full text-xs">
                        {p.is_active ? "Aktif" : "Nonaktif"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-violet-600 hover:bg-violet-50"
                          onClick={() => handleGenerateOne(p.id)}
                          disabled={aiSingleId === p.id}
                          title="Generate gambar AI"
                          data-testid={`ai-gen-${p.id}`}
                        >
                          {aiSingleId === p.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Sparkles className="h-3.5 w-3.5" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEdit(p)}
                          data-testid={`edit-product-${p.id}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => handleDelete(p.id)}
                          data-testid={`delete-product-${p.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between mt-4" data-testid="admin-pagination">
            <p className="text-xs text-muted-foreground">Hal {page} dari {pages}</p>
            <div className="flex gap-2">
              <Button
                variant="outline" size="sm" className="rounded-full"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                data-testid="page-prev"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Sebelumnya
              </Button>
              <Button
                variant="outline" size="sm" className="rounded-full"
                disabled={page >= pages}
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                data-testid="page-next"
              >
                Berikutnya <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}

        {/* === Bulk AI dialog === */}
        <Dialog open={bulkOpen} onOpenChange={(o) => { if (!bulkRunning) setBulkOpen(o); }}>
          <DialogContent className="max-w-md" data-testid="bulk-ai-dialog">
            <DialogHeader>
              <DialogTitle style={{ fontFamily: "'Cormorant Garamond', serif" }} className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-violet-600" /> Generate Gambar AI
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              <p className="text-muted-foreground">
                Sistem akan men-generate gambar AI (Gemini Nano Banana) untuk semua produk yang belum punya gambar. Proses berjalan batch demi batch (≈20 detik per produk). Anda bisa berhenti kapan saja.
              </p>
              <div className="rounded-lg border bg-muted/40 p-3 space-y-1.5">
                <div className="flex justify-between"><span>Produk tanpa gambar</span><strong>{bulkProgress.remaining}</strong></div>
                <div className="flex justify-between"><span>Sudah diproses</span><strong>{bulkProgress.done}</strong></div>
                <div className="flex justify-between text-emerald-700"><span>Berhasil</span><strong>{bulkProgress.success}</strong></div>
                {bulkProgress.failed > 0 && (
                  <div className="flex justify-between text-destructive"><span>Gagal</span><strong>{bulkProgress.failed}</strong></div>
                )}
                {bulkProgress.currentName && (
                  <p className="text-xs text-muted-foreground pt-1 truncate">Terakhir: {bulkProgress.currentName}</p>
                )}
              </div>
              {bulkRunning && (
                <div className="flex items-center gap-2 text-violet-700">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Sedang memproses batch...</span>
                </div>
              )}
              <div className="flex gap-2">
                {!bulkRunning ? (
                  <Button
                    onClick={runBulkGeneration}
                    className="rounded-full flex-1 bg-violet-600 hover:bg-violet-700"
                    disabled={bulkProgress.remaining === 0 && bulkProgress.done > 0}
                    data-testid="bulk-start-btn"
                  >
                    <Sparkles className="h-4 w-4 mr-2" />
                    {bulkProgress.done > 0 ? "Lanjutkan" : "Mulai Generate"}
                  </Button>
                ) : (
                  <Button
                    onClick={() => setBulkStop(true)}
                    variant="outline"
                    className="rounded-full flex-1"
                    data-testid="bulk-stop-btn"
                  >
                    Stop setelah batch ini
                  </Button>
                )}
                {!bulkRunning && (
                  <Button variant="ghost" className="rounded-full" onClick={() => setBulkOpen(false)}>
                    Tutup
                  </Button>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                {editId ? "Edit Produk" : "Tambah Produk"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Nama Produk */}
              <div>
                <Label>Nama Produk</Label>
                <Input
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                  required
                  className="mt-1"
                  data-testid="product-name-input"
                />
              </div>

              {/* Deskripsi */}
              <div>
                <Label>Deskripsi</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => update("description", e.target.value)}
                  rows={3}
                  className="mt-1"
                  data-testid="product-desc-input"
                />
              </div>

              {/* === FITUR 1: VARIASI PRODUK === */}
              <div
                className="rounded-xl border bg-muted/30 p-4 space-y-3"
                data-testid="variants-section"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-primary" />
                    <Label className="text-sm font-semibold m-0">Variasi Produk</Label>
                  </div>
                  {form.variants.length > 0 && (
                    <Badge variant="secondary" className="rounded-full text-[0.65rem]">
                      {form.variants.length} variasi
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground -mt-1">
                  Tambahkan variasi (mis. Merah, Putih, Kuning) jika produk punya beberapa pilihan harga.
                </p>

                {/* Variant list */}
                {form.variants.length > 0 && (
                  <div className="space-y-2">
                    {form.variants.map((v, idx) =>
                      editingVariantIdx === idx ? (
                        <VariantEditor
                          key={idx}
                          draft={variantDraft}
                          setDraft={setVariantDraft}
                          onSave={saveVariant}
                          onCancel={cancelVariantEdit}
                        />
                      ) : (
                        <div
                          key={idx}
                          className="flex items-center justify-between rounded-lg bg-background border px-3 py-2"
                          data-testid={`variant-row-${idx}`}
                        >
                          <div>
                            <p className="text-sm font-medium">{v.name}</p>
                            <p className="text-xs text-muted-foreground">{formatRupiah(v.price)}</p>
                          </div>
                          <div className="flex gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => startEditVariant(idx)}
                              data-testid={`edit-variant-${idx}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive"
                              onClick={() => deleteVariant(idx)}
                              data-testid={`delete-variant-${idx}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                )}

                {/* New variant editor */}
                {editingVariantIdx === -1 && (
                  <VariantEditor
                    draft={variantDraft}
                    setDraft={setVariantDraft}
                    onSave={saveVariant}
                    onCancel={cancelVariantEdit}
                  />
                )}

                {editingVariantIdx === null && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={startAddVariant}
                    className="rounded-full w-full"
                    data-testid="add-variant-btn"
                  >
                    <Plus className="h-4 w-4 mr-2" /> Tambah Variasi
                  </Button>
                )}
              </div>

              {/* === FITUR 2: BERAT & DIMENSI === */}
              <div
                className="rounded-xl border bg-muted/30 p-4 space-y-3"
                data-testid="weight-section"
              >
                <div className="flex items-center gap-2">
                  <Weight className="h-4 w-4 text-primary" />
                  <Label className="text-sm font-semibold m-0">Berat & Dimensi</Label>
                </div>
                <p className="text-xs text-muted-foreground -mt-1">
                  Total berat akan digunakan untuk kalkulasi ongkos kirim.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">
                      Berat produk (gram) <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      type="number"
                      min="1"
                      value={form.weight}
                      onChange={(e) => update("weight", e.target.value)}
                      required
                      placeholder="500"
                      className="mt-1"
                      data-testid="product-weight-input"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Berat kemasan (gram)</Label>
                    <Input
                      type="number"
                      min="0"
                      value={form.packaging_weight}
                      onChange={(e) => update("packaging_weight", e.target.value)}
                      placeholder="100"
                      className="mt-1"
                      data-testid="product-packaging-weight-input"
                    />
                  </div>
                </div>
                <div
                  className="text-xs bg-primary/10 text-primary rounded-lg px-3 py-2 font-medium"
                  data-testid="total-weight-display"
                >
                  Total berat: <strong>{totalWeight} gram</strong>
                  {totalWeight > 0 && <span className="opacity-70"> ({(totalWeight / 1000).toFixed(2)} kg)</span>}
                </div>
              </div>

              {/* Harga & Stok — harga disembunyikan jika ada variasi */}
              <div className={hasVariants ? "" : "grid grid-cols-2 gap-4"}>
                {!hasVariants && (
                  <div data-testid="price-field-wrapper">
                    <Label>Harga (Rp)</Label>
                    <Input
                      type="number"
                      value={form.price}
                      onChange={(e) => update("price", e.target.value)}
                      required
                      className="mt-1"
                      data-testid="product-price-input"
                    />
                  </div>
                )}
                <div>
                  <Label>Stok</Label>
                  <Input
                    type="number"
                    value={form.stock}
                    onChange={(e) => update("stock", e.target.value)}
                    required
                    className="mt-1"
                    data-testid="product-stock-input"
                  />
                </div>
              </div>
              {hasVariants && (
                <p className="text-xs text-muted-foreground -mt-2" data-testid="variants-price-note">
                  Harga sudah diatur per variasi di atas.
                </p>
              )}

              {/* Kategori */}
              <div>
                <Label>Kategori</Label>
                <Select value={form.category_id} onValueChange={(v) => update("category_id", v)}>
                  <SelectTrigger className="mt-1" data-testid="product-category-select">
                    <SelectValue placeholder="Pilih kategori" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Gambar */}
              <div>
                <Label>Gambar</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="Tempel URL gambar"
                    className="flex-1"
                  />
                  <Button type="button" variant="outline" onClick={addImageUrl} className="rounded-full">
                    Tambah
                  </Button>
                </div>
                <label className="flex items-center gap-2 mt-2 text-sm text-primary cursor-pointer hover:underline">
                  <Upload className="h-4 w-4" /> {uploading ? "Mengunggah..." : "Atau upload file"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleUpload}
                    disabled={uploading}
                  />
                </label>
                {form.images.length > 0 && (
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {form.images.map((img, i) => (
                      <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden bg-muted border">
                        <img src={getImageUrl(img)} alt="" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setForm((f) => ({ ...f, images: f.images.filter((_, j) => j !== i) }))}
                          className="absolute top-0 right-0 bg-destructive text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
                        >
                          x
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Button type="submit" className="w-full rounded-full" data-testid="save-product-btn">
                {editId ? "Perbarui" : "Simpan"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}

function VariantEditor({ draft, setDraft, onSave, onCancel }) {
  return (
    <div
      className="rounded-lg bg-background border-2 border-primary/30 p-3 space-y-2"
      data-testid="variant-editor"
    >
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Nama Variasi</Label>
          <Input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="mis. Merah"
            className="mt-1"
            data-testid="variant-name-input"
          />
        </div>
        <div>
          <Label className="text-xs">Harga (Rp)</Label>
          <Input
            type="number"
            min="0"
            value={draft.price}
            onChange={(e) => setDraft({ ...draft, price: e.target.value })}
            placeholder="50000"
            className="mt-1"
            data-testid="variant-price-input"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          onClick={onSave}
          className="rounded-full flex-1"
          data-testid="save-variant-btn"
        >
          <Check className="h-3.5 w-3.5 mr-1" /> Simpan
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCancel}
          className="rounded-full"
          data-testid="cancel-variant-btn"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
