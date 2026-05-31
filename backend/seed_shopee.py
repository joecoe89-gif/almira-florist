"""Seed products from Shopee export CSV into MongoDB.

- Group rows by product_id (variants share the same product_id).
- Auto-categorize based on keywords in name.
- No images (admin will upload via panel). Description auto-generated from name.
"""
import csv
import os
import re
import sys
import uuid
import asyncio
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / '.env')

from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
CSV_PATH = '/app/produk_shopee.csv'

# ---- Category definition (will upsert) ----
CATEGORIES = [
    {"id": "cat-bunga", "name": "Bunga", "slug": "bunga", "description": "Rangkaian bunga segar dan tanaman berbunga",
     "image_url": "https://images.unsplash.com/photo-1771134572111-967700a8bb31?w=400&fit=crop"},
    {"id": "cat-indoor", "name": "Tanaman Indoor", "slug": "tanaman-indoor", "description": "Tanaman hias untuk dalam ruangan",
     "image_url": "https://images.unsplash.com/photo-1604762526063-07244a385cdf?w=400&fit=crop"},
    {"id": "cat-outdoor", "name": "Tanaman Outdoor", "slug": "tanaman-outdoor", "description": "Tanaman untuk taman dan halaman",
     "image_url": "https://images.unsplash.com/photo-1679732747686-33e60fb370a6?w=400&fit=crop"},
    {"id": "cat-kaktus", "name": "Kaktus & Sukulen", "slug": "kaktus-sukulen", "description": "Koleksi kaktus dan sukulen",
     "image_url": "https://images.unsplash.com/photo-1621512366232-0b7b78983782?w=400&fit=crop"},
    {"id": "cat-bibit", "name": "Bibit Buah", "slug": "bibit-buah", "description": "Bibit tanaman buah berkualitas",
     "image_url": "https://images.unsplash.com/photo-1610348725531-843dff563e2c?w=400&fit=crop"},
    {"id": "cat-toga", "name": "Toga & Herbal", "slug": "toga-herbal", "description": "Tanaman obat dan herbal",
     "image_url": "https://images.unsplash.com/photo-1628556270448-4d4e4148e1a1?w=400&fit=crop"},
    {"id": "cat-media", "name": "Media Tanam & Pupuk", "slug": "media-pupuk", "description": "Media tanam, pupuk, dan perlengkapan",
     "image_url": "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=400&fit=crop"},
    {"id": "cat-pot", "name": "Pot & Aksesoris", "slug": "pot-aksesoris", "description": "Pot dan aksesoris tanaman",
     "image_url": "https://images.unsplash.com/photo-1654609678730-d241a2b2eb8d?w=400&fit=crop"},
    {"id": "cat-anggrek", "name": "Anggrek", "slug": "anggrek", "description": "Aneka jenis anggrek koleksi",
     "image_url": "https://images.unsplash.com/photo-1567892737950-30c4db1499a2?w=400&fit=crop"},
    {"id": "cat-aglonema", "name": "Aglonema & Daun Hias", "slug": "aglonema-daun-hias", "description": "Aglonema, Calathea, Philodendron & daun hias lainnya",
     "image_url": "https://images.unsplash.com/photo-1632207691143-0bbd3fd2c19f?w=400&fit=crop"},
]

def categorize(name: str) -> str:
    n = name.lower()
    # Order matters - check specific first
    if re.search(r'\b(media tanam|pupuk|sekam|perlite|cocofiber|planter bag|moss|metan|kompos|gandasil|cocopeat)\b', n):
        return "cat-media"
    if re.search(r'\bpot keramik\b', n) or re.search(r'\bpot\b.*\b(plastik|tanah liat|aksesoris)\b', n):
        return "cat-pot"
    if re.search(r'\b(bibit (?:buah|tanaman buah|pohon)|bibit.*(?:mangga|jeruk|jambu|durian|alpukat|kelengkeng|anggur|apel|pisang|delima|sirsak|markisa|nangka|rambutan|leci|pepaya|naga|tin|lemon|sawo|kepel|matoa|petai|jengkol|kiwi|cherry|plum|kelapa|salak|belimbing|cermai|terong belanda|stroberi|strawberry|nam nam|biriba|jamblang|juwet))', n) or re.search(r'\bbibit.*(buah)\b', n):
        return "cat-bibit"
    if re.search(r'\b(durian|mangga|jeruk|jambu|alpukat|kelengkeng|anggur|delima|sirsak|markisa|rambutan|leci|pepino|kiwi|sawo|matoa|raspberry|murbei|kedondong)\b', n) and 'tanaman' in n:
        return "cat-bibit"
    if re.search(r'\b(kaktus|sukulen|succulent|haworthia|echeveria|agave|lobivia|cereus|jade|tasbih)\b', n):
        return "cat-kaktus"
    if re.search(r'\b(anggrek|orchid|vanda|dendrobium|spathoglottis)\b', n):
        return "cat-anggrek"
    if re.search(r'\b(aglonema|calathea|philodendron|monstera|syngonium|alocasia|begonia|fittonia|hypoestes|sansevieria|sanseivera|tradescantia|peperomia|dieffenbachia|caladium|keladi|kuping gajah|kadaka|hoya|sirih|peace lily|spatufillum|spatufilum|zamioculcas|janda bolong|asparagus|nephrolepis|pakis)\b', n):
        return "cat-aglonema"
    if re.search(r'\b(toga|herbal|mint|kemangi|jahe|kunyit|sereh|serai|salam|kelor|katuk|seledri|sambiloto|insulin|kayu putih|lavender|thyme|oregano|chamomile|dandelion|catnip|sambung nyawa|sledri|jenggot|adas)\b', n):
        return "cat-toga"
    if re.search(r'\b(mawar|bunga|rose|krisan|dahlia|hortensia|hydrangea|azalea|melati|wijaya kusuma|anyelir|matahari|tulip|lily|teratai|lotus|sakura|cempaka|kantil|magnolia|kamboja|gardena|petrea|lantana|bougenville|sedap malam|amaryllis|gloxinia|dianthus|portulaca|hibiscus|nerium|kaliandra|petunia|geranium|cosmos|aster|fuchsia|stefanot|alamanda|garlic vine|coral vine|jade vine|spanish lavender|sunflower|marigold|kenikir|celosia|impatiens|pacar air|pentas|soka|ixora|vinca|primrose|peony|gladiol|kembang|babyrose|honje|airmata pengantin|air mata pengantin)\b', n):
        return "cat-bunga"
    if re.search(r'\b(palem|cemara|bambu|pinus|akasia|ketapang|tabebuia|alang|rumput|sikat botol|calistemon|nolina|pohon|kelapa pandan|murbei|miracle fruit|paku|pepino|cabe|cabai|terong|seledri|brokoli|salam)\b', n):
        return "cat-outdoor"
    return "cat-indoor"

