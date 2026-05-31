"""Backend tests for the NEW AI image generation feature (Gemini Nano Banana)
plus the new search / missing_images query params on /api/admin/products.

Real Gemini calls are used (each ~20-25s). Keep tests minimal:
  - 1 single-product generation
  - 1 bulk call with limit=2
  - file accessibility / content-type validation
  - search & missing_images filter regression
  - auth gating for anon/non-admin
"""
import os
import uuid
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://florist-shop-3.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_USERNAME = "Admin"
ADMIN_PASSWORD = "Kodok5561"

# ---------------- Fixtures ----------------
@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/admin-login", json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def user_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    email = f"TEST_aiimg_{uuid.uuid4().hex[:8]}@example.com"
    r = s.post(f"{API}/auth/register", json={
        "email": email, "password": "TestPass123!", "name": "AI Img Tester", "phone": "0811111111"
    })
    assert r.status_code == 200, f"User register failed: {r.text}"
    return s


@pytest.fixture(scope="module")
def test_category(admin_session):
    name = f"TEST_AI_CAT_{uuid.uuid4().hex[:6]}"
    r = admin_session.post(f"{API}/categories", json={"name": name, "description": "for ai gen tests"})
    assert r.status_code == 200, r.text
    cat = r.json()
    yield cat
    admin_session.delete(f"{API}/categories/{cat['id']}")


@pytest.fixture(scope="module")
def test_products_no_image(admin_session, test_category):
    """Create 3 products with NO images so they can be picked up by bulk/single gen."""
    created = []
    for i in range(3):
        payload = {
            "name": f"TEST_AI_Monstera_Deliciosa_{i}_{uuid.uuid4().hex[:6]}",
            "description": "Tanaman hias monstera deliciosa daun robek hijau segar",
            "price": 75000 + i * 1000,
            "category_id": test_category["id"],
            "stock": 10,
            "images": [],
        }
        r = admin_session.post(f"{API}/products", json=payload)
        assert r.status_code == 200, f"Create failed: {r.text}"
        created.append(r.json())
    yield created
    for p in created:
        admin_session.delete(f"{API}/products/{p['id']}")


# ---------------- Auth gating ----------------
class TestAuthGating:
    def test_single_gen_anonymous_blocked(self):
        r = requests.post(f"{API}/admin/products/some-id/generate-image")
        assert r.status_code in (401, 403), f"expected 401/403 got {r.status_code}"

    def test_bulk_gen_anonymous_blocked(self):
        r = requests.post(f"{API}/admin/products/generate-images-bulk?limit=1")
        assert r.status_code in (401, 403), f"expected 401/403 got {r.status_code}"

    def test_single_gen_non_admin_blocked(self, user_session):
        r = user_session.post(f"{API}/admin/products/some-id/generate-image")
        assert r.status_code in (401, 403), f"expected 401/403 got {r.status_code}"

    def test_bulk_gen_non_admin_blocked(self, user_session):
        r = user_session.post(f"{API}/admin/products/generate-images-bulk?limit=1")
        assert r.status_code in (401, 403), f"expected 401/403 got {r.status_code}"


# ---------------- Admin products filtering ----------------
class TestAdminProductsFilters:
    def test_search_filter(self, admin_session, test_products_no_image):
        # search by partial unique token in name
        unique_token = test_products_no_image[0]["name"].split("_")[-1]  # last hex suffix
        r = admin_session.get(f"{API}/admin/products?search={unique_token}")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "products" in data and "total" in data
        names = [p["name"] for p in data["products"]]
        assert any(unique_token in n for n in names), f"search did not return product with token {unique_token}: {names}"

    def test_search_no_match_returns_empty(self, admin_session):
        r = admin_session.get(f"{API}/admin/products?search=zzz_definitely_no_match_xyz_{uuid.uuid4().hex}")
        assert r.status_code == 200
        data = r.json()
        assert data["total"] == 0
        assert data["products"] == []

    def test_missing_images_true(self, admin_session, test_products_no_image):
        r = admin_session.get(f"{API}/admin/products?missing_images=true&limit=200")
        assert r.status_code == 200
        data = r.json()
        # All returned products must have empty/missing images
        for p in data["products"]:
            imgs = p.get("images")
            assert (not imgs) or (isinstance(imgs, list) and len(imgs) == 0), \
                f"missing_images=true returned a product with images: {p.get('id')} -> {imgs}"
        # And our test products with empty images should appear
        ids_returned = {p["id"] for p in data["products"]}
        for tp in test_products_no_image:
            assert tp["id"] in ids_returned, f"Test product {tp['id']} with empty images not in missing_images result"

    def test_missing_images_false_returns_all(self, admin_session):
        r = admin_session.get(f"{API}/admin/products?missing_images=false&limit=5")
        assert r.status_code == 200
        data = r.json()
        assert "products" in data
        assert isinstance(data["total"], int)


