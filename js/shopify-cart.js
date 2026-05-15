/**
 * shopify-cart.js — Tidal Swimwear
 * Full cart drawer with quantity controls and delete
 *
 * ⚠️  IMPORTANT BEFORE GOING LIVE:
 *  1. Replace STOREFRONT_TOKEN below with a freshly-regenerated token
 *     from Shopify Admin → Apps → Storefront API → rotate
 *  2. In Shopify Admin → Settings → Apps → your Storefront API app:
 *     add these allowed JavaScript domains:
 *        https://tidal-swimwear.co.uk
 *        https://www.tidal-swimwear.co.uk
 *        https://tidal-swimwear.netlify.app
 */

const SHOPIFY_DOMAIN   = 'xfqw4u-tr.myshopify.com';
const STOREFRONT_TOKEN = '95c5ba0cd35c8aab35d6b2a068d370d3';  // <-- REPLACE THIS WITH FRESH TOKEN
const API_URL          = `https://${SHOPIFY_DOMAIN}/api/2024-04/graphql.json`;

/* ============================================================
   GRAPHQL HELPER
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
   PRODUCT CACHE — fetches all products on this page
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
   ============================================================ */
function getVariant(card) {
  const title   = card.dataset.shopifyTitle?.toLowerCase();
  const colour  = card.querySelector('.colour-btn.active')?.dataset.colour?.toLowerCase();
  const sizeBtn = card.querySelector('.size-btn.active');
  const size    = sizeBtn?.textContent?.trim().toUpperCase();
  const product = productCache[title];
  if (!product)  return { error: 'product_not_found', title };
  if (!colour)   return { error: 'no_colour' };
  if (!size)     return { error: 'no_size' };
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
let cartId  = localStorage.getItem('tidal_cart_id')  || null;
let cartUrl = null;     // re-fetched from Shopify each time
let cartData = null;    // current cart lines

function updateCartBadge(qty) {
  document.querySelectorAll('.cart-count').forEach(el => {
    el.textContent = qty;
    el.style.display = qty > 0 ? '' : 'none';
  });
}

/* ============================================================
   CART MUTATIONS
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
  cartUrl  = cartData.checkoutUrl;
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
  cartUrl  = cartData.checkoutUrl;
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
  cartUrl  = cartData.checkoutUrl;
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
  cartUrl  = cartData.checkoutUrl;
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
      // Cart expired — clear it
      localStorage.removeItem('tidal_cart_id');
      cartId = null;
      cartData = null;
      cartUrl = null;
      updateCartBadge(0);
      return null;
    }
    cartData = data.cart;
    cartUrl  = cartData.checkoutUrl;
    updateCartBadge(cartData.totalQuantity);
    return cartData;
  } catch (err) {
    console.error('[Tidal] Failed to fetch cart:', err);
    return null;
  }
}

/* ============================================================
   CART DRAWER UI
   ============================================================ */

function injectDrawerStyles() {
  if (document.getElementById('tidal-cart-styles')) return;
  const style = document.createElement('style');
  style.id = 'tidal-cart-styles';
  style.textContent = `
    .tidal-cart-overlay {
      position: fixed; inset: 0; background: rgba(15,29,58,0.35);
      opacity: 0; pointer-events: none; transition: opacity 0.3s;
      z-index: 998;
    }
    .tidal-cart-overlay.is-open { opacity: 1; pointer-events: auto; }
    .tidal-cart-drawer {
      position: fixed; top: 0; right: 0; height: 100vh;
      width: 360px; max-width: 92vw; background: var(--cream, #f4ede2);
      transform: translateX(100%); transition: transform 0.35s cubic-bezier(.2,.7,.2,1);
      z-index: 999; display: flex; flex-direction: column;
      box-shadow: -2px 0 24px rgba(15,29,58,0.06);
    }
    .tidal-cart-drawer.is-open { transform: translateX(0); }
    .tidal-cart-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 18px 22px; border-bottom: 1px solid rgba(15,29,58,0.06);
    }
    .tidal-cart-header h2 {
      margin: 0; font-family: 'Italiana', serif; font-size: 16px;
      color: var(--navy, #0f1d3a); letter-spacing: 0.22em;
      text-transform: uppercase; font-weight: 400;
    }
    .tidal-cart-close {
      background: none; border: 0; padding: 4px; cursor: pointer;
      color: var(--navy, #0f1d3a); line-height: 0;
    }
    .tidal-cart-close svg { display: block; width: 16px; height: 16px; }
    .tidal-cart-body {
      flex: 1; overflow-y: auto; padding: 8px 22px;
    }
    .tidal-cart-empty {
      text-align: center; padding: 80px 20px;
      font-family: 'Cormorant Garamond', serif; font-style: italic;
      font-size: 15px; color: rgba(15,29,58,0.45);
    }
    .tidal-cart-line {
      display: grid; grid-template-columns: 56px 1fr auto;
      gap: 12px; padding: 14px 0;
      border-bottom: 1px solid rgba(15,29,58,0.06);
    }
    .tidal-cart-line:last-child { border-bottom: 0; }
    .tidal-cart-line-img {
      width: 56px; height: 72px; background: rgba(15,29,58,0.04);
      object-fit: cover; display: block;
    }
    .tidal-cart-line-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .tidal-cart-line-title {
      font-family: 'Italiana', serif; font-size: 13px;
      color: var(--navy, #0f1d3a); letter-spacing: 0.03em;
      line-height: 1.2;
    }
    .tidal-cart-line-meta {
      font-size: 9px; letter-spacing: 0.18em; text-transform: uppercase;
      color: rgba(15,29,58,0.5); font-family: 'Inter', sans-serif;
      line-height: 1.4;
    }
    .tidal-cart-line-qty {
      display: inline-flex; align-items: center; gap: 8px; margin-top: 6px;
    }
    .tidal-cart-qty-btn {
      width: 20px; height: 20px; border: 1px solid rgba(15,29,58,0.15);
      background: transparent; cursor: pointer; font-size: 11px;
      color: var(--navy, #0f1d3a); display: inline-flex;
      align-items: center; justify-content: center; padding: 0;
      transition: background 0.15s, border-color 0.15s; line-height: 0;
    }
    .tidal-cart-qty-btn:hover { background: rgba(15,29,58,0.04); border-color: rgba(15,29,58,0.3); }
    .tidal-cart-qty-num {
      min-width: 14px; text-align: center; font-size: 11px;
      color: var(--navy, #0f1d3a); font-family: 'Inter', sans-serif;
      letter-spacing: 0.05em;
    }
    .tidal-cart-line-right {
      display: flex; flex-direction: column; align-items: flex-end;
      justify-content: space-between; gap: 6px;
    }
    .tidal-cart-line-price {
      font-family: 'Italiana', serif; font-size: 13px;
      color: var(--navy, #0f1d3a); letter-spacing: 0.03em;
    }
    .tidal-cart-line-remove {
      background: none; border: 0; padding: 2px 4px; cursor: pointer;
      color: rgba(15,29,58,0.35); font-size: 14px; line-height: 1;
      transition: color 0.15s; font-family: 'Inter', sans-serif;
      font-weight: 300;
    }
    .tidal-cart-line-remove:hover { color: var(--coral, #c8553d); }
    .tidal-cart-footer {
      padding: 16px 22px 20px; border-top: 1px solid rgba(15,29,58,0.06);
      background: var(--cream, #f4ede2);
    }
    .tidal-cart-subtotal {
      display: flex; justify-content: space-between; align-items: baseline;
      margin-bottom: 12px;
      font-family: 'Inter', sans-serif; font-size: 10px;
      letter-spacing: 0.22em; text-transform: uppercase;
      color: rgba(15,29,58,0.65); font-weight: 400;
    }
    .tidal-cart-subtotal-amount {
      font-family: 'Italiana', serif; font-size: 17px;
      letter-spacing: 0.03em; text-transform: none;
      color: var(--navy, #0f1d3a);
    }
    .tidal-cart-checkout {
      display: block; width: 100%; padding: 13px;
      background: var(--navy, #0f1d3a); color: var(--cream, #f4ede2);
      border: 0; cursor: pointer; text-align: center; text-decoration: none;
      font-family: 'Inter', sans-serif; font-size: 10px;
      letter-spacing: 0.28em; text-transform: uppercase;
      transition: opacity 0.15s; font-weight: 400;
      box-sizing: border-box;
    }
    .tidal-cart-checkout:hover { opacity: 0.88; }
    .tidal-cart-checkout:disabled { opacity: 0.35; cursor: not-allowed; }
    .tidal-cart-continue {
      display: block; text-align: center; padding-top: 10px;
      font-family: 'Cormorant Garamond', serif; font-style: italic;
      font-size: 12px; color: rgba(15,29,58,0.5);
      background: none; border: 0; cursor: pointer; width: 100%;
    }
    .tidal-cart-continue:hover { color: var(--navy, #0f1d3a); }
    @media (max-width: 480px) {
      .tidal-cart-drawer { width: 100vw; max-width: 100vw; }
      .tidal-cart-header { padding: 16px 18px; }
      .tidal-cart-body { padding: 6px 18px; }
      .tidal-cart-footer { padding: 14px 18px 18px; }
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

  /* Bind events */
  overlay.addEventListener('click', closeDrawer);
  drawer.querySelector('.tidal-cart-close').addEventListener('click', closeDrawer);
  document.getElementById('tidal-cart-continue').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeDrawer();
  });
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
    const opts = (v.selectedOptions || [])
      .map(o => o.value).join(' · ');
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

  /* Subtotal */
  const subAmount = cartData?.cost?.subtotalAmount;
  document.getElementById('tidal-cart-subtotal').textContent =
    subAmount ? fmtMoney(subAmount.amount, subAmount.currencyCode) : '£0.00';

  /* Checkout link */
  const checkoutBtn = document.getElementById('tidal-cart-checkout');
  checkoutBtn.href = cartUrl || '#';

  footer.style.display = '';

  /* Wire line actions */
  body.querySelectorAll('.tidal-cart-line').forEach(row => {
    const lineId = row.dataset.lineId;
    const lineNode = lines.find(l => l.node.id === lineId)?.node;
    if (!lineNode) return;

    row.querySelector('[data-action="decrease"]').addEventListener('click', async () => {
      const newQty = lineNode.quantity - 1;
      if (newQty < 1) {
        await removeLine(lineId);
      } else {
        await updateLineQty(lineId, newQty);
      }
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
   BUTTON STATE HELPER
   ============================================================ */
function setBtn(btn, state) {
  const states = {
    idle:        { text: 'Add to Bag',    disabled: false },
    loading:     { text: 'Adding…',       disabled: true  },
    done:        { text: 'Added ✓',       disabled: true  },
    nosize:      { text: 'Select a size', disabled: true  },
    unavailable: { text: 'Sold Out',      disabled: true  },
    error:       { text: 'Try again',     disabled: false },
  };
  const s = states[state] || states.idle;
  btn.textContent = s.text;
  btn.disabled    = s.disabled;
}

/* ============================================================
   INIT
   ============================================================ */
document.addEventListener('DOMContentLoaded', async () => {

  /* Re-fetch cart on every page load (replaces unreliable badge cache) */
  await fetchCart();

  /* Cart icon → open the drawer */
  document.querySelectorAll('.cart-icon, [data-cart-toggle]').forEach(icon => {
    icon.addEventListener('click', e => {
      e.preventDefault();
      openDrawer();
    });
  });

  /* Fetch products on this page */
  try {
    await fetchPageProducts();
  } catch (err) {
    console.error('[Tidal] Failed to load products from Shopify:', err);
  }

  /* Add to Bag buttons */
  document.querySelectorAll('.add-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const card   = btn.closest('.product-card');
      const result = getVariant(card);

      if (result.error === 'no_size') { setBtn(btn, 'nosize'); setTimeout(() => setBtn(btn, 'idle'), 1800); return; }
      if (result.error === 'unavailable') { setBtn(btn, 'unavailable'); setTimeout(() => setBtn(btn, 'idle'), 2000); return; }
      if (result.error) { console.warn('[Tidal] Variant lookup failed:', result); setBtn(btn, 'error'); setTimeout(() => setBtn(btn, 'idle'), 2500); return; }

      setBtn(btn, 'loading');
      try {
        if (!cartId) await createCart(result.gid);
        else         await addToCart(result.gid);
        setBtn(btn, 'done');
        setTimeout(() => setBtn(btn, 'idle'), 1500);
        /* Open drawer to confirm the add */
        openDrawer();
      } catch (err) {
        console.error('[Tidal] Cart error:', err);
        setBtn(btn, 'error');
        setTimeout(() => setBtn(btn, 'idle'), 2500);
      }
    });
  });
});
