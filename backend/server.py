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
EMERGENT_KEY = os.environ.get('EMERGENT_LLM_KEY', '')
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

class CategoryCreate(BaseModel):
    name: str
    description: str = ""
    image_url: str = ""

class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    image_url: Optional[str] = None
    is_active: Optional[bool] = None

class ProductCreate(BaseModel):
    name: str
    description: str = ""
    price: int
    stock: int = 0
    category_id: str = ""
    images: List[str] = []

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[int] = None
    stock: Optional[int] = None
    category_id: Optional[str] = None
    images: Optional[List[str]] = None
    is_active: Optional[bool] = None

class CartItem(BaseModel):
    product_id: str
    quantity: int = 1

class OrderCreate(BaseModel):
    shipping_name: str
    shipping_phone: str
    shipping_address: str
    payment_method: str = "transfer"
    notes: str = ""

class OrderStatusUpdate(BaseModel):
    status: str

class StoreSettingsUpdate(BaseModel):
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    account_holder: Optional[str] = None
    qris_image: Optional[str] = None

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
    doc = {
        "id": str(uuid.uuid4()), "name": data.name, "description": data.description,
        "price": data.price, "stock": data.stock, "category_id": data.category_id,
        "images": data.images, "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.products.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.put("/products/{product_id}")
async def update_product(product_id: str, data: ProductUpdate, request: Request):
    await get_admin_user(request)
    update = {k: v for k, v in data.model_dump().items() if v is not None}
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
    user = await get_current_user(request)
    cart = await db.carts.find_one({"user_id": user["id"]}, {"_id": 0})
    if not cart:
        return {"items": [], "total": 0}
    populated = []
    total = 0
    for item in cart.get("items", []):
        product = await db.products.find_one({"id": item["product_id"], "is_active": True}, {"_id": 0})
        if product:
            populated.append({
                "product_id": item["product_id"], "quantity": item["quantity"],
                "name": product["name"], "price": product["price"],
                "image": product["images"][0] if product.get("images") else "",
                "stock": product["stock"]
            })
            total += product["price"] * item["quantity"]
    return {"items": populated, "total": total}

@api_router.post("/cart/add")
async def add_to_cart(data: CartItem, request: Request):
    user = await get_current_user(request)
    product = await db.products.find_one({"id": data.product_id, "is_active": True})
    if not product:
        raise HTTPException(status_code=404, detail="Produk tidak ditemukan")
    cart = await db.carts.find_one({"user_id": user["id"]})
    if not cart:
        await db.carts.insert_one({"user_id": user["id"], "items": [{"product_id": data.product_id, "quantity": data.quantity}], "updated_at": datetime.now(timezone.utc).isoformat()})
    else:
        existing = next((i for i in cart["items"] if i["product_id"] == data.product_id), None)
        if existing:
            existing["quantity"] += data.quantity
            await db.carts.update_one({"user_id": user["id"]}, {"$set": {"items": cart["items"], "updated_at": datetime.now(timezone.utc).isoformat()}})
        else:
            await db.carts.update_one({"user_id": user["id"]}, {"$push": {"items": {"product_id": data.product_id, "quantity": data.quantity}}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}})
    return {"message": "Ditambahkan ke keranjang"}

@api_router.put("/cart/update")
async def update_cart_item(data: CartItem, request: Request):
    user = await get_current_user(request)
    if data.quantity <= 0:
        await db.carts.update_one({"user_id": user["id"]}, {"$pull": {"items": {"product_id": data.product_id}}})
    else:
        await db.carts.update_one({"user_id": user["id"], "items.product_id": data.product_id}, {"$set": {"items.$.quantity": data.quantity, "updated_at": datetime.now(timezone.utc).isoformat()}})
    return {"message": "Keranjang diperbarui"}

@api_router.delete("/cart/remove/{product_id}")
async def remove_from_cart(product_id: str, request: Request):
    user = await get_current_user(request)
    await db.carts.update_one({"user_id": user["id"]}, {"$pull": {"items": {"product_id": product_id}}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}})
    return {"message": "Dihapus dari keranjang"}

