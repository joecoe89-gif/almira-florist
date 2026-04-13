# Almira Florist E-commerce - PRD

## Problem Statement
Build a full-featured plant e-commerce website for Almira Florist with complete shopping flow, manual bank transfer & QRIS payment, admin dashboard, AI chatbot, and WhatsApp integration.

## Architecture
- **Backend**: FastAPI + MongoDB (JWT httpOnly cookies auth)
- **Frontend**: React + Tailwind CSS + Shadcn UI
- **Storage**: Emergent Object Storage (product images, payment proofs)
- **AI Chatbot**: GPT-4.1-mini via Emergent LLM Key (emergentintegrations)
- **Payment**: Manual Bank Transfer + QRIS

## What's Implemented (Apr 13, 2026)
### Phase 1 - Core E-commerce
- Full backend API (auth, products, categories, cart, wishlist, orders, admin, settings, file upload)
- Complete frontend pages (Home, Catalog, Product Detail, Cart, Checkout, Orders, Wishlist)
- Admin panel (Dashboard, Products, Orders, Categories, Settings)
- Seed data: 5 categories, 12 products, admin user
- Object storage for payment proof uploads
- WhatsApp floating button

### Phase 2 - Logo + AI Chatbot (Apr 13, 2026)
- New themed SVG logo (leaf icon + Almira Florist text)
- AI Chatbot widget with auto-greeting, product knowledge, sales closing capability
- Chat history stored in MongoDB
- 24/7 automated customer support

## Prioritized Backlog
### P1
- Email notifications for order status changes
- Product image gallery (multiple images)
- Shipping cost calculator

### P2
- Product reviews/ratings
- Promo/coupon system
- Order tracking with shipping integration
- Customer address book

### P3
- Analytics dashboard
- Related products recommendations
- Multi-language support
