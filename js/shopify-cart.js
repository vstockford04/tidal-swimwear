/**
 * shopify-cart.js — Tidal Swimwear
 *
 * SHOPIFY INTEGRATION LIVE
 *
 * Add to Bag buttons look up the matching Shopify product by its
 * data-shopify-title attribute, resolve the variant from the
 * selected colour + size, and add it to a Storefront API cart.
 * The cart drawer + badge update automatically.
 *
 * IF YOU REGENERATE THE STOREFRONT TOKEN:
 *   1. Paste the new token into STOREFRONT_TOKEN below
 *   2. Leave ENABLED = true
 *   3. Push to GitHub
 *
 * TO TEMPORARILY GO BACK TO "Coming soon" PLACEHOLDER MODE:
 *   Set ENABLED = false
 */

const ENABLED = true;
const SHOPIFY_DOMAIN   = 'xfqw4u-tr.myshopify.com';
const STOREFRONT_TOKEN = '95c5ba0cd35c8aab35d6b2a068d370d3';
const API_URL          = `https://${SHOPIFY_DOMAIN}/api/2024-04/graphql.json`;

/* ============================================================
   CHECKOUT URL FIX
   Shopify returns a checkoutUrl on the store's configured domain
   (tidal-swimwear.co.uk), but that domain is served by Netlify,
   which has no /cart route -> 404. Force the checkout onto the
   myshopify.com domain, which always serves checkout correctly.
   The cart token in the path is preserved, so nothing is lost.
   Once the Shopify domain settings are sorted, this can be removed.
   ============================================================ */
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

/* ============================================================
   BUTTON STATE HELPER
   ============================================================ */
function setBtn(btn, state) {
  const states = {
    idle:        { text: 'Add to Bag',    disabled: false },
    loading:     { text: 'Adding…',       disabled: true  },
    done:        { text: 'Added ✓',       disabled: true  },
    soon:        { text: 'Coming soon',   disabled: true  },
    nosize:      { text: 'Select a size', disabled: true  },
    unavailable: { text: 'Sold Out',      disabled: true  },
    error:       { text: 'Try again',     disabled: false },
  };
  const s = states[state] || states.idle;
  btn.textContent = s.text;
  btn.disabled    = s.disabled;
}

/* ============================================================
   COLOUR ALIAS MAP
   The UI shows "Toffee" everywhere for consistency, but 4 products
   in Shopify still have the variant option named "Beige".
   This map translates the UI colour → the Shopify colour name
   on a per-product basis so lookups resolve correctly.

   REMOVE each entry once the Shopify variant is renamed to "Toffee".
   The function is a safe no-op if the map is empty.
   ============================================================ */
const COLOUR_ALIASES = {
  'the lucy bottoms': { toffee: 'beige' },
  'the neri bottoms': { toffee: 'beige' },
  'the helena top':   { toffee: 'beige' },
  'the emily top':    { toffee: 'beige' },
};

function resolveColour(productTitle, uiColour) {
  const map = COLOUR_ALIASES[productTitle];
  return map?.[uiColour] ?? uiColour;
}

/* ============================================================
   PLACEHOLDER MODE — when ENABLED = false
   ============================================================ */
function initPlaceholderMode() {
  console.log('[Tidal] Cart placeholder mode active — no Shopify calls.');

  document.querySelectorAll('.cart-count').forEach(el => {
    el.style.display = 'none';
  });

  document.querySelectorAll('.cart-icon, [data-cart-toggle]').forEach(icon => {
    icon.addEventListener('click', e => {
      e.preventDefault();
      alert('Our online shop is launching shortly. For early enquiries please email hello@tidal-swimwear.co.uk');
    });
  });

  document.querySelectorAll('.add-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setBtn(btn, 'soon');
      setTimeout(() => setBtn(btn, 'idle'), 2200);
    });
  });
}

/* ============================================================
   GRAPHQL HELPER (only used when ENABLED)
   ============================================================ */
async function gql(query, variables = {}) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': STOREFRONT_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Shopify API error: ${res.status}`);
  const json = await res.json();
  if (json.errors) {
    console.error('[Tidal] GraphQL errors:', json.errors);
    throw new Error(json.errors[0].message);
  }
  return json;
}

/* ============================================================
   PRODUCT CACHE
   ============================================================ */
const productCache = {};

