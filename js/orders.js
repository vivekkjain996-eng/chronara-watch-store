// Order history for the Chronara demo storefront. Orders are stored server-side, so admin can
// see every order from every customer/device. customerId is still sent when placing an order
// (kept for robustness), but "My Orders" itself is now scoped by the logged-in phone account
// (see js/auth.js) - real account history that follows the customer across devices, not a
// per-browser id.
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

// Requires being logged in (see js/auth.js) - the server resolves "my orders" from the
// Authorization header's phone, not a query param.
async function getOrders() {
  return apiGet("/api/orders");
}

function formatOrderDate(isoString) {
  const d = new Date(isoString);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) +
    " at " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}
