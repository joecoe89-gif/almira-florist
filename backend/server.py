from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, UploadFile, File
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
import bcrypt
import jwt
import base64
import requests as http_requests
from emergentintegrations.llm.chat import LlmChat, UserMessage as LlmUserMessage
from datetime import datetime, timezone, timedelta
from typing import List, Optional
from pydantic import BaseModel

MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
JWT_SECRET = os.environ.get('JWT_SECRET', 'change-me-in-production')
JWT_ALGORITHM = "HS256"
ADMIN_EMAIL = os.environ.get('ADMIN_EMAIL', 'admin@almiraflorist.com')
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'Admin123!')
ADMIN_USERNAME = os.environ.get('ADMIN_USERNAME', 'Admin')
ADMIN_PANEL_PASSWORD = os.environ.get('ADMIN_PANEL_PASSWORD', 'Kodok5561')
EMERGENT_KEY = os.environ.get('EMERGENT_LLM_KEY', '')
RAJAONGKIR_API_KEY = os.environ.get('RAJAONGKIR_API_KEY', '')
RAJAONGKIR_BASE_URL = os.environ.get('RAJAONGKIR_BASE_URL', 'https://rajaongkir.komerce.id/api/v1')
STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
APP_NAME = "almira-florist"
FRONTEND_URL = os.environ.get('FRONTEND_URL', 'http://localhost:3000')

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ============ MODELS ============

class UserRegister(BaseModel):
    email: str
    password: str
    name: str
    phone: str = ""

class UserLogin(BaseModel):
    email: str
    password: str

class AdminLogin(BaseModel):
    username: str
    password: str

class CategoryCreate(BaseModel):
    name: str
    description: str = ""
    image_url: str = ""

class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    image_url: Optional[str] = None
    is_active: Optional[bool] = None

class ProductVariant(BaseModel):
    name: str
    price: int

class ProductCreate(BaseModel):
    name: str
    description: str = ""
    price: int = 0
    stock: int = 0
    category_id: str = ""
    images: List[str] = []
    variants: List[ProductVariant] = []
    weight: int = 0
    packaging_weight: int = 0

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[int] = None
    stock: Optional[int] = None
    category_id: Optional[str] = None
    images: Optional[List[str]] = None
    is_active: Optional[bool] = None
    variants: Optional[List[ProductVariant]] = None
    weight: Optional[int] = None
    packaging_weight: Optional[int] = None

class CartItem(BaseModel):
    product_id: str
    quantity: int = 1
    variant_name: Optional[str] = None

class OrderCreate(BaseModel):
    shipping_name: str
    shipping_phone: str
    shipping_address: str
    shipping_email: str = ""
    payment_method: str = "transfer"
    notes: str = ""

class OrderStatusUpdate(BaseModel):
    status: str

class StoreSettingsUpdate(BaseModel):
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    account_holder: Optional[str] = None
    qris_image: Optional[str] = None
    origin_id: Optional[int] = None
    origin_label: Optional[str] = None

class ShippingCostRequest(BaseModel):
    origin: int
    destination: int
    weight: int  # in grams
    courier: str = "jne:tiki:pos"
    price: str = "lowest"

class OrderCreateV2(BaseModel):
    shipping_name: str
    shipping_phone: str
    shipping_address: str
    shipping_email: str = ""
    payment_method: str = "transfer"
    notes: str = ""
    # Shipping fields
    shipping_destination_id: Optional[int] = None
    shipping_destination_label: Optional[str] = None
    shipping_courier: Optional[str] = None
    shipping_service: Optional[str] = None
    shipping_etd: Optional[str] = None
    shipping_cost: Optional[int] = 0

class ChatRequest(BaseModel):
    message: str
    session_id: str = ""

# ============ AUTH HELPERS ============

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode('utf-8'), hashed.encode('utf-8'))

def create_access_token(user_id: str, email: str) -> str:
    payload = {"sub": user_id, "email": email, "exp": datetime.now(timezone.utc) + timedelta(hours=1), "type": "access"}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def create_refresh_token(user_id: str) -> str:
    payload = {"sub": user_id, "exp": datetime.now(timezone.utc) + timedelta(days=7), "type": "refresh"}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def get_admin_user(request: Request) -> dict:
    user = await get_current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

async def get_user_or_guest(request: Request) -> tuple:
    """Returns (identifier, is_guest, user_data). Works with auth OR X-Guest-ID header."""
    try:
        user = await get_current_user(request)
        return user["id"], False, user
    except Exception:
        guest_id = request.headers.get("X-Guest-ID", "")
        if not guest_id:
            raise HTTPException(status_code=401, detail="Login atau gunakan guest mode")
        return f"guest_{guest_id}", True, None

# ============ OBJECT STORAGE ============

storage_key = None

def init_storage():
    global storage_key
    if storage_key:
        return storage_key
    if not EMERGENT_KEY:
        return None
    try:
        resp = http_requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
        resp.raise_for_status()
        storage_key = resp.json()["storage_key"]
        logger.info("Storage initialized")
        return storage_key
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
        return None

def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    if not key:
        raise HTTPException(status_code=500, detail="Storage not available")
    resp = http_requests.put(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key, "Content-Type": content_type}, data=data, timeout=120)
    resp.raise_for_status()
    return resp.json()

def get_object(path: str):
    key = init_storage()
    if not key:
        raise HTTPException(status_code=500, detail="Storage not available")
    resp = http_requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")

# ============ BRUTE FORCE ============

async def check_brute_force(identifier: str):
    record = await db.login_attempts.find_one({"identifier": identifier}, {"_id": 0})
    if record and record.get("attempts", 0) >= 5:
        last = datetime.fromisoformat(record["last_attempt"])
        if datetime.now(timezone.utc) - last < timedelta(minutes=15):
            raise HTTPException(status_code=429, detail="Terlalu banyak percobaan. Coba lagi dalam 15 menit.")
        else:
            await db.login_attempts.delete_one({"identifier": identifier})

async def record_failed_attempt(identifier: str):
    await db.login_attempts.update_one({"identifier": identifier}, {"$inc": {"attempts": 1}, "$set": {"last_attempt": datetime.now(timezone.utc).isoformat()}}, upsert=True)

async def clear_failed_attempts(identifier: str):
    await db.login_attempts.delete_one({"identifier": identifier})

# ============ AUTH ROUTES ============

