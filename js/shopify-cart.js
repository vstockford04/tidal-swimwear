/**
 * shopify-cart.js — Tidal Swimwear
 *
 * Resolves issues with Add to Bag functionality by fixing event binding and cart integration.
 */

// Shopify add-to-cart endpoint and cart fetch endpoint
const SHOPIFY_ADD_API = "/cart/add.js";
const SHOPIFY_CART_API = "/cart.js";

/**
 * Change the state of the button
 * @param {HTMLElement} btn - Button element
 * @param {string} state - Desired state (idle, loading, done, error)
 */
function setBtnState(btn, state) {
  const states = {
    idle: { text: "Add to Bag", disabled: false },
    loading: { text: "Adding…", disabled: true },
    done: { text: "Added ✓", disabled: true },
    error: { text: "Try Again", disabled: false },
  };

  const { text, disabled } = states[state] || states.idle;
  btn.textContent = text;
  btn.disabled = disabled;
}

/**
 * Add a product to the Shopify cart
 * @param {object} product - Product details (id, quantity, properties)
 */
async function addToCart(product, btn) {
  const payload = {
    items: [
      {
        id: product.id, // Product variant ID from `data-product-id`
        quantity: product.quantity || 1, // Item quantity (default: 1)
        properties: product.properties || {}, // Additional attributes like `size` or `color`
      },
    ],
  };

  try {
    const response = await fetch(SHOPIFY_ADD_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload), // Send product information to Shopify
    });

    if (!response.ok) throw new Error("Unable to add item to cart.");

    console.log("Item added to cart:", payload);
    fetchCart(); // Fetch and render the updated cart

    setBtnState(btn, "done"); // Set the button to "Added" after success
  } catch (error) {
    console.error(error.message);
    setBtnState(btn, "error"); // Set the button to "Try Again" on failure
  }
}

/**
 * Fetch the current cart and update the cart drawer
 */
async function fetchCart() {
  try {
    const response = await fetch(SHOPIFY_CART_API, { method: "GET" });

    if (!response.ok) throw new Error("Failed to fetch cart contents.");

    const cart = await response.json();
    console.log("Cart fetched:", cart);

    renderCart(cart.items);
  } catch (error) {
    console.error("Error fetching Shopify cart:", error);
  }
}

/**
 * Render the cart drawer items
 * @param {Array} items - Cart items fetched from Shopify
 */
function renderCart(items) {
  const cartBody = document.getElementById("tidal-cart-body");
  const emptyCartMessage = '<div class="tidal-cart-empty">Your bag is empty.</div>';

  cartBody.innerHTML = ""; // Clear existing cart contents

  if (items.length === 0) {
    cartBody.innerHTML = emptyCartMessage;
    return;
  }

  items.forEach(item => {
    const { title, properties, quantity, url, featured_image } = item;
    cartBody.innerHTML += `
      <div class="tidal-cart-item">
        <img src="${featured_image.url}" alt="${title}" class="tidal-cart-item-img">
        <div class="tidal-cart-item-details">
          <h4>${title}</h4>
          <p>Color: ${properties?.color || "N/A"}</p>
          <p>Size: ${properties?.size || "N/A"}</p>
          <p>Qty: ${quantity}</p>
        </div>
      </div>
    `;
  });
}

/**
 * Opens the cart drawer
 */
function openCartDrawer() {
  const overlay = document.querySelector(".tidal-cart-overlay");
  const drawer = document.querySelector(".tidal-cart-drawer");
  overlay.classList.add("is-open");
  drawer.classList.add("is-open");
}

/**
 * Close the cart drawer
 */
function closeCartDrawer() {
  const overlay = document.querySelector(".tidal-cart-overlay");
  const drawer = document.querySelector(".tidal-cart-drawer");
  overlay.classList.remove("is-open");
  drawer.classList.remove("is-open");
}

/**
 * Initializes cart drawer and button click logic
 */
function initCartListeners() {
  // Add click events for all Add to Bag buttons
  document.querySelectorAll(".add-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const productId = btn.dataset.productId; // Get the product ID
      const selectedColor = document.querySelector(".colour-btn.active")?.dataset.colour || "Default";
      const selectedSize = document.querySelector(".size-btn.active")?.textContent || "N/A";

      console.log("Product added:", { productId, selectedColor, selectedSize });

      // Update button state to `loading`
      setBtnState(btn, "loading");

      // Add product to cart
      addToCart(
        {
          id: productId,
          properties: { color: selectedColor, size: selectedSize },
        },
        btn
      );
    });
  });

  // Add open/close events for the cart drawer
  const overlay = document.querySelector(".tidal-cart-overlay");
  document.querySelector(".tidal-cart-close").addEventListener("click", closeCartDrawer);
  overlay.addEventListener("click", closeCartDrawer);
}

/**
 * Injects cart drawer and initializes the cart system
 */
document.addEventListener("DOMContentLoaded", () => {
  const overlay = document.createElement("div");
  overlay.className = "tidal-cart-overlay";
  const drawer = document.createElement("div");
  drawer.className = "tidal-cart-drawer tidal-cart-drawer-hidden";
  drawer.innerHTML = `
    <header class="tidal-cart-header">
      <button class="tidal-cart-close">&times;</button>
      <h3>Your Cart</h3>
    </header>
    <div id="tidal-cart-body" class="tidal-cart-body">
      <p class="tidal-cart-empty">Your bag is currently empty.</p>
    </div>
  `;
  document.body.appendChild(overlay);
  document.body.appendChild(drawer);

  initCartListeners(); // Initialize all click listeners
});
