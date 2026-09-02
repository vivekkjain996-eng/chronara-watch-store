const express = require("express");
const multer = require("multer");
const { db, resetProductsToSeed } = require("../db");
const { requireAdmin } = require("../auth");
const { storeMedia, deleteMedia, cleanupProductStorage, wipeAllLocalMedia } = require("../lib/media");
const asyncHandler = require("../lib/asyncHandler");

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

async function nextSortOrder(productId) {
  const row = await db.get(
    "SELECT COALESCE(MAX(sort_order), -1) AS maxOrder FROM product_media WHERE product_id = ?",
    [productId]
  );
  return row.maxOrder + 1;
}

async function getMediaForProduct(productId) {
  return db.all(
    "SELECT id, type, url, label, sort_order FROM product_media WHERE product_id = ? ORDER BY sort_order ASC",
    [productId]
  );
}

async function syncCoverImage(productId) {
  const firstImage = await db.get(
    "SELECT url FROM product_media WHERE product_id = ? AND type = 'image' ORDER BY sort_order ASC LIMIT 1",
    [productId]
  );
  if (firstImage) await db.run("UPDATE products SET image = ? WHERE id = ?", [firstImage.url, productId]);
}

// Adds uploaded photos/video as product_media rows. Only one video is kept per product -
// uploading a new one replaces the old (asset + row).
async function insertMedia(productId, imageFiles, labels, videoFile) {
  let order = await nextSortOrder(productId);

  for (let i = 0; i < (imageFiles || []).length; i++) {
    const { url, publicId } = await storeMedia(productId, imageFiles[i]);
    const label = labels && labels[i] ? String(labels[i]).trim() : "";
    await db.run(
      "INSERT INTO product_media (product_id, type, url, label, sort_order, public_id) VALUES (?, ?, ?, ?, ?, ?)",
      [productId, "image", url, label, order++, publicId]
    );
  }

  if (videoFile) {
    const existingVideos = await db.all(
      "SELECT id, url, public_id, type FROM product_media WHERE product_id = ? AND type = 'video'",
      [productId]
    );
    for (const row of existingVideos) {
      await deleteMedia(row, productId);
      await db.run("DELETE FROM product_media WHERE id = ?", [row.id]);
    }
    const { url, publicId } = await storeMedia(productId, videoFile);
    await db.run(
      "INSERT INTO product_media (product_id, type, url, label, sort_order, public_id) VALUES (?, ?, ?, ?, ?, ?)",
      [productId, "video", url, "", order++, publicId]
    );
  }
}

router.get("/", asyncHandler(async (req, res) => {
  const products = await db.all("SELECT * FROM products ORDER BY id");
  res.json(products);
}));

router.get("/:id", asyncHandler(async (req, res) => {
  const product = await db.get("SELECT * FROM products WHERE id = ?", [req.params.id]);
  if (!product) return res.status(404).json({ error: "Product not found" });
  product.media = await getMediaForProduct(product.id);
  res.json(product);
}));

router.post("/", requireAdmin, handleUpload, asyncHandler(async (req, res) => {
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

  const info = await db.run(
    "INSERT INTO products (name, category, price, image, strap, description) VALUES (?, ?, ?, ?, ?, ?)",
    [name, category, Number(price), "images/watch1.svg", strap, description] // placeholder, synced right after
  );
  const productId = info.lastInsertRowid;

  await insertMedia(productId, images, labels, videoFile);
  await syncCoverImage(productId);

  const product = await db.get("SELECT * FROM products WHERE id = ?", [productId]);
  product.media = await getMediaForProduct(productId);
  res.status(201).json(product);
}));

router.put("/:id", requireAdmin, asyncHandler(async (req, res) => {
  const existing = await db.get("SELECT * FROM products WHERE id = ?", [req.params.id]);
  if (!existing) return res.status(404).json({ error: "Product not found" });

  const merged = {
    name: req.body.name ?? existing.name,
    category: req.body.category ?? existing.category,
    price: req.body.price != null ? Number(req.body.price) : existing.price,
    strap: req.body.strap ?? existing.strap,
    description: req.body.description ?? existing.description
  };

  await db.run(
    "UPDATE products SET name = ?, category = ?, price = ?, strap = ?, description = ? WHERE id = ?",
    [merged.name, merged.category, merged.price, merged.strap, merged.description, req.params.id]
  );

  const product = await db.get("SELECT * FROM products WHERE id = ?", [req.params.id]);
  product.media = await getMediaForProduct(product.id);
  res.json(product);
}));

router.post("/:id/media", requireAdmin, handleUpload, asyncHandler(async (req, res) => {
  const product = await db.get("SELECT * FROM products WHERE id = ?", [req.params.id]);
  if (!product) return res.status(404).json({ error: "Product not found" });

  const images = (req.files && req.files.images) || [];
  const videoFile = (req.files && req.files.video && req.files.video[0]) || null;
  if (!images.length && !videoFile) {
    return res.status(400).json({ error: "No files provided" });
  }
  const labels = Array.isArray(req.body.labels) ? req.body.labels : (req.body.labels ? [req.body.labels] : []);

  await insertMedia(product.id, images, labels, videoFile);
  await syncCoverImage(product.id);

  const updated = await db.get("SELECT * FROM products WHERE id = ?", [product.id]);
  updated.media = await getMediaForProduct(product.id);
  res.status(201).json(updated);
}));

router.delete("/:id/media/:mediaId", requireAdmin, asyncHandler(async (req, res) => {
  const media = await db.get(
    "SELECT * FROM product_media WHERE id = ? AND product_id = ?",
    [req.params.mediaId, req.params.id]
  );
  if (!media) return res.status(404).json({ error: "Media not found" });

  if (media.type === "image") {
    const { count } = await db.get(
      "SELECT COUNT(*) AS count FROM product_media WHERE product_id = ? AND type = 'image'",
      [req.params.id]
    );
    if (count <= 1) return res.status(400).json({ error: "Watch must have at least one photo" });
  }

  await db.run("DELETE FROM product_media WHERE id = ?", [media.id]);
  await deleteMedia(media, req.params.id);
  if (media.type === "image") await syncCoverImage(req.params.id);

  res.status(204).end();
}));

router.delete("/:id", requireAdmin, asyncHandler(async (req, res) => {
  const media = await db.all("SELECT * FROM product_media WHERE product_id = ?", [req.params.id]);
  for (const m of media) {
    await deleteMedia(m, req.params.id);
  }
  await db.run("DELETE FROM product_media WHERE product_id = ?", [req.params.id]);

  const info = await db.run("DELETE FROM products WHERE id = ?", [req.params.id]);
  if (info.changes === 0) return res.status(404).json({ error: "Product not found" });
  cleanupProductStorage(req.params.id);
  res.status(204).end();
}));

router.post("/reset", requireAdmin, asyncHandler(async (req, res) => {
  await resetProductsToSeed();
  wipeAllLocalMedia();
  res.json(await db.all("SELECT * FROM products ORDER BY id"));
}));

module.exports = router;
