const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const express = require("express");
const multer = require("multer");
const { db, resetProductsToSeed, uploadsRoot } = require("../db");
const { requireAdmin } = require("../auth");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === "images" && !file.mimetype.startsWith("image/")) {
      return cb(new Error("Photos must be image files"));
    }
    if (file.fieldname === "video" && !file.mimetype.startsWith("video/")) {
      return cb(new Error("Video must be a video file"));
    }
    cb(null, true);
  }
});
const uploadMedia = upload.fields([{ name: "images", maxCount: 8 }, { name: "video", maxCount: 1 }]);

// Wraps multer so file-too-large/wrong-type errors come back as a clean 400 JSON
// response instead of falling through to the generic 500 handler.
function handleUpload(req, res, next) {
  uploadMedia(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || "Upload failed" });
    next();
  });
}

function extFor(file) {
  const fromName = path.extname(file.originalname || "");
  if (fromName) return fromName;
  const guess = (file.mimetype || "").split("/")[1];
  return guess ? "." + guess : "";
}

function saveFile(productId, file) {
  const dir = path.join(uploadsRoot, String(productId));
  fs.mkdirSync(dir, { recursive: true });
  const filename = crypto.randomBytes(8).toString("hex") + extFor(file);
  fs.writeFileSync(path.join(dir, filename), file.buffer);
  return `/uploads/products/${productId}/${filename}`;
}

function deleteMediaFile(productId, url) {
  const abs = path.join(uploadsRoot, String(productId), path.basename(url));
  fs.unlink(abs, () => {}); // best-effort, ignore errors
}

function nextSortOrder(productId) {
  const row = db.prepare("SELECT COALESCE(MAX(sort_order), -1) AS maxOrder FROM product_media WHERE product_id = ?").get(productId);
  return row.maxOrder + 1;
}

function getMediaForProduct(productId) {
  return db.prepare("SELECT id, type, url, label, sort_order FROM product_media WHERE product_id = ? ORDER BY sort_order ASC").all(productId);
}

function syncCoverImage(productId) {
  const firstImage = db.prepare(`
    SELECT url FROM product_media WHERE product_id = ? AND type = 'image' ORDER BY sort_order ASC LIMIT 1
  `).get(productId);
  if (firstImage) db.prepare("UPDATE products SET image = ? WHERE id = ?").run(firstImage.url, productId);
}

// Adds uploaded photos/video as product_media rows. Only one video is kept per product -
// uploading a new one replaces the old (file + row).
function insertMedia(productId, imageFiles, labels, videoFile) {
  const insertStmt = db.prepare(`
    INSERT INTO product_media (product_id, type, url, label, sort_order) VALUES (?, ?, ?, ?, ?)
  `);
  let order = nextSortOrder(productId);

  (imageFiles || []).forEach((file, i) => {
    const url = saveFile(productId, file);
    const label = labels && labels[i] ? String(labels[i]).trim() : "";
    insertStmt.run(productId, "image", url, label, order++);
  });

  if (videoFile) {
    const existingVideos = db.prepare("SELECT id, url FROM product_media WHERE product_id = ? AND type = 'video'").all(productId);
    existingVideos.forEach((row) => {
      deleteMediaFile(productId, row.url);
      db.prepare("DELETE FROM product_media WHERE id = ?").run(row.id);
    });
    const url = saveFile(productId, videoFile);
    insertStmt.run(productId, "video", url, "", order++);
  }
}

router.get("/", (req, res) => {
  const products = db.prepare("SELECT * FROM products ORDER BY id").all();
  res.json(products);
});

router.get("/:id", (req, res) => {
  const product = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
  if (!product) return res.status(404).json({ error: "Product not found" });
  product.media = getMediaForProduct(product.id);
  res.json(product);
});

router.post("/", requireAdmin, handleUpload, (req, res) => {
  const { name, category, price, strap, description } = req.body;
  const images = (req.files && req.files.images) || [];
  const videoFile = (req.files && req.files.video && req.files.video[0]) || null;

  if (!name || !category || !price || !strap || !description) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  if (!images.length) {
    return res.status(400).json({ error: "At least one photo is required" });
  }

  const labels = Array.isArray(req.body.labels) ? req.body.labels : (req.body.labels ? [req.body.labels] : []);

  const info = db.prepare(`
    INSERT INTO products (name, category, price, image, strap, description)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(name, category, Number(price), "images/watch1.svg", strap, description); // placeholder, synced right after
  const productId = info.lastInsertRowid;

  insertMedia(productId, images, labels, videoFile);
  syncCoverImage(productId);

  const product = db.prepare("SELECT * FROM products WHERE id = ?").get(productId);
  product.media = getMediaForProduct(productId);
  res.status(201).json(product);
});

router.put("/:id", requireAdmin, (req, res) => {
  const existing = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Product not found" });

  const merged = {
    name: req.body.name ?? existing.name,
    category: req.body.category ?? existing.category,
    price: req.body.price != null ? Number(req.body.price) : existing.price,
    strap: req.body.strap ?? existing.strap,
    description: req.body.description ?? existing.description
  };

  db.prepare(`
    UPDATE products SET name = ?, category = ?, price = ?, strap = ?, description = ?
    WHERE id = ?
  `).run(merged.name, merged.category, merged.price, merged.strap, merged.description, req.params.id);

  const product = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
  product.media = getMediaForProduct(product.id);
  res.json(product);
});

router.post("/:id/media", requireAdmin, handleUpload, (req, res) => {
  const product = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
  if (!product) return res.status(404).json({ error: "Product not found" });

  const images = (req.files && req.files.images) || [];
  const videoFile = (req.files && req.files.video && req.files.video[0]) || null;
  if (!images.length && !videoFile) {
    return res.status(400).json({ error: "No files provided" });
  }
  const labels = Array.isArray(req.body.labels) ? req.body.labels : (req.body.labels ? [req.body.labels] : []);

  insertMedia(product.id, images, labels, videoFile);
  syncCoverImage(product.id);

  const updated = db.prepare("SELECT * FROM products WHERE id = ?").get(product.id);
  updated.media = getMediaForProduct(product.id);
  res.status(201).json(updated);
});

router.delete("/:id/media/:mediaId", requireAdmin, (req, res) => {
  const media = db.prepare("SELECT * FROM product_media WHERE id = ? AND product_id = ?").get(req.params.mediaId, req.params.id);
  if (!media) return res.status(404).json({ error: "Media not found" });

  if (media.type === "image") {
    const { count } = db.prepare("SELECT COUNT(*) AS count FROM product_media WHERE product_id = ? AND type = 'image'").get(req.params.id);
    if (count <= 1) return res.status(400).json({ error: "Watch must have at least one photo" });
  }

  db.prepare("DELETE FROM product_media WHERE id = ?").run(media.id);
  deleteMediaFile(req.params.id, media.url);
  if (media.type === "image") syncCoverImage(req.params.id);

  res.status(204).end();
});

router.delete("/:id", requireAdmin, (req, res) => {
  const info = db.prepare("DELETE FROM products WHERE id = ?").run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "Product not found" });
  fs.rmSync(path.join(uploadsRoot, String(req.params.id)), { recursive: true, force: true });
  res.status(204).end();
});

router.post("/reset", requireAdmin, (req, res) => {
  resetProductsToSeed();
  res.json(db.prepare("SELECT * FROM products ORDER BY id").all());
});

module.exports = router;
