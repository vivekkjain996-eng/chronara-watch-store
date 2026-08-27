// Order history for the demo storefront. No backend - orders are saved to this
// browser's localStorage when checkout completes, and read back on the "My Orders" page.
const ORDERS_KEY = "chronara_orders";

function getOrders() {
  try {
    return JSON.parse(localStorage.getItem(ORDERS_KEY)) || [];
  } catch (e) {
    return [];
  }
}

function saveOrder(order) {
  const orders = getOrders();
  orders.unshift(order); // newest first
  localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
}

function getOrderById(orderId) {
  return getOrders().find(o => o.id === orderId);
}

function generateOrderId() {
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return "CHR" + Date.now().toString().slice(-7) + rand;
}

function formatOrderDate(isoString) {
  const d = new Date(isoString);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) +
    " at " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}
