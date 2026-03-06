document.addEventListener("DOMContentLoaded", () => {
  const themeToggleBtn = document.getElementById("theme-toggle");

  // Check for saved user preference, if any
  const savedTheme = localStorage.getItem("theme");

  // Default to dark mode if no saved preference
  if (savedTheme === "light") {
    document.documentElement.setAttribute("data-theme", "light");
  } else {
    document.documentElement.setAttribute("data-theme", "dark");
  }

  // Toggle theme on button click
  themeToggleBtn.addEventListener("click", () => {
    const currentTheme = document.documentElement.getAttribute("data-theme");
    const newTheme = currentTheme === "light" ? "dark" : "light";

    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("theme", newTheme);
  });
});

// --- CONFIGURACIÓN Y LÓGICA DE PRECIOS ---

const PricingConfig = {
  currency: "COP",
  plans: {
    basic: {
      basePrice: 749000,
      included: { shortVideos: 8, longVideos: 0 },
      extraPrices: { shortVideo: 89000, longVideo: null },
    },
    standard: {
      basePrice: 1790000,
      included: { shortVideos: 10, longVideos: 2 },
      extraPrices: { shortVideo: 159000, longVideo: 199000 },
    },
    advanced: {
      basePrice: 3090000,
      included: { shortVideos: 10, longVideos: 2 },
      extraPrices: { shortVideo: 159000, longVideo: 199000 },
    },
  },
  discounts: [
    { minPlans: 3, percent: 0.2 },
    { minPlans: 2, percent: 0.15 },
  ],
};

function FormatCop(value) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

function CalculatePlanPrice({ planKey, shortVideos, longVideos, planQuantity = 1 }) {
  const plan = PricingConfig.plans[planKey];
  if (!plan) throw new Error("Plan inválido");

  const minIncludedShort = plan.included.shortVideos;
  const minIncludedLong = plan.included.longVideos;
  
  const minAllowedShort = planQuantity > 1 ? 5 : minIncludedShort;

  const safeShort = Math.max(minAllowedShort, Number.isFinite(shortVideos) ? Math.floor(shortVideos) : minAllowedShort);
  const safeLongRaw = Number.isFinite(longVideos)
    ? Math.floor(longVideos)
    : minIncludedLong;

  const safeLong = planKey === "basic" ? 0 : Math.max(minIncludedLong, safeLongRaw);

  const extraShortCount = Math.max(0, safeShort - minIncludedShort);
  const extraLongCount = Math.max(0, safeLong - minIncludedLong);

  // Calcular videos no usados (solo para cortos por ahora, si baja de lo incluido)
  const unusedShortCount = Math.max(0, minIncludedShort - safeShort);

  const extraShortCost = extraShortCount * plan.extraPrices.shortVideo;
  const extraLongCost = plan.extraPrices.longVideo
    ? extraLongCount * plan.extraPrices.longVideo
    : 0;
  
  // Para Básico, el descuento por video no usado es de $83.000 para que 5 videos = $500.000
  const unusedDiscountLevel = planKey === "basic" ? 83000 : plan.extraPrices.shortVideo;
  const unusedShortDiscount = unusedShortCount * unusedDiscountLevel;

  const base = plan.basePrice;
  const extras = extraShortCost + extraLongCost;
  // Restamos el valor de los videos no usados del subtotal
  const subtotal = base + extras - unusedShortDiscount;

  return {
    planKey,
    quantities: { shortVideos: safeShort, longVideos: safeLong },
    included: plan.included,
    extras: {
      extraShortCount,
      extraLongCount,
      extraShortCost,
      extraLongCost,
      unusedShortCount,
      unusedShortDiscount
    },
    base,
    subtotal
  };
}

function CalculateCartTotals(items) {
  const safeItems = (items || []).filter(Boolean).map((i) => ({
    breakdown: i.breakdown,
    quantity: Math.max(1, Math.floor(i.quantity ?? 1)),
  }));

  const plansCount = safeItems.reduce((acc, i) => acc + i.quantity, 0);
  const subtotal = safeItems.reduce(
    (acc, i) => acc + i.breakdown.subtotal * i.quantity,
    0,
  );

  const discountRule =
    PricingConfig.discounts.find((d) => plansCount >= d.minPlans) || null;
  const discountPercent = discountRule ? discountRule.percent : 0;
  const discountValue = Math.round(subtotal * discountPercent);
  const total = subtotal - discountValue;

  return {
    plansCount,
    subtotal,
    discountPercent,
    discountValue,
    total,
  };
}