def to_int(v):
    try:
        s = (v or '').strip().replace('.', '').replace(',', '')
        return int(float(s)) if s else 0
    except Exception:
        return 0

def slugify(s):
    s = re.sub(r'[^a-z0-9\s-]', '', s.lower())
    s = re.sub(r'\s+', '-', s).strip('-')
    return s[:80]

async def main():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    # 1) Upsert categories (preserve existing seeded ones, add new)
    now = datetime.now(timezone.utc).isoformat()
    for c in CATEGORIES:
        await db.categories.update_one(
            {"id": c["id"]},
            {"$set": {**c, "is_active": True}, "$setOnInsert": {"created_at": now}},
            upsert=True,
        )
    print(f"Categories upserted: {len(CATEGORIES)}")

    # 2) Read CSV; data starts at row index 6 (after headers + help rows)
    products = {}  # product_id -> {name, variants:[{name,price,stock}]}
    with open(CSV_PATH, encoding='utf-8') as f:
        reader = csv.reader(f)
        rows = list(reader)
    data_rows = rows[6:]  # skip header & instruction rows
    skipped = 0
    for r in data_rows:
        if len(r) < 9:
            continue
        pid = (r[0] or '').strip()
        name = (r[1] or '').strip()
        var_name = (r[3] or '').strip()
        price = to_int(r[6])
        stock = to_int(r[8])
        if not pid or not name or price <= 0:
            skipped += 1
            continue
        # Clean variant name: shopee exports often have format "label suffix,Type"
        if var_name:
            # strip ",Type" suffix
            var_name = var_name.split(',')[0].strip()
            # strip codes like "tbh25jan2023_01" or "ss_13jul_22_01"
            var_name = re.sub(r'\b(tbh\w*|ss_\w*|C_\d+|AF\d+|mawar_\d+|new_\w*)\b', '', var_name, flags=re.IGNORECASE)
            var_name = re.sub(r'\s+', ' ', var_name).strip(' -_')
        if pid not in products:
            products[pid] = {"name": name, "variants": []}
        products[pid]["variants"].append({"name": var_name, "price": price, "stock": stock})

    print(f"Unique products: {len(products)} | Skipped rows: {skipped}")

    # 3) Wipe existing seed products (keep admin & users), then insert new
    await db.products.delete_many({})
    docs = []
    for pid, info in products.items():
        variants = info["variants"]
        # Normalize: if only one variant and its name is empty -> treat as no-variant product
        has_variants = len(variants) > 1 or (len(variants) == 1 and variants[0]["name"])
        total_stock = sum(v["stock"] for v in variants)
        prices = [v["price"] for v in variants if v["price"] > 0]
        base_price = min(prices) if prices else 0
        cat = categorize(info["name"])
        # Build description hint
        desc = info["name"]
        if has_variants and len(variants) > 1:
            opt_list = ", ".join([v["name"] for v in variants if v["name"]][:8])
            if opt_list:
                desc += f"\n\nTersedia pilihan: {opt_list}."
        # Variants for product model (only when meaningful name & price)
        product_variants = []
        if has_variants:
            for v in variants:
                if v["name"]:
                    product_variants.append({"name": v["name"], "price": v["price"]})
            # if all variants had empty names, drop them
            if not product_variants:
                has_variants = False
        docs.append({
            "id": str(uuid.uuid4()),
            "name": info["name"],
            "description": desc,
            "price": base_price,
            "stock": total_stock,
            "category_id": cat,
            "images": [],
            "is_active": True,
            "variants": product_variants,
            "weight": 500,            # default 0.5kg untuk perhitungan ongkir
            "packaging_weight": 200,  # default 0.2kg untuk pot/packing
            "shopee_product_id": pid,
            "created_at": now,
        })

    if docs:
        # Insert in batches
        BATCH = 200
        for i in range(0, len(docs), BATCH):
            await db.products.insert_many(docs[i:i+BATCH])
    print(f"Products inserted: {len(docs)}")

    # 4) Category distribution
    pipeline = [{"$group": {"_id": "$category_id", "count": {"$sum": 1}}}]
    print("\nCategory distribution:")
    async for row in db.products.aggregate(pipeline):
        cat = await db.categories.find_one({"id": row["_id"]}, {"name": 1})
        print(f"  {cat['name'] if cat else row['_id']}: {row['count']}")

    client.close()

if __name__ == "__main__":
    asyncio.run(main())