async function fetchPageProducts() {
  const cards  = document.querySelectorAll('.product-card[data-shopify-title]');
  const titles = [...new Set([...cards].map(c => c.dataset.shopifyTitle).filter(Boolean))];
  if (!titles.length) return;

  const queryParts = titles.map((title, i) => `
    p${i}: products(first: 1, query: "title:'${title.replace(/'/g, "\\'")}'") {
      edges { node {
        title
        variants(first: 100) {
          edges { node {
            id
            availableForSale
            price { amount currencyCode }
            selectedOptions { name value }
          } }
        }
      } }
    }
  `).join('\n');

  const { data } = await gql(`{ ${queryParts} }`);

  Object.values(data).forEach(result => {
    const node = result?.edges?.[0]?.node;
    if (!node) return;
    const byColour = {};
    node.variants.edges.forEach(({ node: v }) => {
      const colourOpt = v.selectedOptions.find(o =>
        ['color', 'colour'].includes(o.name.toLowerCase()));
      const sizeOpt = v.selectedOptions.find(o =>
        o.name.toLowerCase() === 'size');
      if (!colourOpt || !sizeOpt) return;
      const colour = colourOpt.value.toLowerCase();
      const size   = sizeOpt.value.toUpperCase();
      if (!byColour[colour]) byColour[colour] = {};
      byColour[colour][size] = {
        gid: v.id,
        available: v.availableForSale,
        price: v.price,
      };
    });
    productCache[node.title.toLowerCase()] = byColour;
  });

  console.log('[Tidal] Products loaded:', Object.keys(productCache));
}

/* ============================================================
   VARIANT LOOKUP
   Uses resolveColour() to translate UI colour → Shopify colour
   before looking up in the cache. Handles the Toffee/Beige case.
   ============================================================ */
function getVariant(card) {
  const title    = card.dataset.shopifyTitle?.toLowerCase();
  const uiColour = card.querySelector('.colour-btn.active')?.dataset.colour?.toLowerCase();
  const sizeBtn  = card.querySelector('.size-btn.active');
  const size     = sizeBtn?.textContent?.trim().toUpperCase();
  const product  = productCache[title];

  if (!product)  return { error: 'product_not_found', title };
  if (!uiColour) return { error: 'no_colour' };
  if (!size)     return { error: 'no_size' };

  /* Translate UI colour → Shopify colour (handles Toffee → Beige) */
  const colour = resolveColour(title, uiColour);

  const colourKey = Object.keys(product).find(k => k === colour)
                 ?? Object.keys(product).find(k => k.includes(colour) || colour.includes(k));
  if (!colourKey)  return { error: 'colour_not_found', colour };

  const variant = product[colourKey]?.[size];
  if (!variant)    return { error: 'size_not_found', size };
  if (!variant.available) return { error: 'unavailable' };
  return { gid: variant.gid };
}

/* ============================================================
   CART STATE
   ============================================================ */
let cartId   = localStorage.getItem('tidal_cart_id') || null;
let cartUrl  = null;
let cartData = null;

function updateCartBadge(qty) {
  document.querySelectorAll('.cart-count').forEach(el => {
    el.textContent = qty;
    el.style.display = qty > 0 ? '' : 'none';
  });
}

/* ============================================================
   CART MUTATIONS (only used when ENABLED)
   ============================================================ */
const CART_FRAGMENT = `
  id
  checkoutUrl
  totalQuantity
  cost { subtotalAmount { amount currencyCode } }
  lines(first: 50) {
    edges { node {
      id
      quantity
      merchandise {
        ... on ProductVariant {
          id
          title
          price { amount currencyCode }
          product { title featuredImage { url altText } }
          selectedOptions { name value }
        }
      }
    } }
  }
`;

async function createCart(variantGid) {
  const { data } = await gql(`
    mutation cartCreate($variantId: ID!) {
      cartCreate(input: { lines: [{ quantity: 1, merchandiseId: $variantId }] }) {
        cart { ${CART_FRAGMENT} }
        userErrors { message }
      }
    }
  `, { variantId: variantGid });
  const errs = data.cartCreate.userErrors;
  if (errs.length) throw new Error(errs[0].message);
  cartData = data.cartCreate.cart;
  cartId   = cartData.id;
  cartUrl  = fixCheckoutUrl(cartData.checkoutUrl);
  localStorage.setItem('tidal_cart_id', cartId);
  updateCartBadge(cartData.totalQuantity);
  return cartData;
}

