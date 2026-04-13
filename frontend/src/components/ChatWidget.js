import { useState, useEffect, useRef } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageCircle, X, Send, Leaf } from "lucide-react";

const getSessionId = () => {
  let sid = localStorage.getItem("almira_chat_session");
  if (!sid) { sid = crypto.randomUUID(); localStorage.setItem("almira_chat_session", sid); }
  return sid;
};

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasGreeted, setHasGreeted] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open && !hasGreeted && messages.length === 0) {
      setHasGreeted(true);
      sendMessage("Halo", true);
    }
  }, [open, hasGreeted, messages.length]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const sendMessage = async (text, isGreeting = false) => {
    const sessionId = getSessionId();
    if (!isGreeting) {
      setMessages(prev => [...prev, { role: "user", content: text }]);
    }
    setLoading(true);
    try {
      const { data } = await api.post("/chat", { message: text, session_id: sessionId });
      setMessages(prev => [...prev, { role: "assistant", content: data.reply }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Maaf, terjadi gangguan. Hubungi kami via WhatsApp di 087784841084." }]);
    } finally { setLoading(false); }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;
    const text = input.trim();
    setInput("");
    sendMessage(text);
  };

  return (
    <>
      {/* Toggle Button */}
      {!open && (
        <button onClick={() => setOpen(true)} data-testid="chat-toggle-btn"
          className="fixed bottom-6 left-6 z-50 flex items-center gap-2 rounded-full pl-4 pr-5 py-3 bg-primary text-primary-foreground shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300">
          <MessageCircle className="h-5 w-5" />
          <span className="text-sm font-medium hidden md:inline">Chat dengan Kami</span>
        </button>
      )}

      {/* Chat Window */}
      {open && (
        <div className="fixed bottom-6 left-6 z-50 w-[360px] max-w-[calc(100vw-3rem)] rounded-2xl shadow-2xl border bg-card overflow-hidden animate-fade-up" data-testid="chat-window"
          style={{ height: "min(500px, calc(100vh - 6rem))" }}>
          {/* Header */}
          <div className="bg-primary text-primary-foreground px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-primary-foreground/20 flex items-center justify-center">
                <Leaf className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Almira Florist</p>
                <p className="text-[0.65rem] opacity-80">Online 24/7</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-primary-foreground hover:bg-primary-foreground/20" onClick={() => setOpen(false)} data-testid="chat-close-btn">
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3" style={{ height: "calc(100% - 120px)" }}>
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`} data-testid={`chat-message-${i}`}>
                <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-md"
                    : "bg-muted text-foreground rounded-bl-md"
                }`}>
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start" data-testid="chat-typing">
                <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3 flex gap-1">
                  <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} className="border-t px-3 py-2.5 flex gap-2 bg-background">
            <Input ref={inputRef} value={input} onChange={e => setInput(e.target.value)} placeholder="Tulis pesan..."
              className="rounded-full text-sm h-9 border-muted" disabled={loading} data-testid="chat-input" />
            <Button type="submit" size="icon" className="rounded-full h-9 w-9 shrink-0" disabled={loading || !input.trim()} data-testid="chat-send-btn">
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      )}
    </>
  );
}
