# Almira Florist E-commerce - PRD

## Problem Statement
Build a full-featured plant e-commerce website for Almira Florist with complete shopping flow, manual bank transfer & QRIS payment, admin dashboard, and WhatsApp integration.

## Architecture
- **Backend**: FastAPI + MongoDB (JWT httpOnly cookies auth)
- **Frontend**: React + Tailwind CSS + Shadcn UI
- **Storage**: Emergent Object Storage (product images, payment proofs)
- **Payment**: Manual Bank Transfer + QRIS

## User Personas
- **Customer**: Browse products, add to cart, checkout, upload payment proof
- **Admin**: Manage products, categories, orders, store settings

## Core Requirements
1. User auth (register/login/logout)
2. Product catalog with 5 categories, 12 seed products
3. Shopping cart with quantity management
4. Checkout with shipping info + payment method selection
5. Order management with payment proof upload
6. Admin dashboard with stats, product/category/order management
7. Store settings (bank info, QRIS image)
8. WhatsApp floating button (087784841084)
9. Wishlist functionality

## What's Implemented (Apr 13, 2026)
- Full backend API (auth, products, categories, cart, wishlist, orders, admin, settings, file upload)
- Complete frontend (HomePage, CatalogPage, ProductDetailPage, CartPage, CheckoutPage, OrdersPage, OrderDetailPage, WishlistPage)
- Admin panel (Dashboard, Products, Orders, Categories, Settings)
- Seed data: 5 categories, 12 products, admin user
- Object storage integration for payment proof uploads
- Design: Organic/earthy theme with Cormorant Garamond + Manrope fonts

## Prioritized Backlog
### P1
- Add search functionality improvements
- Product image gallery (multiple images per product)
- Email notifications for order status changes

### P2
- Product reviews and ratings
- Promo/coupon system
- Advanced filtering (price range, sort by)
- Order tracking with shipping integration

### P3
- Customer address book
- Related products recommendations
- Analytics dashboard for admin
- Multi-language support
