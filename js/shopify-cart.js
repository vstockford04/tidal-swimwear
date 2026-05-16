/**
 * shopify-cart.js — Tidal Swimwear
 *
 * Ensures Add to Bag functionality works properly.
 */

// Storefront info
const SHOPIFY_API = '/cart/add.js'; // Endpoint for adding products to the cart
const SHOPIFY_FETCH_CART = '/cart.js'; // Endpoint for fetching cart contents

/** Button State Helper */
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

/** Add Product to Shopify Cart */
async function addToCart(product) {
  const payload = {
    items: [
      {
        id: product.id, // Shopify product variant ID
        quantity: product.quantity || 1, // Number of items
        properties: product.properties || {}, // Custom properties like color/size
      },
    ],
  };

  try {
    const response = await fetch(SHOPIFY_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) throw new Error(`Error: Failed to add product to cart`);

    const cartData = await response.json();
    console.log('Product added to cart successfully:', cartData);

    // Fetch and update cart drawer contents
    fetchCart();
  } catch (error) {
    console.error(error.message);
  }
}

/** Fetch and Update Cart Drawer */
async function fetchCart() {
  try {
    const response = await fetch(SHOPIFY_FETCH_CART);

    if (!response.ok) throw new Error('Failed to fetch cart contents');

    const cart = await response.json();
    console.log('Cart contents:', cart);

    renderCartDrawer(cart.items);
  } catch (error) {
    console.error('Error fetching cart:', error.message);
  }
}

/** Render Cart Drawer */
function renderCartDrawer(items) {
  const cartBody = document.getElementById('tidal-cart-body');
  cartBody.innerHTML = ''; // Clear old items

  if (items.length === 0) {
    cartBody.innerHTML = '<div class="tidal-cart-empty">Your bag is empty.</div>';
    return;
  }

  items.forEach(item => {
    const { title, properties, quantity, featured_image } = item || {};
    const color = properties?.color || 'N/A';
    const size = properties?.size || 'N/A';

    const cartItemHTML = `
      <div class="tidal-cart-item">
        <img src="${featured_image.url}" alt="${title}" class="tidal-cart-item-img">
        <div>
          <h4>${title}</h4>
          <p>Color: ${color}</p>
          <p>Size: ${size}</p>
          <p>Qty: ${quantity}</p>
        </div>
      </div>
    `;
    cartBody.innerHTML += cartItemHTML;
  });
}

/** Initialize Add Button Events */
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.add-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const productId = btn.dataset.productId; // Get associated product ID
      const selectedColor = document.querySelector('.color-btn.active')?.dataset.color || 'Default';
      const selectedSize = document.querySelector('.size-btn.active')?.textContent || 'N/A';

      if (!productId) {
        console.error('Error: Product ID missing for Add to Bag button');
        return;
      }

      console.log('Add to Bag clicked with:', { productId, selectedColor, selectedSize });

      // Change button to loading state
      setBtn(btn, 'loading');

      // Add item to cart
      addToCart({
        id: productId,
        properties: { color: selectedColor, size: selectedSize },
      })
        .then(() => setBtn(btn, 'done'))
        .catch(() => setBtn(btn, 'error'));
    });
  });
});