@api_router.post("/auth/register")
async def register(data: UserRegister, response: Response):
    email = data.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email sudah terdaftar")
    user_id = str(uuid.uuid4())
    await db.users.insert_one({
        "id": user_id, "email": email, "password_hash": hash_password(data.password),
        "name": data.name, "phone": data.phone, "role": "user",
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    access_token = create_access_token(user_id, email)
    refresh_token = create_refresh_token(user_id)
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=False, samesite="lax", max_age=3600, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=False, samesite="lax", max_age=604800, path="/")
    return {"id": user_id, "email": email, "name": data.name, "phone": data.phone, "role": "user"}

@api_router.post("/auth/login")
async def login(data: UserLogin, request: Request, response: Response):
    email = data.email.lower().strip()
    identifier = f"{request.client.host}:{email}"
    await check_brute_force(identifier)
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user or not verify_password(data.password, user["password_hash"]):
        await record_failed_attempt(identifier)
        raise HTTPException(status_code=401, detail="Email atau password salah")
    await clear_failed_attempts(identifier)
    access_token = create_access_token(user["id"], email)
    refresh_token = create_refresh_token(user["id"])
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=False, samesite="lax", max_age=3600, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=False, samesite="lax", max_age=604800, path="/")
    return {"id": user["id"], "email": user["email"], "name": user["name"], "phone": user.get("phone", ""), "role": user["role"]}

@api_router.post("/auth/admin-login")
async def admin_login(data: AdminLogin, request: Request, response: Response):
    """Dedicated admin login using username + password."""
    username = data.username.strip()
    identifier = f"{request.client.host}:admin:{username}"
    await check_brute_force(identifier)
    user = await db.users.find_one({"username": username, "role": "admin"}, {"_id": 0})
    if not user or not verify_password(data.password, user["password_hash"]):
        await record_failed_attempt(identifier)
        raise HTTPException(status_code=401, detail="Username atau password salah")
    await clear_failed_attempts(identifier)
    access_token = create_access_token(user["id"], user.get("email", username))
    refresh_token = create_refresh_token(user["id"])
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=False, samesite="lax", max_age=3600, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=False, samesite="lax", max_age=604800, path="/")
    return {"id": user["id"], "username": user.get("username", username), "email": user.get("email", ""), "name": user.get("name", "Admin"), "role": user["role"]}

@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"message": "Berhasil logout"}

@api_router.get("/auth/me")
async def get_me(request: Request):
    return await get_current_user(request)