@api_router.delete("/cart/clear")
async def clear_cart(request: Request):
    user = await get_current_user(request)
    await db.carts.delete_one({"user_id": user["id"]})
    return {"message": "Keranjang dikosongkan"}

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
async def create_order(data: OrderCreate, request: Request):
    user = await get_current_user(request)
    cart = await db.carts.find_one({"user_id": user["id"]}, {"_id": 0})
    if not cart or not cart.get("items"):
        raise HTTPException(status_code=400, detail="Keranjang kosong")
    order_items = []
    total = 0
    for item in cart["items"]:
        product = await db.products.find_one({"id": item["product_id"], "is_active": True}, {"_id": 0})
        if not product:
            raise HTTPException(status_code=400, detail="Produk tidak tersedia")
        if product["stock"] < item["quantity"]:
            raise HTTPException(status_code=400, detail=f"Stok {product['name']} tidak mencukupi")
        order_items.append({"product_id": item["product_id"], "name": product["name"], "price": product["price"], "quantity": item["quantity"], "image": product["images"][0] if product.get("images") else ""})
        total += product["price"] * item["quantity"]
    order_id = str(uuid.uuid4())
    order_doc = {
        "id": order_id, "user_id": user["id"], "user_email": user["email"],
        "user_name": user.get("name", ""), "items": order_items, "total": total,
        "status": "pending_payment", "payment_method": data.payment_method,
        "payment_proof": "", "shipping_name": data.shipping_name,
        "shipping_phone": data.shipping_phone, "shipping_address": data.shipping_address,
        "notes": data.notes, "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    await db.orders.insert_one(order_doc)
    for item in cart["items"]:
        await db.products.update_one({"id": item["product_id"]}, {"$inc": {"stock": -item["quantity"]}})
    await db.carts.delete_one({"user_id": user["id"]})
    order_doc.pop("_id", None)
    return order_doc

@api_router.get("/orders")
async def get_user_orders(request: Request):
    user = await get_current_user(request)
    return await db.orders.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)

@api_router.get("/orders/{order_id}")
async def get_order(order_id: str, request: Request):
    user = await get_current_user(request)
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Pesanan tidak ditemukan")
    if order["user_id"] != user["id"] and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Akses ditolak")
    return order

@api_router.post("/orders/{order_id}/payment-proof")
async def upload_payment_proof(order_id: str, request: Request, file: UploadFile = File(...)):
    user = await get_current_user(request)
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Pesanan tidak ditemukan")
    if order["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    ext = file.filename.split(".")[-1] if "." in file.filename else "jpg"
    storage_path = f"{APP_NAME}/payment-proofs/{user['id']}/{uuid.uuid4()}.{ext}"
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
async def admin_products(request: Request, page: int = 1, limit: int = 50):
    await get_admin_user(request)
    skip = (page - 1) * limit
    total = await db.products.count_documents({})
    products = await db.products.find({}, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    return {"products": products, "total": total}

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
            f.write(f"# Test Credentials\n\n## Admin\n- Email: {ADMIN_EMAIL}\n- Password: {ADMIN_PASSWORD}\n- Role: admin\n\n## Auth Endpoints\n- POST /api/auth/login\n- POST /api/auth/register\n- POST /api/auth/logout\n- GET /api/auth/me\n")
    except Exception as e:
        logger.error(f"Credentials file: {e}")

async def seed_data():
    admin_email = ADMIN_EMAIL.lower()
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({"id": str(uuid.uuid4()), "email": admin_email, "password_hash": hash_password(ADMIN_PASSWORD), "name": "Admin", "phone": "087784841084", "role": "admin", "created_at": datetime.now(timezone.utc).isoformat()})
        logger.info(f"Admin seeded: {admin_email}")
    elif not verify_password(ADMIN_PASSWORD, existing["password_hash"]):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(ADMIN_PASSWORD)}})
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
        await db.settings.insert_one({"type": "store", "bank_name": "BCA", "account_number": "1234567890", "account_holder": "Almira Florist", "qris_image": ""})

@app.on_event("shutdown")
async def shutdown():
    client.close()
