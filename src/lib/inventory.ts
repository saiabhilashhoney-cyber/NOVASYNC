// Central inventory data types and initial state

export type StockLevel = 'high' | 'medium' | 'low' | 'out';

export interface StockItem {
  id: string;
  name: string;
  emoji: string;
  category: string;
  qty: number;
  unit: string;
  price: number;
  maxQty: number;
  lastUpdated: Date;
}

export interface ParsedUpdate {
  action: 'add' | 'set' | 'remove';
  itemName: string;
  qty: number;
  unit: string;
  matchedId: string | null;
  confidence: number;
}

export interface SubstituteItem {
  id: string;
  name: string;
  emoji: string;
  reason: string;
  similarity: number;
}

export interface CartItem extends StockItem {
  cartQty: number;
}

export const INITIAL_INVENTORY: StockItem[] = [
  { id: 'atta', name: 'Aashirvaad Atta', emoji: '🌾', category: 'Grains', qty: 20, unit: 'kg', price: 48, maxQty: 50, lastUpdated: new Date() },
  { id: 'rice', name: 'Basmati Rice', emoji: '🍚', category: 'Grains', qty: 35, unit: 'kg', price: 95, maxQty: 50, lastUpdated: new Date() },
  { id: 'butter', name: 'Amul Butter', emoji: '🧈', category: 'Dairy', qty: 2, unit: 'pcs', price: 55, maxQty: 30, lastUpdated: new Date() },
  { id: 'milk', name: 'Full Cream Milk', emoji: '🥛', category: 'Dairy', qty: 18, unit: 'ltr', price: 62, maxQty: 40, lastUpdated: new Date() },
  { id: 'eggs', name: 'Farm Fresh Eggs', emoji: '🥚', category: 'Protein', qty: 60, unit: 'pcs', price: 7, maxQty: 120, lastUpdated: new Date() },
  { id: 'tomatoes', name: 'Fresh Tomatoes', emoji: '🍅', category: 'Vegetables', qty: 3, unit: 'kg', price: 40, maxQty: 20, lastUpdated: new Date() },
  { id: 'onions', name: 'Red Onions', emoji: '🧅', category: 'Vegetables', qty: 15, unit: 'kg', price: 35, maxQty: 25, lastUpdated: new Date() },
  { id: 'oil', name: 'Sunflower Oil', emoji: '🫙', category: 'Cooking', qty: 12, unit: 'ltr', price: 135, maxQty: 30, lastUpdated: new Date() },
  { id: 'sugar', name: 'Refined Sugar', emoji: '🍬', category: 'Essentials', qty: 8, unit: 'kg', price: 42, maxQty: 25, lastUpdated: new Date() },
  { id: 'salt', name: 'Tata Salt', emoji: '🧂', category: 'Essentials', qty: 0, unit: 'kg', price: 20, maxQty: 20, lastUpdated: new Date() },
  { id: 'tea', name: 'Tata Tea Gold', emoji: '🍵', category: 'Beverages', qty: 5, unit: 'pcs', price: 115, maxQty: 20, lastUpdated: new Date() },
  { id: 'biscuits', name: 'Parle-G Biscuits', emoji: '🍪', category: 'Snacks', qty: 24, unit: 'pcs', price: 10, maxQty: 50, lastUpdated: new Date() },
  { id: 'noodles', name: 'Maggi 2-Minute Noodles', emoji: '🍜', category: 'Snacks', qty: 15, unit: 'pcs', price: 14, maxQty: 40, lastUpdated: new Date() },
];

export const SUBSTITUTE_MAP: Record<string, SubstituteItem[]> = {
  butter: [
    { id: 'ghee', name: 'Amul Ghee', emoji: '🫙', reason: 'Same dairy fat profile, great for cooking', similarity: 88 },
    { id: 'oil', name: 'Sunflower Oil', emoji: '🫙', reason: 'Light alternative for cooking', similarity: 72 },
  ],
  salt: [
    { id: 'rocksalt', name: 'Himalayan Pink Salt', emoji: '🧂', reason: 'Premium mineral-rich alternative', similarity: 95 },
  ],
  tomatoes: [
    { id: 'puree', name: 'Tomato Puree (Tin)', emoji: '🥫', reason: 'Cooked equivalent, longer shelf life', similarity: 82 },
  ],
};

export function getStockLevel(item: StockItem): StockLevel {
  const pct = item.qty / item.maxQty;
  if (item.qty === 0) return 'out';
  if (pct <= 0.15) return 'low';
  if (pct <= 0.45) return 'medium';
  return 'high';
}

export function getStockColor(level: StockLevel): string {
  switch (level) {
    case 'high': return '#10b981';
    case 'medium': return '#f59e0b';
    case 'low': return '#f43f5e';
    case 'out': return '#6b7280';
    default: return '#6b7280';
  }
}

export function getStockBgColor(level: StockLevel): string {
  switch (level) {
    case 'high': return 'rgba(16, 185, 129, 0.12)';
    case 'medium': return 'rgba(245, 158, 11, 0.12)';
    case 'low': return 'rgba(244, 63, 94, 0.12)';
    case 'out': return 'rgba(107, 114, 128, 0.12)';
    default: return 'rgba(107, 114, 128, 0.12)';
  }
}

