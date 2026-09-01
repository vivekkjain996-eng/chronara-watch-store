const express = require("express");
const { db } = require("../db");
const { requireAdmin, optionalCustomer } = require("../auth");
const { evaluatePromo, describePromo } = require("../lib/promo");

const router = express.Router();

// Prefers the verified phone (tamper-resistant) when the customer is logged in; falls back
// to the client-resettable customerId otherwise - these routes are previews only, the real
// enforcement happens at order placement (server/routes/orders.js), which always uses phone.
function isFirstOrderFor({ phone, customerId }) {
  if (phone) {
    const { count } = db.prepare("SELECT COUNT(*) AS count FROM orders WHERE phone = ?").get(phone);
    return count === 0;
  }
  if (!customerId) return false;
  const { count } = db.prepare("SELECT COUNT(*) AS count FROM orders WHERE customer_id = ?").get(customerId);
  return count === 0;
}

router.get("/", requireAdmin, (req, res) => {
  res.json(db.prepare("SELECT * FROM promo_codes ORDER BY id DESC").all());
});

router.post("/", requireAdmin, (req, res) => {
  const { code, type, value, maxDiscount, minOrderValue, firstOrderOnly } = req.body;
  if (!code || !type || value == null) {
    return res.status(400).json({ error: "code, type and value are required" });
  }
  if (!["percent", "flat"].includes(type)) {
    return res.status(400).json({ error: "type must be 'percent' or 'flat'" });
  }

  const normalizedCode = String(code).trim().toUpperCase();
  const existing = db.prepare("SELECT id FROM promo_codes WHERE code = ?").get(normalizedCode);
  if (existing) return res.status(400).json({ error: "A promo code with this code already exists" });

  const info = db.prepare(`
    INSERT INTO promo_codes (code, type, value, max_discount, min_order_value, first_order_only, active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?)
  `).run(
    normalizedCode,
    type,
    Number(value),
    maxDiscount != null && maxDiscount !== "" ? Number(maxDiscount) : null,
    minOrderValue != null && minOrderValue !== "" ? Number(minOrderValue) : null,
    firstOrderOnly ? 1 : 0,
    new Date().toISOString()
  );

  res.status(201).json(db.prepare("SELECT * FROM promo_codes WHERE id = ?").get(info.lastInsertRowid));
});

router.patch("/:id", requireAdmin, (req, res) => {
  const existing = db.prepare("SELECT * FROM promo_codes WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Promo code not found" });

  const merged = {
    type: req.body.type ?? existing.type,
    value: req.body.value != null ? Number(req.body.value) : existing.value,
    max_discount: req.body.maxDiscount !== undefined
      ? (req.body.maxDiscount === "" || req.body.maxDiscount === null ? null : Number(req.body.maxDiscount))
      : existing.max_discount,
    min_order_value: req.body.minOrderValue !== undefined
      ? (req.body.minOrderValue === "" || req.body.minOrderValue === null ? null : Number(req.body.minOrderValue))
      : existing.min_order_value,
    first_order_only: req.body.firstOrderOnly !== undefined ? (req.body.firstOrderOnly ? 1 : 0) : existing.first_order_only,
    active: req.body.active !== undefined ? (req.body.active ? 1 : 0) : existing.active
  };

  db.prepare(`
    UPDATE promo_codes SET type = ?, value = ?, max_discount = ?, min_order_value = ?, first_order_only = ?, active = ?
    WHERE id = ?
  `).run(merged.type, merged.value, merged.max_discount, merged.min_order_value, merged.first_order_only, merged.active, req.params.id);

  res.json(db.prepare("SELECT * FROM promo_codes WHERE id = ?").get(req.params.id));
});

router.delete("/:id", requireAdmin, (req, res) => {
  const info = db.prepare("DELETE FROM promo_codes WHERE id = ?").run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "Promo code not found" });
  res.status(204).end();
});

// Public: codes that currently apply to this cart/customer, for the checkout dropdown.
router.get("/available", optionalCustomer, (req, res) => {
  const subtotal = Number(req.query.subtotal) || 0;
  const customerId = req.query.customerId;
  const firstOrder = isFirstOrderFor({ phone: req.customerPhone, customerId });

  const active = db.prepare("SELECT * FROM promo_codes WHERE active = 1").all();
  const available = active
    .map((promo) => ({ promo, result: evaluatePromo(promo, { subtotal, isFirstOrder: firstOrder }) }))
    .filter(({ result }) => result.valid && result.discount > 0)
    .map(({ promo, result }) => ({
      code: promo.code,
      description: describePromo(promo),
      discount: result.discount
    }));

  res.json(available);
});

// Public: preview the discount for a specific code before placing the order.
router.post("/preview", optionalCustomer, (req, res) => {
  const { code, customerId, subtotal } = req.body;
  const promo = db.prepare("SELECT * FROM promo_codes WHERE code = ?").get(String(code || "").trim().toUpperCase());
  const firstOrder = isFirstOrderFor({ phone: req.customerPhone, customerId });
  const result = evaluatePromo(promo, { subtotal: Number(subtotal) || 0, isFirstOrder: firstOrder });
  res.json(result);
});

module.exports = router;
