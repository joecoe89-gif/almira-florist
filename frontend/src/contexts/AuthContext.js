import { createContext, useContext, useState, useEffect, useCallback } from "react";
import api, { getGuestId } from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cartCount, setCartCount] = useState(0);

  const refreshCart = useCallback(async () => {
    try {
      const { data } = await api.get("/cart");
      setCartCount(data.items?.length || 0);
    } catch {
      setCartCount(0);
    }
  }, []);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data } = await api.get("/auth/me");
        setUser(data);
      } catch {
        setUser(false);
      } finally {
        setLoading(false);
      }
    };
    checkAuth();
  }, []);

  useEffect(() => {
    refreshCart();
  }, [user, refreshCart]);

  const mergeGuestCart = async () => {
    try { await api.post("/cart/merge"); } catch {}
  };

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    setUser(data);
    await mergeGuestCart();
    await refreshCart();
    return data;
  };

  const register = async (formData) => {
    const { data } = await api.post("/auth/register", formData);
    setUser(data);
    await mergeGuestCart();
    await refreshCart();
    return data;
  };

  const logout = async () => {
    await api.post("/auth/logout");
    setUser(false);
    setCartCount(0);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, cartCount, refreshCart }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
