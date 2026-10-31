let me = null; // {email, role} when signed in and authorized
let cities = [];
let markers = [];

const COLORS = { both: "#7b61ff", nir: "#1b74e4", einav: "#e91e63" };
const whoKey = c => (c.visited_nir && c.visited_einav) ? "both" : c.visited_nir ? "nir" : "einav";
const whoLabel = c => ({
  both: "ניר ועינב", nir: "ניר", einav: "עינב",
})[whoKey(c)];

const esc = s => String(s).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);

async function api(path, opts) {
  return fetch(path, { headers: { "Content-Type": "application/json" }, ...opts });
}

// ---------- map ----------
maplibregl.setRTLTextPlugin("https://unpkg.com/@mapbox/mapbox-gl-rtl-text@0.3.0/dist/mapbox-gl-rtl-text.js");
const map = new maplibregl.Map({
  container: "map",
  style: "https://tiles.versatiles.org/assets/styles/colorful/style.json",
  attributionControl: false,
  renderWorldCopies: false,
  projection: { type: "mercator" },
  center: [10, 30],
  zoom: 1.2,
});
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");
const worldLatN = 84, worldLatS = -85;
const merc = la => Math.log(Math.tan(Math.PI / 4 + la * Math.PI / 360));
const worldAspect = (merc(worldLatN) - merc(worldLatS)) / (2 * Math.PI); // height/width of the world strip
function fitWorld() {
  const el = map.getContainer();
  const w = el.clientWidth, h = el.clientHeight;
  const z = Math.min(Math.log2(w / 512), Math.log2(h / (worldAspect * 512))) - 0.12;
  const midMerc = (merc(worldLatN) + merc(worldLatS)) / 2;
  const midLat = (2 * Math.atan(Math.exp(midMerc)) - Math.PI / 2) * 180 / Math.PI;
  map.jumpTo({ center: [0, midLat], zoom: z });
  map.setMinZoom(z);
}
map.once("load", () => {
  // MapLibre mercator clamps the camera so the viewport never exceeds one
  // world, so a full-world entry view must letterbox the container to the
  // rendered world aspect (phone portrait: shrink height; wide screens:
  // shrink width). The map expands to full size on first user interaction.
  const mapEl = document.getElementById("map");
  const cw = mapEl.clientWidth, ch = mapEl.clientHeight;
  let letterboxed = false;
  map.setProjection({ type: "mercator" });
  if (ch / cw > worldAspect + 0.12) {
    // Side inset so edge labels (New Zealand, Alaska) are not clipped.
    const mw = cw - Math.min(48, Math.round(cw * 0.12));
    mapEl.style.width = mw + "px";
    mapEl.style.height = Math.round(mw * worldAspect) + "px";
    map.resize();
    letterboxed = true;
  } else if (cw / ch > 1 / worldAspect + 0.12) {
    mapEl.style.width = Math.round(ch / worldAspect) + "px";
    map.resize();
    letterboxed = true;
  }
  fitWorld();
  if (letterboxed) {
    const expand = () => {
      mapEl.style.width = "100%";
      mapEl.style.height = "100%";
      map.resize();
    };
    map.once("zoomstart", expand);
    map.once("dragstart", expand);
  }
  // English country names, matching the reference style
  for (const id of ["label-boundary-country-small", "label-boundary-country-medium", "label-boundary-country-large"]) {
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, "text-field", ["coalesce", ["get", "name_en"], ["get", "name"]]);
      map.setLayerZoomRange(id, 5.5, 24);
    }
  }
  // Political country colors from Natural Earth (public domain), world zooms only
  map.addSource("countries", { type: "geojson", data: "/countries.geojson", attribution: "<a href='https://www.naturalearthdata.com'>Natural Earth</a>" });
  const countryColors = ["case", ["==", ["get", "name"], "Antarctica"], "#f4f6f6",
    ["match", ["get", "mc"],
      1, "#f2c14e", 2, "#e8853d", 3, "#8bb45f", 4, "#e57fa6",
      5, "#5b8e7d", 6, "#c96a5b", "#f4e285"]];
  map.addLayer({
    id: "country-colors", type: "fill", source: "countries",
    paint: {
      "fill-color": countryColors,
      "fill-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.8, 4.5, 0.8, 6, 0],
    },
  }, "water-ocean");
  map.addLayer({
    id: "country-outlines", type: "line", source: "countries",
    paint: {
      "line-color": "#ffffff", "line-width": 1,
      "line-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.9, 6, 0],
    },
  }, "water-ocean");
  map.addSource("country-labels", { type: "geojson", data: "/country-labels.geojson" });
  const labelLayout = {
    "text-field": ["get", "name"],
    "text-font": ["noto_sans_regular"],
    "text-size": ["interpolate", ["linear"], ["zoom"], 0, 7, 2, 11, 4, 13],
    "symbol-placement": "point",
    "text-max-width": 8,
  };
  const labelPaint = {
    "text-color": "#3a3a3a",
    "text-halo-color": "rgba(255,255,255,0.75)",
    "text-halo-width": 1,
    "text-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.95, 5, 0.95, 6, 0],
  };
  map.addLayer({
    id: "country-labels", type: "symbol", source: "country-labels",
    filter: ["!", ["get", "edge"]],
    layout: labelLayout,
    paint: labelPaint,
  });
  // Countries at the antimeridian: right-anchor the label at its point so it
  // extends inland and is never clipped by the map edge at world zoom.
  map.addLayer({
    id: "country-labels-edge", type: "symbol", source: "country-labels",
    filter: ["get", "edge"],
    layout: Object.assign({}, labelLayout, { "text-anchor": "right", "text-offset": [-0.4, 0] }),
    paint: labelPaint,
  });
});

