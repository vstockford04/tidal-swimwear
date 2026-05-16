/**
 * shopify-cart.js — Tidal Swimwear
 *
 * Fully updated to fix issues with "Add to Bag"
 * and ensure correct product (color, size, image) appears in the cart.
 */

const SHOPIFY_DOMAIN = 'xfqw4u-tr.myshopify.com';
const API_URL = `https://${SHOPIFY_DOMAIN}/api/2024-04/graphql.json`;

/** ----- Helper Functions ----- **/

// Utility to fix checkout URL (enforces Shopify domain)
function fixCheckoutUrl(url) {
  if (!url) return url;
  try {
    const u = new URL(url);
    u.hostname = SHOPIFY_DOMAIN;
    return u.toString();
  } catch (e) {
    return url;
  }
}

// Change button state (idle, loading, done, error)
function setBtn(btn, state) {
  const states = {
    idle: { text: 'Add to Bag', disabled: false },
    loading: { text: 'Adding…', disabled: true },
    done: { text: 'Added ✓', disabled: true },
    error: { text: 'Try again', disabled: false },
  };
  const { text, disabled } = states[state] || states.idle;
  btn.textContent = text;
  btn.disabled = disabled;
}

// Inject styles for the cart drawer
function injectDrawerStyles() {
  if (document.getElementById('tidal-cart-styles')) return;
  const style = document.createElement('style');
  style.id = 'tidal-cart-styles';
  style.textContent = `
    .tidal-cart-overlay {
      position: fixed;
      inset: 0;
      background: rgba(20, 20, 20, 0.3);
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.3s ease-in-out;
      z-index: 998;
    }
    .tidal-cart-overlay.is-open {
      opacity: 1;
      pointer-events: auto;
    }
    .tidal-cart-drawer {
      position: fixed;
      top: 0;
      right: 0;
      height: 100vh;
      width: 360px;
      background: #f4ede2;
      transform: translateX(100%);
      transition: transform 0.35s ease-in-out;
      z-index: 1000;
      display: flex;
      flex-direction: column;
    }
    .tidal-cart-drawer.is-open {
      transform: translateX(0);
    }
    .tidal-cart-item {
      display: flex;
      gap: 10px;
      margin: 15px;
    }
    .tidal-cart-item img {
      width: 80px;
      height: auto;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
    }
    .tidal-cart-item-details h3 {
      font-size: 14px;
      margin: 0;
    }
    .tidal-cart-item-details p {
      margin: 0;
      font-size: 12px;
      color: #555;
    }
  `;
  document.head.appendChild(style);
}

// Open the cart drawer
function openDrawer() {
  buildDrawerDOM();
  fetchCartItems(); // Ensure cart items are up-to-date
  document.getElementById('tidal-cart-overlay').classList.add('is-open');
  document.getElementById('tidal-cart-drawer').classList.add('is-open');
}

// Close the cart drawer
function closeDrawer() {
  const overlay = document.getElementById('tidal-cart-overlay');
  const drawer = document.getElementById('tidal-cart-drawer');
  overlay?.classList.remove('is-open');
  drawer?.classList.remove('is-open');
}

/** ----- Cart Drawer Setup ----- **/

// Build the cart drawer structure (if not already created)
function buildDrawerDOM() {
  if (document.getElementById('tidal-cart-drawer')) return;

  injectDrawerStyles();

  const overlay = document.createElement('div');
  overlay.className = 'tidal-cart-overlay';
  overlay.id = 'tidal-cart-overlay';

  const drawer = document.createElement('aside');
  drawer.className = 'tidal-cart-drawer';
  drawer.id = 'tidal-cart-drawer';
  drawer.innerHTML = `
    <header class="tidal-cart-header">
      <h2>Your Bag</h2>
      <button class="tidal-cart-close" aria-label="Close cart">×</button>
    </header>
    <div class="tidal-cart-body" id="tidal-cart-body">
      <div class="tidal-cart-empty">Your bag is empty.</div>
    </div>
    <footer class="tidal-cart-footer" id="tidal-cart-footer" style="display:none;">
      <span id="tidal-cart-subtotal">Subtotal: £0.00</span>
      <a id="tidal-cart-checkout" href="/checkout">Checkout</a>
    </footer>
  `;

  document.body.appendChild(overlay);
  document.body.appendChild(drawer);

  overlay.addEventListener('click', closeDrawer);
  drawer.querySelector('.tidal-cart-close').addEventListener('click', closeDrawer);
}

/** ----- Shopify Cart Management ----- **/

// Add product to cart
async function addToCart({ id, color, size, quantity = 1 }) {
  const payload = {
    items: [
      {
        id,
        quantity,
        properties: { color, size }, // Attach color and size to cart
      },
    ],
  };

  try {
    const response = await fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) throw new Error('Failed to add item to cart');

    const data = await response.json();
    console.log('Added to cart:', data);

    fetchCartItems(); // Refresh cart drawer items
    openDrawer();
  } catch (error) {
    console.error('Add to cart failed:', error);
  }
}

// Fetch current Shopify cart items
async function fetchCartItems() {
  try {
    const response = await fetch('/cart.js');
    if (!response.ok) throw new Error('Failed to fetch cart contents');

    const cart = await response.json();
    renderCartItems(cart.items);
  } catch (error) {
    console.error('Error fetching cart:', error);
  }
}

// Render cart items in the drawer
function renderCartItems(items) {
  const cartBody = document.getElementById('tidal-cart-body');
  const cartFooter = document.getElementById('tidal-cart-footer');
  cartBody.innerHTML = ''; // Clear previous content

  if (items.length === 0) {
    cartBody.innerHTML = '<div class="tidal-cart-empty">Your bag is empty.</div>';
    cartFooter.style.display = 'none';
    return;
  }

  items.forEach(item => {
    const { product_title, quantity, properties, featured_image } = item;
    const color = properties?.color || 'N/A';
    const size = properties?.size || 'N/A';

    const cartItemHTML = `
      <div class="tidal-cart-item">
        <img src="${featured_image}" alt="${product_title}" />
        <div class="tidal-cart-item-details">
          <h3>${product_title}</h3>
          <p>Color: ${color}</p>
          <p>Size: ${size}</p>
          <p>Quantity: ${quantity}</p>
        </div>
      </div>
    `;

    cartBody.innerHTML += cartItemHTML;
  });

  cartFooter.style.display = 'block';
}

/** ----- Page Initialization ----- **/

// Initialize the page and bind events
document.addEventListener('DOMContentLoaded', () => {
  buildDrawerDOM();

  // Bind "Add to Bag" buttons
  document.querySelectorAll('.add-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const productId = btn.dataset.productId; // Assume data-product-id exists
      const selectedColor = document.querySelector('.colour-btn.active')?.dataset.colour || 'Default';
      const selectedSize = document.querySelector('.size-btn.active')?.textContent || 'M';

      // Add the selected product to the cart
      addToCart({ id: productId, color: selectedColor, size: selectedSize });
    });
  });
});
