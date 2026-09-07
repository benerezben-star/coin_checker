// Side-by-side image workbench: each pane picks a photo and a filter, and the
// zoom slider drives both panes together so the comparison stays honest.

function filterUrl(photoId, filterName) {
  return window.FILTER_URL.replace("/0/", "/" + photoId + "/").replace("ZZZ", filterName);
}

function refresh(pane) {
  const photoId = pane.querySelector(".pane-photo").value;
  const filterName = pane.querySelector(".pane-filter").value;
  if (!photoId) return;

  pane.querySelector(".pane-img").src = filterUrl(photoId, filterName);
  const meta = window.FILTER_HELP[filterName];
  pane.querySelector(".pane-help").textContent = meta ? meta.help : "";
}

const panes = Array.from(document.querySelectorAll(".pane"));

panes.forEach((pane, index) => {
  // Default the two panes to different photos when the coin has more than one,
  // so the workbench opens on an actual comparison rather than a duplicate.
  const select = pane.querySelector(".pane-photo");
  if (index === 1 && select.options.length > 1) select.selectedIndex = 1;

  pane.addEventListener("change", () => refresh(pane));
  refresh(pane);
});

const zoom = document.getElementById("zoom");
if (zoom) {
  zoom.addEventListener("input", () => {
    const scale = zoom.value / 100;
    document.getElementById("zoom-val").textContent = zoom.value + "%";
    document
      .querySelectorAll(".pane-img")
      .forEach((img) => (img.style.transform = `scale(${scale})`));
  });
}