let openPopup = null;

function markerFor(c) {
  const el = document.createElement("div");
  let popupHtml;
  if (c.wishlist) {
    el.className = "wish-star";
    el.textContent = "\u2605";
    popupHtml = `<b>${esc(c.name)}</b>${c.country ? ", " + esc(c.country) : ""}<br>רוצים לבקר`;
  } else {
    el.className = "city-dot";
    el.style.background = COLORS[whoKey(c)];
    popupHtml = `<b>${esc(c.name)}</b>${c.country ? ", " + esc(c.country) : ""}<br>ביקרו: ${whoLabel(c)}`;
  }
  const popup = new maplibregl.Popup({ offset: 14 }).setHTML(popupHtml);
  const m = new maplibregl.Marker({ element: el }).setLngLat([c.lng, c.lat]).setPopup(popup).addTo(map);
  if (me) {
    popup.on("open", () => {
      openPopup = popup;
      const box = popup.getElement().querySelector(".maplibregl-popup-content");
      if (c.wishlist) {
        const conv = document.createElement("button");
        conv.textContent = "ביקרנו!"; conv.className = "btn";
        conv.addEventListener("click", () => {
          popup.remove();
          openConvertPanel(c);
        });
        box.appendChild(conv);
      }
      const btn = document.createElement("button");
      btn.textContent = "מחיקה"; btn.className = "link";
      btn.addEventListener("click", async () => {
        const r = await api("/api/edit/cities/" + c.id, { method: "DELETE" });
        if (r.ok) loadCities();
      });
      box.appendChild(btn);
    });
  }
  markers.push(m);
}

// convert a wishlist destination into a visited city
function openConvertPanel(city) {
  openPanel(`
    <h2>ביקרנו ב${city.name}!</h2>
    <div class="checks">
      <label><input type="checkbox" id="cv-nir"> ניר ביקר</label>
      <label><input type="checkbox" id="cv-einav"> עינב ביקרה</label>
    </div>
    <button id="save-convert" class="btn">שמירה</button>
    <p class="error" id="cv-error" hidden></p>
  `);
  document.getElementById("save-convert").addEventListener("click", async () => {
    const err = document.getElementById("cv-error");
    const vn = document.getElementById("cv-nir").checked;
    const ve = document.getElementById("cv-einav").checked;
    if (!vn && !ve) { err.textContent = "סמנו מי ביקר בעיר"; err.hidden = false; return; }
    const r = await api("/api/edit/cities/" + city.id, {
      method: "PUT",
      body: JSON.stringify({ name: city.name, country: city.country, lat: city.lat, lng: city.lng,
        visited_nir: vn, visited_einav: ve, wishlist: false }),
    });
    if (!r.ok) { err.textContent = "השמירה נכשלה"; err.hidden = false; return; }
    panel.hidden = true;
    loadCities();
  });
}