# ---------------- Single generation ----------------
class TestSingleImageGeneration:
    def test_generate_image_single(self, admin_session, test_products_no_image):
        product = test_products_no_image[0]
        # Call with longer timeout to accommodate ~25s Gemini latency
        r = admin_session.post(f"{API}/admin/products/{product['id']}/generate-image", timeout=120)
        assert r.status_code == 200, f"Generate failed: {r.status_code} {r.text}"
        data = r.json()
        assert "image_path" in data and data["image_path"], data
        assert "image_url" in data and data["image_url"].startswith("/api/files/"), data

        # Verify the file is accessible and looks like a real image
        file_url = f"{BASE_URL}{data['image_url']}"
        fr = requests.get(file_url, timeout=30)
        assert fr.status_code == 200, f"File serve failed: {fr.status_code}"
        ct = fr.headers.get("content-type", "")
        assert ct.startswith("image/"), f"Content-Type not image/*: {ct}"
        assert len(fr.content) > 1000, f"Image suspiciously small: {len(fr.content)} bytes"
        # JPEG or PNG magic bytes
        magic = fr.content[:4]
        assert magic[:3] == b"\xff\xd8\xff" or magic[:4] == b"\x89PNG", \
            f"Bytes don't look like JPEG/PNG: {magic!r}"

        # And the product now has images[0] == path
        pr = admin_session.get(f"{API}/products/{product['id']}")
        assert pr.status_code == 200
        prod = pr.json()
        assert prod.get("images"), "Product images empty after generation"
        assert prod["images"][0] == data["image_path"]

    def test_generate_image_product_not_found(self, admin_session):
        r = admin_session.post(f"{API}/admin/products/nonexistent-id-xyz/generate-image", timeout=30)
        assert r.status_code == 404, f"expected 404 got {r.status_code} {r.text}"


# ---------------- Bulk generation ----------------
class TestBulkImageGeneration:
    def test_bulk_generate_limit_2(self, admin_session, test_products_no_image):
        # Take ~60s total. Use limit=2.
        t0 = time.time()
        r = admin_session.post(f"{API}/admin/products/generate-images-bulk?limit=2", timeout=180)
        elapsed = time.time() - t0
        assert r.status_code == 200, f"Bulk failed: {r.status_code} {r.text}"
        data = r.json()
        for k in ["processed", "success", "failed", "remaining", "remaining_before", "results"]:
            assert k in data, f"Missing key {k} in response: {data}"
        assert data["processed"] <= 2, f"processed exceeded limit: {data}"
        assert data["processed"] == data["success"] + data["failed"]
        assert data["remaining_before"] >= data["remaining"], \
            f"remaining should not increase after bulk run: {data}"
        assert isinstance(data["results"], list)
        # Verify each successful result corresponds to a product that now has images
        for item in data["results"]:
            if item.get("ok"):
                pr = admin_session.get(f"{API}/products/{item['id']}")
                assert pr.status_code == 200
                prod = pr.json()
                assert prod.get("images"), f"Product {item['id']} has no images after bulk success"
                assert prod["images"][0] == item["path"]
        print(f"[bulk] processed={data['processed']} success={data['success']} failed={data['failed']} "
              f"remaining={data['remaining']}/{data['remaining_before']} elapsed={elapsed:.1f}s")

    # NOTE: limit-clamp test omitted on purpose - calling with limit=999 would trigger up to 10
    # real Gemini calls (~4 minutes & real cost). Clamp `min(int(limit or 5), 10)` is verified
    # statically in code review.
