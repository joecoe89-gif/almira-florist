#!/usr/bin/env python3

import requests
import sys
import json
from datetime import datetime

class AlmiraFloristAPITester:
    def __init__(self, base_url="https://florist-preview.preview.emergentagent.com"):
        self.base_url = base_url
        self.session = requests.Session()
        self.admin_token = None
        self.user_token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []

    def log_test(self, name, success, details=""):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name}")
        else:
            print(f"❌ {name} - {details}")
        
        self.test_results.append({
            "test": name,
            "success": success,
            "details": details
        })

    def test_api_call(self, method, endpoint, expected_status, data=None, headers=None, description=""):
        """Make API call and verify response"""
        url = f"{self.base_url}/api/{endpoint}"
        
        try:
            if method == "GET":
                response = self.session.get(url, headers=headers)
            elif method == "POST":
                response = self.session.post(url, json=data, headers=headers)
            elif method == "PUT":
                response = self.session.put(url, json=data, headers=headers)
            elif method == "DELETE":
                response = self.session.delete(url, headers=headers)
            
            success = response.status_code == expected_status
            details = f"Expected {expected_status}, got {response.status_code}"
            if not success and response.text:
                try:
                    error_data = response.json()
                    details += f" - {error_data.get('detail', response.text[:100])}"
                except:
                    details += f" - {response.text[:100]}"
            
            self.log_test(f"{method} {endpoint} {description}", success, details)
            return success, response
            
        except Exception as e:
            self.log_test(f"{method} {endpoint} {description}", False, str(e))
            return False, None

    def test_auth_endpoints(self):
        """Test authentication endpoints"""
        print("\n🔐 Testing Authentication...")
        
        # Test admin login
        success, response = self.test_api_call(
            "POST", "auth/login", 200,
            {"email": "admin@almiraflorist.com", "password": "Admin123!"},
            description="(Admin Login)"
        )
        
        if success and response:
            try:
                data = response.json()
                if data.get("role") == "admin":
                    self.admin_token = response.cookies.get("access_token")
                    print(f"   Admin token obtained: {bool(self.admin_token)}")
                else:
                    print("   ❌ Admin role not returned")
            except:
                print("   ❌ Invalid JSON response")
        
        # Test user registration
        test_user_email = f"test_{datetime.now().strftime('%H%M%S')}@test.com"
        success, response = self.test_api_call(
            "POST", "auth/register", 200,
            {
                "name": "Test User",
                "email": test_user_email,
                "phone": "081234567890",
                "password": "testpass123"
            },
            description="(User Registration)"
        )
        
        if success and response:
            self.user_token = response.cookies.get("access_token")
            print(f"   User token obtained: {bool(self.user_token)}")
        
        # Test /auth/me with admin token
        if self.admin_token:
            headers = {"Cookie": f"access_token={self.admin_token}"}
            self.test_api_call("GET", "auth/me", 200, headers=headers, description="(Get Admin Profile)")
        
        # Test logout
        self.test_api_call("POST", "auth/logout", 200, description="(Logout)")

    def test_categories_endpoints(self):
        """Test categories endpoints"""
        print("\n📂 Testing Categories...")
        
        # Test get categories (public)
        self.test_api_call("GET", "categories", 200, description="(Get Public Categories)")
        
        if self.admin_token:
            headers = {"Cookie": f"access_token={self.admin_token}"}
            
            # Test get all categories (admin)
            self.test_api_call("GET", "categories/all", 200, headers=headers, description="(Get All Categories - Admin)")
            
            # Test create category
            success, response = self.test_api_call(
                "POST", "categories", 200,
                {
                    "name": "Test Category",
                    "description": "Test category description",
                    "image_url": "https://example.com/test.jpg"
                },
                headers=headers,
                description="(Create Category)"
            )
            
            if success and response:
                try:
                    category_data = response.json()
                    category_id = category_data.get("id")
                    if category_id:
                        # Test update category
                        self.test_api_call(
                            "PUT", f"categories/{category_id}", 200,
                            {"name": "Updated Test Category"},
                            headers=headers,
                            description="(Update Category)"
                        )
                        
                        # Test delete category
                        self.test_api_call(
                            "DELETE", f"categories/{category_id}", 200,
                            headers=headers,
                            description="(Delete Category)"
                        )
                except:
                    print("   ❌ Failed to parse category creation response")

    def test_products_endpoints(self):
        """Test products endpoints"""
        print("\n📦 Testing Products...")
        
        # Test get products (public)
        success, response = self.test_api_call("GET", "products", 200, description="(Get Products)")
        
        product_id = None
        if success and response:
            try:
                data = response.json()
                products = data.get("products", [])
                if products:
                    product_id = products[0]["id"]
                    print(f"   Found product ID: {product_id}")
            except:
                print("   ❌ Failed to parse products response")
        
        # Test get single product
        if product_id:
            self.test_api_call("GET", f"products/{product_id}", 200, description="(Get Single Product)")
        
        if self.admin_token:
            headers = {"Cookie": f"access_token={self.admin_token}"}
            
            # Test create product
            success, response = self.test_api_call(
                "POST", "products", 200,
                {
                    "name": "Test Product",
                    "description": "Test product description",
                    "price": 50000,
                    "stock": 10,
                    "category_id": "cat-indoor",
                    "images": ["https://example.com/test.jpg"]
                },
                headers=headers,
                description="(Create Product)"
            )
            
            if success and response:
                try:
                    product_data = response.json()
                    test_product_id = product_data.get("id")
                    if test_product_id:
                        # Test update product
                        self.test_api_call(
                            "PUT", f"products/{test_product_id}", 200,
                            {"name": "Updated Test Product", "price": 75000},
                            headers=headers,
                            description="(Update Product)"
                        )
                        
                        # Test delete product
                        self.test_api_call(
                            "DELETE", f"products/{test_product_id}", 200,
                            headers=headers,
                            description="(Delete Product)"
                        )
                except:
                    print("   ❌ Failed to parse product creation response")

    def test_cart_endpoints(self):
        """Test cart endpoints"""
        print("\n🛒 Testing Cart...")
        
        if not self.user_token:
            print("   ⚠️ Skipping cart tests - no user token")
            return
        
        headers = {"Cookie": f"access_token={self.user_token}"}
        
        # Test get empty cart
        self.test_api_call("GET", "cart", 200, headers=headers, description="(Get Cart)")
        
        # Get a product ID to add to cart
        success, response = self.test_api_call("GET", "products?limit=1", 200)
        product_id = None
        if success and response:
            try:
                data = response.json()
                products = data.get("products", [])
                if products:
                    product_id = products[0]["id"]
            except:
                pass
        
        if product_id:
            # Test add to cart
            self.test_api_call(
                "POST", "cart/add", 200,
                {"product_id": product_id, "quantity": 2},
                headers=headers,
                description="(Add to Cart)"
            )
            
            # Test update cart
            self.test_api_call(
                "PUT", "cart/update", 200,
                {"product_id": product_id, "quantity": 3},
                headers=headers,
                description="(Update Cart)"
            )
            
            # Test remove from cart
            self.test_api_call(
                "DELETE", f"cart/remove/{product_id}", 200,
                headers=headers,
                description="(Remove from Cart)"
            )
            
            # Test clear cart
            self.test_api_call("DELETE", "cart/clear", 200, headers=headers, description="(Clear Cart)")

    def test_wishlist_endpoints(self):
        """Test wishlist endpoints"""
        print("\n❤️ Testing Wishlist...")
        
        if not self.user_token:
            print("   ⚠️ Skipping wishlist tests - no user token")
            return
        
        headers = {"Cookie": f"access_token={self.user_token}"}
        
        # Test get wishlist
        self.test_api_call("GET", "wishlist", 200, headers=headers, description="(Get Wishlist)")
        
        # Get a product ID for wishlist
        success, response = self.test_api_call("GET", "products?limit=1", 200)
        product_id = None
        if success and response:
            try:
                data = response.json()
                products = data.get("products", [])
                if products:
                    product_id = products[0]["id"]
            except:
                pass
        
        if product_id:
            # Test toggle wishlist
            self.test_api_call(
                "POST", f"wishlist/toggle/{product_id}", 200,
                headers=headers,
                description="(Toggle Wishlist)"
            )
            
            # Test check wishlist
            self.test_api_call(
                "GET", f"wishlist/check/{product_id}", 200,
                headers=headers,
                description="(Check Wishlist)"
            )

    def test_orders_endpoints(self):
        """Test orders endpoints"""
        print("\n📋 Testing Orders...")
        
        if not self.user_token:
            print("   ⚠️ Skipping order tests - no user token")
            return
        
        headers = {"Cookie": f"access_token={self.user_token}"}
        
        # Add item to cart first
        success, response = self.test_api_call("GET", "products?limit=1", 200)
        product_id = None
        if success and response:
            try:
                data = response.json()
                products = data.get("products", [])
                if products:
                    product_id = products[0]["id"]
                    # Add to cart
                    self.test_api_call(
                        "POST", "cart/add", 200,
                        {"product_id": product_id, "quantity": 1},
                        headers=headers,
                        description="(Add to Cart for Order)"
                    )
            except:
                pass
        
        # Test create order
        success, response = self.test_api_call(
            "POST", "orders", 200,
            {
                "shipping_name": "Test User",
                "shipping_phone": "081234567890",
                "shipping_address": "Test Address 123",
                "payment_method": "transfer",
                "notes": "Test order"
            },
            headers=headers,
            description="(Create Order)"
        )
        
        order_id = None
        if success and response:
            try:
                order_data = response.json()
                order_id = order_data.get("id")
            except:
                pass
        
        # Test get user orders
        self.test_api_call("GET", "orders", 200, headers=headers, description="(Get User Orders)")
        
        # Test get single order
        if order_id:
            self.test_api_call("GET", f"orders/{order_id}", 200, headers=headers, description="(Get Single Order)")

    def test_admin_endpoints(self):
        """Test admin endpoints"""
        print("\n👑 Testing Admin...")
        
        if not self.admin_token:
            print("   ⚠️ Skipping admin tests - no admin token")
            return
        
        headers = {"Cookie": f"access_token={self.admin_token}"}
        
        # Test admin stats
        self.test_api_call("GET", "admin/stats", 200, headers=headers, description="(Admin Stats)")
        
        # Test admin orders
        self.test_api_call("GET", "admin/orders", 200, headers=headers, description="(Admin Orders)")
        
        # Test admin products
        self.test_api_call("GET", "admin/products", 200, headers=headers, description="(Admin Products)")

    def test_settings_endpoints(self):
        """Test settings endpoints"""
        print("\n⚙️ Testing Settings...")
        
        # Test get settings (public)
        self.test_api_call("GET", "settings", 200, description="(Get Settings)")
        
        if self.admin_token:
            headers = {"Cookie": f"access_token={self.admin_token}"}
            
            # Test update settings
            self.test_api_call(
                "PUT", "settings", 200,
                {
                    "bank_name": "Test Bank",
                    "account_number": "1234567890",
                    "account_holder": "Test Holder"
                },
                headers=headers,
                description="(Update Settings)"
            )

    def test_chat_endpoints(self):
        """Test AI chatbot endpoints"""
        print("\n🤖 Testing AI Chatbot...")
        
        # Test chat endpoint without session_id
        success, response = self.test_api_call(
            "POST", "chat", 200,
            {"message": "Halo, saya ingin tahu tentang tanaman indoor"},
            description="(Chat without session)"
        )
        
        session_id = None
        if success and response:
            try:
                data = response.json()
                session_id = data.get("session_id")
                reply = data.get("reply", "")
                if reply and len(reply) > 10:
                    print(f"   ✅ Chat response received: {reply[:50]}...")
                else:
                    print(f"   ⚠️ Short or empty chat response: {reply}")
            except:
                print("   ❌ Failed to parse chat response")
        
        # Test chat with session_id
        if session_id:
            success, response = self.test_api_call(
                "POST", "chat", 200,
                {
                    "message": "Berapa harga Monstera Deliciosa?",
                    "session_id": session_id
                },
                description="(Chat with session)"
            )
            
            if success and response:
                try:
                    data = response.json()
                    reply = data.get("reply", "")
                    if "monstera" in reply.lower() or "150" in reply:
                        print(f"   ✅ Product-specific response: {reply[:50]}...")
                    else:
                        print(f"   ⚠️ Generic response (may not have product knowledge): {reply[:50]}...")
                except:
                    print("   ❌ Failed to parse chat response")
        
        # Test chat with empty message (should handle gracefully)
        self.test_api_call(
            "POST", "chat", 200,
            {"message": ""},
            description="(Chat with empty message)"
        )

    def run_all_tests(self):
        """Run all API tests"""
        print("🚀 Starting Almira Florist API Tests...")
        print(f"Base URL: {self.base_url}")
        
        # Run test suites
        self.test_auth_endpoints()
        self.test_categories_endpoints()
        self.test_products_endpoints()
        self.test_cart_endpoints()
        self.test_wishlist_endpoints()
        self.test_orders_endpoints()
        self.test_admin_endpoints()
        self.test_settings_endpoints()
        self.test_chat_endpoints()
        
        # Print summary
        print(f"\n📊 Test Summary:")
        print(f"Tests run: {self.tests_run}")
        print(f"Tests passed: {self.tests_passed}")
        print(f"Tests failed: {self.tests_run - self.tests_passed}")
        print(f"Success rate: {(self.tests_passed/self.tests_run*100):.1f}%")
        
        return self.tests_passed == self.tests_run

def main():
    tester = AlmiraFloristAPITester()
    success = tester.run_all_tests()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())