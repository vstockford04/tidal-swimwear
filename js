/**
 * shopify-cart.js — Tidal Swimwear
 * Automatically fetches products + variants from Shopify Storefront API.
 * No manual variant ID mapping needed.
 *
 * ⚠️  BEFORE YOU GO LIVE: regenerate your Storefront Access Token in
 *     Shopify Admin and replace the value below. The current token
 *     was shared in a chat and should be treated as compromised.
 *
 * HOW TO USE:
 *   1. Drop this file in your repo at /js/shopify-cart.js
 *   2. Add just before </body> in your HTML:
 *        <script src="/js/shopify-cart.js"></script>
 *   3. Make sure each .product-card has a data-shopify-title attribute
 *      matching the product title in Shopify exactly (see below).
 *   4. Push to GitHub — Netlify deploys automatically.
 *
 * REQUIRED data attribute on each .product-card in your HTML:
 *   data-shopify-title="The Soleil"   ← must match Shopify product title exactly
 *
 * Example:
 *   <div class="product-card" data-cat="one-piece" data-shopify-title="The Soleil">
 *
 * The script reads selected colour from .colour-btn.active[data-colour]
 * and selected size from .size-btn.active — these already exist in your HTML.
 */

const SHOPIFY_DOMAIN   = 'tidal-swimwear-2019.myshopify.com';
const STOREFRONT_TOKEN = 'atkn_e5e2fd5aabacbd99d869a350e49af1642487037976c2b40d8b363b2b3b48dc7a';
const API_URL          = `https://${SHOPIFY_DOMAIN}/api/2024-04/graphql.json`;

/* ------------------------------------------------------------------ */
/* GRAPHQL HELPER                                                       */
/* ------------------------------------------------------------------ */

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
  return res.json();
}

/* ------------------------------------------------------------------ */
/* PRODUCT CACHE                                                        */
/* Fetches only the products that appear on the current page.          */
/* title (lowercase) → { colour → { SIZE → { gid, available } } }     */
/* ------------------------------------------------------------------ */

const productCache = {};

async function fetchPageProducts() {
  const cards  = document.querySelectorAll('.product-card[data-shopify-title]');
  const titles = [...new Set([...cards].map(c => c.dataset.shopifyTitle).filter(Boolean))];

  if (!titles.length) {
    console.warn('[Tidal] No product cards found with data-shopify-title attribute.');
    return;
  }

  /* Batch all titles into a single GraphQL query using aliases */
  const queryParts = titles.map((title, i) => `
    p${i}: products(first: 1, query: "title:'${title.replace(/'/g, "\\'")}'") {
      edges {
        node {
          title
          variants(first: 100) {
            edges {
              node {
                id
                availableForSale
                selectedOptions { name value }
              }
            }
          }
        }
      }
    }
  `).join('\n');

  const { data, errors } = await gql(`{ ${queryParts} }`);

  if (errors) {
    console.error('[Tidal] GraphQL errors:', errors);
    return;
  }

  /* Parse each result into productCache */
  Object.values(data).forEach(result => {
    const node = result?.edges?.[0]?.node;
    if (!node) return;

    const byColour = {};

    node.variants.edges.forEach(({ node: v }) => {
      /* Shopify option names vary — handle both "Color" and "Colour" */
      const colourOpt = v.selectedOptions.find(o =>
        ['color', 'colour'].includes(o.name.toLowerCase())
      );
      const sizeOpt = v.selectedOptions.find(o =>
        o.name.toLowerCase() === 'size'
      );

      if (!colourOpt || !sizeOpt) return;

      const colour = colourOpt.value.toLowerCase();
      const size   = sizeOpt.value.toUpperCase();

      if (!byColour[colour]) byColour[colour] = {};
      byColour[colour][size] = {
        gid:       v.id,
        available: v.availableForSale,
      };
    });

    productCache[node.title.toLowerCase()] = byColour;
  });

  console.log('[Tidal] Products loaded:', Object.keys(productCache));
}

/* ------------------------------------------------------------------ */
/* VARIANT LOOKUP FOR A GIVEN CARD                                      */
/* ------------------------------------------------------------------ */

function getVariant(card) {
  const title   = card.dataset.shopifyTitle?.toLowerCase();
  const colour  = card.querySelector('.colour-btn.active')?.dataset.colour?.toLowerCase();
  const sizeBtn = card.querySelector('.size-btn.active');
  const size    = sizeBtn?.textContent?.trim().toUpperCase();

  const product = productCache[title];
  if (!product)  return { error: 'product_not_found', title };
  if (!colour)   return { error: 'no_colour' };
  if (!size)     return { error: 'no_size' };

  /* Exact match first, then partial match (e.g. "coral" matching "coral red") */
  const colourKey = Object.keys(product).find(k => k === colour)
                 ?? Object.keys(product).find(k => k.includes(colour) || colour.includes(k));

  if (!colourKey)  return { error: 'colour_not_found', colour };

  const variant = product[colourKey]?.[size];
  if (!variant)    return { error: 'size_not_found', size };
  if (!variant.available) return { error: 'unavailable' };

  return { gid: variant.gid };
}

