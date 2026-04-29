import axios from "axios";

const API_URL = process.env.REACT_APP_BACKEND_URL;

const api = axios.create({
  baseURL: `${API_URL}/api`,
  withCredentials: true,
});

// Guest ID management
export const getGuestId = () => {
  let gid = localStorage.getItem("belibunga_guest_id");
  if (!gid) { gid = crypto.randomUUID(); localStorage.setItem("belibunga_guest_id", gid); }
  return gid;
};

export const clearGuestId = () => localStorage.removeItem("belibunga_guest_id");

// Add guest ID header to all requests
api.interceptors.request.use((config) => {
  config.headers["X-Guest-ID"] = getGuestId();
  return config;
});

export const formatRupiah = (price) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(price);

export const getImageUrl = (path) => {
  if (!path) return "https://images.unsplash.com/photo-1604762526063-07244a385cdf?w=400&fit=crop";
  if (path.startsWith("http")) return path;
  return `${API_URL}/api/files/${path}`;
};

export const formatApiError = (detail) => {
  if (detail == null) return "Terjadi kesalahan. Silakan coba lagi.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((e) => e?.msg || JSON.stringify(e)).filter(Boolean).join(" ");
  if (detail?.msg) return detail.msg;
  return String(detail);
};

export const STATUS_LABELS = {
  pending_payment: "Menunggu Pembayaran",
  payment_uploaded: "Bukti Diunggah",
  confirmed: "Dikonfirmasi",
  processing: "Diproses",
  shipped: "Dikirim",
  delivered: "Selesai",
  cancelled: "Dibatalkan",
};

export const STATUS_COLORS = {
  pending_payment: "bg-yellow-100 text-yellow-800",
  payment_uploaded: "bg-blue-100 text-blue-800",
  confirmed: "bg-emerald-100 text-emerald-800",
  processing: "bg-indigo-100 text-indigo-800",
  shipped: "bg-purple-100 text-purple-800",
  delivered: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
};

export default api;
