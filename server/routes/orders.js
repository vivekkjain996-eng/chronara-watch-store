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

  const orderId = generateOrderId();
  const date = new Date().toISOString();
  const total = subtotal - discount;

  const isUpiWithUtr = payment === "UPI" && utr && String(utr).trim();
  const paymentStatus = isUpiWithUtr ? "Pending Verification" : "Not Required";
  const utrValue = isUpiWithUtr ? String(utr).trim() : null;

  await db.run(
    `INSERT INTO orders (id, customer_id, date, items, total, promo_code, discount, phone, customer_name, email, city, pin, address, payment, status, utr, payment_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [orderId, customerId, date, JSON.stringify(items), total, appliedCode, discount, phone,
      customerName || "", email || "", city || "", pin || "", address || "", payment || "", "Processing",
      utrValue, paymentStatus]
  );

  if (isUpiWithUtr) {
    sendAdminAlert(
      `New UPI payment to verify - Order #${orderId}`,
      `<p><strong>Order #${orderId}</strong> - ₹${total}</p>
       <p>Customer: ${customerName || ""} (${phone})</p>
       <p><strong>UTR: ${utrValue}</strong></p>
       <p>Check this against your bank/UPI app, then mark it verified in the admin Orders tab.</p>`
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
