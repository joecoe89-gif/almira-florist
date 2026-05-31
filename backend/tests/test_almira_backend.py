"""Comprehensive backend regression tests for Almira Florist after GitHub migration."""
import os
import uuid
import time
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://florist-shop-3.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"

ADMIN_USERNAME = "Admin"
ADMIN_PASSWORD = "Kodok5561"


# ---------- Session fixtures ----------
@pytest.fixture(scope="session")
def admin_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/admin-login", json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    data = r.json()
    assert data.get("role") == "admin"
    # Use cookie-based session (cookies stored automatically)
    return s


@pytest.fixture(scope="session")
def user_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    email = f"TEST_user_{uuid.uuid4().hex[:8]}@example.com"
    password = "TestPass123!"
    r = s.post(f"{API}/auth/register", json={"email": email, "password": password, "name": "Test User", "phone": "0811111111"})
    assert r.status_code == 200, f"Register failed: {r.status_code} {r.text}"
    s.email = email
    s.password = password
    return s


@pytest.fixture(scope="session")
def guest_id():
    return f"TEST_guest_{uuid.uuid4().hex[:8]}"


# ---------- Health / Public catalog ----------
class TestHealthAndCatalog:
    def test_categories_seeded(self):
        r = requests.get(f"{API}/categories")
        assert r.status_code == 200
        cats = r.json()
        assert isinstance(cats, list)
        assert len(cats) >= 5, f"Expected >=5 seeded categories, got {len(cats)}"
        names = {c["name"] for c in cats}
        for expected in ["Tanaman Indoor", "Tanaman Outdoor", "Kaktus & Sukulen", "Bunga", "Pot & Aksesoris"]:
            assert expected in names, f"Missing seeded category {expected}"

    def test_products_pagination(self):
        r = requests.get(f"{API}/products?page=1&limit=5")
        assert r.status_code == 200
        data = r.json()
        for k in ("products", "total", "page", "pages"):
            assert k in data
        assert data["page"] == 1
        assert len(data["products"]) <= 5
        assert data["total"] >= 1

    def test_product_by_id(self):
        list_resp = requests.get(f"{API}/products?limit=1").json()
        assert list_resp["products"], "No products available"
        pid = list_resp["products"][0]["id"]
        r = requests.get(f"{API}/products/{pid}")
        assert r.status_code == 200
        assert r.json()["id"] == pid


# ---------- Auth ----------
class TestAuth:
    def test_register_login_me(self):
        email = f"TEST_authflow_{uuid.uuid4().hex[:6]}@example.com"
        s = requests.Session()
        r = s.post(f"{API}/auth/register", json={"email": email, "password": "Passw0rd!", "name": "Flow"})
        assert r.status_code == 200
        assert r.json()["email"].lower() == email.lower()
        # login fresh session
        s2 = requests.Session()
        r2 = s2.post(f"{API}/auth/login", json={"email": email, "password": "Passw0rd!"})
        assert r2.status_code == 200
        # me
        r3 = s2.get(f"{API}/auth/me")
        assert r3.status_code == 200
        assert r3.json()["email"].lower() == email.lower()

    def test_login_invalid(self):
        r = requests.post(f"{API}/auth/login", json={"email": "nope@nope.com", "password": "wrong"})
        assert r.status_code == 401

    def test_admin_login_success(self, admin_session):
        r = admin_session.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json()["role"] == "admin"

    def test_admin_login_invalid(self):
        r = requests.post(f"{API}/auth/admin-login", json={"username": "Admin", "password": "wrongpass!"})
        assert r.status_code == 401


