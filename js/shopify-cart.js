function injectProductStyles() {
  if (document.getElementById('tidal-product-styles')) return;
  const style = document.createElement('style');
  style.id = 'tidal-product-styles';
  style.textContent = `
    .tidal-cart-overlay {
      position: fixed; inset: 0;
      background: rgba(15,29,58,0.35);
      opacity: 0; pointer-events: none;
      transition: opacity 0.3s;
      z-index: 998;
    }
    .tidal-cart-overlay.is-open { opacity: 1; pointer-events: auto; }
    .tidal-cart-drawer {
      position: fixed; top: 0; right: 0;
      height: 100vh;
      height: 100dvh;
      width: 360px; max-width: 92vw;
      background: #f4ede2; /* Cart background color */
      transform: translateX(100%);
      transition: transform 0.35s cubic-bezier(.2,.7,.2,1);
      z-index: 999;
      display: flex; flex-direction: column;
      box-shadow: -2px 0 24px rgba(15,29,58,0.06);
    }
    .tidal-cart-drawer.is-open { transform: translateX(0); }
    .tidal-cart-footer {
      padding: 16px 22px 20px;
      background: #f4ede2; /* Adjust background of footer to match the drawer */
      border-top: 1px solid rgba(15,29,58,0.06);
      flex-shrink: 0;
    }
    /* Reset any unintended margin or padding */
    .tidal-cart-drawer, .tidal-cart-body, .tidal-cart-footer {
      margin: 0;
      padding: 0;
    }
    .tidal-cart-drawer > *::after, .tidal-cart-drawer > *::before {
      background: #f4ede2; /* Match cart drawer background exactly */
    }
  `;
  document.head.appendChild(style);
}