/* ------------------------------------------------------------------ */
/* CART STATE — persisted in localStorage                              */
/* ------------------------------------------------------------------ */

let cartId  = localStorage.getItem('tidal_cart_id')  || null;
let cartUrl = localStorage.getItem('tidal_cart_url') || null;
let cartQty = parseInt(localStorage.getItem('tidal_cart_qty') || '0', 10);

function updateCartBadge(qty) {
  cartQty = qty;
  localStorage.setItem('tidal_cart_qty', qty);
  document.querySelectorAll('.cart-count').forEach(el => {
    el.textContent = qty;
  });
}

/* ------------------------------------------------------------------ */
/* CART MUTATIONS                                                       */
/* ------------------------------------------------------------------ */

async function createCart(variantGid) {
  const { data } = await gql(`
    mutation cartCreate($variantId: ID!) {
      cartCreate(input: {
        lines: [{ quantity: 1, merchandiseId: $variantId }]
      }) {
        cart { id checkoutUrl totalQuantity }
        userErrors { message }
      }
    }
  `, { variantId: variantGid });

  const errs = data.cartCreate.userErrors;
  if (errs.length) throw new Error(errs[0].message);

  const cart = data.cartCreate.cart;
  cartId  = cart.id;
  cartUrl = cart.checkoutUrl;
  localStorage.setItem('tidal_cart_id',  cartId);
  localStorage.setItem('tidal_cart_url', cartUrl);
  updateCartBadge(cart.totalQuantity);
}

async function addToCart(variantGid) {
  const { data } = await gql(`
    mutation cartLinesAdd($cartId: ID!, $variantId: ID!) {
      cartLinesAdd(
        cartId: $cartId,
        lines: [{ quantity: 1, merchandiseId: $variantId }]
      ) {
        cart { id checkoutUrl totalQuantity }
        userErrors { message }
      }
    }
  `, { cartId, variantId: variantGid });

  const errs = data.cartLinesAdd.userErrors;
  if (errs.length) throw new Error(errs[0].message);

  const cart = data.cartLinesAdd.cart;
  cartUrl = cart.checkoutUrl;
  localStorage.setItem('tidal_cart_url', cartUrl);
  updateCartBadge(cart.totalQuantity);
}

/* ------------------------------------------------------------------ */
/* BUTTON STATE HELPER                                                  */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* INIT                                                                 */
/* ------------------------------------------------------------------ */

document.addEventListener('DOMContentLoaded', async () => {

  /* Restore badge from previous session */
  updateCartBadge(cartQty);

  /* Cart icon → go to checkout */
  document.querySelectorAll('.cart-icon').forEach(icon => {
    icon.addEventListener('click', e => {
      e.preventDefault();
      if (cartUrl) {
        window.location.href = cartUrl;
      } else {
        alert('Your bag is empty.');
      }
    });
  });

  /* Fetch all products shown on this page */
  try {
    await fetchPageProducts();
  } catch (err) {
    console.error('[Tidal] Failed to load products from Shopify:', err);
  }

  /* Wire up every Add to Bag button */
  document.querySelectorAll('.add-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const card   = btn.closest('.product-card');
      const result = getVariant(card);

      if (result.error === 'no_size') {
        setBtn(btn, 'nosize');
        setTimeout(() => setBtn(btn, 'idle'), 1800);
        return;
      }
      if (result.error === 'unavailable') {
        setBtn(btn, 'unavailable');
        setTimeout(() => setBtn(btn, 'idle'), 2000);
        return;
      }
      if (result.error) {
        console.warn('[Tidal] Variant lookup failed:', result);
        setBtn(btn, 'error');
        setTimeout(() => setBtn(btn, 'idle'), 2500);
        return;
      }

      setBtn(btn, 'loading');
      try {
        if (!cartId) {
          await createCart(result.gid);
        } else {
          await addToCart(result.gid);
        }
        setBtn(btn, 'done');
        setTimeout(() => setBtn(btn, 'idle'), 2000);
      } catch (err) {
        console.error('[Tidal] Cart error:', err);
        setBtn(btn, 'error');
        setTimeout(() => setBtn(btn, 'idle'), 2500);
      }
    });
  });

});
