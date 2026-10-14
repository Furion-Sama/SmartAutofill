(() => {
  "use strict";

  // Match common ways people label a phone/contact field.
  const FIELD_LABELS = {
    email: [
      "college mail id", "college email", "college mail", "email address",
      "email id", "e mail", "mail id", "mail-id", "mail", "email"
    ],
    phone: [
      "contact number", "contact no", "contact mobile", "phone number",
      "phone no", "mobile number", "mobile no", "telephone number",
      "telephone", "whatsapp number", "whatsapp no", "phone", "mobile",
      "contact", "cell number"
    ],
    rollNumber: [
      "roll number", "roll no", "roll no.", "rollnum", "roll num",
      "student roll number", "student roll no", "registration number",
      "registration no", "enrollment number", "enrolment number"
    ],
    college: ["college name", "university", "institution", "college"],
    address: ["postal address", "home address", "address"],
    name: ["full name", "your name", "first name", "last name", "name"]
  };

  const FIELD_TITLES = {
    name: "Name",
    email: "Email",
    phone: "Phone number",
    college: "College",
    rollNumber: "Roll number",
    address: "Address"
  };

  const seen = new WeakSet();

  function normalize(text) {
    // Turn punctuation into spaces so "Contact No." and "Contact No" both match.
    return (text || "")
      .toLowerCase()
      .replace(/[^a-z0-9@.+]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function classifyQuestion(text) {
    const value = normalize(text);
    if (!value) return null;

    // Specific categories first; use word boundaries to avoid accidental partial matches.
    const order = ["email", "phone", "rollNumber", "college", "address", "name"];
    for (const field of order) {
      for (const label of FIELD_LABELS[field]) {
        const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        if (new RegExp(`(^|\\s)${escaped}(?=\\s|$)`, "i").test(value)) {
          return field;
        }
      }
    }
    return null;
  }

  function getQuestionContainer(target) {
    return target.closest(".Qr7Oae") ||
      target.closest('[role="listitem"]') ||
      target.parentElement?.parentElement?.parentElement ||
      target.parentElement;
  }

  function textWithoutAnswerArea(container) {
    const clone = container?.cloneNode(true);
    if (!clone) return "";
    clone.querySelectorAll(
      "input, textarea, select, button, [role='textbox'], [contenteditable='true'], .smart-autofill-wrap"
    ).forEach(el => el.remove());
    return normalize(clone.innerText || clone.textContent);
  }

  function getQuestionText(container, target) {
    // First inspect common Google Forms question-title elements.
    const selectors = [
      ".M7eMe", ".HoXoMd", "[role='heading']", ".z12itd",
      "[data-params]", "label"
    ];

    for (const selector of selectors) {
      const elements = container?.querySelectorAll(selector) || [];
      for (const element of elements) {
        const text = normalize(
          element.innerText ||
          element.textContent ||
          element.getAttribute("aria-label") ||
          ""
        );
        if (text && classifyQuestion(text)) return text;
      }
    }

    // Fallback: inspect the question container's visible text with answer controls removed.
    const containerText = textWithoutAnswerArea(container);
    if (containerText && classifyQuestion(containerText)) return containerText;

    // Some forms have unusual wrappers. Try a few ancestors and use only a matching text.
    let ancestor = target.parentElement;
    for (let depth = 0; ancestor && depth < 5; depth++, ancestor = ancestor.parentElement) {
      const text = textWithoutAnswerArea(ancestor);
      if (text && classifyQuestion(text)) return text;
      if (ancestor === document.body) break;
    }

    // Last-resort hints sometimes exist on the field itself.
    return normalize([
      target.getAttribute("aria-label"),
      target.getAttribute("placeholder"),
      target.getAttribute("name"),
      target.getAttribute("autocomplete")
    ].filter(Boolean).join(" "));
  }

  function getFillableElements(root = document) {
    const selectors = [
      'input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]):not([type="file"])',
      "textarea",
      '[role="textbox"][contenteditable="true"]',
      '[role="textbox"]:not([aria-hidden="true"])'
    ];
    return [...root.querySelectorAll(selectors.join(","))].filter(el => {
      if (el.disabled || el.readOnly) return false;
      if (el.closest(".smart-autofill-wrap")) return false;
      if (el.getAttribute("aria-disabled") === "true") return false;
      return true;
    });
  }

  function setNativeValue(element, value) {
    if (element.isContentEditable || element.getAttribute("contenteditable") === "true") {
      element.focus();
      element.textContent = value;
    } else {
      const prototype = element.tagName === "TEXTAREA"
        ? HTMLTextAreaElement.prototype
        : element.tagName === "INPUT"
          ? HTMLInputElement.prototype
          : null;
      const setter = prototype && Object.getOwnPropertyDescriptor(prototype, "value")?.set;
      element.focus();
      if (setter) setter.call(element, value);
      else element.value = value;
    }

    element.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  function addAutofillControl(target) {
    if (seen.has(target)) return;
    const container = getQuestionContainer(target);
    if (!container) return;

    const question = getQuestionText(container, target);
    const detectedField = classifyQuestion(question);
    if (!detectedField) return;

    seen.add(target);
    const wrap = document.createElement("span");
    wrap.className = "smart-autofill-wrap";

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "smart-autofill-trigger";
    trigger.textContent = "✨ Autofill";
    trigger.setAttribute("aria-label", "Choose a saved value to fill this field");

    const menu = document.createElement("div");
    menu.className = "smart-autofill-menu";
    menu.hidden = true;
    menu.setAttribute("role", "dialog");

    trigger.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();

      document.querySelectorAll(".smart-autofill-menu").forEach(other => {
        if (other !== menu) other.hidden = true;
      });

      menu.replaceChildren();
      const heading = document.createElement("p");
      heading.textContent = `Question detected as: ${FIELD_TITLES[detectedField]}`;
      menu.appendChild(heading);

      const result = await chrome.storage.local.get("profile");
      const profile = result.profile || {};
      const available = Object.keys(FIELD_TITLES).filter(key => profile[key]);

      if (available.length === 0) {
        const empty = document.createElement("p");
        empty.className = "smart-autofill-empty";
        empty.textContent = "No saved details yet. Open the extension to add your profile.";
        menu.appendChild(empty);
      } else {
        available.sort((a, b) => (
          a === detectedField ? -1 : b === detectedField ? 1 : 0
        ));
        for (const key of available) {
          const option = document.createElement("button");
          option.type = "button";
          option.className = "smart-autofill-option";
          option.textContent = `${FIELD_TITLES[key]}${key === detectedField ? " (suggested)" : ""}`;
          option.addEventListener("click", (clickEvent) => {
            clickEvent.preventDefault();
            clickEvent.stopPropagation();
            setNativeValue(target, profile[key]);
            menu.hidden = true;
          });
          menu.appendChild(option);
        }
      }
      menu.hidden = false;
    });

    wrap.append(trigger, menu);
    target.insertAdjacentElement("afterend", wrap);
  }

  function scan(root = document) {
    if (root.nodeType === Node.ELEMENT_NODE && root.matches?.(
      'input, textarea, [role="textbox"]'
    )) {
      addAutofillControl(root);
    }
    for (const element of getFillableElements(root)) addAutofillControl(element);
  }

  scan();

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) scan(node);
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".smart-autofill-wrap")) {
      document.querySelectorAll(".smart-autofill-menu").forEach(menu => menu.hidden = true);
    }
  });
})();