async function loadCities() {
  const res = await api("/api/list");
  const data = await res.json();
  cities = data.cities || [];
  markers.forEach(m => m.remove());
  markers = [];
  cities.forEach(markerFor);
}

// ---------- auth state ----------
async function loadMe() {
  let r;
  try { r = await api("/api/edit/me"); } catch { r = null; }
  me = null;
  if (r && r.ok) {
    const body = await r.json().catch(() => null);
    if (body && body.email) me = body;
  }
  const who = document.getElementById("who");
  const loginBtn = document.getElementById("login-btn");
  const logoutBtn = document.getElementById("logout-btn");
  if (me) {
    who.textContent = me.role === "owner" ? "מחובר כבעלים" : "מחובר לעריכה";
    who.hidden = false; loginBtn.hidden = true; logoutBtn.hidden = false;
  } else {
    who.hidden = true; loginBtn.hidden = false; logoutBtn.hidden = true;
  }
  document.getElementById("editor-tools").hidden = !me;
  document.getElementById("editors-btn").hidden = !(me && me.role === "owner");
}

document.getElementById("logout-btn").addEventListener("click", async () => {
  await api("/api/logout", { method: "POST" });
  await loadMe();
  loadCities();
});

// ---------- bottom panel ----------
const panel = document.getElementById("panel");
const panelContent = document.getElementById("panel-content");
function openPanel(html) { panelContent.innerHTML = html; panel.hidden = false; }
document.getElementById("panel-close").addEventListener("click", () => { panel.hidden = true; });

// ---------- add city (geocoding search + who visited) ----------
document.getElementById("add-city-btn").addEventListener("click", () => {
  openPanel(`
    <h2>הוספת עיר</h2>
    <label>חיפוש עיר (למשל: ליסבון או Lisbon)</label>
    <input type="text" id="geo-q">
    <button id="geo-go" class="btn" style="margin-top:8px">חיפוש</button>
    <ul class="geo-results" id="geo-results"></ul>
    <div id="pick" hidden>
      <h2 id="pick-name"></h2>
      <div class="checks">
        <label><input type="checkbox" id="v-wish"> יעד עתידי - עדיין לא ביקרנו</label>
      </div>
      <div class="checks" id="visited-checks">
        <label><input type="checkbox" id="v-nir"> ניר ביקר</label>
        <label><input type="checkbox" id="v-einav"> עינב ביקרה</label>
      </div>
      <button id="save-city" class="btn">שמירה</button>
    </div>
    <p class="error" id="add-error" hidden></p>
  `);
  let picked = null;
  document.getElementById("geo-go").addEventListener("click", async () => {
    const q = document.getElementById("geo-q").value.trim();
    if (!q) return;
    const err = document.getElementById("add-error");
    err.hidden = true;
    const u = "https://nominatim.openstreetmap.org/search?format=json&limit=5&accept-language=he&q=" + encodeURIComponent(q);
    let results;
    try { results = await (await fetch(u)).json(); }
    catch { err.textContent = "החיפוש נכשל, נסו שוב"; err.hidden = false; return; }
    const ul = document.getElementById("geo-results");
    ul.innerHTML = "";
    if (!results.length) { err.textContent = "לא נמצאה עיר"; err.hidden = false; return; }
    for (const r of results) {
      const li = document.createElement("li");
      li.textContent = r.display_name;
      li.addEventListener("click", () => {
        const parts = r.display_name.split(",");
        picked = {
          name: (r.name || parts[0]).trim(),
          country: (parts[parts.length - 1] || "").trim(),
          lat: Number(r.lat), lng: Number(r.lon),
        };
        document.getElementById("pick").hidden = false;
        document.getElementById("pick-name").textContent = picked.name + (picked.country ? ", " + picked.country : "");
      });
      ul.appendChild(li);
    }
  });
  const wishBox = document.getElementById("v-wish");
  wishBox.addEventListener("change", () => {
    const vc = document.getElementById("visited-checks");
    vc.style.opacity = wishBox.checked ? "0.4" : "1";
    vc.querySelectorAll("input").forEach(i => { i.disabled = wishBox.checked; if (wishBox.checked) i.checked = false; });
  });
  document.getElementById("save-city").addEventListener("click", async () => {
    const err = document.getElementById("add-error");
    if (!picked) { err.textContent = "קודם בחרו עיר מהחיפוש"; err.hidden = false; return; }
    const wish = document.getElementById("v-wish").checked;
    const vn = document.getElementById("v-nir").checked;
    const ve = document.getElementById("v-einav").checked;
    if (!wish && !vn && !ve) { err.textContent = "סמנו מי ביקר בעיר, או יעד עתידי"; err.hidden = false; return; }
    const r = await api("/api/edit/cities", {
      method: "POST",
      body: JSON.stringify({ ...picked, visited_nir: vn, visited_einav: ve, wishlist: wish }),
    });
    if (!r.ok) {
      const b = await r.json().catch(() => ({}));
      err.textContent = b.error === "city already exists" ? "העיר כבר קיימת ברשימה" : "השמירה נכשלה";
      err.hidden = false; return;
    }
    panel.hidden = true;
    loadCities();
  });
});