# ---------- Admin endpoints ----------
class TestAdminEndpoints:
    def test_stats(self, admin_session):
        r = admin_session.get(f"{API}/admin/stats")
        assert r.status_code == 200
        for k in ("total_products", "total_orders", "total_users", "pending_orders", "revenue"):
            assert k in r.json()

    def test_dashboard(self, admin_session):
        r = admin_session.get(f"{API}/admin/dashboard")
        assert r.status_code == 200
        for k in ("total_products", "orders_today", "revenue_month", "pending_orders", "month_label"):
            assert k in r.json()

    def test_admin_orders(self, admin_session):
        r = admin_session.get(f"{API}/admin/orders")
        assert r.status_code == 200
        assert "orders" in r.json()

    def test_admin_products(self, admin_session):
        r = admin_session.get(f"{API}/admin/products")
        assert r.status_code == 200
        assert "products" in r.json()

    def test_admin_unauthenticated_blocked(self):
        r = requests.get(f"{API}/admin/stats")
        assert r.status_code in (401, 403)


# ---------- Categories admin CRUD ----------
class TestCategoryCRUD:
    def test_create_update_delete(self, admin_session):
        payload = {"name": f"TEST_cat_{uuid.uuid4().hex[:6]}", "description": "test cat"}
        r = admin_session.post(f"{API}/categories", json=payload)
        assert r.status_code == 200
        created = r.json()
        cid = created["id"]
        assert created["name"] == payload["name"]

        # update
        r2 = admin_session.put(f"{API}/categories/{cid}", json={"description": "updated"})
        assert r2.status_code == 200
        assert r2.json()["description"] == "updated"

        # delete (deactivate)
        r3 = admin_session.delete(f"{API}/categories/{cid}")
        assert r3.status_code == 200


# ---------- Products admin CRUD ----------
class TestProductCRUD:
    @pytest.fixture(scope="class")
    def created_product(self, admin_session):
        payload = {
            "name": f"TEST_product_{uuid.uuid4().hex[:6]}",
            "description": "Test plant", "price": 50000, "stock": 10,
            "category_id": "cat-indoor", "images": [], "weight": 500, "packaging_weight": 100,
        }
        r = admin_session.post(f"{API}/products", json=payload)
        assert r.status_code == 200, r.text
        return r.json()

    def test_create_persists(self, admin_session, created_product):
        pid = created_product["id"]
        r = requests.get(f"{API}/products/{pid}")
        assert r.status_code == 200
        assert r.json()["name"] == created_product["name"]

    def test_update_product(self, admin_session, created_product):
        pid = created_product["id"]
        r = admin_session.put(f"{API}/products/{pid}", json={"price": 75000})
        assert r.status_code == 200
        assert r.json()["price"] == 75000

    def test_delete_product(self, admin_session, created_product):
        pid = created_product["id"]
        r = admin_session.delete(f"{API}/products/{pid}")
        assert r.status_code == 200
        # Now should 404 on public endpoint? No, it's just deactivated; GET by id still returns.
        # But listing should exclude it.
        listing = requests.get(f"{API}/products?limit=100").json()["products"]
        assert not any(p["id"] == pid for p in listing)


# ---------- Cart guest flow ----------
class TestCartGuest:
    def test_full_guest_cart_flow(self, guest_id):
        # Get a product to add
        prods = requests.get(f"{API}/products?limit=1").json()["products"]
        assert prods, "No products"
        pid = prods[0]["id"]
        headers = {"X-Guest-ID": guest_id, "Content-Type": "application/json"}

        # add
        r = requests.post(f"{API}/cart/add", json={"product_id": pid, "quantity": 2}, headers=headers)
        assert r.status_code == 200

        # get
        r2 = requests.get(f"{API}/cart", headers=headers)
        assert r2.status_code == 200
        body = r2.json()
        assert len(body["items"]) == 1
        assert body["items"][0]["quantity"] == 2

        # update
        r3 = requests.put(f"{API}/cart/update", json={"product_id": pid, "quantity": 3}, headers=headers)
        assert r3.status_code == 200
        body2 = requests.get(f"{API}/cart", headers=headers).json()
        assert body2["items"][0]["quantity"] == 3

        # remove
        r4 = requests.delete(f"{API}/cart/remove/{pid}", headers=headers)
        assert r4.status_code == 200
        body3 = requests.get(f"{API}/cart", headers=headers).json()
        assert len(body3["items"]) == 0