async function addToCart(variantGid) {
  const { data } = await gql(`
    mutation cartLinesAdd($cartId: ID!, $variantId: ID!) {
      cartLinesAdd(cartId: $cartId, lines: [{ quantity: 1, merchandiseId: $variantId }]) {
        cart { ${CART_FRAGMENT} }
        userErrors { message }
      }
    }
  `, { cartId, variantId: variantGid });
  const errs = data.cartLinesAdd.userErrors;
  if (errs.length) throw new Error(errs[0].message);
  cartData = data.cartLinesAdd.cart;
  cartUrl  = fixCheckoutUrl(cartData.checkoutUrl);
  updateCartBadge(cartData.totalQuantity);
  return cartData;
}

async function updateLineQty(lineId, newQty) {
  const { data } = await gql(`
    mutation cartLinesUpdate($cartId: ID!, $lineId: ID!, $qty: Int!) {
      cartLinesUpdate(cartId: $cartId, lines: [{ id: $lineId, quantity: $qty }]) {
        cart { ${CART_FRAGMENT} }
        userErrors { message }
      }
    }
  `, { cartId, lineId, qty: newQty });
  const errs = data.cartLinesUpdate.userErrors;
  if (errs.length) throw new Error(errs[0].message);
  cartData = data.cartLinesUpdate.cart;
  cartUrl  = fixCheckoutUrl(cartData.checkoutUrl);
  updateCartBadge(cartData.totalQuantity);
  return cartData;
}

async function removeLine(lineId) {
  const { data } = await gql(`
    mutation cartLinesRemove($cartId: ID!, $lineIds: [ID!]!) {
      cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
        cart { ${CART_FRAGMENT} }
        userErrors { message }
      }
    }
  `, { cartId, lineIds: [lineId] });
  const errs = data.cartLinesRemove.userErrors;
  if (errs.length) throw new Error(errs[0].message);
  cartData = data.cartLinesRemove.cart;
  cartUrl  = fixCheckoutUrl(cartData.checkoutUrl);
  updateCartBadge(cartData.totalQuantity);
  return cartData;
}

async function fetchCart() {
  if (!cartId) return null;
  try {
    const { data } = await gql(`
      query getCart($cartId: ID!) {
        cart(id: $cartId) { ${CART_FRAGMENT} }
      }
    `, { cartId });
    if (!data.cart) {
      localStorage.removeItem('tidal_cart_id');
      cartId = null; cartData = null; cartUrl = null;
      updateCartBadge(0);
      return null;
    }
    cartData = data.cart;
    cartUrl  = fixCheckoutUrl(cartData.checkoutUrl);
    updateCartBadge(cartData.totalQuantity);
    return cartData;
  } catch (err) {
    console.error('[Tidal] Failed to fetch cart:', err);
    return null;
  }
}

/* ============================================================
   PRODUCT CARD BUTTON STYLES
   Injected once on init. Ensures size buttons, colour switcher
   and Add to Bag are correctly centred and aligned on all screens.
   ============================================================ */
