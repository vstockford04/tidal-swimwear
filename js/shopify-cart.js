/**
 * shopify-cart.js — Tidal Swimwear
 *
 * Fixes issues to fully restore "Add to Bag" functionality.
 * Handles integration with Shopify cart and ensures the cart drawer works.
 */

// Shopify Storefront API Domain
const SHOPIFY_DOMAIN = 'xfqw4u-tr.myshopify.com';

// Utility to fix checkout URL (forces correct Shopify domain)
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

// Change the button state dynamically (idle, loading, success, error)
function setBtn(btn, state) {
  const states = {
    idle: { text: 'Add to Bag', disabled: false },
    loading: { text: 'Adding…', disabled: true },
    done: { text: 'Added ✓', disabled: true },
    error: { text: 'Try Again', disabled: false },
  };
  const { text, disabled } = states[state] || states.idle;
  btn.textContent = text;
  btn.disabled = disabled;
}

// Inject cart drawer styles only once
function injectDrawerStyles() {
  if (document.getElementById('tidal-cart-styles')) return;

  const style = document.createElement('style');
  style.id = 'tidal-cart-styles';
  style.textContent = `
    .tidal-cart-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.35);
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
      width: 360px;
      background: #f4ede2;
      transform: translateX(100%);
      transition: transform 0.3s ease-in-out;
      z-index: 999;
    }
    .tidal-cart-drawer.is-open {
      transform: translateX(0);
    }
    .tidal-cart-item {
      display: flex;
      gap: 10px;
      margin: 15px;
      align-items: center;
    }
    .tidal-cart-item img {
      width: 80px;
      height: auto;
    }
    .tidal-cart-item-details h3 {
      margin: 0;
      font-size: 16px;
    }
    .tidal-cart-footer {
      padding: 15px;
      background: #faf8f3;
      border-top: 1px solid #ddd;
    }
  `;
  document.head.appendChild(style);
}

// Open the cart drawer
function openDrawer() {
  buildDrawerDOM();
  fetchCartItems();
  document.getElementById('tidal-cart-overlay').classList.add('is-open');
  document.getElementById('tidal-cart-drawer').classList.add('is-open');
}

// Close the cart drawer
function closeDrawer() {
  document.getElementById('tidal-cart-overlay').classList.remove('is-open');
  document.getElementById('tidal-cart-drawer').classList.remove('is-open');
}

// Build the cart drawer once
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
      <h3>Your Bag</h3>
      <button class="tidal-cart-close">&times;</button>
    </header>
    <div class="tidal-cart-body" id="tidal-cart-body">
      <p class="tidal-cart-empty">Your cart is currently empty.</p>
    </div>
    <footer class="tidal-cart-footer">
      <a href="/cart" class="btn-checkout" id="tidal-cart-checkout">Proceed to Checkout</a>
    </footer>
  `;

  document.body.appendChild(overlay);
  document.body.appendChild(drawer);

  drawer.querySelector('.tidal-cart-close').addEventListener('click', closeDrawer);
  overlay.addEventListener('click', closeDrawer);
}

/** ----- Shopify Cart Logic ----- **/

// Add item to the cart (using the Shopify cart API)
async function addToCart(product) {
  const payload = {
    items: [
      {
        id: product.id,
        quantity: product.quantity || 1,
        properties: {
          color: product.color || 'N/A',
          size: product.size || 'N/A',
        },
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

    // Proceed if successful
    fetchCartItems();
    openDrawer();
  } catch (error) {
    console.error('Error adding item to cart:', error);
  }
}

// Fetch current cart contents and render it in the drawer
async function fetchCartItems() {
  try {
    const response = await fetch('/cart.js');
    if (!response.ok) throw new Error('Failed to fetch cart');

    const cart = await response.json();
    renderCartItems(cart.items);
  } catch (error) {
    console.error('Error fetching cart items:', error);
  }
}

// Render cart items dynamically
function renderCartItems(items) {
  const cartBody = document.getElementById('tidal-cart-body');
  cartBody.innerHTML = ''; // Clear previous contents

  if (items.length === 0) {
    cartBody.innerHTML = '<p class="tidal-cart-empty">Your cart is currently empty.</p>';
    return;
  }

  items.forEach(item => {
    const cartItemHTML = `
      <div class="tidal-cart-item">
        <img src="${item.featured_image?.url || '/placeholder.png'}" alt="${item.title}">
        <div class="tidal-cart-item-details">
          <h3>${item.title}</h3>
          <p>Color: ${item.properties?.color || 'N/A'}</p>
          <p>Size: ${item.properties?.size || 'N/A'}</p>
          <p>Quantity: ${item.quantity}</p>
        </div>
      </div>
    `;
    cartBody.innerHTML += cartItemHTML;
  });
}

/** ----- Event Listeners & Setup ----- **/

// Initialize the cart logic on page load
document.addEventListener('DOMContentLoaded', () => {
  buildDrawerDOM();

  document.querySelectorAll('.add-btn').forEach(button => {
    button.addEventListener('click', () => {
      const productId = button.dataset.productId;
      const selectedColor = document.querySelector('.colour-btn.active')?.dataset.colour || 'Default';
      const selectedSize = document.querySelector('.size-btn.active')?.textContent || 'N/A';

      // Add the selected product to the cart
      addToCart({
        id: productId,
        color: selectedColor,
        size: selectedSize,
      });
    });
  });
});
