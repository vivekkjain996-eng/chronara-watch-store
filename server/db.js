// SQLite setup for the Chronara demo. Single local file DB, zero external services.
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const dataDir = path.join(__dirname, "..", "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const uploadsRoot = path.join(__dirname, "..", "uploads", "products");
if (!fs.existsSync(uploadsRoot)) fs.mkdirSync(uploadsRoot, { recursive: true });

const db = new Database(path.join(dataDir, "chronara.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    price INTEGER NOT NULL,
    image TEXT NOT NULL,
    strap TEXT NOT NULL,
    description TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    date TEXT NOT NULL,
    items TEXT NOT NULL,
    total INTEGER NOT NULL,
    customer_name TEXT,
    email TEXT,
    city TEXT,
    pin TEXT,
    address TEXT,
    payment TEXT,
    status TEXT NOT NULL DEFAULT 'Processing'
  );

  CREATE TABLE IF NOT EXISTS product_media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('image','video')),
    url TEXT NOT NULL,
    label TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS promo_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL CHECK (type IN ('percent','flat')),
    value REAL NOT NULL,
    max_discount INTEGER,
    min_order_value INTEGER,
    first_order_only INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );
`);

// Additive migration for the "orders" table (already existed before promo codes were added).
function ensureColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
ensureColumn("orders", "promo_code", "TEXT");
ensureColumn("orders", "discount", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("orders", "phone", "TEXT");

// Seed data - the original fictional demo catalog. Only used to populate an empty table.
const SEED_PRODUCTS = [
  { name: "Chronara Regal", category: "men", price: 8995, image: "images/watch1.svg", strap: "Stainless Steel",
    description: "A classic stainless steel case paired with a sunburst silver dial. Timeless design for everyday wear." },
  { name: "Chronara Heritage", category: "men", price: 11499, image: "images/watch2.svg", strap: "Genuine Leather",
    description: "Genuine leather strap with a warm ivory dial and gold-tone accents. A refined choice for the office." },
  { name: "Chronara Sovereign", category: "men", price: 24999, image: "images/watch3.svg", strap: "Gold-Tone Steel",
    description: "An all-gold luxury dress watch with a midnight black dial. Reserved for special occasions." },
  { name: "Chronara Blush", category: "women", price: 6499, image: "images/watch4.svg", strap: "Rose Gold Alloy",
    description: "A rose-tone case with a soft blush dial - effortless elegance for everyday wear." },
  { name: "Chronara Voyager", category: "women", price: 9999, image: "images/watch5.svg", strap: "Steel Bracelet",
    description: "A steel bracelet watch with a deep ocean-blue dial. Water resistant and versatile." },
  { name: "Chronara Pulse", category: "smart", price: 5999, image: "images/watch6.svg", strap: "Silicone",
    description: "Smartwatch with heart-rate tracking, step counter and up to 7 days of battery life." },
  { name: "Chronara Prestige", category: "men", price: 18750, image: "images/watch7.svg", strap: "Gold-Tone Steel",
    description: "A navy dial framed in gold for a bold statement piece that commands attention." },
  { name: "Chronara Stealth", category: "men", price: 7299, image: "images/watch8.svg", strap: "Matte Steel",
    description: "All-black tactical design with a matte finish, built for a modern, understated look." }
];

function seedProductsIfEmpty() {
  const { count } = db.prepare("SELECT COUNT(*) AS count FROM products").get();
  if (count > 0) return;
  const insert = db.prepare(`
    INSERT INTO products (name, category, price, image, strap, description)
    VALUES (@name, @category, @price, @image, @strap, @description)
  `);
  const insertMany = db.transaction((rows) => rows.forEach((row) => insert.run(row)));
  insertMany(SEED_PRODUCTS);
}

function resetProductsToSeed() {
  db.exec("DELETE FROM products"); // cascades product_media rows via ON DELETE CASCADE
  db.exec("DELETE FROM sqlite_sequence WHERE name = 'products'");
  db.exec("DELETE FROM sqlite_sequence WHERE name = 'product_media'");
  fs.rmSync(uploadsRoot, { recursive: true, force: true });
  fs.mkdirSync(uploadsRoot, { recursive: true });
  seedProductsIfEmpty();
}

seedProductsIfEmpty();

module.exports = { db, resetProductsToSeed, uploadsRoot };
