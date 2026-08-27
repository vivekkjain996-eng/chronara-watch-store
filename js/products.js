// Sample product catalog for the Chronara demo site.
// All data is fictional/placeholder - no real brand or pricing data.
const PRODUCTS = [
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

function formatPrice(value) {
  return "₹" + value.toLocaleString("en-IN");
}

function getProductById(id) {
  return PRODUCTS.find(p => p.id === Number(id));
}
