import { useState, useEffect } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import ProductCard from "@/components/ProductCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Search, SlidersHorizontal } from "lucide-react";

export default function CatalogPage() {
  const { categoryId } = useParams();
  const [searchParams] = useSearchParams();
  const searchQuery = searchParams.get("search") || "";
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(categoryId || "");
  const [search, setSearch] = useState(searchQuery);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const { user, refreshCart } = useAuth();
  const navigate = useNavigate();

  useEffect(() => { setSelectedCategory(categoryId || ""); }, [categoryId]);
  useEffect(() => { setSearch(searchQuery); }, [searchQuery]);
  useEffect(() => { api.get("/categories").then(r => setCategories(r.data)).catch(() => {}); }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (selectedCategory) params.set("category", selectedCategory);
    if (search) params.set("search", search);
    params.set("page", page);
    params.set("limit", 12);
    api.get(`/products?${params}`).then(r => { setProducts(r.data.products || []); setTotalPages(r.data.pages || 1); })
      .catch(() => {}).finally(() => setLoading(false));
  }, [selectedCategory, search, page]);

  const handleAddToCart = async (productId) => {
    try { await api.post("/cart/add", { product_id: productId, quantity: 1 }); toast.success("Ditambahkan ke keranjang"); refreshCart(); }
    catch { toast.error("Gagal menambahkan"); }
  };

  const currentCat = categories.find(c => c.id === selectedCategory);

  return (
    <div className="min-h-screen pt-20 md:pt-24" data-testid="catalog-page">
      <div className="px-6 md:px-12 lg:px-24 py-8">
        <div className="flex flex-col md:flex-row gap-8">
          {/* Sidebar */}
          <aside className={`${showFilters ? "block" : "hidden"} md:block w-full md:w-56 shrink-0`}>
            <div className="sticky top-24 space-y-4">
              <h3 className="text-lg font-semibold" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Kategori</h3>
              <div className="space-y-1">
                <button onClick={() => { setSelectedCategory(""); setPage(1); }} data-testid="cat-filter-all"
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${!selectedCategory ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                  Semua Produk
                </button>
                {categories.map(c => (
                  <button key={c.id} onClick={() => { setSelectedCategory(c.id); setPage(1); }} data-testid={`cat-filter-${c.id}`}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${selectedCategory === c.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          </aside>

          {/* Main */}
          <main className="flex-1">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
              <div>
                <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                  {currentCat ? currentCat.name : search ? `Hasil: "${search}"` : "Semua Produk"}
                </h1>
                <p className="text-muted-foreground text-sm mt-1">{products.length} produk ditemukan</p>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Cari tanaman..."
                    className="pl-9 rounded-full" data-testid="catalog-search-input" />
                </div>
                <Button variant="outline" size="icon" className="md:hidden rounded-full" onClick={() => setShowFilters(!showFilters)}>
                  <SlidersHorizontal className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {loading ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
                {[...Array(6)].map((_, i) => <div key={i} className="aspect-square rounded-2xl bg-muted animate-pulse" />)}
              </div>
            ) : products.length === 0 ? (
              <div className="text-center py-20">
                <p className="text-muted-foreground text-lg">Tidak ada produk ditemukan</p>
                <Link to="/catalog"><Button variant="outline" className="rounded-full mt-4">Lihat Semua</Button></Link>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6" data-testid="product-grid">
                  {products.map(p => <ProductCard key={p.id} product={p} onAddToCart={handleAddToCart} />)}
                </div>
                {totalPages > 1 && (
                  <div className="flex justify-center gap-2 mt-8" data-testid="pagination">
                    {Array.from({ length: totalPages }, (_, i) => (
                      <Button key={i} variant={page === i + 1 ? "default" : "outline"} size="sm" className="rounded-full"
                        onClick={() => setPage(i + 1)}>{i + 1}</Button>
                    ))}
                  </div>
                )}
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
