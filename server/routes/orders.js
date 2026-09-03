const express = require("express");
const { db } = require("../db");
const { requireAdmin, requireCustomer, optionalCustomer } = require("../auth");
const { evaluatePromo } = require("../lib/promo");
const { sendAdminAlert } = require("../lib/mail");
const asyncHandler = require("../lib/asyncHandler");

const router = express.Router();

function generateOrderId() {
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return "CHR" + Date.now().toString().slice(-7) + rand;
}

function rowToOrder(row) {
  return {
    id: row.id,
    customerId: row.customer_id,
    date: row.date,
    items: JSON.parse(row.items),
    total: row.total,
    discount: row.discount || 0,
    shipping: row.shipping || 0,
    codFee: row.cod_fee || 0,
    promoCode: row.promo_code || null,
    phone: row.phone || null,
    utr: row.utr || null,
    paymentStatus: row.payment_status || "Not Required",
    customerName: row.customer_name,
    email: row.email,
    city: row.city,
    pin: row.pin,
    address: row.address,
    payment: row.payment,
    status: row.status
  };
}

function money(n) { return "₹" + Number(n).toLocaleString("en-IN"); }

// Full order details for the admin email alert - address, items, and the complete price
// breakdown, not just the total, so admin can act on the email without needing to also open
// the admin dashboard.
function renderOrderAlertHtml(o) {
  const itemRows = o.items.map((item) => `
    <tr>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e0d8;">${item.name}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e0d8;text-align:center;">${item.qty}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e0d8;text-align:right;">${money(item.price * item.qty)}</td>
    </tr>`).join("");

  const summaryRow = (label, value) => value ? `
    <tr><td style="padding:3px 0;color:#6b6b6b;">${label}</td><td style="padding:3px 0;text-align:right;">${value}</td></tr>` : "";

  return `
    <div style="font-family:Arial,sans-serif;max-width:560px;">
      <h2 style="margin:0 0 4px;">${o.isCOD ? "New COD Order - Advance Payment to Verify" : "New UPI Payment to Verify"}</h2>
      <p style="color:#6b6b6b;margin:0 0 18px;">Order #${o.orderId} &middot; ${new Date(o.date).toLocaleString("en-IN")}</p>

      <table style="width:100%;border-collapse:collapse;margin-bottom:18px;">
        <tr><td style="padding:3px 0;color:#6b6b6b;width:140px;">Customer</td><td style="padding:3px 0;">${o.customerName || "-"}</td></tr>
        <tr><td style="padding:3px 0;color:#6b6b6b;">Phone</td><td style="padding:3px 0;">${o.phone || "-"}</td></tr>
        <tr><td style="padding:3px 0;color:#6b6b6b;">Email</td><td style="padding:3px 0;">${o.email || "-"}</td></tr>
        <tr><td style="padding:3px 0;color:#6b6b6b;vertical-align:top;">Delivery Address</td><td style="padding:3px 0;">${o.address || ""}${o.address ? "," : ""} ${o.city || ""} ${o.pin || ""}</td></tr>
        <tr><td style="padding:3px 0;color:#6b6b6b;">Payment Method</td><td style="padding:3px 0;">${o.payment || "-"}</td></tr>
        <tr><td style="padding:3px 0;color:#6b6b6b;"><strong>UTR</strong></td><td style="padding:3px 0;"><strong>${o.utr}</strong></td></tr>
      </table>

      <table style="width:100%;border-collapse:collapse;margin-bottom:14px;">
        <thead>
          <tr style="background:#f5f3ef;">
            <th style="padding:6px 10px;text-align:left;">Item</th>
            <th style="padding:6px 10px;text-align:center;">Qty</th>
            <th style="padding:6px 10px;text-align:right;">Price</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>

      <table style="width:100%;border-collapse:collapse;margin-bottom:18px;">
        <tr><td style="padding:3px 0;color:#6b6b6b;">Subtotal</td><td style="padding:3px 0;text-align:right;">${money(o.subtotal)}</td></tr>
        ${summaryRow("Discount", o.discount > 0 ? "-" + money(o.discount) : "")}
        ${summaryRow("Shipping", o.shipping > 0 ? money(o.shipping) : "Free")}
        <tr><td style="padding:6px 0 0;font-weight:bold;border-top:1px solid #e5e0d8;">Order Total</td><td style="padding:6px 0 0;text-align:right;font-weight:bold;border-top:1px solid #e5e0d8;">${money(o.total)}</td></tr>
        ${o.isCOD ? `
        <tr><td style="padding:8px 0 0;color:#2e7d32;font-weight:bold;">Advance paid now (UPI)</td><td style="padding:8px 0 0;text-align:right;color:#2e7d32;font-weight:bold;">${money(o.advanceAmount)}</td></tr>
        <tr><td style="padding:3px 0;color:#b8941f;font-weight:bold;">Amount due on delivery</td><td style="padding:3px 0;text-align:right;color:#b8941f;font-weight:bold;">${money(o.total - o.advanceAmount)}</td></tr>` : ""}
      </table>

      <p style="color:#6b6b6b;font-size:13px;">Check this UTR against your bank/UPI app, then mark the payment verified in the admin Orders tab.</p>
    </div>`;
}

// Admin: every order, every customer, full details. Defined before "/" GET so it's
// unambiguous, though the path shapes don't actually collide.
router.get("/admin", requireAdmin, asyncHandler(async (req, res) => {
  const rows = await db.all("SELECT * FROM orders ORDER BY date DESC");
  res.json(rows.map(rowToOrder));
}));

