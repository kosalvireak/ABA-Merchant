// Static in-memory product list. No database for this playground.
// Prices are integer KHR (Riel has no decimals in practice),
// all unique and inside the demo range 100..500.
const products = [
  { id: "p01", name: "Candy", emoji: "🍬", price: 100, currency: "KHR" },
  { id: "p02", name: "Chewing Gum", emoji: "🟩", price: 125, currency: "KHR" },
  { id: "p03", name: "Bottled Water", emoji: "💧", price: 150, currency: "KHR" },
  { id: "p04", name: "Instant Noodle Cup", emoji: "🍜", price: 200, currency: "KHR" },
  { id: "p05", name: "Potato Chips", emoji: "🥔", price: 250, currency: "KHR" },
  { id: "p06", name: "Chocolate Bar", emoji: "🍫", price: 300, currency: "KHR" },
  { id: "p07", name: "Iced Tea", emoji: "🧋", price: 350, currency: "KHR" },
  { id: "p08", name: "Biscuit Pack", emoji: "🍪", price: 400, currency: "KHR" },
  { id: "p09", name: "Fruit Juice", emoji: "🧃", price: 450, currency: "KHR" },
  { id: "p10", name: "Ice Cream", emoji: "🍦", price: 500, currency: "KHR" },
];

export function listProducts() {
  return products;
}

export function findProduct(id) {
  return products.find((p) => p.id === id) || null;
}
