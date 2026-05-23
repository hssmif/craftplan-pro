// ══════════════════════════════════════════════════════════════
// DOM Manipulation Utilities for Etsy Form Filling
// Safe helpers with timeouts, retries, and React-compatible events
// ══════════════════════════════════════════════════════════════

/**
 * Wait for an element matching one of the given CSS selectors.
 * Tries each selector, uses MutationObserver if not immediately found.
 */
export function waitForElement(
  selectors: string[],
  timeout = 10000
): Promise<Element> {
  return new Promise((resolve, reject) => {
    // Try immediately
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return resolve(el);
    }

    // Watch for DOM changes
    const observer = new MutationObserver(() => {
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) {
          observer.disconnect();
          return resolve(el);
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Timeout
    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`waitForElement timeout: ${selectors.join(", ")}`));
    }, timeout);
  });
}

/**
 * Set an input/textarea value using native property descriptor
 * to properly trigger React/Preact state updates.
 */
export function simulateInput(el: HTMLElement, value: string): void {
  // Determine if it's an input or textarea
  const isTextarea = el.tagName === "TEXTAREA";
  const proto = isTextarea
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;

  const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (nativeSetter) {
    nativeSetter.call(el, value);
  } else {
    (el as HTMLInputElement).value = value;
  }

  // Dispatch events that React/Preact listen for
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(new Event("blur", { bubbles: true }));
}

/**
 * Simulate a full click sequence (mousedown → mouseup → click).
 */
export function simulateClick(el: HTMLElement): void {
  el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

/**
 * Select an option in a <select> element by value or visible text.
 */
export function selectOption(
  selectEl: HTMLSelectElement,
  valueOrText: string
): boolean {
  const options = Array.from(selectEl.options);
  const match = options.find(
    (o) =>
      o.value === valueOrText ||
      o.textContent?.trim().toLowerCase() === valueOrText.toLowerCase()
  );

  if (match) {
    selectEl.value = match.value;
    selectEl.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }
  return false;
}

/**
 * Type text character by character into an element (for autocomplete fields).
 */
export async function typeText(el: HTMLElement, text: string, charDelay = 50): Promise<void> {
  (el as HTMLInputElement).focus();
  for (const char of text) {
    el.dispatchEvent(new KeyboardEvent("keydown", { key: char, bubbles: true }));
    simulateInput(el, ((el as HTMLInputElement).value || "") + char);
    el.dispatchEvent(new KeyboardEvent("keyup", { key: char, bubbles: true }));
    await delay(charDelay);
  }
}

/**
 * Press a specific key (e.g., Enter, Tab).
 */
export function pressKey(el: HTMLElement, key: string): void {
  el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  el.dispatchEvent(new KeyboardEvent("keypress", { key, bubbles: true }));
  el.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
}

/**
 * Promise-based delay.
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Scroll an element into view smoothly.
 */
export function scrollToElement(el: Element): void {
  el.scrollIntoView({ behavior: "smooth", block: "center" });
}

/**
 * Add a glowing highlight effect to an element.
 */
export function highlightElement(el: HTMLElement, color = "#10b981"): void {
  el.style.cssText += `
    outline: 3px solid ${color} !important;
    box-shadow: 0 0 20px ${color}66, 0 0 40px ${color}33 !important;
    transition: all 0.3s ease !important;
  `;

  // Add pulse animation
  const style = document.createElement("style");
  style.textContent = `
    @keyframes craftplan-pulse {
      0%, 100% { box-shadow: 0 0 20px ${color}66, 0 0 40px ${color}33; }
      50% { box-shadow: 0 0 30px ${color}99, 0 0 60px ${color}66; }
    }
  `;
  document.head.appendChild(style);
  el.style.animation = "craftplan-pulse 1.5s infinite";
}
