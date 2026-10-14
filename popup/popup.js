const form = document.getElementById("profile-form");
const status = document.getElementById("status");
const fieldNames = ["name", "email", "phone", "college", "rollNumber", "address"];

async function loadProfile() {
  const result = await chrome.storage.local.get("profile");
  const profile = result.profile || {};
  for (const name of fieldNames) {
    const field = form.elements.namedItem(name);
    if (field) field.value = profile[name] || "";
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const profile = {};
  for (const name of fieldNames) {
    profile[name] = String(form.elements.namedItem(name).value || "").trim();
  }
  await chrome.storage.local.set({ profile });
  status.textContent = "Profile saved on this browser.";
});

document.getElementById("clear").addEventListener("click", async () => {
  await chrome.storage.local.remove("profile");
  form.reset();
  status.textContent = "Saved profile cleared.";
});

loadProfile().catch(() => {
  status.textContent = "Could not load profile. Try reopening the extension.";
});
