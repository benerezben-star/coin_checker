// Checklist + variety buttons save immediately, so a long inspection session
// can be interrupted at any point without losing anything.

function post(url, payload) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

function activate(button) {
  button.parentElement
    .querySelectorAll(".opt")
    .forEach((b) => b.classList.remove("active"));
  button.classList.add("active");
}

document.addEventListener("click", (event) => {
  const button = event.target.closest(".opt");
  if (button) {
    const coinId = button.dataset.coin;
    const value = button.dataset.value;

    if (button.dataset.check) {
      const row = button.closest(".check");
      row.className = "check check-" + value;
      activate(button);
      post(`/coin/${coinId}/check`, {
        check_key: button.dataset.check,
        result: value,
      });
    } else if (button.dataset.variety) {
      activate(button);
      post(`/coin/${coinId}/variety`, {
        variety_id: button.dataset.variety,
        status: value,
      });
    }
    return;
  }

  const toggle = event.target.closest("[data-toggle]");
  if (toggle) {
    document.querySelector(toggle.dataset.toggle).classList.toggle("collapsed");
    return;
  }

  const tab = event.target.closest(".tab");
  if (tab) {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.add("hidden"));
    tab.classList.add("active");
    document.querySelector(tab.dataset.tab).classList.remove("hidden");
  }
});
