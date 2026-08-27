// Admin panel logic. IMPORTANT: this is a client-side-only demo gate, NOT real
// security - the password below is visible to anyone who views this file's source.
// It's meant to separate the "customer" and "admin" areas of the demo UI, not to
// protect real data. Do not reuse this pattern for anything that needs real security.
const ADMIN_PASSWORD = "admin123";
const ADMIN_AUTH_KEY = "chronara_admin_auth";
const MAX_IMAGE_DIM = 500;

let editingId = null;
let pendingImageDataUrl = null;

function isAdminLoggedIn() {
  return sessionStorage.getItem(ADMIN_AUTH_KEY) === "true";
}

function initAdminPage() {
  const root = document.getElementById("admin-root");
  if (!root) return;

  if (!isAdminLoggedIn()) {
    renderLogin(root);
  } else {
    renderDashboard(root);
  }
}

function renderLogin(root) {
  root.innerHTML = `
    <div class="form-card" style="max-width:400px;">
      <h2 style="margin-bottom:6px;">Admin Login</h2>
      <p style="color:#6b6b6b;font-size:13px;margin-bottom:20px;">Demo password: <code>admin123</code></p>
      <form id="admin-login-form">
        <div class="form-row">
          <label>Password</label>
          <input type="password" id="admin-password" required placeholder="Enter admin password">
        </div>
        <p id="admin-login-error" style="color:#a6262b;font-size:13px;margin-bottom:12px;display:none;">Incorrect password. Try again.</p>
        <button type="submit" class="btn btn-dark btn-block">Log In</button>
      </form>
    </div>`;

  document.getElementById("admin-login-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const entered = document.getElementById("admin-password").value;
    if (entered === ADMIN_PASSWORD) {
      sessionStorage.setItem(ADMIN_AUTH_KEY, "true");
      renderDashboard(root);
    } else {
      document.getElementById("admin-login-error").style.display = "block";
    }
  });
}

function renderDashboard(root) {
  refreshProducts();
  root.innerHTML = `
    <div class="admin-topbar">
      <h2>Manage Watches</h2>
      <div>
        <button class="btn btn-outline" id="admin-reset-btn" style="color:#0d1b2a;border-color:#0d1b2a;">Reset to Demo Data</button>
        <button class="btn btn-dark" id="admin-logout-btn">Log Out</button>
      </div>
    </div>

    <div class="admin-layout">
      <div class="admin-table-wrap">
        <table class="cart-table" id="admin-product-table">
          <thead><tr><th></th><th>Name</th><th>Category</th><th>Price</th><th></th></tr></thead>
          <tbody id="admin-product-tbody"></tbody>
        </table>
      </div>

      <div class="form-card" id="admin-form-card">
        <h3 id="admin-form-title" style="margin-bottom:18px;">Add New Watch</h3>
        <form id="admin-product-form">
          <input type="hidden" id="admin-edit-id">
          <div class="form-row">
            <label>Watch Name</label>
            <input type="text" id="admin-name" required placeholder="e.g. Chronara Aurora">
          </div>
          <div class="form-row form-row-2">
            <div>
              <label>Category</label>
              <select id="admin-category">
                <option value="men">Men</option>
                <option value="women">Women</option>
                <option value="smart">Smart</option>
              </select>
            </div>
            <div>
              <label>Price (₹)</label>
              <input type="number" id="admin-price" required min="0" step="1" placeholder="9999">
            </div>
          </div>
          <div class="form-row">
            <label>Strap Material</label>
            <input type="text" id="admin-strap" required placeholder="e.g. Stainless Steel">
          </div>
          <div class="form-row">
            <label>Description</label>
            <textarea id="admin-description" rows="3" required placeholder="Short product description"></textarea>
          </div>
          <div class="form-row">
            <label>Watch Image</label>
            <input type="file" id="admin-image" accept="image/*">
            <p style="font-size:12px;color:#6b6b6b;margin-top:6px;">Optional when editing - leave blank to keep the current image. Images are resized to fit in your browser's storage.</p>
            <img id="admin-image-preview" style="max-width:120px;max-height:120px;margin-top:10px;display:none;border:1px solid var(--border);border-radius:4px;">
          </div>
          <div style="display:flex;gap:10px;">
            <button type="submit" class="btn btn-dark" id="admin-submit-btn" style="flex:1;">Add Watch</button>
            <button type="button" class="btn btn-outline" id="admin-cancel-edit-btn" style="display:none;color:#0d1b2a;border-color:#0d1b2a;">Cancel</button>
          </div>
        </form>
      </div>
    </div>`;

  renderAdminTable();
  wireAdminForm();

  document.getElementById("admin-logout-btn").addEventListener("click", () => {
    sessionStorage.removeItem(ADMIN_AUTH_KEY);
    initAdminPage();
  });

  document.getElementById("admin-reset-btn").addEventListener("click", () => {
    if (confirm("Reset the catalog back to the original 8 demo watches? Any watches you added or edited will be lost.")) {
      resetCatalogToDemoData();
      renderAdminTable();
    }
  });
}