function GetUpgradeSuggestion(planKey, planSubtotal) {
  if (planKey === "basic") {
    const standardPrice = PricingConfig.plans.standard.basePrice;
    if (planSubtotal >= standardPrice) {
      return {
        shouldSuggest: true,
        toPlan: "standard",
        message: "Con esa cantidad de videos, te conviene pasar a Estándar",
      };
    }
  }

  if (planKey === "standard") {
    const advancedPrice = PricingConfig.plans.advanced.basePrice;
    if (planSubtotal >= advancedPrice * 0.92) {
      return {
        shouldSuggest: true,
        toPlan: "advanced",
        message:
          "Estás muy cerca de Avanzado, podrías aprovechar estrategia y guiones",
      };
    }
  }

  return { shouldSuggest: false };
}

// --- INTEGRACIÓN CON LA UI ---
document.addEventListener("DOMContentLoaded", () => {
  // Elements
  const planSelect = document.getElementById("plan-select");
  if (!planSelect) return; // Si no existe el customizador, salimos

  const shortInput = document.getElementById("short-videos");
  const longInput = document.getElementById("long-videos");
  const qtyInput = document.getElementById("plan-quantity");

  const btnShortMinus = document.getElementById("btn-short-minus");
  const btnShortPlus = document.getElementById("btn-short-plus");
  const btnLongMinus = document.getElementById("btn-long-minus");
  const btnLongPlus = document.getElementById("btn-long-plus");
  const btnQtyMinus = document.getElementById("btn-qty-minus");
  const btnQtyPlus = document.getElementById("btn-qty-plus");

  // Summary Elements
  const elBase = document.getElementById("summary-base");
  const rowExtrasShort = document.getElementById("row-extras-short");
  const countExtrasShort = document.getElementById("count-extras-short");
  const costExtrasShort = document.getElementById("cost-extras-short");

  const rowExtrasLong = document.getElementById("row-extras-long");
  const countExtrasLong = document.getElementById("count-extras-long");
  const costExtrasLong = document.getElementById("cost-extras-long");
  
  const rowUnusedShort = document.getElementById("row-unused-short");
  const countUnusedShort = document.getElementById("count-unused-short");
  const costUnusedShort = document.getElementById("cost-unused-short");
  
  const elSubtotal = document.getElementById("summary-subtotal");
  const rowDiscount = document.getElementById("row-discount");
  const elDiscountPercent = document.getElementById("discount-percent");
  const elDiscountValue = document.getElementById("summary-discount");
  const dividerDiscount = document.getElementById("divider-discount");

  const elTotal = document.getElementById("summary-total");

  const upgradeBox = document.getElementById("upgrade-suggestion");
  const suggestionMessage = document.getElementById("suggestion-message");

  const btnHire = document.getElementById("btn-hire-custom");

  // Estado inicial
  let currentState = {
    planKey: planSelect.value || "standard",
    shortVideos: 10,
    longVideos: 2,
    planQuantity: 1,
  };

  function render() {
    // 1. Calcular desglose del plan
    const breakdown = CalculatePlanPrice({
      planKey: currentState.planKey,
      shortVideos: currentState.shortVideos,
      longVideos: currentState.longVideos,
      planQuantity: currentState.planQuantity
    });
    
    // Sincronizar estado en caso de correcciones de límites (ej. pasar de 2 a 1 plan)
    currentState.shortVideos = breakdown.quantities.shortVideos;
    currentState.longVideos = breakdown.quantities.longVideos;

    // 2. Calcular totales del carrito (aplicando descuentos por cantidad de planes)
    const cart = CalculateCartTotals([
      {
        breakdown,
        quantity: currentState.planQuantity,
      },
    ]);

    // 3. Obtener sugerencia de upgrade
    const suggestion = GetUpgradeSuggestion(
      currentState.planKey,
      breakdown.subtotal,
    );

    // -- Actualizar UI --

    // Precios y cantidades
    elBase.textContent = FormatCop(breakdown.base);

    if (breakdown.extras.extraShortCount > 0) {
      rowExtrasShort.style.display = "flex";
      countExtrasShort.textContent = breakdown.extras.extraShortCount;
      costExtrasShort.textContent = FormatCop(breakdown.extras.extraShortCost);
    } else {
      rowExtrasShort.style.display = "none";
    }

    if (breakdown.extras.extraLongCount > 0) {
      rowExtrasLong.style.display = "flex";
      countExtrasLong.textContent = breakdown.extras.extraLongCount;
      costExtrasLong.textContent = FormatCop(breakdown.extras.extraLongCost);
    } else {
      rowExtrasLong.style.display = "none";
    }

    if (breakdown.extras.unusedShortCount > 0) {
      rowUnusedShort.style.display = "flex";
      countUnusedShort.textContent = breakdown.extras.unusedShortCount;
      costUnusedShort.textContent = `-${FormatCop(breakdown.extras.unusedShortDiscount)}`;
    } else {
      rowUnusedShort.style.display = "none";
    }

    elSubtotal.textContent = FormatCop(cart.subtotal);

    if (cart.discountValue > 0) {
      rowDiscount.style.display = "flex";
      if (dividerDiscount) dividerDiscount.style.display = "block";
      elDiscountPercent.textContent = Math.round(cart.discountPercent * 100);
      elDiscountValue.textContent = `-${FormatCop(cart.discountValue)}`;
    } else {
      rowDiscount.style.display = "none";
      if (dividerDiscount) dividerDiscount.style.display = "none";
    }

    elTotal.textContent = FormatCop(cart.total);

    // Sugerencia
    if (suggestion.shouldSuggest) {
      upgradeBox.style.display = "flex";
      suggestionMessage.textContent = suggestion.message;
    } else {
      upgradeBox.style.display = "none";
    }

    // Actualizar enlace de contratación
    const planName = planSelect.options[planSelect.selectedIndex].text;
    const text = `Hola! Quiero contratar el Paquete a mi medida:\n- Plan Base: ${planName}\n- Videos Cortos (30-60s): ${breakdown.quantities.shortVideos}\n- Videos Largos (≈90s): ${breakdown.quantities.longVideos}\n- Cantidad de planes: ${currentState.planQuantity}\n- Total: ${FormatCop(cart.total)}`;
    btnHire.href = `https://wa.me/573160627549?text=${encodeURIComponent(text)}`;

    // Actualizar inputs (por si hubo correcciones mágicas de límites)
    shortInput.value = breakdown.quantities.shortVideos;
    longInput.value = breakdown.quantities.longVideos;
    qtyInput.value = currentState.planQuantity;

    // Deshabilitar botones si estamos en el mínimo
    const planConfig = PricingConfig.plans[currentState.planKey];
    const minAllowedShort = currentState.planQuantity > 1 ? 5 : planConfig.included.shortVideos;
    btnShortMinus.disabled = breakdown.quantities.shortVideos <= minAllowedShort;
    
    if (currentState.planKey === "basic") {
      btnLongMinus.disabled = true;
      btnLongPlus.disabled = true;
      longInput.disabled = true;
      longInput.parentElement.style.opacity = "0.5";
    } else {
      btnLongMinus.disabled =
        breakdown.quantities.longVideos <= planConfig.included.longVideos;
      btnLongPlus.disabled = false;
      longInput.disabled = false;
      longInput.parentElement.style.opacity = "1";
    }

    btnQtyMinus.disabled = currentState.planQuantity <= 1;
  }

  // Event Listeners
  planSelect.addEventListener("change", (e) => {
    currentState.planKey = e.target.value;
    const planConfig = PricingConfig.plans[currentState.planKey];
    currentState.shortVideos = planConfig.included.shortVideos;
    currentState.longVideos = planConfig.included.longVideos;
    render();
  });

  btnShortMinus.addEventListener("click", () => {
    currentState.shortVideos--;
    render();
  });
  btnShortPlus.addEventListener("click", () => {
    currentState.shortVideos++;
    render();
  });

  btnLongMinus.addEventListener("click", () => {
    if (currentState.planKey !== "basic") {
      currentState.longVideos--;
      render();
    }
  });
  btnLongPlus.addEventListener("click", () => {
    if (currentState.planKey !== "basic") {
      currentState.longVideos++;
      render();
    }
  });

  btnQtyMinus.addEventListener("click", () => {
    if (currentState.planQuantity > 1) {
      currentState.planQuantity--;
      render();
    }
  });
  btnQtyPlus.addEventListener("click", () => {
    currentState.planQuantity++;
    render();
  });

  // Render inicial
  render();
});