function injectProductStyles() {
  if (document.getElementById('tidal-product-styles')) return;
  const style = document.createElement('style');
  style.id = 'tidal-product-styles';
  style.textContent = `
    /* ── Colour switcher — sits flush below image, unchanged ── */
    .colour-switcher {
      display: flex;
      border-top: 1px solid var(--hairline, rgba(15,29,58,0.10));
      background: var(--cream, #f4ede2);
      width: 100%;
    }

    .colour-btn {
      flex: 1;
      padding: 14px 6px;
      border: none;
      background: none;
      cursor: pointer;
      font-size: 9px;
      letter-spacing: 0.25em;
      text-transform: uppercase;
      font-family: 'Inter', sans-serif;
      color: var(--muted, #6b6b6b);
      transition: all 0.2s;
      border-bottom: 2px solid transparent;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 6px;
      font-weight: 400;
    }

    .colour-btn:not(:last-child) {
      border-right: 1px solid var(--hairline, rgba(15,29,58,0.10));
    }

    .colour-btn .dot {
      width: 13px;
      height: 13px;
      border-radius: 50%;
      border: 1.5px solid rgba(15,29,58,0.18);
      transition: transform 0.2s, border-color 0.2s;
      flex-shrink: 0;
    }

    .colour-btn.active .dot {
      transform: scale(1.25);
      border-color: var(--navy, #0f1d3a);
    }

    .colour-btn.active {
      color: var(--navy, #0f1d3a);
      border-bottom-color: var(--navy, #0f1d3a);
    }

    .colour-btn:hover { color: var(--navy, #0f1d3a); }

    /* ── Product info wrapper ── */
    .product-info {
      padding: 20px 24px 0;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0;
    }

    .product-category {
      font-size: 9px;
      letter-spacing: 0.4em;
      text-transform: uppercase;
      color: var(--muted, #6b6b6b);
      margin-bottom: 6px;
      font-weight: 400;
    }

    .product-desc {
      font-family: 'Cormorant Garamond', serif;
      font-style: italic;
      font-size: 14px;
      color: var(--muted, #6b6b6b);
      line-height: 1.6;
      margin-bottom: 16px;
      max-width: 300px;
    }

    /* ── Price row ── */
    .product-footer {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0;
      margin-bottom: 14px;
      width: 100%;
    }

    .product-price {
      font-family: 'Italiana', serif;
      font-size: 1.4rem;
      color: var(--navy, #0f1d3a);
      letter-spacing: 0.04em;
    }

    /* ── Size row — centred, just below price ── */
    .size-row {
      display: flex;
      gap: 5px;
      justify-content: center;
      align-items: center;
      flex-wrap: wrap;
      margin-bottom: 18px;
      width: 100%;
    }

    /* Size buttons mirror the colour active style:
       muted by default, navy text + navy bottom border when active */
    .size-btn {
      background: none;
      border: none;
      border-bottom: 2px solid transparent;
      padding: 6px 10px;
      font-size: 9px;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      font-family: 'Inter', sans-serif;
      color: var(--muted, #6b6b6b);
      cursor: pointer;
      transition: color 0.2s, border-color 0.2s;
      font-weight: 400;
      white-space: nowrap;
      line-height: 1.4;
    }

    .size-btn:hover {
      color: var(--navy, #0f1d3a);
    }

    .size-btn.active {
      color: var(--navy, #0f1d3a);
      border-bottom-color: var(--navy, #0f1d3a);
    }

    /* ── Add to Bag — full width, below size row ── */
    .add-btn {
      width: 100%;
      background: var(--navy, #0f1d3a);
      color: var(--cream, #f4ede2);
      border: none;
      padding: 15px;
      font-size: 10px;
      letter-spacing: 0.35em;
      text-transform: uppercase;
      font-family: 'Inter', sans-serif;
      cursor: pointer;
      transition: background 0.25s;
      font-weight: 400;
      display: block;
      text-align: center;
      box-sizing: border-box;
      margin-top: 0;
    }

    .add-btn:hover:not(:disabled) {
      background: var(--coral, #c8553d);
    }

    .add-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* ── Mobile ── */
    @media (max-width: 600px) {
      .product-info {
        padding: 16px 16px 0;
      }
      .size-btn {
        padding: 5px 8px;
        font-size: 8px;
      }
      .colour-btn {
        padding: 11px 4px;
        font-size: 8px;
        letter-spacing: 0.18em;
      }
    }
  `;
  document.head.appendChild(style);
}

/* ============================================================
   CART DRAWER UI (only used when ENABLED)
   ============================================================ */
