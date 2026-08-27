// Product catalog for the Chronara demo site.
// BASE_PRODUCTS is the original seed data (fictional, placeholder). The live catalog
// (what shoppers and the admin panel actually see) is stored in localStorage so that
// watches added/edited via the admin panel persist and show up across the site,
// without needing any backend/database.
const BASE_PRODUCTS = [
  {
    id: 1,
    name: "Chronara Regal",
    category: "men",
    price: 8995,
    image: "images/watch1.svg",
    strap: "Stainless Steel",
    description: "A classic stainless steel case paired with a sunburst silver dial. Timeless design for everyday wear."
  },
  {
    id: 2,
    name: "Chronara Heritage",
    category: "men",
    price: 11499,
    image: "images/watch2.svg",
    strap: "Genuine Leather",
    description: "Genuine leather strap with a warm ivory dial and gold-tone accents. A refined choice for the office."
  },
  {
    id: 3,
    name: "Chronara Sovereign",
    category: "men",
    price: 24999,
    image: "images/watch3.svg",
    strap: "Gold-Tone Steel",
    description: "An all-gold luxury dress watch with a midnight black dial. Reserved for special occasions."
  },
  {
    id: 4,
    name: "Chronara Blush",
    category: "women",
    price: 6499,
    image: "images/watch4.svg",
    strap: "Rose Gold Alloy",
    description: "A rose-tone case with a soft blush dial - effortless elegance for everyday wear."
  },
  {
    id: 5,
    name: "Chronara Voyager",
    category: "women",
    price: 9999,
    image: "images/watch5.svg",
    strap: "Steel Bracelet",
    description: "A steel bracelet watch with a deep ocean-blue dial. Water resistant and versatile."
  },
  {
    id: 6,
    name: "Chronara Pulse",
    category: "smart",
    price: 5999,
    image: "images/watch6.svg",
    strap: "Silicone",
    description: "Smartwatch with heart-rate tracking, step counter and up to 7 days of battery life."
  },
  {
    id: 7,
    name: "Chronara Prestige",
    category: "men",
    price: 18750,
    image: "images/watch7.svg",
    strap: "Gold-Tone Steel",
    description: "A navy dial framed in gold for a bold statement piece that commands attention."
  },
  {
    id: 8,
    name: "Chronara Stealth",
    category: "men",
    price: 7299,
    image: "images/watch8.svg",
    strap: "Matte Steel",
    description: "All-black tactical design with a matte finish, built for a modern, understated look."
  }
];

const CATALOG_KEY = "chronara_catalog";

function loadCatalog() {
  let stored = null;
  try {
    stored = JSON.parse(localStorage.getItem(CATALOG_KEY));
  } catch (e) {
    stored = null;
  }
  if (!Array.isArray(stored) || stored.length === 0) {
    stored = JSON.parse(JSON.stringify(BASE_PRODUCTS));
    localStorage.setItem(CATALOG_KEY, JSON.stringify(stored));
  }
  return stored;
}

let PRODUCTS = loadCatalog();

function refreshProducts() {
  PRODUCTS = loadCatalog();
  return PRODUCTS;
}

function saveCatalog(list) {
  localStorage.setItem(CATALOG_KEY, JSON.stringify(list));
  PRODUCTS = list;
}

function nextProductId() {
  const list = loadCatalog();
  return list.reduce((max, p) => Math.max(max, p.id), 0) + 1;
}

function addProduct(product) {
  const list = loadCatalog();
  const newProduct = Object.assign({}, product, { id: nextProductId() });
  list.push(newProduct);
  saveCatalog(list);
  return newProduct;
}

function updateProduct(id, updates) {
  const list = loadCatalog();
  const idx = list.findIndex(p => p.id === Number(id));
  if (idx !== -1) {
    list[idx] = Object.assign({}, list[idx], updates);
    saveCatalog(list);
  }
}

function deleteProduct(id) {
  const list = loadCatalog().filter(p => p.id !== Number(id));
  saveCatalog(list);
}

function resetCatalogToDemoData() {
  saveCatalog(JSON.parse(JSON.stringify(BASE_PRODUCTS)));
}

function formatPrice(value) {
  return "₹" + Number(value).toLocaleString("en-IN");
}

function getProductById(id) {
  return PRODUCTS.find(p => p.id === Number(id));
}
