/**
 * Quick View Popup
 * -----------------
 * Handles:
 * 1) Opening popup from the plus icon on a grid item
 * 2) Locking body scroll while popup is open (unlocks on close button or outside click)
 * 3) Color (buttons) + Size (dropdown) selection -> variant matching, price/availability update
 * 4) Auto-adding a secondary product when Color=Black AND Size=M is selected
 *
 * Requires these Liquid additions (see chat for the exact snippets):
 *  - <script type="application/json" id="variants-json-{{ product.id }}">{{ product.variants | json }}</script>
 *    placed inside the popup partial
 *  - data-auto-variant-id="{{ auto_added_product }}" on .popup_product_content
 *  - data-money-format="{{ shop.money_format | json }}" on .custom-product-grid
 */

(function () {
  'use strict';

  var AUTO_ADD_COLOR = 'black';
  var AUTO_ADD_SIZE = 'm';

  var savedScrollY = 0;

  function lockBodyScroll() {
    savedScrollY = window.pageYOffset || document.documentElement.scrollTop;
    document.body.style.position = 'fixed';
    document.body.style.top = '-' + savedScrollY + 'px';
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
    document.body.classList.add('popup-open');
  }

  function unlockBodyScroll() {
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.width = '';
    document.body.classList.remove('popup-open');
    window.scrollTo(0, savedScrollY);
  }

  function openPopup(popupEl) {
    popupEl.classList.add('is-active');
    lockBodyScroll();
  }

  function closePopup(popupEl) {
    popupEl.classList.remove('is-active');
    unlockBodyScroll();
  }

  function formatMoney(rawPrice, moneyFormat) {
    var value = parseFloat(rawPrice);
    if (isNaN(value)) return rawPrice;
    var formatted = value.toFixed(2).replace('.', ',');
    if (!moneyFormat) return formatted;
    return moneyFormat
      .replace('{{amount}}', formatted)
      .replace('{{ amount }}', formatted);
  }

  function ProductPopup(popupEl) {
    this.popup = popupEl;
    this.productId = popupEl.dataset.productId;
    this.card = popupEl.querySelector('.popup_product_content');
    this.autoVariantId = this.card ? this.card.dataset.autoVariantId : null;

    var variantsScript = document.getElementById('variants-json-' + this.productId);
    this.variants = [];
    if (variantsScript) {
      try {
        this.variants = JSON.parse(variantsScript.textContent);
      } catch (e) {
        this.variants = [];
      }
    }

    var gridEl = document.querySelector('.custom-product-grid');
    this.moneyFormat = gridEl ? gridEl.dataset.moneyFormat : null;
    if (this.moneyFormat) {
      try {
        this.moneyFormat = JSON.parse(this.moneyFormat);
      } catch (e) {
        // leave as-is
      }
    }

    this.selections = {};
    this.currentVariant = null;
    this.shouldAutoAdd = false;

    this.addToCartBtn = popupEl.querySelector('.popup_add_to_cart');
    // this.priceEl = popupEl.querySelector('.popup_product_price');

    this.bindEvents();
    this.preselectDefaults();
  }

  ProductPopup.prototype.preselectDefaults = function () {
    var self = this;
    var selectedButtons = this.popup.querySelectorAll('.popup_option_button.is-selected');
    selectedButtons.forEach(function (btn) {
      self.selections[btn.dataset.optionIndex] = btn.dataset.optionValue;
    });
    this.onSelectionChange();
  };

  ProductPopup.prototype.bindEvents = function () {
    var self = this;

    // Color / generic option buttons
    this.popup.querySelectorAll('.popup_option_button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var index = btn.dataset.optionIndex;
        var value = btn.dataset.optionValue;

        self.popup
          .querySelectorAll('.popup_option_button[data-option-index="' + index + '"]')
          .forEach(function (b) {
            b.classList.remove('is-selected');
          });
        btn.classList.add('is-selected');

        self.selections[index] = value;
        self.onSelectionChange();
      });
    });

    // Size dropdown (and any other dropdown option)
    this.popup.querySelectorAll('.popup_option_select').forEach(function (select) {
      select.addEventListener('change', function () {
        var index = select.dataset.optionIndex;
        self.selections[index] = select.value;
        self.onSelectionChange();
      });
    });

    // Close button
    var closeBtn = this.popup.querySelector('.product_popup_close');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        closePopup(self.popup);
      });
    }

    // Click outside the card (on the backdrop itself) closes the popup
    this.popup.addEventListener('click', function (e) {
      if (e.target === self.popup) {
        closePopup(self.popup);
      }
    });

    // Add to cart
    if (this.addToCartBtn) {
      this.addToCartBtn.addEventListener('click', function () {
        self.handleAddToCart();
      });
    }
  };

  ProductPopup.prototype.getSelectedValuesInOrder = function () {
    var selections = this.selections;
    return Object.keys(selections)
      .sort(function (a, b) {
        return a - b;
      })
      .map(function (k) {
        return selections[k];
      });
  };

  ProductPopup.prototype.findMatchingVariant = function () {
    var values = this.getSelectedValuesInOrder();
    if (!this.variants.length || values.length === 0) return null;

    return (
      this.variants.find(function (variant) {
        var variantOptions = [variant.option1, variant.option2, variant.option3].filter(Boolean);
        return values.every(function (v) {
          return variantOptions.indexOf(v) !== -1;
        });
      }) || null
    );
  };

  ProductPopup.prototype.onSelectionChange = function () {
    var variant = this.findMatchingVariant();
    this.currentVariant = variant;

    if (variant) {
    //   if (this.priceEl) {
    //     this.priceEl.textContent = formatMoney(variant.price, this.moneyFormat);
    //   }
      if (this.addToCartBtn) {
        this.addToCartBtn.disabled = !variant.available;
        var textEl = this.addToCartBtn.querySelector('.popup_add_to_cart_text');
        if (textEl) {
          textEl.textContent = variant.available ? 'ADD TO CART' : 'SOLD OUT';
        }
      }
    } else if (this.addToCartBtn) {
      this.addToCartBtn.disabled = true;
    }

    this.checkAutoAddCondition();
  };

  ProductPopup.prototype.checkAutoAddCondition = function () {
    var values = this.getSelectedValuesInOrder().map(function (v) {
      return String(v).toLowerCase();
    });
    this.shouldAutoAdd =
      values.indexOf(AUTO_ADD_COLOR) !== -1 && values.indexOf(AUTO_ADD_SIZE) !== -1;
  };

  ProductPopup.prototype.handleAddToCart = function () {
    var self = this;

    if (!this.currentVariant || !this.currentVariant.available) return;

    this.addToCartBtn.disabled = true;

    var items = [{ id: this.currentVariant.id, quantity: 1 }];

    if (this.shouldAutoAdd && this.autoVariantId) {
      items.push({ id: parseInt(this.autoVariantId, 10), quantity: 1 });
    }

    fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: items })
    })
      .then(function (res) {
        if (!res.ok) {
          return res.json().then(function (err) {
            throw new Error(err.description || 'Could not add to cart');
          });
        }
        return res.json();
      })
      .then(function () {
        document.dispatchEvent(new CustomEvent('cart:updated'));
        closePopup(self.popup);
        window.location.href = "/cart";
      })
      .catch(function (err) {
        console.error(err);
        alert(err.message || 'Something went wrong adding this product to your cart.');
      })
      .finally(function () {
        self.addToCartBtn.disabled = false;
      });
  };

  function initQuickView() {
    document.querySelectorAll('.quick_view_btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.dataset.productId;
        var popup = document.getElementById('product-popup-' + id);
        if (popup) openPopup(popup);
      });
    });

    document.querySelectorAll('.product_popup').forEach(function (popupEl) {
      new ProductPopup(popupEl);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        document.querySelectorAll('.product_popup.is-active').forEach(function (popupEl) {
          closePopup(popupEl);
        });
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initQuickView);
  } else {
    initQuickView();
  }
})();
