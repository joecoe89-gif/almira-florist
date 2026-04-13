import { Phone } from "lucide-react";

export default function WhatsAppButton() {
  return (
    <a href="https://wa.me/6287784841084" target="_blank" rel="noopener noreferrer"
      data-testid="whatsapp-float-btn"
      className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full px-5 py-3 text-white font-medium text-sm shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300"
      style={{ backgroundColor: "#25D366" }}>
      <Phone className="h-5 w-5" />
      <span className="hidden md:inline">Chat WhatsApp</span>
    </a>
  );
}