@api_router.post("/auth/refresh")
async def refresh(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        new_access = create_access_token(user["id"], user["email"])
        response.set_cookie(key="access_token", value=new_access, httponly=True, secure=False, samesite="lax", max_age=3600, path="/")
        return {"message": "Token refreshed"}
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Refresh token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

# ============ CATEGORIES ============

@api_router.get("/categories")
async def list_categories():
    return await db.categories.find({"is_active": True}, {"_id": 0}).sort("name", 1).to_list(100)

@api_router.get("/categories/all")
async def list_all_categories(request: Request):
    await get_admin_user(request)
    return await db.categories.find({}, {"_id": 0}).sort("name", 1).to_list(100)

@api_router.post("/categories")
async def create_category(data: CategoryCreate, request: Request):
    await get_admin_user(request)
    doc = {
        "id": str(uuid.uuid4()), "name": data.name,
        "slug": data.name.lower().replace(" ", "-").replace("&", "dan"),
        "description": data.description, "image_url": data.image_url,
        "is_active": True, "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.categories.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.put("/categories/{cat_id}")
async def update_category(cat_id: str, data: CategoryUpdate, request: Request):
    await get_admin_user(request)
    update = {k: v for k, v in data.model_dump().items() if v is not None}
    if "name" in update:
        update["slug"] = update["name"].lower().replace(" ", "-").replace("&", "dan")
    if update:
        await db.categories.update_one({"id": cat_id}, {"$set": update})
    return await db.categories.find_one({"id": cat_id}, {"_id": 0})

@api_router.delete("/categories/{cat_id}")
async def delete_category(cat_id: str, request: Request):
    await get_admin_user(request)
    await db.categories.update_one({"id": cat_id}, {"$set": {"is_active": False}})
    return {"message": "Kategori dinonaktifkan"}

# ============ PRODUCTS ============

@api_router.get("/products")
async def list_products(category: str = None, search: str = None, page: int = 1, limit: int = 20):
    query = {"is_active": True}
    if category:
        query["category_id"] = category
    if search:
        query["name"] = {"$regex": search, "$options": "i"}
    skip = (page - 1) * limit
    total = await db.products.count_documents(query)
    products = await db.products.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    return {"products": products, "total": total, "page": page, "pages": max(1, (total + limit - 1) // limit)}

@api_router.get("/products/{product_id}")
async def get_product(product_id: str):
    product = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Produk tidak ditemukan")
    if product.get("category_id"):
        cat = await db.categories.find_one({"id": product["category_id"]}, {"_id": 0})
        if cat:
            product["category_name"] = cat["name"]
            product["category_slug"] = cat["slug"]
    return product

@api_router.post("/products")
async def create_product(data: ProductCreate, request: Request):
    await get_admin_user(request)
    variants_list = [v.model_dump() for v in data.variants] if data.variants else []
    # If variants exist, set base price = min variant price (so list views still show a price)
    base_price = data.price
    if variants_list:
        prices = [v["price"] for v in variants_list if v.get("price")]
        if prices:
            base_price = min(prices)
    doc = {
        "id": str(uuid.uuid4()), "name": data.name, "description": data.description,
        "price": base_price, "stock": data.stock, "category_id": data.category_id,
        "images": data.images, "is_active": True,
        "variants": variants_list,
        "weight": int(data.weight or 0),
        "packaging_weight": int(data.packaging_weight or 0),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.products.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.put("/products/{product_id}")
async def update_product(product_id: str, data: ProductUpdate, request: Request):
    await get_admin_user(request)
    update = {k: v for k, v in data.model_dump().items() if v is not None}
    if "variants" in update:
        # Convert pydantic objects (already dicts via model_dump) and recompute base price
        variants_list = update["variants"]
        update["variants"] = variants_list
        if variants_list:
            prices = [v["price"] for v in variants_list if v.get("price")]
            if prices:
                update["price"] = min(prices)
    if update:
        await db.products.update_one({"id": product_id}, {"$set": update})
    return await db.products.find_one({"id": product_id}, {"_id": 0})

@api_router.delete("/products/{product_id}")
async def delete_product(product_id: str, request: Request):
    await get_admin_user(request)
    await db.products.update_one({"id": product_id}, {"$set": {"is_active": False}})
    return {"message": "Produk dinonaktifkan"}

# ============ CART ============

@api_router.get("/cart")
async def get_cart(request: Request):
    user_id, is_guest, _ = await get_user_or_guest(request)
    cart = await db.carts.find_one({"user_id": user_id}, {"_id": 0})
    if not cart:
        return {"items": [], "total": 0, "total_weight": 0}
    populated = []
    total = 0
    total_weight = 0
    for item in cart.get("items", []):
        product = await db.products.find_one({"id": item["product_id"], "is_active": True}, {"_id": 0})
        if product:
            # Determine effective price based on variant
            variant_name = item.get("variant_name")
            unit_price = product["price"]
            if variant_name and product.get("variants"):
                v = next((x for x in product["variants"] if x.get("name") == variant_name), None)
                if v:
                    unit_price = v.get("price", unit_price)
            unit_weight = (product.get("weight", 0) or 0) + (product.get("packaging_weight", 0) or 0)
            populated.append({
                "product_id": item["product_id"], "quantity": item["quantity"],
                "variant_name": variant_name or "",
                "name": product["name"], "price": unit_price,
                "image": product["images"][0] if product.get("images") else "",
                "stock": product["stock"],
                "weight": unit_weight,
            })
            total += unit_price * item["quantity"]
            total_weight += unit_weight * item["quantity"]
    return {"items": populated, "total": total, "total_weight": total_weight}

@api_router.post("/cart/add")
async def add_to_cart(data: CartItem, request: Request):
    user_id, is_guest, _ = await get_user_or_guest(request)
    product = await db.products.find_one({"id": data.product_id, "is_active": True})
    if not product:
        raise HTTPException(status_code=404, detail="Produk tidak ditemukan")
    # Validate variant if provided
    variant_name = data.variant_name or None
    if variant_name and product.get("variants"):
        if not any(v.get("name") == variant_name for v in product["variants"]):
            raise HTTPException(status_code=400, detail="Variasi tidak valid")
    cart = await db.carts.find_one({"user_id": user_id})
    new_item = {"product_id": data.product_id, "quantity": data.quantity, "variant_name": variant_name}
    if not cart:
        await db.carts.insert_one({"user_id": user_id, "items": [new_item], "updated_at": datetime.now(timezone.utc).isoformat()})
    else:
        existing = next((i for i in cart["items"] if i["product_id"] == data.product_id and (i.get("variant_name") or None) == variant_name), None)
        if existing:
            existing["quantity"] += data.quantity
            await db.carts.update_one({"user_id": user_id}, {"$set": {"items": cart["items"], "updated_at": datetime.now(timezone.utc).isoformat()}})
        else:
            await db.carts.update_one({"user_id": user_id}, {"$push": {"items": new_item}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}})
    return {"message": "Ditambahkan ke keranjang"}

@api_router.put("/cart/update")
async def update_cart_item(data: CartItem, request: Request):
    user_id, is_guest, _ = await get_user_or_guest(request)
    variant_name = data.variant_name or None
    cart = await db.carts.find_one({"user_id": user_id})
    if not cart:
        return {"message": "Keranjang kosong"}
    if data.quantity <= 0:
        new_items = [i for i in cart["items"] if not (i["product_id"] == data.product_id and (i.get("variant_name") or None) == variant_name)]
    else:
        new_items = []
        for i in cart["items"]:
            if i["product_id"] == data.product_id and (i.get("variant_name") or None) == variant_name:
                i["quantity"] = data.quantity
            new_items.append(i)
    await db.carts.update_one({"user_id": user_id}, {"$set": {"items": new_items, "updated_at": datetime.now(timezone.utc).isoformat()}})
    return {"message": "Keranjang diperbarui"}

@api_router.delete("/cart/remove/{product_id}")
async def remove_from_cart(product_id: str, request: Request, variant: str = ""):
    user_id, is_guest, _ = await get_user_or_guest(request)
    variant_name = variant or None
    cart = await db.carts.find_one({"user_id": user_id})
    if not cart:
        return {"message": "Keranjang kosong"}
    new_items = [i for i in cart["items"] if not (i["product_id"] == product_id and (i.get("variant_name") or None) == variant_name)]
    await db.carts.update_one({"user_id": user_id}, {"$set": {"items": new_items, "updated_at": datetime.now(timezone.utc).isoformat()}})
    return {"message": "Dihapus dari keranjang"}

@api_router.delete("/cart/clear")
async def clear_cart(request: Request):
    user_id, is_guest, _ = await get_user_or_guest(request)
    await db.carts.delete_one({"user_id": user_id})
    return {"message": "Keranjang dikosongkan"}

@api_router.post("/cart/merge")
async def merge_cart(request: Request):
    """Merge guest cart into authenticated user cart after login."""
    user = await get_current_user(request)
    guest_id = request.headers.get("X-Guest-ID", "")
    if not guest_id:
        return {"message": "No guest cart to merge"}
    guest_cart = await db.carts.find_one({"user_id": f"guest_{guest_id}"})
    if not guest_cart or not guest_cart.get("items"):
        return {"message": "Guest cart empty"}
    user_cart = await db.carts.find_one({"user_id": user["id"]})
    if not user_cart:
        await db.carts.insert_one({"user_id": user["id"], "items": guest_cart["items"], "updated_at": datetime.now(timezone.utc).isoformat()})
    else:
        for item in guest_cart["items"]:
            existing = next((i for i in user_cart["items"] if i["product_id"] == item["product_id"]), None)
            if existing:
                existing["quantity"] += item["quantity"]
            else:
                user_cart["items"].append(item)
        await db.carts.update_one({"user_id": user["id"]}, {"$set": {"items": user_cart["items"], "updated_at": datetime.now(timezone.utc).isoformat()}})
    await db.carts.delete_one({"user_id": f"guest_{guest_id}"})
    return {"message": "Cart merged"}

# ============ WISHLIST ============

@api_router.get("/wishlist")
async def get_wishlist(request: Request):
    user = await get_current_user(request)
    wishlist = await db.wishlists.find_one({"user_id": user["id"]}, {"_id": 0})
    if not wishlist:
        return {"products": []}
    products = []
    for pid in wishlist.get("product_ids", []):
        product = await db.products.find_one({"id": pid, "is_active": True}, {"_id": 0})
        if product:
            products.append(product)
    return {"products": products}

@api_router.post("/wishlist/toggle/{product_id}")
async def toggle_wishlist(product_id: str, request: Request):
    user = await get_current_user(request)
    wishlist = await db.wishlists.find_one({"user_id": user["id"]})
    if not wishlist:
        await db.wishlists.insert_one({"user_id": user["id"], "product_ids": [product_id]})
        return {"in_wishlist": True}
    if product_id in wishlist.get("product_ids", []):
        await db.wishlists.update_one({"user_id": user["id"]}, {"$pull": {"product_ids": product_id}})
        return {"in_wishlist": False}
    await db.wishlists.update_one({"user_id": user["id"]}, {"$push": {"product_ids": product_id}})
    return {"in_wishlist": True}

@api_router.get("/wishlist/check/{product_id}")
async def check_wishlist(product_id: str, request: Request):
    try:
        user = await get_current_user(request)
        wishlist = await db.wishlists.find_one({"user_id": user["id"]})
        return {"in_wishlist": bool(wishlist and product_id in wishlist.get("product_ids", []))}
    except Exception:
        return {"in_wishlist": False}

# ============ ORDERS ============

@api_router.post("/orders")
async def create_order(data: OrderCreateV2, request: Request):
    user_id, is_guest, user_data = await get_user_or_guest(request)
    cart = await db.carts.find_one({"user_id": user_id}, {"_id": 0})
    if not cart or not cart.get("items"):
        raise HTTPException(status_code=400, detail="Keranjang kosong")
    order_items = []
    subtotal = 0
    total_weight = 0
    for item in cart["items"]:
        product = await db.products.find_one({"id": item["product_id"], "is_active": True}, {"_id": 0})
        if not product:
            raise HTTPException(status_code=400, detail="Produk tidak tersedia")
        if product["stock"] < item["quantity"]:
            raise HTTPException(status_code=400, detail=f"Stok {product['name']} tidak mencukupi")
        # Variant-aware pricing
        variant_name = item.get("variant_name") or ""
        unit_price = product["price"]
        if variant_name and product.get("variants"):
            v = next((x for x in product["variants"] if x.get("name") == variant_name), None)
            if v:
                unit_price = v.get("price", unit_price)
        unit_weight = (product.get("weight", 0) or 0) + (product.get("packaging_weight", 0) or 0)
        order_items.append({
            "product_id": item["product_id"], "name": product["name"],
            "variant_name": variant_name,
            "price": unit_price, "quantity": item["quantity"],
            "image": product["images"][0] if product.get("images") else "",
            "weight": unit_weight,
        })
        subtotal += unit_price * item["quantity"]
        total_weight += unit_weight * item["quantity"]
    shipping_cost = int(data.shipping_cost or 0)
    total = subtotal + shipping_cost
    order_id = str(uuid.uuid4())
    order_doc = {
        "id": order_id, "user_id": user_id, "is_guest": is_guest,
        "user_email": data.shipping_email if is_guest else (user_data.get("email", "") if user_data else ""),
        "user_name": data.shipping_name, "items": order_items,
        "subtotal": subtotal, "shipping_cost": shipping_cost, "total": total,
        "total_weight": total_weight,
        "status": "pending_payment", "payment_method": data.payment_method,
        "payment_proof": "", "shipping_name": data.shipping_name,
        "shipping_phone": data.shipping_phone, "shipping_address": data.shipping_address,
        "shipping_email": data.shipping_email,
        "shipping_destination_id": data.shipping_destination_id,
        "shipping_destination_label": data.shipping_destination_label or "",
        "shipping_courier": (data.shipping_courier or "").upper(),
        "shipping_service": data.shipping_service or "",
        "shipping_etd": data.shipping_etd or "",
        "notes": data.notes, "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    await db.orders.insert_one(order_doc)
    for item in cart["items"]:
        await db.products.update_one({"id": item["product_id"]}, {"$inc": {"stock": -item["quantity"]}})
    await db.carts.delete_one({"user_id": user_id})
    order_doc.pop("_id", None)
    return order_doc

@api_router.get("/orders")
async def get_user_orders(request: Request):
    user = await get_current_user(request)
    return await db.orders.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)

@api_router.get("/orders/{order_id}")
async def get_order(order_id: str, request: Request):
    user_id, is_guest, _ = await get_user_or_guest(request)
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Pesanan tidak ditemukan")
    if order["user_id"] != user_id:
        # Also allow admin access
        try:
            admin = await get_admin_user(request)
        except Exception:
            raise HTTPException(status_code=403, detail="Akses ditolak")
    return order

@api_router.post("/orders/{order_id}/payment-proof")
async def upload_payment_proof(order_id: str, request: Request, file: UploadFile = File(...)):
    user_id, is_guest, _ = await get_user_or_guest(request)
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Pesanan tidak ditemukan")
    if order["user_id"] != user_id:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    ext = file.filename.split(".")[-1] if "." in file.filename else "jpg"
    storage_path = f"{APP_NAME}/payment-proofs/{user_id}/{uuid.uuid4()}.{ext}"
    data = await file.read()
    try:
        result = put_object(storage_path, data, file.content_type or "image/jpeg")
        proof_path = result["path"]
    except Exception as e:
        logger.error(f"Upload failed: {e}")
        raise HTTPException(status_code=500, detail="Upload gagal")
    await db.orders.update_one({"id": order_id}, {"$set": {"payment_proof": proof_path, "status": "payment_uploaded", "updated_at": datetime.now(timezone.utc).isoformat()}})
    return {"message": "Bukti pembayaran diunggah", "path": proof_path}

# ============ FILE ROUTES ============

@api_router.post("/upload")
async def upload_file(request: Request, file: UploadFile = File(...)):
    await get_admin_user(request)
    ext = file.filename.split(".")[-1] if "." in file.filename else "bin"
    storage_path = f"{APP_NAME}/uploads/{uuid.uuid4()}.{ext}"
    data = await file.read()
    try:
        result = put_object(storage_path, data, file.content_type or "application/octet-stream")
        return {"path": result["path"], "url": f"/api/files/{result['path']}"}
    except Exception as e:
        logger.error(f"Upload failed: {e}")
        raise HTTPException(status_code=500, detail="Upload gagal")

@api_router.get("/files/{path:path}")
async def serve_file(path: str):
    try:
        data, content_type = get_object(path)
        return Response(content=data, media_type=content_type)
    except Exception as e:
        logger.error(f"File serve failed: {e}")
        raise HTTPException(status_code=404, detail="File tidak ditemukan")

# ============ ADMIN ============

@api_router.get("/admin/stats")
async def admin_stats(request: Request):
    await get_admin_user(request)
    total_products = await db.products.count_documents({"is_active": True})
    total_orders = await db.orders.count_documents({})
    total_users = await db.users.count_documents({"role": "user"})
    pending_orders = await db.orders.count_documents({"status": {"$in": ["pending_payment", "payment_uploaded"]}})
    pipeline = [{"$match": {"status": {"$in": ["confirmed", "processing", "shipped", "delivered"]}}}, {"$group": {"_id": None, "total": {"$sum": "$total"}}}]
    result = await db.orders.aggregate(pipeline).to_list(1)
    revenue = result[0]["total"] if result else 0
    return {"total_products": total_products, "total_orders": total_orders, "total_users": total_users, "pending_orders": pending_orders, "revenue": revenue}

@api_router.get("/admin/dashboard")
async def admin_dashboard(request: Request):
    """Dashboard summary: total products, today's orders, this month's revenue."""
    await get_admin_user(request)
    now = datetime.now(timezone.utc)
    today_start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
    month_start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)

    total_products = await db.products.count_documents({"is_active": True})
    orders_today = await db.orders.count_documents({"created_at": {"$gte": today_start.isoformat()}})

    pipeline = [
        {"$match": {
            "status": {"$in": ["confirmed", "processing", "shipped", "delivered"]},
            "created_at": {"$gte": month_start.isoformat()}
        }},
        {"$group": {"_id": None, "total": {"$sum": "$total"}}}
    ]
    res = await db.orders.aggregate(pipeline).to_list(1)
    revenue_month = res[0]["total"] if res else 0

    pending_orders = await db.orders.count_documents({"status": {"$in": ["pending_payment", "payment_uploaded"]}})

    return {
        "total_products": total_products,
        "orders_today": orders_today,
        "revenue_month": revenue_month,
        "pending_orders": pending_orders,
        "month_label": now.strftime("%B %Y"),
    }

@api_router.get("/admin/orders")
async def admin_orders(request: Request, status: str = None, page: int = 1, limit: int = 20):
    await get_admin_user(request)
    query = {}
    if status:
        query["status"] = status
    skip = (page - 1) * limit
    total = await db.orders.count_documents(query)
    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    return {"orders": orders, "total": total, "page": page, "pages": max(1, (total + limit - 1) // limit)}

@api_router.put("/admin/orders/{order_id}/status")
async def admin_update_order_status(order_id: str, data: OrderStatusUpdate, request: Request):
    await get_admin_user(request)
    valid = ["pending_payment", "payment_uploaded", "confirmed", "processing", "shipped", "delivered", "cancelled"]
    if data.status not in valid:
        raise HTTPException(status_code=400, detail="Status tidak valid")
    await db.orders.update_one({"id": order_id}, {"$set": {"status": data.status, "updated_at": datetime.now(timezone.utc).isoformat()}})
    return await db.orders.find_one({"id": order_id}, {"_id": 0})

@api_router.get("/admin/products")
async def admin_products(request: Request, page: int = 1, limit: int = 50, search: str = "", missing_images: bool = False):
    await get_admin_user(request)
    query = {}
    if search:
        query["name"] = {"$regex": search, "$options": "i"}
    if missing_images:
        query["$or"] = [{"images": {"$exists": False}}, {"images": {"$size": 0}}]
    skip = (page - 1) * limit
    total = await db.products.count_documents(query)
    products = await db.products.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    return {"products": products, "total": total, "page": page, "pages": max(1, (total + limit - 1) // limit)}

# ============ AI IMAGE GENERATION (Gemini Nano Banana) ============

async def _generate_product_image(product: dict) -> Optional[str]:
    """Generate a product image using Gemini and save it to storage. Returns storage path or None."""
    if not EMERGENT_KEY:
        raise HTTPException(status_code=503, detail="EMERGENT_LLM_KEY belum dikonfigurasi")
    name = product.get("name", "")
    if not name:
        return None
    prompt = (
        f"Professional product photography of '{name}'. "
        f"This is an Indonesian plant/flower e-commerce product. "
        f"Clean minimalist white background, soft natural daylight from the left, "
        f"sharp focus on the plant, high resolution, centered composition, "
        f"realistic e-commerce style, square 1:1 aspect ratio, "
        f"no text, no watermarks, no humans, no extra props."
    )
    try:
        chat = LlmChat(api_key=EMERGENT_KEY, session_id=f"img-{product['id']}", system_message="You are a product photographer assistant.")
        chat.with_model("gemini", "gemini-3.1-flash-image-preview").with_params(modalities=["image", "text"])
        msg = LlmUserMessage(text=prompt)
        _, images = await chat.send_message_multimodal_response(msg)
        if not images:
            return None
        img = images[0]
        image_bytes = base64.b64decode(img["data"])
        ext = "png" if "png" in img.get("mime_type", "") else "jpg"
        storage_path = f"{APP_NAME}/ai-images/{product['id']}.{ext}"
        result = put_object(storage_path, image_bytes, img.get("mime_type", "image/png"))
        return result["path"]
    except Exception as e:
        logger.error(f"AI image gen failed for {product.get('id')}: {e}")
        return None

@api_router.post("/admin/products/{product_id}/generate-image")
async def admin_generate_product_image(product_id: str, request: Request):
    await get_admin_user(request)
    product = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Produk tidak ditemukan")
    path = await _generate_product_image(product)
    if not path:
        raise HTTPException(status_code=500, detail="Gagal generate gambar")
    # Replace images array with single AI image (admin can add more manually later)
    new_images = [path] + [i for i in (product.get("images") or []) if i != path]
    await db.products.update_one({"id": product_id}, {"$set": {"images": new_images}})
    return {"image_path": path, "image_url": f"/api/files/{path}"}

@api_router.post("/admin/products/generate-images-bulk")
async def admin_generate_images_bulk(request: Request, limit: int = 5):
    """Generate AI images for up to `limit` products that currently have no images.
    Returns counts so the frontend can call this in a loop until done."""
    await get_admin_user(request)
    limit = max(1, min(int(limit or 5), 10))  # safety: 1..10 per call
    cursor = db.products.find(
        {"is_active": True, "$or": [{"images": {"$exists": False}}, {"images": {"$size": 0}}]},
        {"_id": 0},
    ).limit(limit)
    products = await cursor.to_list(limit)
    remaining = await db.products.count_documents(
        {"is_active": True, "$or": [{"images": {"$exists": False}}, {"images": {"$size": 0}}]}
    )
    success = 0
    failed = 0
    results = []
    for p in products:
        path = await _generate_product_image(p)
        if path:
            await db.products.update_one({"id": p["id"]}, {"$set": {"images": [path]}})
            success += 1
            results.append({"id": p["id"], "name": p["name"], "ok": True, "path": path})
        else:
            failed += 1
            results.append({"id": p["id"], "name": p["name"], "ok": False})
    # Recount after processing
    remaining_after = await db.products.count_documents(
        {"is_active": True, "$or": [{"images": {"$exists": False}}, {"images": {"$size": 0}}]}
    )
    return {
        "processed": len(products),
        "success": success,
        "failed": failed,
        "remaining": remaining_after,
        "remaining_before": remaining,
        "results": results,
    }

# ============ SHIPPING (RajaOngkir/Komerce) ============

def _rajaongkir_headers():
    return {"key": RAJAONGKIR_API_KEY}

@api_router.get("/shipping/destination")
async def shipping_search_destination(search: str = "", limit: int = 20):
    """Search Indonesian destinations by keyword (province/city/district/subdistrict).
    Uses Komerce v1 search-base endpoint, returns rows with full label and id."""
    if not RAJAONGKIR_API_KEY:
        raise HTTPException(status_code=503, detail="Shipping API belum dikonfigurasi")
    if not search or len(search.strip()) < 3:
        return {"data": []}
    try:
        url = f"{RAJAONGKIR_BASE_URL}/destination/domestic-destination"
        resp = http_requests.get(url, headers=_rajaongkir_headers(), params={"search": search.strip(), "limit": limit, "offset": 0}, timeout=15)
        if resp.status_code != 200:
            logger.error(f"RajaOngkir search err {resp.status_code}: {resp.text[:200]}")
            raise HTTPException(status_code=502, detail="Gagal mencari lokasi")
        body = resp.json()
        rows = body.get("data") or []
        # Normalize into id + label
        results = []
        for r in rows:
            label = ", ".join([str(r.get(k, "")) for k in ["subdistrict_name", "district_name", "city_name", "province_name", "zip_code"] if r.get(k)])
            results.append({
                "id": r.get("id"),
                "label": label,
                "subdistrict_name": r.get("subdistrict_name", ""),
                "district_name": r.get("district_name", ""),
                "city_name": r.get("city_name", ""),
                "province_name": r.get("province_name", ""),
                "zip_code": r.get("zip_code", ""),
            })
        return {"data": results}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Shipping search failed: {e}")
        raise HTTPException(status_code=502, detail="Gagal mencari lokasi")

@api_router.post("/shipping/cost")
async def shipping_cost(data: ShippingCostRequest):
    """Calculate domestic shipping cost via Komerce v1 (search-base)."""
    if not RAJAONGKIR_API_KEY:
        raise HTTPException(status_code=503, detail="Shipping API belum dikonfigurasi")
    if data.weight <= 0:
        raise HTTPException(status_code=400, detail="Berat harus lebih dari 0 gram")
    try:
        url = f"{RAJAONGKIR_BASE_URL}/calculate/domestic-cost"
        payload = {
            "origin": str(data.origin),
            "destination": str(data.destination),
            "weight": str(data.weight),
            "courier": data.courier,
            "price": data.price,
        }
        resp = http_requests.post(
            url,
            headers={"key": RAJAONGKIR_API_KEY, "Content-Type": "application/x-www-form-urlencoded"},
            data=payload, timeout=20,
        )
        if resp.status_code != 200:
            logger.error(f"RajaOngkir cost err {resp.status_code}: {resp.text[:300]}")
            raise HTTPException(status_code=502, detail="Gagal menghitung ongkir")
        body = resp.json()
        services = []
        for row in (body.get("data") or []):
            services.append({
                "courier": (row.get("code") or row.get("name") or "").upper(),
                "service": row.get("service", ""),
                "description": row.get("description", ""),
                "cost": int(row.get("cost", 0) or 0),
                "etd": row.get("etd", ""),
            })
        return {"services": services}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Shipping cost failed: {e}")
        raise HTTPException(status_code=502, detail="Gagal menghitung ongkir")

@api_router.get("/shipping/origin")
async def shipping_origin():
    """Public endpoint returning the store's configured origin (id + label)."""
    settings = await db.settings.find_one({"type": "store"}, {"_id": 0}) or {}
    return {
        "origin_id": settings.get("origin_id"),
        "origin_label": settings.get("origin_label", ""),
    }

# ============ SETTINGS ============

@api_router.get("/settings")
async def get_settings():
    settings = await db.settings.find_one({"type": "store"}, {"_id": 0})
    if not settings:
        return {"bank_name": "BCA", "account_number": "1234567890", "account_holder": "Almira Florist", "qris_image": ""}
    return settings

@api_router.put("/settings")
async def update_settings(data: StoreSettingsUpdate, request: Request):
    await get_admin_user(request)
    update = {k: v for k, v in data.model_dump().items() if v is not None}
    if update:
        update["type"] = "store"
        await db.settings.update_one({"type": "store"}, {"$set": update}, upsert=True)
    return await db.settings.find_one({"type": "store"}, {"_id": 0})

# ============ CHATBOT ============

@api_router.post("/chat")
async def chat_endpoint(data: ChatRequest):
    session_id = data.session_id or str(uuid.uuid4())
    try:
        products = await db.products.find({"is_active": True}, {"_id": 0, "name": 1, "price": 1, "description": 1, "stock": 1, "category_id": 1}).to_list(50)
        categories = await db.categories.find({"is_active": True}, {"_id": 0, "name": 1, "id": 1}).to_list(20)
        settings = await db.settings.find_one({"type": "store"}, {"_id": 0}) or {}

        cat_map = {c["id"]: c["name"] for c in categories}
        product_list = "\n".join([f"- {p['name']} (Rp {p['price']:,}, {cat_map.get(p.get('category_id',''),'')}, Stok: {p['stock']})" for p in products])
        bank_info = f"{settings.get('bank_name','BCA')} - {settings.get('account_number','1234567890')} a.n. {settings.get('account_holder','Almira Florist')}"

        history = await db.chat_messages.find({"session_id": session_id}, {"_id": 0}).sort("created_at", 1).to_list(20)
        history_str = ""
        for msg in history[-10:]:
            role = "Customer" if msg["role"] == "user" else "Almira"
            history_str += f"{role}: {msg['content']}\n"

        system_msg = f"""Kamu adalah asisten penjualan BeliBunga.com (powered by Almira Florist), toko tanaman hias dan bunga online.

ATURAN:
- Jawab ramah, hangat, natural dalam Bahasa Indonesia
- JANGAN pernah bilang kamu AI/robot. Kamu asisten BeliBunga.com
- Arahkan percakapan menuju pembelian (closing)
- Rekomendasikan produk sesuai kebutuhan customer
- Jawab singkat (2-3 kalimat), kecuali diminta detail
- Gunakan emoji sesekali

INFO TOKO:
- WhatsApp Admin: 087784841084
- Pembayaran: Transfer Bank ({bank_info}) atau QRIS
- Customer bisa langsung belanja di website belibunga.com

KATALOG PRODUK:
{product_list}

{f"RIWAYAT CHAT:{chr(10)}{history_str}" if history_str else "Ini pesan pertama. Sapa hangat dan tanyakan apa yang dicari."}

Bantu customer menemukan tanaman/bunga yang tepat dan dorong untuk membeli."""

        chat = LlmChat(api_key=EMERGENT_KEY, session_id=f"almira-{session_id}", system_message=system_msg)
        chat.with_model("openai", "gpt-4.1-mini")
        response = await chat.send_message(LlmUserMessage(text=data.message))

        now = datetime.now(timezone.utc).isoformat()
        await db.chat_messages.insert_many([
            {"session_id": session_id, "role": "user", "content": data.message, "created_at": now},
            {"session_id": session_id, "role": "assistant", "content": response, "created_at": now}
        ])
        return {"reply": response, "session_id": session_id}
    except Exception as e:
        logger.error(f"Chat error: {e}")
        return {"reply": "Maaf, saya sedang mengalami gangguan teknis. Silakan hubungi kami via WhatsApp di 087784841084 ya!", "session_id": session_id}

# ============ SETUP ============

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.categories.create_index("id", unique=True)
    await db.products.create_index("id")
    await db.orders.create_index("id")
    await db.login_attempts.create_index("identifier")
    try:
        init_storage()
    except Exception as e:
        logger.error(f"Storage init: {e}")
    await seed_data()
    try:
        os.makedirs("/app/memory", exist_ok=True)
        with open("/app/memory/test_credentials.md", "w") as f:
            f.write(f"# Test Credentials\n\n## Admin Panel Login (/admin/login)\n- Username: {ADMIN_USERNAME}\n- Password: {ADMIN_PANEL_PASSWORD}\n- Endpoint: POST /api/auth/admin-login\n\n## Admin (Email-based, fallback)\n- Email: {ADMIN_EMAIL}\n- Password: {ADMIN_PANEL_PASSWORD}\n- Role: admin\n\n## Auth Endpoints\n- POST /api/auth/login (email-based)\n- POST /api/auth/admin-login (username-based)\n- POST /api/auth/register\n- POST /api/auth/logout\n- GET /api/auth/me\n")
    except Exception as e:
        logger.error(f"Credentials file: {e}")

async def seed_data():
    admin_email = ADMIN_EMAIL.lower()
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({"id": str(uuid.uuid4()), "email": admin_email, "username": ADMIN_USERNAME, "password_hash": hash_password(ADMIN_PASSWORD), "name": "Admin", "phone": "087784841084", "role": "admin", "created_at": datetime.now(timezone.utc).isoformat()})
        logger.info(f"Admin seeded: {admin_email} (username: {ADMIN_USERNAME})")
    elif not verify_password(ADMIN_PASSWORD, existing["password_hash"]):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(ADMIN_PASSWORD), "username": ADMIN_USERNAME}})

    # Ensure admin has username + admin-panel password
    await db.users.update_one(
        {"email": admin_email},
        {"$set": {"username": ADMIN_USERNAME}}
    )
    # Use ADMIN_PANEL_PASSWORD for the admin panel login (username-based)
    admin_user = await db.users.find_one({"email": admin_email})
    if admin_user and not verify_password(ADMIN_PANEL_PASSWORD, admin_user["password_hash"]):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(ADMIN_PANEL_PASSWORD)}})
        logger.info("Admin panel password updated")

    # Ensure unique username index for admin
    try:
        await db.users.create_index("username", unique=True, sparse=True)
    except Exception:
        pass
    if await db.categories.count_documents({}) == 0:
        await db.categories.insert_many([
            {"id": "cat-indoor", "name": "Tanaman Indoor", "slug": "tanaman-indoor", "description": "Tanaman hias untuk dalam ruangan", "image_url": "https://images.unsplash.com/photo-1604762526063-07244a385cdf?w=400&fit=crop", "is_active": True, "created_at": datetime.now(timezone.utc).isoformat()},
            {"id": "cat-outdoor", "name": "Tanaman Outdoor", "slug": "tanaman-outdoor", "description": "Tanaman untuk taman dan halaman", "image_url": "https://images.unsplash.com/photo-1679732747686-33e60fb370a6?w=400&fit=crop", "is_active": True, "created_at": datetime.now(timezone.utc).isoformat()},
            {"id": "cat-kaktus", "name": "Kaktus & Sukulen", "slug": "kaktus-sukulen", "description": "Koleksi kaktus dan sukulen cantik", "image_url": "https://images.unsplash.com/photo-1621512366232-0b7b78983782?w=400&fit=crop", "is_active": True, "created_at": datetime.now(timezone.utc).isoformat()},
            {"id": "cat-bunga", "name": "Bunga", "slug": "bunga", "description": "Rangkaian bunga segar dan indah", "image_url": "https://images.unsplash.com/photo-1771134572111-967700a8bb31?w=400&fit=crop", "is_active": True, "created_at": datetime.now(timezone.utc).isoformat()},
            {"id": "cat-pot", "name": "Pot & Aksesoris", "slug": "pot-aksesoris", "description": "Pot dan aksesoris tanaman", "image_url": "https://images.unsplash.com/photo-1654609678730-d241a2b2eb8d?w=400&fit=crop", "is_active": True, "created_at": datetime.now(timezone.utc).isoformat()},
        ])
        logger.info("Categories seeded")
    if await db.products.count_documents({}) == 0:
        await db.products.insert_many([
            {"id": str(uuid.uuid4()), "name": "Monstera Deliciosa", "description": "Tanaman monstera dengan daun besar berlubang yang cantik dan ikonik. Cocok untuk dekorasi ruangan modern.", "price": 150000, "stock": 25, "category_id": "cat-indoor", "images": ["https://images.unsplash.com/photo-1762755647813-017e128a4ba0?w=600&fit=crop"], "is_active": True, "created_at": datetime.now(timezone.utc).isoformat()},
            {"id": str(uuid.uuid4()), "name": "Sansevieria Trifasciata", "description": "Lidah mertua, tanaman yang mudah perawatan dan sangat baik sebagai pembersih udara.", "price": 75000, "stock": 40, "category_id": "cat-indoor", "images": ["https://images.unsplash.com/photo-1604762526063-07244a385cdf?w=600&fit=crop"], "is_active": True, "created_at": datetime.now(timezone.utc).isoformat()},
            {"id": str(uuid.uuid4()), "name": "Calathea Orbifolia", "description": "Calathea dengan daun bulat bermotif garis-garis hijau-perak yang indah dan elegan.", "price": 120000, "stock": 15, "category_id": "cat-indoor", "images": ["https://images.unsplash.com/photo-1766139455139-86ebad281efa?w=600&fit=crop"], "is_active": True, "created_at": datetime.now(timezone.utc).isoformat()},
            {"id": str(uuid.uuid4()), "name": "Alocasia Amazonica", "description": "Tanaman tropis dengan daun panah berwarna hijau gelap dan urat putih yang dramatis.", "price": 200000, "stock": 10, "category_id": "cat-indoor", "images": ["https://images.unsplash.com/photo-1775457114630-a21121662c6f?w=600&fit=crop"], "is_active": True, "created_at": datetime.now(timezone.utc).isoformat()},
            {"id": str(uuid.uuid4()), "name": "Bougainvillea Pink", "description": "Tanaman hias outdoor dengan bunga berwarna pink cerah, indah dan tahan panas.", "price": 95000, "stock": 20, "category_id": "cat-outdoor", "images": ["https://images.unsplash.com/photo-1679732747686-33e60fb370a6?w=600&fit=crop"], "is_active": True, "created_at": datetime.now(timezone.utc).isoformat()},
            {"id": str(uuid.uuid4()), "name": "Philodendron Giant", "description": "Philodendron besar dengan daun hijau tropis. Sempurna untuk taman atau teras.", "price": 180000, "stock": 12, "category_id": "cat-outdoor", "images": ["https://images.unsplash.com/photo-1771308135367-0b4db7113f64?w=600&fit=crop"], "is_active": True, "created_at": datetime.now(timezone.utc).isoformat()},
            {"id": str(uuid.uuid4()), "name": "Echeveria Elegans", "description": "Sukulen rosette cantik dengan daun berwarna hijau pucat kebiruan. Perawatan mudah.", "price": 45000, "stock": 50, "category_id": "cat-kaktus", "images": ["https://images.unsplash.com/photo-1773431456745-53afab492fb0?w=600&fit=crop"], "is_active": True, "created_at": datetime.now(timezone.utc).isoformat()},
            {"id": str(uuid.uuid4()), "name": "Kaktus Mini Set", "description": "Set kaktus mini lucu dalam pot kecil. Cocok untuk meja kerja atau hadiah.", "price": 55000, "stock": 35, "category_id": "cat-kaktus", "images": ["https://images.unsplash.com/photo-1765109247621-098b74615c77?w=600&fit=crop"], "is_active": True, "created_at": datetime.now(timezone.utc).isoformat()},
            {"id": str(uuid.uuid4()), "name": "Buket Mawar Premium", "description": "Rangkaian buket mawar segar pilihan dalam berbagai warna. Cocok untuk hadiah spesial.", "price": 250000, "stock": 15, "category_id": "cat-bunga", "images": ["https://images.unsplash.com/photo-1771134572111-967700a8bb31?w=600&fit=crop"], "is_active": True, "created_at": datetime.now(timezone.utc).isoformat()},
            {"id": str(uuid.uuid4()), "name": "Rangkaian Bunga Putih", "description": "Rangkaian bunga putih elegan untuk pernikahan, acara formal, atau dekorasi.", "price": 300000, "stock": 10, "category_id": "cat-bunga", "images": ["https://images.unsplash.com/photo-1773913106041-7215428bf90f?w=600&fit=crop"], "is_active": True, "created_at": datetime.now(timezone.utc).isoformat()},
            {"id": str(uuid.uuid4()), "name": "Pot Keramik Minimalis", "description": "Pot keramik handmade dengan desain minimalis modern. Tersedia berbagai ukuran.", "price": 120000, "stock": 30, "category_id": "cat-pot", "images": ["https://images.unsplash.com/photo-1654609678730-d241a2b2eb8d?w=600&fit=crop"], "is_active": True, "created_at": datetime.now(timezone.utc).isoformat()},
            {"id": str(uuid.uuid4()), "name": "Bunga Campuran Segar", "description": "Buket campuran bunga segar berwarna-warni. Sempurna untuk mencerahkan ruangan.", "price": 175000, "stock": 20, "category_id": "cat-bunga", "images": ["https://images.unsplash.com/photo-1759004612201-87c2bad9eb3e?w=600&fit=crop"], "is_active": True, "created_at": datetime.now(timezone.utc).isoformat()},
        ])
        logger.info("Products seeded")
    if not await db.settings.find_one({"type": "store"}):
        await db.settings.insert_one({
            "type": "store",
            "bank_name": "BCA", "account_number": "1234567890",
            "account_holder": "Almira Florist", "qris_image": "",
            "origin_id": 47056,
            "origin_label": "BUMIAJI, BUMIAJI, BATU, JAWA TIMUR, 65331",
        })
    else:
        # Ensure origin is set if missing (don't overwrite admin's choice)
        existing = await db.settings.find_one({"type": "store"})
        if not existing.get("origin_id"):
            await db.settings.update_one(
                {"type": "store"},
                {"$set": {"origin_id": 47056, "origin_label": "BUMIAJI, BUMIAJI, BATU, JAWA TIMUR, 65331"}}
            )

@app.on_event("shutdown")
async def shutdown():
    client.close()
