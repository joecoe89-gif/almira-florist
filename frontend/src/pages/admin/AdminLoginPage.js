import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Lock, User as UserIcon, ShieldCheck } from "lucide-react";

export default function AdminLoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const { user, adminLogin, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && user && user.role === "admin") {
      navigate("/admin", { replace: true });
    }
  }, [user, authLoading, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await adminLogin(username.trim(), password);
      if (data.role !== "admin") {
        setError("Akun ini bukan admin");
        return;
      }
      toast.success("Selamat datang, Admin!");
      navigate("/admin", { replace: true });
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail) || "Login gagal");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-gradient-to-br from-emerald-50 via-stone-50 to-amber-50" data-testid="admin-login-page">
      <Card className="w-full max-w-md rounded-2xl shadow-xl border-emerald-100">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-emerald-600 text-white flex items-center justify-center mb-3">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <CardTitle className="text-2xl" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
            Admin Panel
          </CardTitle>
          <p className="text-sm text-muted-foreground">BeliBunga.com</p>
          <p className="text-xs text-muted-foreground mt-1">Masuk untuk mengakses dashboard admin</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4" data-testid="admin-login-form">
            {error && (
              <p className="text-sm text-destructive bg-destructive/10 p-3 rounded-lg" data-testid="admin-login-error">
                {error}
              </p>
            )}
            <div>
              <Label htmlFor="admin-username">Username</Label>
              <div className="relative mt-1">
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="admin-username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  className="pl-9"
                  placeholder="Admin"
                  autoComplete="username"
                  data-testid="admin-username-input"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="admin-password">Password</Label>
              <div className="relative mt-1">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="admin-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="pl-9"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  data-testid="admin-password-input"
                />
              </div>
            </div>
            <Button
              type="submit"
              className="w-full rounded-full hover:scale-[1.02] transition-transform"
              disabled={loading}
              data-testid="admin-login-submit"
            >
              {loading ? "Memproses..." : "Masuk ke Admin Panel"}
            </Button>
          </form>
          <p className="text-xs text-muted-foreground text-center mt-6">
            Halaman ini khusus untuk administrator BeliBunga.com
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
