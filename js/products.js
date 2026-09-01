// Product catalog for the Chronara demo site.
// The catalog now lives server-side (SQLite via /api/products) so that watches added or
// edited in the admin panel are visible to every customer, on any browser/device - not
// just the browser that made the change.
let PRODUCTS = [];

async function loadProducts() {
  PRODUCTS = await apiGet("/api/products");
  return PRODUCTS;
}

// formData: text fields + one or more "images" files + parallel "labels" fields + optional "video".
async function createProduct(formData) {
  const created = await apiUpload("POST", "/api/products", formData);
  await loadProducts();
  return created;
}

async function updateProduct(id, updates) {
  const updated = await apiPut(`/api/products/${id}`, updates);
  await loadProducts();
  return updated;
}

// formData: optional "images"/"labels" and/or "video" - adds more media to an existing product.
async function uploadProductMedia(id, formData) {
  const updated = await apiUpload("POST", `/api/products/${id}/media`, formData);
  await loadProducts();
  return updated;
}

async function deleteProductMedia(id, mediaId) {
  await apiDelete(`/api/products/${id}/media/${mediaId}`);
  await loadProducts();
}

async function deleteProduct(id) {
  await apiDelete(`/api/products/${id}`);
  await loadProducts();
}

// Full product detail including its photo/video gallery (the list endpoint only returns
// the cover image, to keep the shop grid payload small).
async function fetchProductWithMedia(id) {
  return apiGet(`/api/products/${id}`);
}

async function resetCatalogToDemoData() {
  await apiPost("/api/products/reset");
  await loadProducts();
}

function formatPrice(value) {
  return "₹" + Number(value).toLocaleString("en-IN");
}

function getProductById(id) {
  return PRODUCTS.find(p => p.id === Number(id));
}
