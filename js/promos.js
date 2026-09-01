// Promo code helpers shared by the checkout page (apply a code) and the admin panel
// (manage codes). Discount math itself always lives server-side (server/lib/promo.js) -
// these just call the API.

async function getAvailablePromos(subtotal) {
  return apiGet(`/api/promos/available?customerId=${encodeURIComponent(getCustomerId())}&subtotal=${encodeURIComponent(subtotal)}`);
}

async function previewPromo(code, subtotal) {
  return apiPost("/api/promos/preview", { code, customerId: getCustomerId(), subtotal });
}

async function getAllPromos() {
  return apiGet("/api/promos");
}

async function createPromo(promo) {
  return apiPost("/api/promos", promo);
}

async function updatePromo(id, updates) {
  return apiPatch(`/api/promos/${id}`, updates);
}

async function deletePromo(id) {
  return apiDelete(`/api/promos/${id}`);
}