function injectDrawerStyles() {
  if (document.getElementById('tidal-cart-styles')) return;
  const style = document.createElement('style');
  style.id = 'tidal-cart-styles';
  style.textContent = `
    .tidal-cart-overlay {
      position: fixed; inset: 0; background: rgba(20,20,20,0.25);
      opacity: 0; pointer-events: none; transition: opacity 0.3s;
      z-index: 998;
    }
    .tidal-cart-overlay.is-open { opacity: 1; pointer-events: auto; }
    .tidal-cart-drawer {
      position: fixed; top: 0; right: 0;
      height: 100vh;
      height: 100dvh;
      width: 360px; max-width: 92vw;
      background: var(--cream, #f4ede2);
      transform: translateX(100%);
      transition: transform 0.35s cubic-bezier(.2,.7,.2,1);
      z-index: 999; display: flex; flex-direction: column;
      box-shadow: -2px 0 24px rgba(0,0,0,0.04);
    }
    .tidal-cart-drawer.is-open { transform: translateX(0); }
    .tidal-cart-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 22px 24px 18px;
      background: var(--cream, #f4ede2);
    }
    .tidal-cart-header h2 {
      margin: 0;
      font-family: 'Italiana', serif;
      font-size: 14px;
      color: #2a2a2a;
      letter-spacing: 0.26em;
      text-transform: uppercase;
      font-weight: 400;
    }
    .tidal-cart-close {
      background: none; border: 0; padding: 4px; cursor: pointer;
      color: #2a2a2a;
      line-height: 0;
      opacity: 0.65;
      transition: opacity 0.15s;
    }
    .tidal-cart-close:hover { opacity: 1; }
    .tidal-cart-close svg { display: block; width: 14px; height: 14px; }
    .tidal-cart-body {
      flex: 1; overflow-y: auto;
      padding: 0 24px;
      background: var(--cream, #f4ede2);
    }
    .tidal-cart-empty {
      text-align: center; padding: 80px 20px;
      font-family: 'Cormorant Garamond', serif; font-style: italic;
      font-size: 15px; color: rgba(42,42,42,0.45);
    }
    .tidal-cart-line {
      display: grid; grid-template-columns: 56px 1fr auto;
      gap: 14px; padding: 18px 0;
      border-bottom: 1px solid rgba(42,42,42,0.08);
    }
    .tidal-cart-line:first-child { padding-top: 6px; }
    .tidal-cart-line:last-child { border-bottom: 0; }
    .tidal-cart-line-img {
      width: 56px; height: 72px;
      background: rgba(42,42,42,0.04);
      object-fit: cover; display: block;
    }
    .tidal-cart-line-info {
      display: flex; flex-direction: column; gap: 3px; min-width: 0;
    }
    .tidal-cart-line-title {
      font-family: 'Italiana', serif; font-size: 13px;
      color: #2a2a2a;
      letter-spacing: 0.04em; line-height: 1.25;
    }
    .tidal-cart-line-meta {
      font-size: 9px; letter-spacing: 0.2em; text-transform: uppercase;
      color: rgba(42,42,42,0.55);
      font-family: 'Inter', sans-serif; line-height: 1.4;
    }
    .tidal-cart-line-qty {
      display: inline-flex; align-items: center; gap: 10px; margin-top: 8px;
    }
    .tidal-cart-qty-btn {
      width: 20px; height: 20px;
      border: 1px solid rgba(42,42,42,0.18);
      background: transparent; cursor: pointer; font-size: 11px;
      color: #2a2a2a;
      display: inline-flex;
      align-items: center; justify-content: center; padding: 0;
      transition: background 0.15s, border-color 0.15s; line-height: 0;
    }
    .tidal-cart-qty-btn:hover {
      background: rgba(42,42,42,0.04);
      border-color: rgba(42,42,42,0.35);
    }
    .tidal-cart-qty-num {
      min-width: 14px; text-align: center; font-size: 11px;
      color: #2a2a2a;
      font-family: 'Inter', sans-serif; letter-spacing: 0.05em;
    }
    .tidal-cart-line-right {
      display: flex; flex-direction: column; align-items: flex-end;
      justify-content: space-between; gap: 6px;
    }
    .tidal-cart-line-price {
      font-family: 'Italiana', serif; font-size: 13px;
      color: #2a2a2a;
      letter-spacing: 0.04em;
    }
    .tidal-cart-line-remove {
      background: none; border: 0; padding: 2px 6px; cursor: pointer;
      color: rgba(42,42,42,0.35);
      font-size: 16px; line-height: 1;
      transition: color 0.15s;
      font-family: 'Inter', sans-serif; font-weight: 300;
    }
    .tidal-cart-line-remove:hover { color: var(--coral, #c8553d); }
    .tidal-cart-footer {
      padding: 18px 24px 22px;
      background: var(--cream, #f4ede2);
      border-top: 1px solid rgba(42,42,42,0.08);
      flex-shrink: 0;
    }
    .tidal-cart-subtotal {
      display: flex; justify-content: space-between; align-items: baseline;
      margin-bottom: 16px;
      font-family: 'Inter', sans-serif; font-size: 10px;
      letter-spacing: 0.24em; text-transform: uppercase;
      color: rgba(42,42,42,0.7);
      font-weight: 400;
    }
    .tidal-cart-subtotal-amount {
      font-family: 'Italiana', serif; font-size: 18px;
      letter-spacing: 0.04em; text-transform: none;
      color: #2a2a2a;
    }
    .tidal-cart-checkout {
      display: block;
      width: 100%;
      max-width: 100%;
      padding: 14px 16px;
      background: var(--navy, #0f1d3a);
      color: var(--cream, #f4ede2);
      border: 0;
      cursor: pointer;
      text-align: center;
      text-decoration: none;
      font-family: 'Inter', sans-serif;
      font-size: 11px;
      letter-spacing: 0.28em;
      text-transform: uppercase;
      font-weight: 400;
      box-sizing: border-box;
      transition: background 0.18s;
      line-height: 1.2;
    }
    .tidal-cart-checkout:hover {
      background: #1c2c4d;
    }
    .tidal-cart-checkout:disabled {
      opacity: 0.35;
      cursor: not-allowed;
    }
    .tidal-cart-continue {
      display: block; text-align: center; padding-top: 14px;
      font-family: 'Cormorant Garamond', serif; font-style: italic;
      font-size: 13px; color: rgba(42,42,42,0.5);
      background: none; border: 0; cursor: pointer; width: 100%;
    }
    .tidal-cart-continue:hover { color: #2a2a2a; }
    @media (max-width: 480px) {
      .tidal-cart-drawer {
        width: 100vw;
        max-width: 100vw;
      }
      .tidal-cart-header {
        padding: 16px 18px 12px;
      }
      .tidal-cart-body {
        padding: 0 18px;
      }
      .tidal-cart-footer {
        padding: 14px 18px calc(20px + env(safe-area-inset-bottom, 0px));
      }
      .tidal-cart-checkout {
        padding: 14px 14px;
        font-size: 10px;
        letter-spacing: 0.26em;
      }
    }
  `;
  document.head.appendChild(style);
}

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
      <button class="tidal-cart-close" aria-label="Close bag">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <path d="M6 6l12 12"/><path d="M6 18L18 6"/>
        </svg>
      </button>
    </header>
    <div class="tidal-cart-body" id="tidal-cart-body">
      <div class="tidal-cart-empty">Your bag is empty.</div>
    </div>
    <footer class="tidal-cart-footer" id="tidal-cart-footer" style="display:none;">
      <div class="tidal-cart-subtotal">
        <span>Subtotal</span>
        <span class="tidal-cart-subtotal-amount" id="tidal-cart-subtotal">£0.00</span>
      </div>
      <a class="tidal-cart-checkout" id="tidal-cart-checkout" href="#">Checkout</a>
      <button class="tidal-cart-continue" type="button" id="tidal-cart-continue">Continue shopping</button>
    </footer>
  `;
  document.body.appendChild(overlay);
  document.body.appendChild(drawer);
  overlay.addEventListener('click', closeDrawer);
  drawer.querySelector('.tidal-cart-close').addEventListener('click', closeDrawer);
  document.getElementById('tidal-cart-continue').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });
}

function openDrawer() {
  buildDrawerDOM();
  renderDrawer();
  document.getElementById('tidal-cart-overlay').classList.add('is-open');
  document.getElementById('tidal-cart-drawer').classList.add('is-open');
  document.body.style.overflow = 'hidden';
}

function closeDrawer() {
  const overlay = document.getElementById('tidal-cart-overlay');
  const drawer  = document.getElementById('tidal-cart-drawer');
  if (overlay) overlay.classList.remove('is-open');
  if (drawer)  drawer.classList.remove('is-open');
  document.body.style.overflow = '';
}

function fmtMoney(amount, currency) {
  const sym = { GBP: '£', USD: '$', EUR: '€' }[currency] || '';
  return `${sym}${parseFloat(amount).toFixed(2)}`;
}

function renderDrawer() {
  const body   = document.getElementById('tidal-cart-body');
  const footer = document.getElementById('tidal-cart-footer');
  if (!body) return;
  const lines = cartData?.lines?.edges || [];
  if (!lines.length) {
    body.innerHTML = '<div class="tidal-cart-empty">Your bag is empty.</div>';
    footer.style.display = 'none';
    return;
  }
  body.innerHTML = lines.map(({ node: line }) => {
    const v = line.merchandise;
    const opts = (v.selectedOptions || []).map(o => o.value).join(' · ');
    const img = v.product?.featuredImage?.url || '';
    const imgTag = img
      ? `<img class="tidal-cart-line-img" src="${img}" alt="${v.product.title}">`
      : `<div class="tidal-cart-line-img"></div>`;
    return `
      <div class="tidal-cart-line" data-line-id="${line.id}">
        ${imgTag}
        <div class="tidal-cart-line-info">
          <div class="tidal-cart-line-title">${v.product.title}</div>
          <div class="tidal-cart-line-meta">${opts}</div>
          <div class="tidal-cart-line-qty">
            <button class="tidal-cart-qty-btn" data-action="decrease">−</button>
            <span class="tidal-cart-qty-num">${line.quantity}</span>
            <button class="tidal-cart-qty-btn" data-action="increase">+</button>
          </div>
        </div>
        <div class="tidal-cart-line-right">
          <button class="tidal-cart-line-remove" data-action="remove" aria-label="Remove">×</button>
          <div class="tidal-cart-line-price">${fmtMoney(v.price.amount * line.quantity, v.price.currencyCode)}</div>
        </div>
      </div>
    `;
  }).join('');
  const subAmount = cartData?.cost?.subtotalAmount;
  document.getElementById('tidal-cart-subtotal').textContent =
    subAmount ? fmtMoney(subAmount.amount, subAmount.currencyCode) : '£0.00';
  const checkoutBtn = document.getElementById('tidal-cart-checkout');
  checkoutBtn.href = fixCheckoutUrl(cartUrl) || '#';
  checkoutBtn.onclick = function (e) {
    const target = fixCheckoutUrl(cartUrl);
    if (!target) { e.preventDefault(); return; }
    window.location.href = target;
    e.preventDefault();
  };
  footer.style.display = '';
  body.querySelectorAll('.tidal-cart-line').forEach(row => {
    const lineId   = row.dataset.lineId;
    const lineNode = lines.find(l => l.node.id === lineId)?.node;
    if (!lineNode) return;
    row.querySelector('[data-action="decrease"]').addEventListener('click', async () => {
      const newQty = lineNode.quantity - 1;
      if (newQty < 1) await removeLine(lineId);
      else await updateLineQty(lineId, newQty);
      renderDrawer();
    });
    row.querySelector('[data-action="increase"]').addEventListener('click', async () => {
      await updateLineQty(lineId, lineNode.quantity + 1);
      renderDrawer();
    });
    row.querySelector('[data-action="remove"]').addEventListener('click', async () => {
      await removeLine(lineId);
      renderDrawer();
    });
  });
}

/* ============================================================
   INIT
   ============================================================ */
document.addEventListener('DOMContentLoaded', async () => {

  /* Always inject product button styles */
  injectProductStyles();

  /* If disabled, run placeholder mode and stop */
  if (!ENABLED || !STOREFRONT_TOKEN) {
    initPlaceholderMode();
    return;
  }

  /* Full Shopify integration */
  await fetchCart();

  document.querySelectorAll('.cart-icon, [data-cart-toggle]').forEach(icon => {
    icon.addEventListener('click', e => {
      e.preventDefault();
      openDrawer();
    });
  });

  try {
    await fetchPageProducts();
  } catch (err) {
    console.error('[Tidal] Failed to load products from Shopify:', err);
  }

  document.querySelectorAll('.add-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const card   = btn.closest('.product-card');
      const result = getVariant(card);
      if (result.error === 'no_size')      { setBtn(btn, 'nosize');      setTimeout(() => setBtn(btn, 'idle'), 1800); return; }
      if (result.error === 'unavailable')  { setBtn(btn, 'unavailable'); setTimeout(() => setBtn(btn, 'idle'), 2000); return; }
      if (result.error)                    { console.warn('[Tidal] Variant lookup failed:', result); setBtn(btn, 'error'); setTimeout(() => setBtn(btn, 'idle'), 2500); return; }
      setBtn(btn, 'loading');
      try {
        if (!cartId) await createCart(result.gid);
        else         await addToCart(result.gid);
        setBtn(btn, 'done');
        setTimeout(() => setBtn(btn, 'idle'), 1500);
        openDrawer();
      } catch (err) {
        console.error('[Tidal] Cart error:', err);
        setBtn(btn, 'error');
        setTimeout(() => setBtn(btn, 'idle'), 2500);
      }
    });
  });
});