function renderAdminTable() {
  const tbody = document.getElementById("admin-product-tbody");
  if (!tbody) return;
  refreshProducts();
  tbody.innerHTML = PRODUCTS.map(p => `
    <tr>
      <td><img src="${p.image}" alt="${p.name}" style="width:44px;height:44px;object-fit:contain;"></td>
      <td>${p.name}</td>
      <td style="text-transform:capitalize;">${p.category}</td>
      <td>${formatPrice(p.price)}</td>
      <td style="white-space:nowrap;">
        <button class="btn btn-outline admin-edit-btn" data-id="${p.id}" style="padding:6px 14px;font-size:11.5px;color:#0d1b2a;border-color:#0d1b2a;">Edit</button>
        <button class="btn btn-outline admin-delete-btn" data-id="${p.id}" style="padding:6px 14px;font-size:11.5px;color:#a6262b;border-color:#a6262b;">Delete</button>
      </td>
    </tr>`).join("");

  tbody.querySelectorAll(".admin-edit-btn").forEach(btn => {
    btn.addEventListener("click", () => startEdit(Number(btn.dataset.id)));
  });
  tbody.querySelectorAll(".admin-delete-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const p = getProductById(btn.dataset.id);
      if (p && confirm(`Delete "${p.name}"? This can't be undone.`)) {
        deleteProduct(btn.dataset.id);
        renderAdminTable();
        if (editingId === Number(btn.dataset.id)) resetAdminForm();
      }
    });
  });
}

function startEdit(id) {
  const p = getProductById(id);
  if (!p) return;
  editingId = id;
  pendingImageDataUrl = null;

  document.getElementById("admin-form-title").textContent = "Edit Watch";
  document.getElementById("admin-edit-id").value = id;
  document.getElementById("admin-name").value = p.name;
  document.getElementById("admin-category").value = p.category;
  document.getElementById("admin-price").value = p.price;
  document.getElementById("admin-strap").value = p.strap;
  document.getElementById("admin-description").value = p.description;
  document.getElementById("admin-submit-btn").textContent = "Update Watch";
  document.getElementById("admin-cancel-edit-btn").style.display = "inline-block";

  const preview = document.getElementById("admin-image-preview");
  preview.src = p.image;
  preview.style.display = "block";

  document.getElementById("admin-form-card").scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetAdminForm() {
  editingId = null;
  pendingImageDataUrl = null;
  const form = document.getElementById("admin-product-form");
  if (form) form.reset();
  document.getElementById("admin-form-title").textContent = "Add New Watch";
  document.getElementById("admin-edit-id").value = "";
  document.getElementById("admin-submit-btn").textContent = "Add Watch";
  document.getElementById("admin-cancel-edit-btn").style.display = "none";
  const preview = document.getElementById("admin-image-preview");
  preview.style.display = "none";
  preview.src = "";
}

function wireAdminForm() {
  const form = document.getElementById("admin-product-form");
  if (!form) return;

  document.getElementById("admin-image").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    resizeImageToDataUrl(file, MAX_IMAGE_DIM, (dataUrl) => {
      pendingImageDataUrl = dataUrl;
      const preview = document.getElementById("admin-image-preview");
      preview.src = dataUrl;
      preview.style.display = "block";
    });
  });

  document.getElementById("admin-cancel-edit-btn").addEventListener("click", resetAdminForm);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const id = document.getElementById("admin-edit-id").value;
    const existing = id ? getProductById(id) : null;

    const product = {
      name: document.getElementById("admin-name").value.trim(),
      category: document.getElementById("admin-category").value,
      price: Number(document.getElementById("admin-price").value),
      strap: document.getElementById("admin-strap").value.trim(),
      description: document.getElementById("admin-description").value.trim(),
      image: pendingImageDataUrl || (existing ? existing.image : "images/watch1.svg")
    };

    if (id) {
      updateProduct(id, product);
    } else {
      addProduct(product);
    }

    resetAdminForm();
    renderAdminTable();
  });
}

/* Resize an uploaded image via canvas so it doesn't blow past localStorage's
   storage quota, then hand back a compressed base64 data URL. */
function resizeImageToDataUrl(file, maxDim, callback) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      callback(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

document.addEventListener("DOMContentLoaded", initAdminPage);
