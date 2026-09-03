const express = require("express");
const { db } = require("../db");
const { requireAdmin, requireCustomer } = require("../auth");
const asyncHandler = require("../lib/asyncHandler");

const router = express.Router();

function rowToReview(row) {
  return {
    id: row.id,
    productId: row.product_id,
    customerName: row.customer_name || "Verified Buyer",
    rating: row.rating,
    comment: row.comment || "",
    date: row.date
  };
}

// A customer can only review watches that show up in one of their own past orders - checked
// by scanning their orders' stored item lists (items is a JSON blob per order, there's no
// separate order_items table), same source of truth the admin Orders tab already reads from.
async function hasPurchased(phone, productId) {
  const orders = await db.all("SELECT items FROM orders WHERE phone = ?", [phone]);
  return orders.some((o) => {
    try {
      return JSON.parse(o.items).some((item) => Number(item.id) === Number(productId));
    } catch (e) {
      return false;
    }
  });
}

async function latestCustomerName(phone) {
  const row = await db.get(
    "SELECT customer_name FROM orders WHERE phone = ? AND customer_name != '' ORDER BY date DESC LIMIT 1",
    [phone]
  );
  return (row && row.customer_name) || null;
}

router.get("/:productId", asyncHandler(async (req, res) => {
  const rows = await db.all(
    "SELECT * FROM reviews WHERE product_id = ? ORDER BY date DESC",
    [req.params.productId]
  );
  const reviews = rows.map(rowToReview);
  const count = reviews.length;
  const average = count ? reviews.reduce((sum, r) => sum + r.rating, 0) / count : 0;
  res.json({ reviews, average, count });
}));

router.get("/:productId/mine", requireCustomer, asyncHandler(async (req, res) => {
  const canReview = await hasPurchased(req.customerPhone, req.params.productId);
  const existing = await db.get(
    "SELECT * FROM reviews WHERE product_id = ? AND phone = ?",
    [req.params.productId, req.customerPhone]
  );
  res.json({ canReview, review: existing ? rowToReview(existing) : null });
}));

router.post("/:productId", requireCustomer, asyncHandler(async (req, res) => {
  const productId = Number(req.params.productId);
  const product = await db.get("SELECT id FROM products WHERE id = ?", [productId]);
  if (!product) return res.status(404).json({ error: "Watch not found" });

  const rating = Number(req.body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ error: "Rating must be a whole number from 1 to 5" });
  }
  const comment = req.body.comment ? String(req.body.comment).trim().slice(0, 1000) : "";

  if (!(await hasPurchased(req.customerPhone, productId))) {
    return res.status(403).json({ error: "You can only review watches you've purchased." });
  }

  const customerName = (await latestCustomerName(req.customerPhone)) || "Verified Buyer";
  const date = new Date().toISOString();

  await db.run(
    `INSERT INTO reviews (product_id, phone, customer_name, rating, comment, date)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(product_id, phone) DO UPDATE SET
       customer_name = excluded.customer_name, rating = excluded.rating,
       comment = excluded.comment, date = excluded.date`,
    [productId, req.customerPhone, customerName, rating, comment, date]
  );

  const saved = await db.get(
    "SELECT * FROM reviews WHERE product_id = ? AND phone = ?",
    [productId, req.customerPhone]
  );
  res.status(201).json(rowToReview(saved));
}));

router.get("/admin/all", requireAdmin, asyncHandler(async (req, res) => {
  const rows = await db.all(
    `SELECT reviews.*, products.name AS product_name
     FROM reviews JOIN products ON products.id = reviews.product_id
     ORDER BY reviews.date DESC`
  );
  res.json(rows.map((r) => ({ ...rowToReview(r), productName: r.product_name })));
}));

router.delete("/admin/:id", requireAdmin, asyncHandler(async (req, res) => {
  const info = await db.run("DELETE FROM reviews WHERE id = ?", [req.params.id]);
  if (info.changes === 0) return res.status(404).json({ error: "Review not found" });
  res.status(204).end();
}));

module.exports = router;
