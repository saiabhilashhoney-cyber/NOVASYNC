"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Store, ShoppingCart, Zap, RefreshCw, TrendingUp, Package,
  AlertTriangle, CheckCircle, XCircle, ChevronRight, Plus,
  Minus, X, Search, Sparkles, BarChart3, Clock, Shield,
  ArrowRight, Flame, Send, RotateCcw, Bell, Star, MapPin
} from "lucide-react";
import {
  INITIAL_INVENTORY, SUBSTITUTE_MAP, StockItem, CartItem,
  ParsedUpdate, SubstituteItem, getStockLevel, getStockColor,
  getStockBgColor, parseOwnerInput
} from "@/lib/inventory";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type ActivePanel = "owner" | "customer";

interface ToastMsg { id: string; message: string; type: "success" | "warn" | "error"; }

interface SubstGuardState {
  open: boolean;
  item: StockItem | null;
  substitutes: SubstituteItem[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const fmt = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

const CATEGORIES = ["All", "Grains", "Dairy", "Protein", "Vegetables", "Cooking", "Essentials", "Beverages", "Snacks"];

const QUICK_UPDATES = [
  "Got 20 packets of atta, out of butter",
  "Received 10 kg rice and 5 ltr oil",
  "Out of salt, tomatoes: 8 kg",
  "Added 30 pcs eggs, tea: 12 pcs",
];

const TICKER_ITEMS = [
  { label: "Avg Delivery", value: "8 min", icon: "⚡" },
  { label: "Trust Score", value: "98.4%", icon: "🛡️" },
  { label: "Live Stores", value: "2,847", icon: "🏪" },
  { label: "Orders Today", value: "41.2K", icon: "📦" },
  { label: "Cancellations Prevented", value: "99.1%", icon: "✅" },
  { label: "Smart Subs Used", value: "8,301", icon: "🔄" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function LiveTicker() {
  const items = [...TICKER_ITEMS, ...TICKER_ITEMS];
  return (
    <div className="relative overflow-hidden py-3" style={{ background: "rgba(99,102,241,0.06)", borderBottom: "1px solid rgba(99,102,241,0.15)" }}>
      <div className="ticker-track flex gap-10 whitespace-nowrap" style={{ width: "max-content" }}>
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span>{item.icon}</span>
            <span style={{ color: "var(--text-secondary)" }}>{item.label}:</span>
            <span className="font-semibold" style={{ color: "var(--accent-indigo)" }}>{item.value}</span>
            <span style={{ color: "rgba(255,255,255,0.1)" }}>|</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StockBar({ item }: { item: StockItem }) {
  const pct = Math.min(100, (item.qty / item.maxQty) * 100);
  const level = getStockLevel(item);
  const color = getStockColor(level);
  return (
    <div className="stock-bar" style={{ background: "rgba(255,255,255,0.06)" }}>
      <div className="stock-bar-fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

function StockBadge({ item }: { item: StockItem }) {
  const level = getStockLevel(item);
  const color = getStockColor(level);
  const bg = getStockBgColor(level);
  const labels: Record<string, string> = { high: "In Stock", medium: "Limited", low: "Low Stock", out: "Out of Stock" };
  return (
    <span className="tag" style={{ background: bg, color }}>
      {level !== "high" && level !== "out" && <span className="pulse-dot" style={{ width: 6, height: 6, borderRadius: "50%", background: color, display: "inline-block", marginRight: 2 }} />}
      {labels[level]}
    </span>
  );
}

function Toast({ msg, onRemove }: { msg: ToastMsg; onRemove: (id: string) => void }) {
  useEffect(() => {
    const t = setTimeout(() => onRemove(msg.id), 3000);
    return () => clearTimeout(t);
  }, [msg.id, onRemove]);

  const colors: Record<string, string> = {
    success: "var(--accent-emerald)",
    warn: "var(--accent-amber)",
    error: "var(--accent-rose)",
  };

  return (
    <div className="toast glass-card" style={{
      padding: "12px 16px", display: "flex", alignItems: "center", gap: 10,
      borderLeft: `3px solid ${colors[msg.type]}`, minWidth: 280, maxWidth: 360
    }}>
      {msg.type === "success" && <CheckCircle size={16} style={{ color: colors[msg.type], flexShrink: 0 }} />}
      {msg.type === "warn" && <AlertTriangle size={16} style={{ color: colors[msg.type], flexShrink: 0 }} />}
      {msg.type === "error" && <XCircle size={16} style={{ color: colors[msg.type], flexShrink: 0 }} />}
      <span style={{ fontSize: "0.85rem", color: "var(--text-primary)" }}>{msg.message}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Owner Panel
// ─────────────────────────────────────────────────────────────────────────────
function OwnerPanel({
  inventory, onApplyUpdates, onAddProduct, addToast
}: {
  inventory: StockItem[];
  onApplyUpdates: (updates: ParsedUpdate[]) => void;
  onAddProduct: (item: StockItem) => void;
  addToast: (msg: string, type: ToastMsg["type"]) => void;
}) {
  const [input, setInput] = useState("");
  const [parsed, setParsed] = useState<ParsedUpdate[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [editQty, setEditQty] = useState<Record<string, number>>({});
  const [addProductOpen, setAddProductOpen] = useState(false);
  const [newProduct, setNewProduct] = useState({ name: "", emoji: "📦", category: "Essentials", price: "", unit: "pcs", qty: "", maxQty: "" });
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleAddNewProduct = useCallback(() => {
    if (!newProduct.name.trim() || !newProduct.price || !newProduct.qty || !newProduct.maxQty) {
      addToast("Please fill all required fields", "warn");
      return;
    }
    const id = newProduct.name.toLowerCase().replace(/\s+/g, "-") + "-" + Date.now();
    const item: StockItem = {
      id,
      name: newProduct.name.trim(),
      emoji: newProduct.emoji || "📦",
      category: newProduct.category,
      price: parseFloat(newProduct.price),
      unit: newProduct.unit,
      qty: parseInt(newProduct.qty),
      maxQty: parseInt(newProduct.maxQty),
      lastUpdated: new Date(),
    };
    onAddProduct(item);
    setNewProduct({ name: "", emoji: "📦", category: "Essentials", price: "", unit: "pcs", qty: "", maxQty: "" });
    setAddProductOpen(false);
    addToast(`✨ ${item.name} added to inventory`, "success");
  }, [newProduct, onAddProduct, addToast]);

  const handleParse = useCallback(() => {
    if (!input.trim()) return;
    setIsParsing(true);
    setTimeout(() => {
      const results = parseOwnerInput(input, inventory);
      setParsed(results);
      setEditQty({});
      setIsParsing(false);
      if (results.length === 0) {
        addToast("Couldn't parse update. Try: 'Got 20 kg atta, out of butter'", "warn");
      }
    }, 400);
  }, [input, inventory, addToast]);

  const handleApply = useCallback(() => {
    const finalUpdates = parsed.map(p => ({
      ...p,
      qty: editQty[p.itemName] !== undefined ? editQty[p.itemName] : p.qty
    }));
    onApplyUpdates(finalUpdates);
    setParsed([]);
    setInput("");
    addToast(`✓ ${finalUpdates.length} item(s) updated in real-time`, "success");
  }, [parsed, editQty, onApplyUpdates, addToast]);

  const metrics = {
    available: inventory.filter(i => getStockLevel(i) === "high" || getStockLevel(i) === "medium").length,
    limited:   inventory.filter(i => getStockLevel(i) === "medium").length,
    lowStock:  inventory.filter(i => getStockLevel(i) === "low").length,
    outOfStock:inventory.filter(i => getStockLevel(i) === "out").length,
    totalValue:inventory.reduce((sum, i) => sum + i.qty * i.price, 0),
  };
  // sanity: available + lowStock + outOfStock should equal inventory.length

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="glass-card p-5" style={{ borderColor: "rgba(99,102,241,0.25)", background: "rgba(99,102,241,0.06)" }}>
        {/* Store info row */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Store size={18} style={{ color: "var(--accent-indigo)" }} />
            </div>
            <div>
              <h2 className="font-bold text-sm" style={{ color: "var(--text-primary)", fontFamily: "'Space Grotesk', sans-serif", lineHeight: 1.3 }}>
                Store Owner Portal
              </h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent-emerald)", flexShrink: 0 }} className="pulse-dot" />
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Rajesh's Kirana · Koramangala</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)" }}>
            <MapPin size={11} style={{ color: "var(--accent-emerald)" }} />
            <span className="text-xs font-medium" style={{ color: "var(--accent-emerald)" }}>Live Synced</span>
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "rgba(255,255,255,0.06)", marginBottom: 16 }} />

        {/* Metrics — 4 columns: Available | Low Stock | Out of Stock | Value */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Available",      value: metrics.available,       sub: `${metrics.limited} limited`, color: "var(--accent-emerald)", bg: "rgba(16,185,129,0.08)",  border: "rgba(16,185,129,0.2)",  icon: <CheckCircle   size={15} /> },
            { label: "Low Stock",      value: metrics.lowStock,        sub: "needs restock",               color: "var(--accent-amber)",   bg: "rgba(245,158,11,0.08)",  border: "rgba(245,158,11,0.2)",  icon: <AlertTriangle size={15} /> },
            { label: "Out of Stock",   value: metrics.outOfStock,      sub: "unavailable",                 color: "var(--accent-rose)",    bg: "rgba(244,63,94,0.08)",   border: "rgba(244,63,94,0.2)",   icon: <XCircle       size={15} /> },
            { label: "Inventory Value",value: fmt(metrics.totalValue), sub: `${inventory.length} items`,  color: "var(--accent-indigo)", bg: "rgba(99,102,241,0.08)",  border: "rgba(99,102,241,0.2)",  icon: <TrendingUp    size={15} /> },
          ].map((m, i) => (
            <div key={i} className="flex flex-col gap-2 p-4 rounded-xl" style={{ background: m.bg, border: `1px solid ${m.border}` }}>
              <div className="flex items-center gap-1.5" style={{ color: m.color }}>
                {m.icon}
                <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>{m.label}</span>
              </div>
              <p className="font-bold text-2xl leading-none" style={{ color: m.color, fontFamily: "'Space Grotesk', sans-serif" }}>{m.value}</p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>{m.sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Two-column body ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>

        {/* LEFT — NLP Update + Parsed Preview */}
        <div className="flex flex-col gap-4">

      {/* Smart Update Input */}
      <div className="glass-card p-5 flex flex-col gap-4" style={{ borderColor: "rgba(99,102,241,0.2)" }}>
        <div className="flex items-center gap-2">
          <Sparkles size={16} style={{ color: "var(--accent-violet)" }} />
          <h3 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>AI-Powered Stock Update</h3>
          <span className="tag" style={{ background: "rgba(139,92,246,0.15)", color: "var(--accent-violet)", marginLeft: "auto" }}>NLP Parser</span>
        </div>
        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Type naturally — "Got 20 packets of atta, out of butter" — and Nova Cart understands.</p>

        {/* Quick fill chips */}
        <div className="flex flex-wrap gap-2">
          {QUICK_UPDATES.map((q, i) => (
            <button key={i} onClick={() => setInput(q)} className="text-xs px-3 py-1.5 rounded-full transition-all"
              style={{ background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)", color: "var(--text-secondary)", cursor: "pointer" }}
              onMouseEnter={e => { (e.target as HTMLElement).style.background = "rgba(99,102,241,0.2)"; (e.target as HTMLElement).style.color = "var(--text-primary)"; }}
              onMouseLeave={e => { (e.target as HTMLElement).style.background = "rgba(99,102,241,0.1)"; (e.target as HTMLElement).style.color = "var(--text-secondary)"; }}
            >
              {q.length > 35 ? q.slice(0, 35) + "…" : q}
            </button>
          ))}
        </div>

        <div className="relative">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && e.ctrlKey) handleParse(); }}
            placeholder="e.g. Got 20 packets of atta, out of butter, milk: 15 ltr"
            rows={3}
            style={{
              width: "100%", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(99,102,241,0.25)",
              borderRadius: 12, padding: "12px 16px", color: "var(--text-primary)", fontSize: "0.875rem",
              resize: "vertical", outline: "none", fontFamily: "inherit",
              transition: "border-color 0.2s"
            }}
            onFocus={e => { (e.target as HTMLElement).style.borderColor = "rgba(99,102,241,0.6)"; }}
            onBlur={e => { (e.target as HTMLElement).style.borderColor = "rgba(99,102,241,0.25)"; }}
          />
          <div className="absolute bottom-3 right-3 text-xs" style={{ color: "var(--text-muted)" }}>Ctrl+Enter</div>
        </div>

        <div className="flex gap-3">
          <button onClick={handleParse} disabled={!input.trim() || isParsing} className="btn-primary flex items-center gap-2 flex-1 justify-center">
            {isParsing ? <RefreshCw size={14} className="animate-spin" /> : <Zap size={14} />}
            {isParsing ? "Parsing…" : "Parse Update"}
          </button>
          {input && (
            <button onClick={() => { setInput(""); setParsed([]); }} style={{ padding: "10px 16px", borderRadius: 12, background: "rgba(255,255,255,0.06)", border: "1px solid var(--border)", color: "var(--text-secondary)", cursor: "pointer", fontSize: "0.875rem" }}>
              <RotateCcw size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Parsed Preview */}
      {parsed.length > 0 && (
        <div className="glass-card p-5 flex flex-col gap-4 slide-up" style={{ borderColor: "rgba(16,185,129,0.2)" }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle size={16} style={{ color: "var(--accent-emerald)" }} />
              <h3 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>Parsed — Review before applying</h3>
            </div>
            <span className="tag" style={{ background: "rgba(16,185,129,0.1)", color: "var(--accent-emerald)" }}>{parsed.length} changes</span>
          </div>

          <div className="flex flex-col gap-3">
            {parsed.map((p, i) => {
              const invItem = inventory.find(inv => inv.id === p.matchedId);
              const qtyValue = editQty[p.itemName] !== undefined ? editQty[p.itemName] : p.qty;
              return (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.12)" }}>
                  <div className="text-xl">{invItem?.emoji || "📦"}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{invItem?.name || p.itemName}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                        {p.action === "set" && qtyValue === 0 ? "→ Mark out of stock" : p.action === "add" ? `→ Add ${qtyValue} ${p.unit || invItem?.unit || "pcs"}` : `→ Set to ${qtyValue} ${p.unit || invItem?.unit || "pcs"}`}
                      </span>
                      <span className="text-xs" style={{ color: "var(--accent-emerald)", opacity: p.confidence / 100 }}>
                        {Math.round(p.confidence)}% match
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {p.action !== "set" || qtyValue !== 0 ? (
                      <>
                        <button onClick={() => setEditQty(q => ({ ...q, [p.itemName]: Math.max(0, qtyValue - 1) }))}
                          style={{ width: 26, height: 26, borderRadius: 8, border: "1px solid var(--border)", background: "rgba(255,255,255,0.05)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Minus size={12} style={{ color: "var(--text-secondary)" }} />
                        </button>
                        <span className="w-8 text-center text-sm font-bold" style={{ color: "var(--text-primary)" }}>{qtyValue}</span>
                        <button onClick={() => setEditQty(q => ({ ...q, [p.itemName]: qtyValue + 1 }))}
                          style={{ width: 26, height: 26, borderRadius: 8, border: "1px solid var(--border)", background: "rgba(255,255,255,0.05)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Plus size={12} style={{ color: "var(--text-secondary)" }} />
                        </button>
                      </>
                    ) : (
                      <span className="tag" style={{ background: "rgba(244,63,94,0.1)", color: "var(--accent-rose)" }}>OOS</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <button onClick={handleApply} className="btn-primary flex items-center gap-2 justify-center" style={{ background: "linear-gradient(135deg, #10b981, #059669)" }}>
            <Send size={14} />
            Apply & Sync Live
          </button>
        </div>
      )}
        </div>{/* end LEFT column */}

        {/* RIGHT — Live Inventory */}
      {/* Inventory table */}
        <div className="glass-card p-5 flex flex-col gap-4" style={{ borderColor: "rgba(99,102,241,0.15)" }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package size={16} style={{ color: "var(--accent-indigo)" }} />
              <h3 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>Live Inventory</h3>
              <span className="tag" style={{ background: "rgba(99,102,241,0.1)", color: "var(--accent-indigo)" }}>{inventory.length} items</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent-emerald)" }} className="pulse-dot" />
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>Syncing…</span>
              </div>
              <button onClick={() => setAddProductOpen(true)}
                className="flex items-center gap-1.5 btn-primary"
                style={{ padding: "6px 12px", fontSize: "0.75rem", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", borderRadius: 9 }}>
                <Plus size={13} /> Add Product
              </button>
            </div>
          </div>

        <div className="overflow-y-auto flex flex-col gap-2 pr-1" style={{ maxHeight: 560 }}>
            {inventory.map(item => {
              const level = getStockLevel(item);
              return (
                <div key={item.id} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.05)" }}>
                  <span className="text-lg">{item.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold truncate" style={{ color: "var(--text-primary)" }}>{item.name}</span>
                      <div className="flex items-center gap-2 ml-2">
                        <span className="text-xs" style={{ color: "var(--text-muted)", whiteSpace: "nowrap" }}>₹{item.price}/{item.unit}</span>
                        <span className="text-xs font-bold" style={{ color: getStockColor(level), whiteSpace: "nowrap" }}>{item.qty} {item.unit}</span>
                      </div>
                    </div>
                    <StockBar item={item} />
                  </div>
                  <StockBadge item={item} />
                </div>
              );
            })}
        </div>
        </div>{/* end RIGHT column */}

      </div>{/* end two-column grid */}

      {/* ── Add Product Modal ── */}
      {addProductOpen && (
        <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)" }}
          onClick={() => setAddProductOpen(false)}>
          <div className="modal-content glass-card p-6 w-full max-w-md"
            style={{ background: "rgba(10,15,30,0.97)", borderColor: "rgba(99,102,241,0.35)", boxShadow: "0 24px 80px rgba(0,0,0,0.6), 0 0 60px rgba(99,102,241,0.12)" }}
            onClick={e => e.stopPropagation()}>

            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-bold text-base" style={{ color: "var(--text-primary)", fontFamily: "'Space Grotesk', sans-serif" }}>Add New Product</h3>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>New items instantly appear in customer view</p>
              </div>
              <button onClick={() => setAddProductOpen(false)}
                style={{ width: 32, height: 32, borderRadius: 9, background: "rgba(255,255,255,0.06)", border: "1px solid var(--border)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <X size={14} style={{ color: "var(--text-secondary)" }} />
              </button>
            </div>

            <div className="flex flex-col gap-4">
              {/* Emoji + Name row */}
              <div className="flex gap-3">
                <div className="flex flex-col gap-1" style={{ width: 80 }}>
                  <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Emoji</label>
                  <input value={newProduct.emoji} onChange={e => setNewProduct(p => ({ ...p, emoji: e.target.value }))}
                    maxLength={2} placeholder="📦"
                    style={{ width: "100%", textAlign: "center", fontSize: "1.5rem", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(99,102,241,0.25)", borderRadius: 10, padding: "8px", color: "var(--text-primary)", outline: "none" }} />
                </div>
                <div className="flex flex-col gap-1 flex-1">
                  <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Product Name *</label>
                  <input value={newProduct.name} onChange={e => setNewProduct(p => ({ ...p, name: e.target.value }))}
                    placeholder="e.g. Amul Cheese Slices"
                    style={{ width: "100%", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(99,102,241,0.25)", borderRadius: 10, padding: "10px 14px", color: "var(--text-primary)", fontSize: "0.875rem", outline: "none", fontFamily: "inherit" }} />
                </div>
              </div>

              {/* Category + Unit */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Category</label>
                  <select value={newProduct.category} onChange={e => setNewProduct(p => ({ ...p, category: e.target.value }))}
                    style={{ width: "100%", background: "rgba(0,0,0,0.6)", border: "1px solid rgba(99,102,241,0.25)", borderRadius: 10, padding: "10px 14px", color: "var(--text-primary)", fontSize: "0.875rem", outline: "none", cursor: "pointer" }}>
                    {["Grains","Dairy","Protein","Vegetables","Cooking","Essentials","Beverages","Snacks"].map(c => (
                      <option key={c} value={c} style={{ background: "#0a0f1e" }}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Unit</label>
                  <select value={newProduct.unit} onChange={e => setNewProduct(p => ({ ...p, unit: e.target.value }))}
                    style={{ width: "100%", background: "rgba(0,0,0,0.6)", border: "1px solid rgba(99,102,241,0.25)", borderRadius: 10, padding: "10px 14px", color: "var(--text-primary)", fontSize: "0.875rem", outline: "none", cursor: "pointer" }}>
                    {["pcs","kg","g","ltr","ml"].map(u => (
                      <option key={u} value={u} style={{ background: "#0a0f1e" }}>{u}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Price + Qty + MaxQty */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Price (₹) *",     key: "price",  placeholder: "49" },
                  { label: "Current Stock *", key: "qty",    placeholder: "20" },
                  { label: "Max Capacity *",  key: "maxQty", placeholder: "50" },
                ].map(f => (
                  <div key={f.key} className="flex flex-col gap-1">
                    <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>{f.label}</label>
                    <input type="number" min="0"
                      value={(newProduct as any)[f.key]}
                      onChange={e => setNewProduct(p => ({ ...p, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      style={{ width: "100%", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(99,102,241,0.25)", borderRadius: 10, padding: "10px 14px", color: "var(--text-primary)", fontSize: "0.875rem", outline: "none", fontFamily: "inherit" }} />
                  </div>
                ))}
              </div>

              {/* Preview */}
              {newProduct.name && (
                <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "rgba(99,102,241,0.07)", border: "1px solid rgba(99,102,241,0.2)" }}>
                  <span className="text-2xl">{newProduct.emoji || "📦"}</span>
                  <div className="flex-1">
                    <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{newProduct.name}</p>
                    <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{newProduct.category} · ₹{newProduct.price || "—"}/{newProduct.unit} · Stock: {newProduct.qty || "—"}/{newProduct.maxQty || "—"} {newProduct.unit}</p>
                  </div>
                  <span className="tag" style={{ background: "rgba(16,185,129,0.1)", color: "var(--accent-emerald)" }}>Preview</span>
                </div>
              )}

              <div className="flex gap-3 mt-1">
                <button onClick={() => setAddProductOpen(false)}
                  style={{ flex: 1, padding: "10px", borderRadius: 12, background: "rgba(255,255,255,0.05)", border: "1px solid var(--border)", color: "var(--text-secondary)", cursor: "pointer", fontSize: "0.875rem" }}>
                  Cancel
                </button>
                <button onClick={handleAddNewProduct} className="btn-primary flex items-center gap-2 justify-center" style={{ flex: 2 }}>
                  <Plus size={14} /> Add to Inventory
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Customer Panel
// ─────────────────────────────────────────────────────────────────────────────
function CustomerPanel({
  inventory, addToast
}: {
  inventory: StockItem[];
  addToast: (msg: string, type: ToastMsg["type"]) => void;
}) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [guardState, setGuardState] = useState<SubstGuardState>({ open: false, item: null, substitutes: [] });
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutDone, setCheckoutDone] = useState(false);
  const cartRef = useRef<HTMLDivElement>(null);

  const filtered = inventory.filter(item => {
    const matchCat = activeCategory === "All" || item.category === activeCategory;
    const matchSearch = item.name.toLowerCase().includes(search.toLowerCase()) || item.category.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const cartTotal = cart.reduce((sum, c) => sum + c.cartQty * c.price, 0);
  const cartCount = cart.reduce((sum, c) => sum + c.cartQty, 0);

  const handleAddToCart = useCallback((item: StockItem) => {
    const level = getStockLevel(item);
    if (level === "out") {
      // Check substitutes
      const subs = SUBSTITUTE_MAP[item.id] || [];
      setGuardState({ open: true, item, substitutes: subs });
      return;
    }
    if (level === "low") {
      const subs = SUBSTITUTE_MAP[item.id] || [];
      if (subs.length > 0) {
        setGuardState({ open: true, item, substitutes: subs });
        return;
      }
    }
    setCart(prev => {
      const existing = prev.find(c => c.id === item.id);
      if (existing) {
        return prev.map(c => c.id === item.id ? { ...c, cartQty: Math.min(c.cartQty + 1, item.qty) } : c);
      }
      return [...prev, { ...item, cartQty: 1 }];
    });
    addToast(`${item.emoji} ${item.name} added to cart`, "success");
  }, [addToast]);

  const handleRemoveFromCart = useCallback((id: string) => {
    setCart(prev => prev.filter(c => c.id !== id));
  }, []);

  const handleQtyChange = useCallback((id: string, delta: number) => {
    setCart(prev => prev.map(c => {
      if (c.id !== id) return c;
      const newQty = c.cartQty + delta;
      if (newQty <= 0) return null as unknown as CartItem;
      return { ...c, cartQty: Math.min(newQty, c.qty) };
    }).filter(Boolean));
  }, []);

  const handleForceAdd = useCallback(() => {
    if (!guardState.item) return;
    const item = guardState.item;
    if (item.qty > 0) {
      setCart(prev => {
        const existing = prev.find(c => c.id === item.id);
        if (existing) return prev.map(c => c.id === item.id ? { ...c, cartQty: Math.min(c.cartQty + 1, item.qty) } : c);
        return [...prev, { ...item, cartQty: 1 }];
      });
      addToast(`${item.emoji} Added with low stock notice`, "warn");
    }
    setGuardState({ open: false, item: null, substitutes: [] });
  }, [guardState.item, addToast]);

  const handlePickSub = useCallback((sub: SubstituteItem) => {
    const invItem = inventory.find(i => i.id === sub.id);
    if (invItem) {
      setCart(prev => {
        const existing = prev.find(c => c.id === invItem.id);
        if (existing) return prev.map(c => c.id === invItem.id ? { ...c, cartQty: c.cartQty + 1 } : c);
        return [...prev, { ...invItem, cartQty: 1 }];
      });
      addToast(`🔄 Switched to ${invItem.name}`, "success");
    } else {
      addToast(`🔄 ${sub.name} noted — will be sourced`, "warn");
    }
    setGuardState({ open: false, item: null, substitutes: [] });
  }, [inventory, addToast]);

  const handleCheckout = useCallback(() => {
    setCartOpen(false);
    setCheckoutDone(true);
    setTimeout(() => setCheckoutDone(false), 4000);
    setCart([]);
    addToast("🎉 Order placed! Arriving in ~8 min", "success");
  }, [addToast]);

  return (
    <div className="flex flex-col gap-5 h-full">
      {/* Header */}
      <div className="glass-card p-5" style={{ borderColor: "rgba(6,182,212,0.25)", background: "rgba(6,182,212,0.04)" }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ShoppingCart size={18} style={{ color: "var(--accent-cyan)" }} />
              <h2 className="font-bold text-base" style={{ color: "var(--text-primary)", fontFamily: "'Space Grotesk', sans-serif" }}>
                Customer Discovery
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <Flame size={12} style={{ color: "var(--accent-amber)" }} />
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Rajesh's Kirana · Real-time stock · Koramangala</p>
            </div>
          </div>
          <button
            id="cart-btn"
            onClick={() => setCartOpen(true)}
            className="relative flex items-center gap-2 btn-primary"
            style={{ background: "linear-gradient(135deg, #06b6d4, #10b981)", padding: "10px 16px" }}
          >
            <ShoppingCart size={16} />
            <span>Cart</span>
            {cartCount > 0 && (
              <span className="cart-bounce" style={{
                position: "absolute", top: -8, right: -8, background: "var(--accent-rose)",
                color: "white", fontSize: "0.7rem", fontWeight: 700, borderRadius: "50%",
                width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center",
                border: "2px solid var(--bg-primary)"
              }}>
                {cartCount}
              </span>
            )}
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none" }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search items, categories…"
            style={{
              width: "100%", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(6,182,212,0.2)",
              borderRadius: 12, padding: "10px 16px 10px 38px", color: "var(--text-primary)",
              fontSize: "0.875rem", outline: "none", transition: "border-color 0.2s"
            }}
            onFocus={e => { (e.target as HTMLElement).style.borderColor = "rgba(6,182,212,0.5)"; }}
            onBlur={e => { (e.target as HTMLElement).style.borderColor = "rgba(6,182,212,0.2)"; }}
          />
        </div>
      </div>

      {/* Category filter */}
      <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
        {CATEGORIES.map(cat => (
          <button key={cat} onClick={() => setActiveCategory(cat)}
            style={{
              whiteSpace: "nowrap", padding: "6px 14px", borderRadius: 100,
              fontSize: "0.75rem", fontWeight: 600, cursor: "pointer", transition: "all 0.2s",
              background: activeCategory === cat ? "linear-gradient(135deg, #06b6d4, #10b981)" : "rgba(255,255,255,0.05)",
              border: activeCategory === cat ? "1px solid transparent" : "1px solid rgba(255,255,255,0.08)",
              color: activeCategory === cat ? "white" : "var(--text-secondary)",
              boxShadow: activeCategory === cat ? "0 4px 12px rgba(6,182,212,0.3)" : "none",
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Product grid */}
      <div className="flex-1 overflow-y-auto" style={{ maxHeight: 480 }}>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16" style={{ color: "var(--text-muted)" }}>
            <Package size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
            <p className="text-sm">No items found</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filtered.map(item => {
              const level = getStockLevel(item);
              const cartItem = cart.find(c => c.id === item.id);
              const isOut = level === "out";
              const isLow = level === "low";
              const hasSubs = !!SUBSTITUTE_MAP[item.id];

              return (
                <div key={item.id} className="glass-card p-4 flex flex-col gap-3 relative overflow-hidden"
                  style={{ opacity: isOut ? 0.7 : 1, borderColor: isLow ? "rgba(244,63,94,0.2)" : isOut ? "rgba(107,114,128,0.2)" : "var(--border)" }}>
                  {isLow && (
                    <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: "linear-gradient(90deg, #f43f5e, transparent)" }} />
                  )}
                  <div className="flex items-start justify-between">
                    <div className="text-2xl">{item.emoji}</div>
                    <StockBadge item={item} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>{item.name}</p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{item.category}</p>
                  </div>
                  <StockBar item={item} />
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>
                      ₹{item.price}<span className="font-normal text-xs" style={{ color: "var(--text-muted)" }}>/{item.unit}</span>
                    </span>
                    {isOut && hasSubs ? (
                      <button onClick={() => handleAddToCart(item)}
                        className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg"
                        style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)", color: "var(--accent-violet)", cursor: "pointer" }}>
                        <RefreshCw size={11} /> Sub
                      </button>
                    ) : cartItem ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleQtyChange(item.id, -1)}
                          style={{ width: 26, height: 26, borderRadius: 8, background: "rgba(255,255,255,0.08)", border: "1px solid var(--border)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Minus size={12} style={{ color: "var(--text-secondary)" }} />
                        </button>
                        <span className="w-6 text-center text-sm font-bold" style={{ color: "var(--text-primary)" }}>{cartItem.cartQty}</span>
                        <button onClick={() => handleAddToCart(item)}
                          style={{ width: 26, height: 26, borderRadius: 8, background: "linear-gradient(135deg, #06b6d4, #10b981)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Plus size={12} style={{ color: "white" }} />
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => handleAddToCart(item)} disabled={isOut && !hasSubs}
                        className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg"
                        style={{
                          background: isOut && !hasSubs ? "rgba(255,255,255,0.05)" : "linear-gradient(135deg, #06b6d4, #10b981)",
                          border: "none", color: isOut && !hasSubs ? "var(--text-muted)" : "white",
                          cursor: isOut && !hasSubs ? "not-allowed" : "pointer",
                          boxShadow: isOut && !hasSubs ? "none" : "0 2px 8px rgba(6,182,212,0.3)"
                        }}>
                        <Plus size={11} /> Add
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Smart Substitution Guard Modal */}
      {guardState.open && guardState.item && (
        <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)" }}
          onClick={() => setGuardState({ open: false, item: null, substitutes: [] })}>
          <div className="modal-content glass-card p-6 w-full max-w-sm relative"
            style={{ borderColor: "rgba(244,63,94,0.3)", background: "rgba(10,15,30,0.95)", boxShadow: "0 20px 80px rgba(0,0,0,0.6), 0 0 60px rgba(244,63,94,0.1)" }}
            onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
              <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(244,63,94,0.12)", border: "1px solid rgba(244,63,94,0.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Shield size={22} style={{ color: "var(--accent-rose)" }} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-base" style={{ color: "var(--text-primary)", fontFamily: "'Space Grotesk', sans-serif" }}>Smart Sub Guard</h3>
                  <span className="tag" style={{ background: "rgba(244,63,94,0.1)", color: "var(--accent-rose)" }}>
                    {getStockLevel(guardState.item) === "out" ? "Out of Stock" : "Low Stock"}
                  </span>
                </div>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>Preventing order cancellation for you</p>
              </div>
            </div>

            {/* Item preview */}
            <div className="flex items-center gap-3 p-3 rounded-xl mb-4" style={{ background: "rgba(244,63,94,0.07)", border: "1px solid rgba(244,63,94,0.15)" }}>
              <span className="text-2xl">{guardState.item.emoji}</span>
              <div className="flex-1">
                <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{guardState.item.name}</p>
                <p className="text-xs" style={{ color: "var(--accent-rose)" }}>
                  {getStockLevel(guardState.item) === "out" ? "Unavailable at this store right now" : `Only ${guardState.item.qty} ${guardState.item.unit} remaining`}
                </p>
              </div>
            </div>

            {/* Substitutes */}
            {guardState.substitutes.length > 0 && (
              <div className="flex flex-col gap-2 mb-4">
                <p className="text-xs font-semibold mb-1" style={{ color: "var(--text-secondary)" }}>
                  <Sparkles size={12} style={{ display: "inline", marginRight: 4 }} />
                  AI-Recommended Substitutes
                </p>
                {guardState.substitutes.map(sub => (
                  <button key={sub.id} onClick={() => handlePickSub(sub)}
                    className="flex items-center gap-3 p-3 rounded-xl text-left w-full transition-all"
                    style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.2)", cursor: "pointer" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(139,92,246,0.15)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(139,92,246,0.08)"; }}>
                    <span className="text-xl">{sub.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{sub.name}</p>
                      <p className="text-xs truncate" style={{ color: "var(--text-secondary)" }}>{sub.reason}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-xs font-bold" style={{ color: "var(--accent-violet)" }}>{sub.similarity}%</span>
                      <ArrowRight size={12} style={{ color: "var(--accent-violet)" }} />
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col gap-2">
              {getStockLevel(guardState.item) === "low" && (
                <button onClick={handleForceAdd}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all"
                  style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.25)", color: "var(--accent-amber)", cursor: "pointer" }}>
                  <AlertTriangle size={14} style={{ display: "inline", marginRight: 6 }} />
                  Proceed Anyway (Low Stock Risk)
                </button>
              )}
              <button onClick={() => setGuardState({ open: false, item: null, substitutes: [] })}
                className="w-full py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--border)", color: "var(--text-secondary)", cursor: "pointer" }}>
                Keep Browsing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cart Sidebar */}
      {cartOpen && (
        <div className="modal-backdrop fixed inset-0 z-50 flex justify-end"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
          onClick={() => setCartOpen(false)}>
          <div ref={cartRef} className="modal-content h-full flex flex-col"
            style={{ width: "min(380px, 100vw)", background: "var(--bg-secondary)", borderLeft: "1px solid rgba(6,182,212,0.2)", padding: 24 }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-bold text-lg" style={{ color: "var(--text-primary)", fontFamily: "'Space Grotesk', sans-serif" }}>Your Cart</h3>
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{cartCount} item{cartCount !== 1 ? "s" : ""} · ~8 min delivery</p>
              </div>
              <button onClick={() => setCartOpen(false)} style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.06)", border: "1px solid var(--border)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <X size={16} style={{ color: "var(--text-secondary)" }} />
              </button>
            </div>

            {cart.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center" style={{ color: "var(--text-muted)" }}>
                <ShoppingCart size={48} style={{ marginBottom: 12, opacity: 0.3 }} />
                <p className="text-sm">Your cart is empty</p>
                <p className="text-xs mt-1">Browse fresh local stock above</p>
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto flex flex-col gap-3">
                  {cart.map(item => (
                    <div key={item.id} className="glass-card p-3 flex items-center gap-3">
                      <span className="text-xl">{item.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{item.name}</p>
                        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>₹{item.price}/{item.unit}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleQtyChange(item.id, -1)} style={{ width: 26, height: 26, borderRadius: 8, background: "rgba(255,255,255,0.08)", border: "1px solid var(--border)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Minus size={11} style={{ color: "var(--text-secondary)" }} />
                        </button>
                        <span className="w-6 text-center text-sm font-bold" style={{ color: "var(--text-primary)" }}>{item.cartQty}</span>
                        <button onClick={() => handleQtyChange(item.id, 1)} style={{ width: 26, height: 26, borderRadius: 8, background: "rgba(255,255,255,0.08)", border: "1px solid var(--border)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Plus size={11} style={{ color: "var(--text-secondary)" }} />
                        </button>
                      </div>
                      <div className="text-right" style={{ minWidth: 56 }}>
                        <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>₹{item.cartQty * item.price}</p>
                        <button onClick={() => handleRemoveFromCart(item.id)} style={{ fontSize: "0.7rem", color: "var(--accent-rose)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Remove</button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex flex-col gap-3">
                  <div className="glass-card p-4 flex flex-col gap-2" style={{ borderColor: "rgba(6,182,212,0.15)" }}>
                    <div className="flex justify-between text-sm">
                      <span style={{ color: "var(--text-secondary)" }}>Subtotal</span>
                      <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{fmt(cartTotal)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span style={{ color: "var(--text-secondary)" }}>Delivery</span>
                      <span style={{ color: "var(--accent-emerald)", fontWeight: 600 }}>FREE</span>
                    </div>
                    <div className="h-px" style={{ background: "var(--border)" }} />
                    <div className="flex justify-between">
                      <span className="font-bold" style={{ color: "var(--text-primary)" }}>Total</span>
                      <span className="font-bold text-lg" style={{ color: "var(--text-primary)", fontFamily: "'Space Grotesk', sans-serif" }}>{fmt(cartTotal)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 px-2">
                    <Shield size={14} style={{ color: "var(--accent-emerald)" }} />
                    <span className="text-xs" style={{ color: "var(--text-secondary)" }}>Smart Sub Guard active — no surprise cancellations</span>
                  </div>

                  <button onClick={handleCheckout} className="btn-primary flex items-center gap-2 justify-center w-full py-3"
                    style={{ background: "linear-gradient(135deg, #06b6d4, #10b981)", fontSize: "0.95rem", boxShadow: "0 6px 30px rgba(6,182,212,0.35)" }}>
                    <Zap size={16} />
                    Place Order · {fmt(cartTotal)}
                    <ArrowRight size={16} />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Checkout success */}
      {checkoutDone && (
        <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}>
          <div className="modal-content glass-card p-8 text-center" style={{ maxWidth: 320, borderColor: "rgba(16,185,129,0.3)" }}>
            <div style={{ fontSize: "3rem", marginBottom: 12 }}>🎉</div>
            <h3 className="font-bold text-xl mb-2" style={{ color: "var(--text-primary)", fontFamily: "'Space Grotesk', sans-serif" }}>Order Confirmed!</h3>
            <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>Your items from Rajesh's Kirana are on the way!</p>
            <div className="flex items-center justify-center gap-2 mb-4">
              <Clock size={16} style={{ color: "var(--accent-cyan)" }} />
              <span className="font-bold" style={{ color: "var(--accent-cyan)" }}>Arriving in ~8 minutes</span>
            </div>
            <div className="flex justify-center gap-1">
              {[1, 2, 3, 4, 5].map(s => <Star key={s} size={16} fill="var(--accent-amber)" style={{ color: "var(--accent-amber)" }} />)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────
export default function NovaCartPage() {
  const [inventory, setInventory] = useState(INITIAL_INVENTORY);
  const [activePanel, setActivePanel] = useState<ActivePanel>("owner");
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const [lastSyncTime, setLastSyncTime] = useState<string>("");

  useEffect(() => {
    const fmt = () => new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setLastSyncTime(fmt());
    const t = setInterval(() => setLastSyncTime(fmt()), 1000);
    return () => clearInterval(t);
  }, []);

  const addToast = useCallback((message: string, type: ToastMsg["type"]) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const handleApplyUpdates = useCallback((updates: typeof inventory extends (infer T)[] ? any[] : any[]) => {
    setInventory(prev => {
      const next = [...prev];
      for (const upd of updates) {
        const idx = next.findIndex(i => i.id === upd.matchedId);
        if (idx === -1) continue;
        if (upd.action === "add") {
          next[idx] = { ...next[idx], qty: Math.min(next[idx].qty + upd.qty, next[idx].maxQty), lastUpdated: new Date() };
        } else if (upd.action === "set") {
          next[idx] = { ...next[idx], qty: upd.qty, lastUpdated: new Date() };
        } else if (upd.action === "remove") {
          next[idx] = { ...next[idx], qty: 0, lastUpdated: new Date() };
        }
      }
      return next;
    });
  }, []);

  const handleAddProduct = useCallback((item: StockItem) => {
    setInventory(prev => [...prev, item]);
  }, []);

  const lowAlerts = inventory.filter(i => getStockLevel(i) === "low" || getStockLevel(i) === "out");

  return (
    <div className="relative min-h-screen" style={{ background: "var(--bg-primary)" }}>
      {/* Background orbs */}
      <div className="orb" style={{ width: 500, height: 500, background: "rgba(99,102,241,0.07)", top: -100, left: -100 }} />
      <div className="orb" style={{ width: 400, height: 400, background: "rgba(6,182,212,0.06)", bottom: -50, right: -50 }} />
      <div className="orb" style={{ width: 300, height: 300, background: "rgba(139,92,246,0.05)", top: "50%", left: "50%" }} />

      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Top Nav */}
        <header style={{ borderBottom: "1px solid var(--border)", background: "rgba(5,8,20,0.9)", backdropFilter: "blur(20px)" }}>
          <div className="max-w-7xl mx-auto px-6 py-4" style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 16 }}>

            {/* Left — Logo */}
            <div className="flex items-center gap-3">
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--gradient-main)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 20px rgba(99,102,241,0.4)", flexShrink: 0 }}>
                <Zap size={18} style={{ color: "white" }} />
              </div>
              <div>
                <h1 className="font-black text-lg leading-none gradient-text" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                  Nova Cart
                </h1>
                <p className="text-xs leading-none" style={{ color: "var(--text-muted)" }}>Live-Sync &amp; Trust Engine</p>
              </div>
            </div>

            {/* Centre — Panel Toggle */}
            <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--border)" }}>
              {(["owner", "customer"] as const).map(panel => (
                <button key={panel} onClick={() => setActivePanel(panel)}
                  id={`toggle-${panel}`}
                  className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all"
                  style={{
                    background: activePanel === panel
                      ? (panel === "owner" ? "linear-gradient(135deg, #6366f1, #8b5cf6)" : "linear-gradient(135deg, #06b6d4, #10b981)")
                      : "transparent",
                    color: activePanel === panel ? "white" : "var(--text-secondary)",
                    boxShadow: activePanel === panel
                      ? (panel === "owner" ? "0 4px 16px rgba(99,102,241,0.35)" : "0 4px 16px rgba(6,182,212,0.35)")
                      : "none",
                    cursor: "pointer", border: "none", whiteSpace: "nowrap"
                  }}>
                  {panel === "owner" ? <Store size={14} /> : <ShoppingCart size={14} />}
                  {panel === "owner" ? "Store Owner" : "Customer"}
                </button>
              ))}
            </div>

            {/* Right — Status badges */}
            <div className="flex items-center gap-3 justify-end">
              {lowAlerts.length > 0 && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.2)" }}>
                  <Bell size={12} style={{ color: "var(--accent-rose)" }} />
                  <span className="text-xs font-semibold" style={{ color: "var(--accent-rose)" }}>{lowAlerts.length} alerts</span>
                </div>
              )}
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)" }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--accent-emerald)" }} className="pulse-dot" />
                <span className="text-xs font-semibold" style={{ color: "var(--accent-emerald)" }}>Live</span>
              </div>
            </div>

          </div>
        </header>

        {/* Live Ticker */}
        <LiveTicker />

        {/* Main Content — single panel, animated */}
        <main className="flex-1 max-w-5xl mx-auto w-full px-6 pb-10 pt-6">
          {/* Active panel label */}
          <div className="flex items-center gap-2 mb-5">
            <div className="h-px flex-1" style={{
              background: activePanel === "owner"
                ? "linear-gradient(90deg, rgba(99,102,241,0.5), transparent)"
                : "linear-gradient(90deg, rgba(6,182,212,0.5), transparent)"
            }} />
            <div className="flex items-center gap-2 px-3 py-1 rounded-full" style={{
              background: activePanel === "owner" ? "rgba(99,102,241,0.1)" : "rgba(6,182,212,0.08)",
              border: activePanel === "owner" ? "1px solid rgba(99,102,241,0.25)" : "1px solid rgba(6,182,212,0.25)"
            }}>
              {activePanel === "owner"
                ? <><Store size={12} style={{ color: "var(--accent-indigo)" }} /><span className="text-xs font-semibold" style={{ color: "var(--accent-indigo)" }}>STORE OWNER PORTAL</span></>
                : <><ShoppingCart size={12} style={{ color: "var(--accent-cyan)" }} /><span className="text-xs font-semibold" style={{ color: "var(--accent-cyan)" }}>CUSTOMER DISCOVERY</span></>}
            </div>
            <div className="h-px flex-1" style={{
              background: activePanel === "owner"
                ? "linear-gradient(90deg, transparent, rgba(99,102,241,0.5))"
                : "linear-gradient(90deg, transparent, rgba(6,182,212,0.5))"
            }} />
          </div>

          {/* Panels — only active one is shown with slide-up animation */}
          <div key={activePanel} className="slide-up">
            {activePanel === "owner"
              ? <OwnerPanel inventory={inventory} onApplyUpdates={handleApplyUpdates} onAddProduct={handleAddProduct} addToast={addToast} />
              : <CustomerPanel inventory={inventory} addToast={addToast} />}
          </div>
        </main>

        {/* Footer */}
        <footer style={{ borderTop: "1px solid var(--border)", padding: "16px 24px" }}>
          <div className="max-w-7xl mx-auto flex items-center justify-between text-xs" style={{ color: "var(--text-muted)" }}>
            <span>Nova Cart Live-Sync &amp; Trust Engine · MVP Demo</span>
            <div className="flex items-center gap-4">
              <span>NLP Stock Parser · Smart Sub Guard · Real-time Sync</span>
              <div className="flex items-center gap-1.5">
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent-emerald)" }} />
                <span style={{ color: "var(--accent-emerald)" }}>All systems operational</span>
              </div>
            </div>
          </div>
        </footer>
      </div>

      {/* Toast container */}
      <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2">
        {toasts.map(msg => (
          <Toast key={msg.id} msg={msg} onRemove={removeToast} />
        ))}
      </div>
    </div>
  );
}