// ---------- owner: editors management ----------
document.getElementById("editors-btn").addEventListener("click", async () => {
  const r = await api("/api/edit/editors");
  if (!r.ok) return;
  const { owner, editors } = await r.json();
  const all = [{ email: owner, role: "owner" }, ...editors.filter(e => e.email !== owner)];
  const items = all.map(e =>
    `<li>${e.email}${e.role === "owner" ? " (בעלים)" : ` <button class="link" data-del="${e.email}">הסרה</button>`}</li>`
  ).join("");
  openPanel(`
    <h2>ניהול עורכים</h2>
    <ul>${items}</ul>
    <label>הוספת עורך (כתובת Gmail)</label>
    <input type="email" id="new-editor-email">
    <button id="add-editor" class="btn" style="margin-top:8px">הוספה</button>
    <p class="error" id="ed-error" hidden></p>
  `);
  panelContent.querySelectorAll("[data-del]").forEach(btn =>
    btn.addEventListener("click", async () => {
      await api("/api/edit/editors/" + encodeURIComponent(btn.dataset.del), { method: "DELETE" });
      panel.hidden = true;
    })
  );
  document.getElementById("add-editor").addEventListener("click", async () => {
    const email = document.getElementById("new-editor-email").value.trim();
    const err = document.getElementById("ed-error");
    const rr = await api("/api/edit/editors", { method: "POST", body: JSON.stringify({ email }) });
    if (!rr.ok) { err.textContent = "לא ניתן להוסיף"; err.hidden = false; return; }
    panel.hidden = true;
  });
});

// ---------- cities list view ----------
document.getElementById("list-btn").addEventListener("click", () => {
  const byName = (a, b) => a.name.localeCompare(b.name, "he");
  const wish = cities.filter(c => c.wishlist).sort(byName);
  const visited = cities.filter(c => !c.wishlist).sort(byName);
  const row = c => `<li class="city-row" data-id="${c.id}">` +
    (c.wishlist
      ? `<span class="wish-legend">★</span>`
      : `<i class="dot ${whoKey(c)}"></i>`) +
    `<span class="row-name">${esc(c.name)}${c.country ? ", " + esc(c.country) : ""}</span>` +
    `<span class="row-who">${c.wishlist ? "רוצים לבקר" : whoLabel(c)}</span></li>`;
  openPanel(`
    <h2>הערים שלנו</h2>
    ${wish.length ? `<h3 class="list-section">רוצים לבקר</h3><ul class="city-list">${wish.map(row).join("")}</ul>` : ""}
    ${visited.length ? `<h3 class="list-section">ביקרנו</h3><ul class="city-list">${visited.map(row).join("")}</ul>` : ""}
    ${!cities.length ? "<p>עדיין אין ערים ברשימה</p>" : ""}
  `);
  panelContent.querySelectorAll(".city-row").forEach(el =>
    el.addEventListener("click", () => {
      const c = cities.find(x => x.id == el.dataset.id);
      if (c) { panel.hidden = true; map.flyTo({ center: [c.lng, c.lat], zoom: 6 }); }
    })
  );
});

(async () => { await loadMe(); loadCities(); })();
