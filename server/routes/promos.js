const express = require("express");
const { db } = require("../db");
const { requireAdmin, optionalCustomer } = require("../auth");
const { evaluatePromo, describePromo } = require("../lib/promo");
const asyncHandler = require("../lib/asyncHandler");

const router = express.Router();

// Prefers the verified phone (tamper-resistant) when the customer is logged in; falls back
// to the client-resettable customerId otherwise - these routes are previews only, the real
// enforcement happens at order placement (server/routes/orders.js), which always uses phone.
async function isFirstOrderFor({ phone, customerId }) {
  if (phone) {
    const { count } = await db.get("SELECT COUNT(*) AS count FROM orders WHERE phone = ?", [phone]);
    return count === 0;
  }
  if (!customerId) return false;
  const { count } = await db.get("SELECT COUNT(*) AS count FROM orders WHERE customer_id = ?", [customerId]);
  return count === 0;
}

router.get("/", requireAdmin, asyncHandler(async (req, res) => {
  res.json(await db.all("SELECT * FROM promo_codes ORDER BY id DESC"));
}));

router.post("/", requireAdmin, asyncHandler(async (req, res) => {
  const { code, type, value, maxDiscount, minOrderValue, firstOrderOnly } = req.body;
  if (!code || !type || value == null) {
    return res.status(400).json({ error: "code, type and value are required" });
  }
  if (!["percent", "flat"].includes(type)) {
    return res.status(400).json({ error: "type must be 'percent' or 'flat'" });
  }

  const normalizedCode = String(code).trim().toUpperCase();
  const existing = await db.get("SELECT id FROM promo_codes WHERE code = ?", [normalizedCode]);
  if (existing) return res.status(400).json({ error: "A promo code with this code already exists" });

  const info = await db.run(
    `INSERT INTO promo_codes (code, type, value, max_discount, min_order_value, first_order_only, active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
    [
      normalizedCode,
      type,
      Number(value),
      maxDiscount != null && maxDiscount !== "" ? Number(maxDiscount) : null,
      minOrderValue != null && minOrderValue !== "" ? Number(minOrderValue) : null,
      firstOrderOnly ? 1 : 0,
      new Date().toISOString()
    ]
  );

  res.status(201).json(await db.get("SELECT * FROM promo_codes WHERE id = ?", [info.lastInsertRowid]));
}));

router.patch("/:id", requireAdmin, asyncHandler(async (req, res) => {
  const existing = await db.get("SELECT * FROM promo_codes WHERE id = ?", [req.params.id]);
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

  await db.run(
    `UPDATE promo_codes SET type = ?, value = ?, max_discount = ?, min_order_value = ?, first_order_only = ?, active = ?
     WHERE id = ?`,
    [merged.type, merged.value, merged.max_discount, merged.min_order_value, merged.first_order_only, merged.active, req.params.id]
  );

  res.json(await db.get("SELECT * FROM promo_codes WHERE id = ?", [req.params.id]));
}));

router.delete("/:id", requireAdmin, asyncHandler(async (req, res) => {
  const info = await db.run("DELETE FROM promo_codes WHERE id = ?", [req.params.id]);
  if (info.changes === 0) return res.status(404).json({ error: "Promo code not found" });
  res.status(204).end();
}));

// Public: codes that currently apply to this cart/customer, for the checkout dropdown.
router.get("/available", optionalCustomer, asyncHandler(async (req, res) => {
  const subtotal = Number(req.query.subtotal) || 0;
  const customerId = req.query.customerId;
  const firstOrder = await isFirstOrderFor({ phone: req.customerPhone, customerId });

  const active = await db.all("SELECT * FROM promo_codes WHERE active = 1");
  const available = active
    .map((promo) => ({ promo, result: evaluatePromo(promo, { subtotal, isFirstOrder: firstOrder }) }))
    .filter(({ result }) => result.valid && result.discount > 0)
    .map(({ promo, result }) => ({
      code: promo.code,
      description: describePromo(promo),
      discount: result.discount
    }));

  res.json(available);
}));

// Public: preview the discount for a specific code before placing the order.
router.post("/preview", optionalCustomer, asyncHandler(async (req, res) => {
  const { code, customerId, subtotal } = req.body;
  const promo = await db.get("SELECT * FROM promo_codes WHERE code = ?", [String(code || "").trim().toUpperCase()]);
  const firstOrder = await isFirstOrderFor({ phone: req.customerPhone, customerId });
  const result = evaluatePromo(promo, { subtotal: Number(subtotal) || 0, isFirstOrder: firstOrder });
  res.json(result);
}));

module.exports = router;
