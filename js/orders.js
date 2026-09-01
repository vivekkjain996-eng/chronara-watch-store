// Order history for the Chronara demo storefront. Orders are now stored server-side
// (SQLite via /api/orders), so admin can see every order from every customer/device.
// A customer's own "My Orders" page is scoped by a random per-browser customerId - not a
// real account system, but enough to keep "my orders" private-ish without one.
const CUSTOMER_ID_KEY = "chronara_customer_id";

function getCustomerId() {
  let id = localStorage.getItem(CUSTOMER_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(CUSTOMER_ID_KEY, id);
  }
  return id;
}

async function placeOrder(orderDetails) {
  const order = await apiPost("/api/orders", Object.assign({ customerId: getCustomerId() }, orderDetails));
  return order;
}

async function getOrders() {
  return apiGet(`/api/orders?customerId=${encodeURIComponent(getCustomerId())}`);
}

function formatOrderDate(isoString) {
  const d = new Date(isoString);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) +
    " at " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}
