import { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import Logo from "@/components/Logo";

export default function AuthPage() {
  const location = useLocation();
  const isRegister = location.pathname === "/register";
  const [tab, setTab] = useState(isRegister ? "register" : "login");
  const navigate = useNavigate();
  const { login, register, user } = useAuth();

  if (user) { navigate(user.role === "admin" ? "/admin" : "/"); return null; }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 pt-24 pb-12" data-testid="auth-page">
      <Card className="w-full max-w-md rounded-2xl shadow-lg">
        <CardHeader className="text-center pb-2">
          <Link to="/" className="flex justify-center mb-4"><Logo size="large" /></Link>
          <CardTitle className="text-2xl" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Selamat Datang</CardTitle>
          <p className="text-sm text-muted-foreground">di Almira Florist</p>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="login" data-testid="login-tab">Masuk</TabsTrigger>
              <TabsTrigger value="register" data-testid="register-tab">Daftar</TabsTrigger>
            </TabsList>
            <TabsContent value="login"><LoginForm onLogin={login} navigate={navigate} /></TabsContent>
            <TabsContent value="register"><RegisterForm onRegister={register} navigate={navigate} /></TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

function LoginForm({ onLogin, navigate }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await onLogin(email, password);
      toast.success("Berhasil masuk!");
      navigate(data.role === "admin" ? "/admin" : "/");
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail) || err.message);
    } finally { setLoading(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-testid="login-form">
      {error && <p className="text-sm text-destructive bg-destructive/10 p-3 rounded-lg" data-testid="login-error">{error}</p>}
      <div><Label htmlFor="login-email">Email</Label><Input id="login-email" type="email" value={email} onChange={e => setEmail(e.target.value)} required className="mt-1" data-testid="login-email-input" /></div>
      <div><Label htmlFor="login-password">Password</Label><Input id="login-password" type="password" value={password} onChange={e => setPassword(e.target.value)} required className="mt-1" data-testid="login-password-input" /></div>
      <Button type="submit" className="w-full rounded-full hover:scale-[1.02] transition-transform" disabled={loading} data-testid="login-submit-btn">
        {loading ? "Memproses..." : "Masuk"}
      </Button>
    </form>
  );
}

function RegisterForm({ onRegister, navigate }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", confirmPassword: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (form.password !== form.confirmPassword) { setError("Password tidak cocok"); return; }
    if (form.password.length < 6) { setError("Password minimal 6 karakter"); return; }
    setLoading(true);
    try {
      await onRegister({ name: form.name, email: form.email, phone: form.phone, password: form.password });
      toast.success("Berhasil mendaftar!");
      navigate("/");
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail) || err.message);
    } finally { setLoading(false); }
  };

  const updateForm = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-testid="register-form">
      {error && <p className="text-sm text-destructive bg-destructive/10 p-3 rounded-lg" data-testid="register-error">{error}</p>}
      <div><Label>Nama Lengkap</Label><Input value={form.name} onChange={e => updateForm("name", e.target.value)} required className="mt-1" data-testid="register-name-input" /></div>
      <div><Label>Email</Label><Input type="email" value={form.email} onChange={e => updateForm("email", e.target.value)} required className="mt-1" data-testid="register-email-input" /></div>
      <div><Label>No. Telepon</Label><Input value={form.phone} onChange={e => updateForm("phone", e.target.value)} className="mt-1" data-testid="register-phone-input" /></div>
      <div><Label>Password</Label><Input type="password" value={form.password} onChange={e => updateForm("password", e.target.value)} required className="mt-1" data-testid="register-password-input" /></div>
      <div><Label>Konfirmasi Password</Label><Input type="password" value={form.confirmPassword} onChange={e => updateForm("confirmPassword", e.target.value)} required className="mt-1" data-testid="register-confirm-input" /></div>
      <Button type="submit" className="w-full rounded-full hover:scale-[1.02] transition-transform" disabled={loading} data-testid="register-submit-btn">
        {loading ? "Memproses..." : "Daftar"}
      </Button>
    </form>
  );
}
