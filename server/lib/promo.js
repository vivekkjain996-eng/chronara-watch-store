// Shared discount math - used by both the checkout preview endpoints and the order
// placement route, so "what the customer was shown" and "what actually gets charged" can
// never disagree. Never trust a client-supplied discount amount; always recompute here
// from the promo row + a server-known subtotal/order-history fact.
function evaluatePromo(promo, { subtotal, isFirstOrder }) {
  if (!promo || !promo.active) return { valid: false, reason: "Invalid or inactive code" };
  if (promo.min_order_value && subtotal < promo.min_order_value) {
    return { valid: false, reason: `Minimum order value is ₹${promo.min_order_value}` };
  }
  if (promo.first_order_only && !isFirstOrder) {
    return { valid: false, reason: "This code is only valid for first-time customers" };
  }

  let discount = promo.type === "percent"
    ? Math.round(subtotal * promo.value / 100)
    : promo.value;
  if (promo.max_discount) discount = Math.min(discount, promo.max_discount);
  discount = Math.min(Math.max(0, Math.round(discount)), subtotal);

  return { valid: true, discount };
}

function describePromo(promo) {
  const parts = [
    promo.type === "percent" ? `${promo.value}% off` : `₹${promo.value} off`
  ];
  if (promo.type === "percent" && promo.max_discount) parts.push(`up to ₹${promo.max_discount}`);
  if (promo.min_order_value) parts.push(`on orders above ₹${promo.min_order_value}`);
  if (promo.first_order_only) parts.push("first order only");
  return parts.join(", ");
}

module.exports = { evaluatePromo, describePromo };