// Customer: "My Orders" - real account history when logged in (scoped by phone, works from any
// device), falling back to the old per-browser customerId for robustness if not.
router.get("/", optionalCustomer, asyncHandler(async (req, res) => {
  if (req.customerPhone) {
    const rows = await db.all("SELECT * FROM orders WHERE phone = ? ORDER BY date DESC", [req.customerPhone]);
    return res.json(rows.map(rowToOrder));
  }
  const customerId = req.query.customerId;
  if (!customerId) return res.json([]);
  const rows = await db.all("SELECT * FROM orders WHERE customer_id = ? ORDER BY date DESC", [customerId]);
  res.json(rows.map(rowToOrder));
}));

// Placing an order requires a verified phone (OTP login at checkout, see server/routes/auth.js) -
// that's what makes first-order promo eligibility below tamper-resistant instead of relying on
// a client-resettable customerId.
router.post("/", requireCustomer, asyncHandler(async (req, res) => {
  const { customerId, items, customerName, email, city, pin, address, payment, promoCode, utr } = req.body;
  if (!customerId || !Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: "Missing customerId or items" });
  }
  const phone = req.customerPhone;

  // Subtotal (and therefore the discount and final total) is always computed here from the
  // items themselves - a client-sent total/discount is never trusted.
  const subtotal = items.reduce((sum, item) => sum + Number(item.price) * Number(item.qty), 0);

  let discount = 0;
  let appliedCode = null;
  if (promoCode) {
    const promo = await db.get("SELECT * FROM promo_codes WHERE code = ?", [String(promoCode).trim().toUpperCase()]);
    const { count } = await db.get("SELECT COUNT(*) AS count FROM orders WHERE phone = ?", [phone]);
    const result = evaluatePromo(promo, { subtotal, isFirstOrder: count === 0 });
    if (result.valid) {
      discount = result.discount;
      appliedCode = promo.code;
    }
    // An invalid/expired code at submit time doesn't fail the order - it's just not applied.
  }

  // Free shipping at/above ₹5,000 subtotal (matches the threshold already advertised on the
  // site and used for the cart page's shipping display), else a flat ₹200 - checked against
  // pre-discount subtotal like the cart page already does.
  const shipping = subtotal >= 5000 ? 0 : 200;

  // Cash on Delivery requires a small UPI advance upfront (anti-fraud pattern) - ₹50 for small
  // orders, ₹200 for larger ones. This is a *prepayment*, not an added fee: it's already part of
  // `total` below, not added on top. The remainder (total - advanceAmount) is collected as cash
  // at delivery. Unlike full-UPI orders (still lenient - see isUpiWithUtr below), a COD order
  // without an advance UTR is rejected outright, since the whole point is to require it upfront.
  const isCOD = payment === "Cash on Delivery";
  const advanceAmount = isCOD ? (subtotal < 500 ? 50 : 200) : 0;
  const utrValue = utr && String(utr).trim() ? String(utr).trim() : null;

  if (isCOD && !utrValue) {
    return res.status(400).json({ error: "COD requires a small UPI advance payment - pay via the QR code shown and enter the UTR." });
  }

  const orderId = generateOrderId();
  const date = new Date().toISOString();
  const total = subtotal - discount + shipping;

  const isUpiWithUtr = payment === "UPI" && utrValue;
  const paymentStatus = (isCOD || isUpiWithUtr) ? "Pending Verification" : "Not Required";

  await db.run(
    `INSERT INTO orders (id, customer_id, date, items, total, promo_code, discount, shipping, cod_fee, phone, customer_name, email, city, pin, address, payment, status, utr, payment_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [orderId, customerId, date, JSON.stringify(items), total, appliedCode, discount, shipping, advanceAmount, phone,
      customerName || "", email || "", city || "", pin || "", address || "", payment || "", "Processing",
      utrValue, paymentStatus]
  );

  if (isCOD || isUpiWithUtr) {
    sendAdminAlert(
      isCOD ? `New COD order - advance to verify - Order #${orderId}` : `New UPI payment to verify - Order #${orderId}`,
      renderOrderAlertHtml({
        orderId, date, items, subtotal, discount, shipping, total, isCOD, advanceAmount,
        customerName, email, phone, city, pin, address, payment, utr: utrValue
      })
    ); // not awaited - an email failure shouldn't fail order placement
  }

  res.status(201).json(rowToOrder(await db.get("SELECT * FROM orders WHERE id = ?", [orderId])));
}));

router.patch("/admin/:id", requireAdmin, asyncHandler(async (req, res) => {
  const { status } = req.body;
  const allowed = ["Processing", "Shipped", "Delivered", "Cancelled"];
  if (!allowed.includes(status)) return res.status(400).json({ error: "Invalid status" });

  const info = await db.run("UPDATE orders SET status = ? WHERE id = ?", [status, req.params.id]);
  if (info.changes === 0) return res.status(404).json({ error: "Order not found" });
  res.json(rowToOrder(await db.get("SELECT * FROM orders WHERE id = ?", [req.params.id])));
}));

router.patch("/admin/:id/verify-payment", requireAdmin, asyncHandler(async (req, res) => {
  const info = await db.run(
    "UPDATE orders SET payment_status = 'Verified' WHERE id = ? AND payment_status = 'Pending Verification'",
    [req.params.id]
  );
  if (info.changes === 0) return res.status(404).json({ error: "Order not found or not pending verification" });
  res.json(rowToOrder(await db.get("SELECT * FROM orders WHERE id = ?", [req.params.id])));
}));

module.exports = router;
