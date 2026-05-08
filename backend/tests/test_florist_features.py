"""Backend tests for new florist features: variants, cart, RajaOngkir shipping, settings origin, orders."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://florist-preview.preview.emergentagent.com').rstrip('/')
ADMIN_USERNAME = "Admin"
ADMIN_PASSWORD = "Kodok5561"


@pytest.fixture(scope="session")
def admin_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/admin-login", json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="session")
def guest_id():
    return f"test-guest-{uuid.uuid4()}"


@pytest.fixture(scope="session")
def guest_session(guest_id):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "X-Guest-ID": guest_id})
    return s


@pytest.fixture(scope="session")
def variant_product(admin_session):
    """Create a product with variants and weight for testing."""
    payload = {
        "name": f"TEST_Variant Product {uuid.uuid4().hex[:6]}",
        "description": "test product with variants",
        "price": 0,
        "stock": 100,
        "category_id": "cat-bunga",
        "images": ["https://example.com/img.jpg"],
        "variants": [
            {"name": "Small", "price": 50000},
            {"name": "Medium", "price": 75000},
            {"name": "Large", "price": 100000},
        ],
        "weight": 500,
        "packaging_weight": 200,
    }
    r = admin_session.post(f"{BASE_URL}/api/products", json=payload)
    assert r.status_code == 200, f"create product failed: {r.status_code} {r.text}"
    data = r.json()
    yield data
    # cleanup
    try:
        admin_session.delete(f"{BASE_URL}/api/products/{data['id']}")
    except Exception:
        pass


# =========== SHIPPING ==============
class TestShipping:
    def test_origin_endpoint(self):
        r = requests.get(f"{BASE_URL}/api/shipping/origin")
        assert r.status_code == 200
        d = r.json()
        assert d.get("origin_id") == 47056, f"expected 47056, got {d}"
        assert "BUMIAJI" in (d.get("origin_label") or "").upper()

    def test_destination_search_bumiaji(self):
        r = requests.get(f"{BASE_URL}/api/shipping/destination", params={"search": "bumiaji"})
        assert r.status_code == 200, r.text
        body = r.json()
        rows = body.get("data", [])
        assert isinstance(rows, list) and len(rows) > 0, f"no rows: {body}"
        first = rows[0]
        assert "id" in first and "label" in first
        assert isinstance(first["id"], int)

    def test_destination_search_short(self):
        r = requests.get(f"{BASE_URL}/api/shipping/destination", params={"search": "ab"})
        assert r.status_code == 200
        assert r.json().get("data") == []

    def test_shipping_cost_calculation(self):
        # destination ~ Jakarta search to find an id
        r = requests.get(f"{BASE_URL}/api/shipping/destination", params={"search": "menteng"})
        assert r.status_code == 200
        rows = r.json().get("data", [])
        assert len(rows) > 0
        dest_id = rows[0]["id"]

        r2 = requests.post(f"{BASE_URL}/api/shipping/cost", json={
            "origin": 47056,
            "destination": dest_id,
            "weight": 1000,
            "courier": "jne:tiki:pos",
        })
        assert r2.status_code == 200, f"cost failed: {r2.status_code} {r2.text}"
        services = r2.json().get("services", [])
        assert isinstance(services, list) and len(services) > 0, f"no services: {r2.json()}"
        s0 = services[0]
        assert s0.get("cost", 0) > 0
        assert "courier" in s0 and "service" in s0

    def test_shipping_cost_invalid_weight(self):
        r = requests.post(f"{BASE_URL}/api/shipping/cost", json={
            "origin": 47056, "destination": 2098, "weight": 0, "courier": "jne",
        })
        assert r.status_code == 400


# =========== SETTINGS / ORIGIN ==========
class TestSettings:
    def test_admin_update_origin(self, admin_session):
        # update to some other origin then back
        new_id = 99999
        new_label = "TEST_LABEL"
        r = admin_session.put(f"{BASE_URL}/api/settings", json={
            "origin_id": new_id, "origin_label": new_label
        })
        assert r.status_code == 200
        d = r.json()
        assert d.get("origin_id") == new_id
        assert d.get("origin_label") == new_label

        # restore
        r2 = admin_session.put(f"{BASE_URL}/api/settings", json={
            "origin_id": 47056, "origin_label": "BUMIAJI, BUMIAJI, BATU, JAWA TIMUR, 65331"
        })
        assert r2.status_code == 200
        assert r2.json().get("origin_id") == 47056

    def test_get_settings_public(self):
        r = requests.get(f"{BASE_URL}/api/settings")
        assert r.status_code == 200


# =========== PRODUCT VARIANTS =========
class TestProductVariants:
    def test_product_created_with_variants(self, variant_product):
        assert variant_product["price"] == 50000  # min variant
        assert len(variant_product["variants"]) == 3
        assert variant_product["weight"] == 500
        assert variant_product["packaging_weight"] == 200

    def test_get_product_returns_variants(self, variant_product):
        r = requests.get(f"{BASE_URL}/api/products/{variant_product['id']}")
        assert r.status_code == 200
        d = r.json()
        assert d["variants"] and len(d["variants"]) == 3
        assert d["weight"] == 500
        assert d["packaging_weight"] == 200


# =========== CART (variant-aware) ============
class TestCart:
    def test_cart_add_two_variants_separate_rows(self, variant_product, guest_session, guest_id):
        # clear any existing cart
        guest_session.delete(f"{BASE_URL}/api/cart/clear")
        pid = variant_product["id"]

        r1 = guest_session.post(f"{BASE_URL}/api/cart/add", json={
            "product_id": pid, "quantity": 2, "variant_name": "Small"
        })
        assert r1.status_code == 200, r1.text

        r2 = guest_session.post(f"{BASE_URL}/api/cart/add", json={
            "product_id": pid, "quantity": 1, "variant_name": "Large"
        })
        assert r2.status_code == 200

        rg = guest_session.get(f"{BASE_URL}/api/cart")
        assert rg.status_code == 200
        cart = rg.json()
        items = cart["items"]
        assert len(items) == 2, f"expected 2 rows, got {items}"
        sm = next(i for i in items if i["variant_name"] == "Small")
        lg = next(i for i in items if i["variant_name"] == "Large")
        assert sm["price"] == 50000
        assert lg["price"] == 100000
        # total: 50000*2 + 100000*1 = 200000
        assert cart["total"] == 200000
        # weight: (500+200)*2 + (500+200)*1 = 2100
        assert cart["total_weight"] == 2100

    def test_update_variant_only_updates_that_row(self, variant_product, guest_session):
        pid = variant_product["id"]
        r = guest_session.put(f"{BASE_URL}/api/cart/update", json={
            "product_id": pid, "quantity": 5, "variant_name": "Small"
        })
        assert r.status_code == 200
        rg = guest_session.get(f"{BASE_URL}/api/cart")
        items = rg.json()["items"]
        sm = next(i for i in items if i["variant_name"] == "Small")
        lg = next(i for i in items if i["variant_name"] == "Large")
        assert sm["quantity"] == 5
        assert lg["quantity"] == 1

    def test_remove_variant_only_removes_that(self, variant_product, guest_session):
        pid = variant_product["id"]
        r = guest_session.delete(f"{BASE_URL}/api/cart/remove/{pid}", params={"variant": "Small"})
        assert r.status_code == 200
        rg = guest_session.get(f"{BASE_URL}/api/cart")
        items = rg.json()["items"]
        assert len(items) == 1
        assert items[0]["variant_name"] == "Large"

    def test_invalid_variant_rejected(self, variant_product, guest_session):
        pid = variant_product["id"]
        r = guest_session.post(f"{BASE_URL}/api/cart/add", json={
            "product_id": pid, "quantity": 1, "variant_name": "DOES_NOT_EXIST"
        })
        assert r.status_code == 400


# =========== ORDER (with shipping) ==========
class TestOrder:
    def test_create_order_with_shipping(self, variant_product, guest_session):
        # Ensure cart has items (Large variant from prev test, add fresh)
        pid = variant_product["id"]
        guest_session.delete(f"{BASE_URL}/api/cart/clear")
        guest_session.post(f"{BASE_URL}/api/cart/add", json={
            "product_id": pid, "quantity": 1, "variant_name": "Medium"
        })

        order_payload = {
            "shipping_name": "Test Buyer",
            "shipping_phone": "08123456789",
            "shipping_address": "Jl. Test 123",
            "shipping_email": "test@example.com",
            "payment_method": "transfer",
            "notes": "Test order",
            "shipping_destination_id": 2098,
            "shipping_destination_label": "TEST DEST",
            "shipping_courier": "jne",
            "shipping_service": "REG",
            "shipping_etd": "2-3",
            "shipping_cost": 25000,
        }
        r = guest_session.post(f"{BASE_URL}/api/orders", json=order_payload)
        assert r.status_code == 200, r.text
        order = r.json()
        assert order["subtotal"] == 75000  # Medium variant price
        assert order["shipping_cost"] == 25000
        assert order["total"] == 100000
        assert order["shipping_courier"] == "JNE"
        assert order["shipping_service"] == "REG"
        assert order["items"][0]["variant_name"] == "Medium"
        assert order["items"][0]["weight"] == 700  # 500+200
        assert order["total_weight"] == 700
