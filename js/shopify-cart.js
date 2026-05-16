/**
 * shopify-cart.js — Tidal Swimwear
 *
 * Updated to address the issue of the nav bar showing when the cart drawer opens.
 */

const ENABLED = true;
const SHOPIFY_DOMAIN = 'xfqw4u-tr.myshopify.com';
const STOREFRONT_TOKEN = '95c5ba0cd35c8aab35d6b2a068d370d3';
const API_URL = `https://${SHOPIFY_DOMAIN}/api/2024-04/graphql.json`;

// Utility to fix checkout URL (forces link to Shopify domain)
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

// Button state helper
function setBtn(btn, state) {
  const states = {
    idle: { text: 'Add to Bag', disabled: false },
    loading: { text: 'Adding…', disabled: true },
    done: { text: 'Added ✓', disabled: true },
    soon: { text: 'Coming soon', disabled: true },
    nosize: { text: 'Select a size', disabled: true },
    unavailable: { text: 'Sold Out', disabled: true },
    error: { text: 'Try again', disabled: false },
  };
  const s = states[state] || states.idle;
  btn.textContent = s.text;
  btn.disabled = s.disabled;
}

// Inject styles for the cart drawer, ensuring no nav bar visibility when open
function injectDrawerStyles() {
  if (document.getElementById('tidal-cart-styles')) return;
  const style = document.createElement('style');
  style.id = 'tidal-cart-styles';
  style.textContent = `
    .tidal-cart-overlay {
      position: fixed;
      inset: 0;
      background: rgba(20, 20, 20, 0.25);
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.3s;
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
      max-width: 92vw;
      background: #f4ede2;
      transform: translateX(100%);
      transition: transform 0.35s cubic-bezier(0.2, 0.7, 0.2, 1);
      z-index: 1000; /* Increased z-index above nav */
      display: flex;
      flex-direction: column;
      box-shadow: -2px 0 24px rgba(0, 0, 0, 0.04);
    }
    .tidal-cart-drawer.is-open {
      transform: translateX(0);
    }
    body.tidal-drawer-open {
      overflow: hidden !important; /* Prevent scrolling */
    }
    body.tidal-drawer-open nav {
      display: none; /* Hide the nav when drawer is open */
    }
  `;
  document.head.appendChild(style);
}

// Build the cart drawer DOM if not already present
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
      <button class="tidal-cart-close" aria-label="Close bag">×</button>
    </header>
    <div class="tidal-cart-body" id="tidal-cart-body">
      <div class="tidal-cart-empty">Your bag is empty.</div>
    </div>
    <footer class="tidal-cart-footer" id="tidal-cart-footer" style="display:none;">
      <span class="tidal-cart-subtotal-amount" id="tidal-cart-subtotal">£0.00</span>
      <a class="tidal-cart-checkout" id="tidal-cart-checkout" href="#">Checkout</a>
    </footer>
  `;
  document.body.appendChild(overlay);
  document.body.appendChild(drawer);
  overlay.addEventListener('click', closeDrawer);
  drawer.querySelector('.tidal-cart-close').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeDrawer();
  });
}

// Open drawer and ensure the body gets updated to hide the nav bar
function openDrawer() {
  buildDrawerDOM();
  document.getElementById('tidal-cart-overlay').classList.add('is-open');
  document.getElementById('tidal-cart-drawer').classList.add('is-open');
  document.body.classList.add('tidal-drawer-open');
}

// Close drawer and restore the body state
function closeDrawer() {
  const overlay = document.getElementById('tidal-cart-overlay');
  const drawer = document.getElementById('tidal-cart-drawer');
  if (overlay) overlay.classList.remove('is-open');
  if (drawer) drawer.classList.remove('is-open');
  document.body.classList.remove('tidal-drawer-open');
}

// Initialize everything
document.addEventListener('DOMContentLoaded', () => {
  buildDrawerDOM();

  document.querySelectorAll('.add-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      openDrawer();
    });
*`
