// Database access for Chronara. Two backends behind one async interface (get/all/run/batch):
//   - Turso (hosted, SQLite-compatible, real persistence) when TURSO_DATABASE_URL is set.
//   - Local better-sqlite3 file (today's behavior, resets on every redeploy on hosts with no
//     persistent disk) as a zero-config fallback when it isn't.
// Every route talks to the same interface either way - only this file knows which backend
// is actually in use.
const path = require("path");
const fs = require("fs");

const uploadsRoot = path.join(__dirname, "..", "uploads", "products");
if (!fs.existsSync(uploadsRoot)) fs.mkdirSync(uploadsRoot, { recursive: true });

const usingTurso = !!process.env.TURSO_DATABASE_URL;

let db;

if (usingTurso) {
  const { createClient } = require("@libsql/client");
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN
  });

  db = {
    async get(sql, args = []) {
      const res = await client.execute({ sql, args });
      return res.rows[0];
    },
    async all(sql, args = []) {
      const res = await client.execute({ sql, args });
      return res.rows;
    },
    async run(sql, args = []) {
      const res = await client.execute({ sql, args });
      return { changes: res.rowsAffected, lastInsertRowid: res.lastInsertRowid };
    },
    async batch(statements) {
      await client.batch(statements.map((s) => ({ sql: s.sql, args: s.args || [] })), "write");
    }
  };
  console.log("[db] Using Turso (persistent) - TURSO_DATABASE_URL is set.");
} else {
  const path2 = require("path");
  const fs2 = require("fs");
  const Database = require("better-sqlite3");

  const dataDir = path2.join(__dirname, "..", "data");
  if (!fs2.existsSync(dataDir)) fs2.mkdirSync(dataDir, { recursive: true });

  const sqlite = new Database(path2.join(dataDir, "chronara.db"));
  sqlite.pragma("journal_mode = WAL");

  db = {
    async get(sql, args = []) {
      return sqlite.prepare(sql).get(...args);
    },
    async all(sql, args = []) {
      return sqlite.prepare(sql).all(...args);
    },
    async run(sql, args = []) {
      const res = sqlite.prepare(sql).run(...args);
      return { changes: res.changes, lastInsertRowid: res.lastInsertRowid };
    },
    async batch(statements) {
      const tx = sqlite.transaction((stmts) => {
        stmts.forEach(({ sql, args }) => sqlite.prepare(sql).run(...(args || [])));
      });
      tx(statements);
    }
  };
  console.log(
    "[db] Using local SQLite file (data/chronara.db) - resets on every redeploy on hosts with " +
    "no persistent disk. Set TURSO_DATABASE_URL/TURSO_AUTH_TOKEN for real persistence."
  );
}

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    price INTEGER NOT NULL,
    image TEXT NOT NULL,
    strap TEXT NOT NULL,
    description TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS orders (
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
  )`,
  `CREATE TABLE IF NOT EXISTS product_media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('image','video')),
    url TEXT NOT NULL,
    label TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS promo_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL CHECK (type IN ('percent','flat')),
    value REAL NOT NULL,
    max_discount INTEGER,
    min_order_value INTEGER,
    first_order_only INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS payment_settings (
    id INTEGER PRIMARY KEY,
    upi_id TEXT,
    qr_code_url TEXT,
    qr_code_public_id TEXT
  )`
];

// product_media no longer relies on ON DELETE CASCADE (uncertain whether PRAGMA foreign_keys
// state is reliably sticky per-request on a remote Turso connection) - products.js explicitly
// deletes product_media rows before deleting a product instead.

async function ensureColumn(table, column, definition) {
  const cols = await db.all(`PRAGMA table_info(${table})`);
  if (!cols.some((c) => c.name === column)) {
    await db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

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

async function seedProductsIfEmpty() {
  const { count } = await db.get("SELECT COUNT(*) AS count FROM products");
  if (count > 0) return;
  await db.batch(SEED_PRODUCTS.map((p) => ({
    sql: `INSERT INTO products (name, category, price, image, strap, description) VALUES (?, ?, ?, ?, ?, ?)`,
    args: [p.name, p.category, p.price, p.image, p.strap, p.description]
  })));
}

// Only resets DB rows - wiping locally-stored media (if that's the active media backend) is
// handled by the caller via media.js's wipeAllLocalMedia(), which is independent of which DB
// backend is in use here.
async function resetProductsToSeed() {
  await db.run("DELETE FROM product_media");
  await db.run("DELETE FROM products");
  if (!usingTurso) {
    await db.run("DELETE FROM sqlite_sequence WHERE name = 'products'");
    await db.run("DELETE FROM sqlite_sequence WHERE name = 'product_media'");
  }
  await seedProductsIfEmpty();
}

async function init() {
  for (const stmt of SCHEMA_STATEMENTS) {
    await db.run(stmt);
  }
  await ensureColumn("orders", "promo_code", "TEXT");
  await ensureColumn("orders", "discount", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn("orders", "phone", "TEXT");
  await ensureColumn("orders", "utr", "TEXT");
  await ensureColumn("orders", "payment_status", "TEXT NOT NULL DEFAULT 'Not Required'");
  await ensureColumn("product_media", "public_id", "TEXT");
  await seedProductsIfEmpty();
}

module.exports = { db, init, resetProductsToSeed, uploadsRoot, usingTurso };
