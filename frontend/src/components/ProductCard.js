import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Plus } from "lucide-react";
import { formatRupiah, getImageUrl } from "@/lib/api";

export default function ProductCard({ product, onAddToCart }) {
  const image = product.images?.[0] || "";

  return (
    <Card data-testid={`product-card-${product.id}`} className="group rounded-2xl overflow-hidden border shadow-sm hover:shadow-md transition-shadow duration-300 bg-card">
      <Link to={`/product/${product.id}`} className="block">
        <div className="aspect-square overflow-hidden bg-muted">
          <img src={getImageUrl(image)} alt={product.name}
            className="w-full h-full object-cover product-image-hover"
            loading="lazy" />
        </div>
      </Link>
      <div className="p-4">
        <Link to={`/product/${product.id}`}>
          <h3 className="text-base font-semibold line-clamp-1 group-hover:text-primary transition-colors" style={{ fontFamily: "'Cormorant Garamond', serif" }} data-testid={`product-name-${product.id}`}>
            {product.name}
          </h3>
        </Link>
        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{product.description}</p>
        <div className="flex items-center justify-between mt-3 gap-2">
          <span className="text-base font-semibold text-primary" data-testid={`product-price-${product.id}`}>{formatRupiah(product.price)}</span>
          {onAddToCart && (
            <Button size="sm" className="rounded-full px-3 h-8 text-xs hover:scale-105 transition-transform gap-1"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAddToCart(product.id); }}
              data-testid={`add-to-cart-${product.id}`}>
              <Plus className="h-3 w-3" />
              <span className="hidden sm:inline">Keranjang</span>
              <ShoppingCart className="h-3 w-3 sm:hidden" />
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
