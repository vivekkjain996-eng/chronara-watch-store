const crypto = require("crypto");
const express = require("express");
const { db } = require("../db");
const { requireAdmin, requireCustomer } = require("../auth");
const { evaluatePromo } = require("../lib/promo");

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
router.get("/admin", requireAdmin, (req, res) => {
  const rows = db.prepare("SELECT * FROM orders ORDER BY date DESC").all();
  res.json(rows.map(rowToOrder));
});

// Customer: only their own orders ("My Orders"), scoped by the per-browser customerId.
router.get("/", (req, res) => {
  const customerId = req.query.customerId;
  if (!customerId) return res.json([]);
  const rows = db.prepare("SELECT * FROM orders WHERE customer_id = ? ORDER BY date DESC").all(customerId);
  res.json(rows.map(rowToOrder));
});

// Placing an order requires a verified phone (OTP login at checkout, see server/routes/auth.js) -
// that's what makes first-order promo eligibility below tamper-resistant instead of relying on
// a client-resettable customerId.
router.post("/", requireCustomer, (req, res) => {
  const { customerId, items, customerName, email, city, pin, address, payment, promoCode } = req.body;
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
    const promo = db.prepare("SELECT * FROM promo_codes WHERE code = ?").get(String(promoCode).trim().toUpperCase());
    const { count } = db.prepare("SELECT COUNT(*) AS count FROM orders WHERE phone = ?").get(phone);
    const result = evaluatePromo(promo, { subtotal, isFirstOrder: count === 0 });
    if (result.valid) {
      discount = result.discount;
      appliedCode = promo.code;
    }
    // An invalid/expired code at submit time doesn't fail the order - it's just not applied.
  }

  const order = {
    id: generateOrderId(),
    customer_id: customerId,
    date: new Date().toISOString(),
    items: JSON.stringify(items),
    total: subtotal - discount,
    promo_code: appliedCode,
    discount,
    phone,
    customer_name: customerName || "",
    email: email || "",
    city: city || "",
    pin: pin || "",
    address: address || "",
    payment: payment || "",
    status: "Processing"
  };

  db.prepare(`
    INSERT INTO orders (id, customer_id, date, items, total, promo_code, discount, phone, customer_name, email, city, pin, address, payment, status)
    VALUES (@id, @customer_id, @date, @items, @total, @promo_code, @discount, @phone, @customer_name, @email, @city, @pin, @address, @payment, @status)
  `).run(order);

  res.status(201).json(rowToOrder(db.prepare("SELECT * FROM orders WHERE id = ?").get(order.id)));
});

router.patch("/admin/:id", requireAdmin, (req, res) => {
  const { status } = req.body;
  const allowed = ["Processing", "Shipped", "Delivered", "Cancelled"];
  if (!allowed.includes(status)) return res.status(400).json({ error: "Invalid status" });

  const info = db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(status, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "Order not found" });
  res.json(rowToOrder(db.prepare("SELECT * FROM orders WHERE id = ?").get(req.params.id)));
});

module.exports = router;