# ---------- Wishlist ----------
class TestWishlist:
    def test_toggle_and_check(self, user_session):
        prods = requests.get(f"{API}/products?limit=1").json()["products"]
        pid = prods[0]["id"]
        r = user_session.post(f"{API}/wishlist/toggle/{pid}")
        assert r.status_code == 200
        assert r.json()["in_wishlist"] is True
        r2 = user_session.get(f"{API}/wishlist/check/{pid}")
        assert r2.status_code == 200
        assert r2.json()["in_wishlist"] is True
        # toggle again removes
        r3 = user_session.post(f"{API}/wishlist/toggle/{pid}")
        assert r3.json()["in_wishlist"] is False


# ---------- Orders ----------
class TestOrders:
    def test_create_order_flow(self, user_session):
        # add to cart first
        prods = requests.get(f"{API}/products?limit=1").json()["products"]
        pid = prods[0]["id"]
        r = user_session.post(f"{API}/cart/add", json={"product_id": pid, "quantity": 1})
        assert r.status_code == 200

        order_payload = {
            "shipping_name": "Test Buyer",
            "shipping_phone": "0812345678",
            "shipping_address": "Jl Test 1, Jakarta",
            "shipping_email": "buyer@test.com",
            "payment_method": "transfer",
            "notes": "TEST order",
            "shipping_cost": 15000,
        }
        r2 = user_session.post(f"{API}/orders", json=order_payload)
        assert r2.status_code == 200, r2.text
        order = r2.json()
        oid = order["id"]
        assert order["status"] == "pending_payment"
        assert order["shipping_cost"] == 15000

        # get user orders
        r3 = user_session.get(f"{API}/orders")
        assert r3.status_code == 200
        assert any(o["id"] == oid for o in r3.json())

        # get order by id
        r4 = user_session.get(f"{API}/orders/{oid}")
        assert r4.status_code == 200
        assert r4.json()["id"] == oid

    def test_create_order_empty_cart(self, user_session):
        # Ensure cart is empty
        user_session.delete(f"{API}/cart/clear")
        r = user_session.post(f"{API}/orders", json={
            "shipping_name": "X", "shipping_phone": "0", "shipping_address": "X",
        })
        assert r.status_code == 400


# ---------- Settings ----------
class TestSettings:
    def test_get_settings(self):
        r = requests.get(f"{API}/settings")
        assert r.status_code == 200
        assert "bank_name" in r.json()

    def test_update_settings(self, admin_session):
        r = admin_session.put(f"{API}/settings", json={"bank_name": "BCA", "account_number": "1234567890", "account_holder": "Almira Florist"})
        assert r.status_code == 200
        assert r.json()["bank_name"] == "BCA"


# ---------- Shipping ----------
class TestShipping:
    def test_origin(self):
        r = requests.get(f"{API}/shipping/origin")
        assert r.status_code == 200
        assert "origin_id" in r.json()

    def test_destination_no_key_returns_503(self):
        r = requests.get(f"{API}/shipping/destination?search=jakarta")
        # RAJAONGKIR_API_KEY is empty - expect 503
        assert r.status_code == 503

    def test_cost_no_key_returns_503(self):
        r = requests.post(f"{API}/shipping/cost", json={"origin": 47056, "destination": 1, "weight": 1000})
        assert r.status_code == 503


# ---------- Chatbot ----------
class TestChatbot:
    def test_chat_reply(self):
        r = requests.post(f"{API}/chat", json={"message": "Halo, ada tanaman indoor?"}, timeout=60)
        assert r.status_code == 200
        body = r.json()
        assert "reply" in body and isinstance(body["reply"], str) and len(body["reply"]) > 0
        assert "session_id" in body