// NLP parser for owner text input
export function parseOwnerInput(text: string, inventory: StockItem[]): ParsedUpdate[] {
  const results: ParsedUpdate[] = [];
  
  // Patterns: "got X kg/pcs of ITEM", "out of ITEM", "ITEM: X", "X packets of ITEM"
  const patterns = [
    /(?:got|received|added?|stocked?)\s+(\d+(?:\.\d+)?)\s*(kg|g|ltr|l|pcs?|packets?|boxes?|cans?|bottles?)?\s+(?:of\s+)?(.+)/gi,
    /(?:out\s+of|finished|no\s+more|zero)\s+(?:stock\s+of\s+)?(.+)/gi,
    /(\d+(?:\.\d+)?)\s*(kg|g|ltr|l|pcs?|packets?|boxes?)?\s+(?:of\s+)?(.+)/gi,
    /(.+?)\s*[:=]\s*(\d+(?:\.\d+)?)\s*(kg|g|ltr|l|pcs?)?/gi,
  ];

  // Simple tokenize approach
  const segments = text.split(/[,;.&]+/).map(s => s.trim()).filter(Boolean);
  
  for (const segment of segments) {
    let matched = false;

    // "out of X"
    const outMatch = segment.match(/(?:out\s+of|finished|no\s+more|zero)\s+(.+)/i);
    if (outMatch) {
      const itemName = outMatch[1].trim();
      const bestMatch = findBestMatch(itemName, inventory);
      if (bestMatch) {
        results.push({ action: 'set', itemName, qty: 0, unit: '', matchedId: bestMatch.id, confidence: bestMatch.score });
        matched = true;
      }
    }

    if (!matched) {
      // "got N unit of item"
      const gotMatch = segment.match(/(?:got|received|added?|stocked?)\s+(\d+(?:\.\d+)?)\s*(kg|g|ltr|l|pcs?|packets?|boxes?|cans?|bottles?)?\s+(?:of\s+)?(.+)/i);
      if (gotMatch) {
        const qty = parseFloat(gotMatch[1]);
        const unit = normalizeUnit(gotMatch[2] || '');
        const itemName = gotMatch[3].trim();
        const bestMatch = findBestMatch(itemName, inventory);
        results.push({ action: 'add', itemName, qty, unit, matchedId: bestMatch?.id || null, confidence: bestMatch?.score || 0 });
        matched = true;
      }
    }

    if (!matched) {
      // "N unit of item"
      const qtyFirst = segment.match(/^(\d+(?:\.\d+)?)\s*(kg|g|ltr|l|pcs?|packets?|boxes?)?\s+(?:of\s+)?(.+)/i);
      if (qtyFirst) {
        const qty = parseFloat(qtyFirst[1]);
        const unit = normalizeUnit(qtyFirst[2] || '');
        const itemName = qtyFirst[3].trim();
        const bestMatch = findBestMatch(itemName, inventory);
        results.push({ action: 'add', itemName, qty, unit, matchedId: bestMatch?.id || null, confidence: bestMatch?.score || 0 });
        matched = true;
      }
    }

    if (!matched) {
      // "item: N"
      const colonMatch = segment.match(/(.+?)\s*[:=]\s*(\d+(?:\.\d+)?)\s*(kg|g|ltr|l|pcs?)?/i);
      if (colonMatch) {
        const itemName = colonMatch[1].trim();
        const qty = parseFloat(colonMatch[2]);
        const unit = normalizeUnit(colonMatch[3] || '');
        const bestMatch = findBestMatch(itemName, inventory);
        results.push({ action: 'set', itemName, qty, unit, matchedId: bestMatch?.id || null, confidence: bestMatch?.score || 0 });
        matched = true;
      }
    }
  }

  return results;
}

function normalizeUnit(unit: string): string {
  const u = unit.toLowerCase();
  if (u.startsWith('kg')) return 'kg';
  if (u.startsWith('g')) return 'g';
  if (u.startsWith('ltr') || u === 'l') return 'ltr';
  if (u.startsWith('pcs') || u.startsWith('pc')) return 'pcs';
  if (u.startsWith('packet')) return 'pcs';
  if (u.startsWith('box')) return 'pcs';
  return 'pcs';
}

function findBestMatch(name: string, inventory: StockItem[]): { id: string; score: number } | null {
  const lname = name.toLowerCase();
  let best: { id: string; score: number } | null = null;

  for (const item of inventory) {
    const iname = item.name.toLowerCase();
    const iid = item.id.toLowerCase();
    let score = 0;

    if (iid === lname || iname === lname) { score = 100; }
    else if (iname.includes(lname) || lname.includes(iid)) { score = 85; }
    else {
      // Check word overlap
      const nameWords = lname.split(/\s+/);
      const itemWords = iname.split(/\s+/).concat([iid]);
      const overlap = nameWords.filter(w => itemWords.some(iw => iw.includes(w) || w.includes(iw)));
      score = (overlap.length / Math.max(nameWords.length, 1)) * 75;
    }

    if (score > 40 && (!best || score > best.score)) {
      best = { id: item.id, score };
    }
  }

  return best;
}
