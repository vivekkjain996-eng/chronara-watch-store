// Product photo/video storage. Two backends:
//   - Cloudinary (real persistence, survives redeploys) when CLOUDINARY_URL (or the three
//     CLOUDINARY_* vars) is set.
//   - Local disk under uploads/products/<id>/ (today's behavior) as a zero-config fallback.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { uploadsRoot } = require("../db");

const usingCloudinary = !!(process.env.CLOUDINARY_URL || process.env.CLOUDINARY_CLOUD_NAME);

let cloudinary = null;
if (usingCloudinary) {
  cloudinary = require("cloudinary").v2;
  // cloudinary.config() auto-reads CLOUDINARY_URL from the environment if present; the
  // explicit call below only matters when using the three separate CLOUDINARY_* vars instead.
  if (!process.env.CLOUDINARY_URL) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET
    });
  }
  console.log("[media] Using Cloudinary (persistent) for uploaded photos/videos.");
} else {
  console.log(
    "[media] Using local disk (uploads/products) - resets on every redeploy on hosts with no " +
    "persistent disk. Set CLOUDINARY_URL for real persistence."
  );
}

function extFor(file) {
  const fromName = path.extname(file.originalname || "");
  if (fromName) return fromName;
  const guess = (file.mimetype || "").split("/")[1];
  return guess ? "." + guess : "";
}

function uploadToCloudinary(productId, file) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { resource_type: "auto", folder: `chronara/products/${productId}` },
      (err, result) => {
        if (err) return reject(err);
        resolve({ url: result.secure_url, publicId: result.public_id, resourceType: result.resource_type });
      }
    );
    stream.end(file.buffer);
  });
}

async function storeMedia(productId, file) {
  if (usingCloudinary) {
    return uploadToCloudinary(productId, file);
  }
  const dir = path.join(uploadsRoot, String(productId));
  fs.mkdirSync(dir, { recursive: true });
  const filename = crypto.randomBytes(8).toString("hex") + extFor(file);
  fs.writeFileSync(path.join(dir, filename), file.buffer);
  return { url: `/uploads/products/${productId}/${filename}`, publicId: null, resourceType: null };
}

async function deleteMedia(media, productId) {
  if (usingCloudinary && media.public_id) {
    const resourceType = media.type === "video" ? "video" : "image";
    try {
      await cloudinary.uploader.destroy(media.public_id, { resource_type: resourceType });
    } catch (e) {
      console.error("[media] Cloudinary delete failed for", media.public_id, e.message);
    }
    return;
  }
  if (!usingCloudinary) {
    const abs = path.join(uploadsRoot, String(productId), path.basename(media.url));
    fs.unlink(abs, () => {}); // best-effort, ignore errors
  }
}

// Called after a product (and its individual media rows/assets) is deleted, to remove the
// now-empty local directory. No-op on the Cloudinary path (nothing local to clean up).
function cleanupProductStorage(productId) {
  if (usingCloudinary) return;
  fs.rmSync(path.join(uploadsRoot, String(productId)), { recursive: true, force: true });
}

// Wipes every locally-stored product photo/video (used when resetting the catalog to seed
// data). No-op on the Cloudinary path - the seed products never had Cloudinary assets to begin
// with, so there's nothing there to clean up.
function wipeAllLocalMedia() {
  if (usingCloudinary) return;
  fs.rmSync(uploadsRoot, { recursive: true, force: true });
  fs.mkdirSync(uploadsRoot, { recursive: true });
}

module.exports = { storeMedia, deleteMedia, cleanupProductStorage, wipeAllLocalMedia, usingCloudinary };
