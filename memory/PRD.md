# PRD - Almira Florist (BeliBunga.com)

## Original Problem Statement
User memindahkan repository GitHub `joecoe89-gif/almira-florist` ke platform Emergent untuk dilanjutkan editing dan deployment. Fokus: jalankan apa adanya dan perbaiki error agar bisa running end-to-end.

## Source
- GitHub: https://github.com/joecoe89-gif/almira-florist
- Migrated to: /app on 2026-05-31

## Architecture
- **Backend**: FastAPI (single file `server.py`, ~1070 lines)
- **Database**: MongoDB (DB_NAME=almira_florist_db)
- **Frontend**: React 19 + CRACO + Tailwind + Radix UI + react-router-dom v7
- **AI**: Emergent LLM Key (gpt-4.1-mini) untuk chatbot sales
- **Storage**: Emergent object storage untuk payment proofs & uploads
- **Shipping**: RajaOngkir (Komerce v1) — API key kosong, endpoints aktif tapi 503 sampai diisi

## User Personas
- **Customer (guest & registered)**: browse katalog tanaman/bunga, tambah ke cart, checkout dengan ongkir RajaOngkir, upload bukti pembayaran transfer, track order
- **Admin**: kelola produk, kategori, order, settings (bank/QRIS/origin pengiriman) via panel `/admin`

## Core Features (Implemented & Tested)
- Auth: register/login user (email), admin login (username), JWT cookie + bearer, brute-force protection, refresh token
- Katalog: kategori + produk dengan variants, weight, packaging_weight, search & pagination
- Cart guest + user (X-Guest-ID header, merge on login)
- Wishlist (user only)
- Orders: create dengan shipping breakdown, status flow (pending_payment → payment_uploaded → confirmed → processing → shipped → delivered/cancelled)
- Upload bukti pembayaran → Emergent storage
- Settings toko (bank, QRIS, origin pengiriman)
- Chatbot AI (BeliBunga.com sales assistant) menggunakan Emergent LLM Key
- Shipping search & cost (RajaOngkir/Komerce v1) — siap pakai begitu API key diisi
- Admin dashboard: stats (produk, order, user, revenue, pending), dashboard ringkas, CRUD penuh

## Implementation Log
- 2026-05-31: Migrasi penuh dari GitHub repo ke `/app`. .env disetup ulang dengan EMERGENT_LLM_KEY, JWT_SECRET, ADMIN creds, dan FRONTEND_URL. Backend + frontend dependencies terinstall, supervisor restart, services UP.
- 2026-05-31: Backend regression via testing agent — 26/26 pytest passed (100%).
- 2026-05-31: Import bulk produk dari Shopee export (CSV) via `/app/backend/seed_shopee.py`. **826 produk** masuk, didistribusikan otomatis ke 9 kategori (Bunga 192, Bibit Buah 195, Tanaman Indoor 150, Aglonema & Daun Hias 115, Tanaman Outdoor 62, Toga & Herbal 46, Kaktus & Sukulen 25, Anggrek 23, Media Tanam & Pupuk 18). Field `shopee_product_id` disimpan untuk traceability. Gambar dikosongkan (akan diisi user lewat admin panel). Weight default 500g, packaging 200g untuk perhitungan ongkir RajaOngkir.
- 2026-05-31: **AI Image Generation (Gemini Nano Banana / gemini-3.1-flash-image-preview)** ditambahkan. Endpoint baru:
  - `POST /api/admin/products/{id}/generate-image` — generate per produk
  - `POST /api/admin/products/generate-images-bulk?limit=N` — bulk batch (max 10/call, default 5)
  - `GET /api/admin/products` ditambah query `search` & `missing_images` & pagination
  
  UI admin: tombol ✨ "Generate AI" per row + tombol "Generate AI Bulk" dengan dialog progress (resume/stop), search bar, filter "Tanpa gambar saja", pagination prev/next. Gambar 1024x1024 JPEG ~600KB, disimpan ke Emergent storage. Verified via testing agent: 37/37 tests passed (11 baru + 26 regression).

## Credentials
- Admin Panel: username `Admin`, password `Kodok5561` (`/admin/login`)
- Admin Email: `admin@almiraflorist.com`, password `Kodok5561`

## Backlog / Next Action Items
- P1: Isi `RAJAONGKIR_API_KEY` di `/app/backend/.env` agar fitur ongkir live (sekarang 503)
- P1: Test frontend end-to-end (login, cart, checkout, admin) jika user request
- P2: Refactor `server.py` menjadi routers terpisah (auth/products/orders/admin/shipping/chat)
- P2: Tambah real product images (saat ini pakai Unsplash placeholders)
- P3: Tambah payment gateway (Midtrans/Xendit) sebagai alternatif transfer manual
- P3: Email notification untuk order baru (admin) & status update (customer)

## Deployment Target
Emergent platform (preview URL: https://florist-shop-3.preview.emergentagent.com)
