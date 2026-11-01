const $ = (s) => document.querySelector(s);
const inr = (n) => "₹" + Math.round(n).toLocaleString("en-IN");
const fmtDate = (s, long) => new Date(s + "T00:00:00").toLocaleDateString("en-IN",
  long ? { weekday: "short", day: "numeric", month: "short", year: "numeric" } : { day: "numeric", month: "short", year: "numeric" });
const fmtShort = (s) => new Date(s + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const rem = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;

const ICON = {
  underpriced: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="m7.5 12.5 3 3 6-7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  fair: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 10h10M7 14h10" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  overpriced: '<svg viewBox="0 0 24 24"><path d="M12 3 22 20H2L12 3Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 10v4.5M12 17.2v.1" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  yes: '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  no: '<svg viewBox="0 0 24 24"><path d="M6 12h12" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>',
};
const VERDICT = { underpriced: { title: "Underpriced", color: "#0b6b0b" }, fair: { title: "Fair price", color: "#1f64b8" }, overpriced: { title: "Overpriced", color: "#b02e2e" } };

const S = {
  meta: null, from: "Delhi", to: "Mumbai", date: "2024-06-15", airline: "IndiGo", stops: "1 stop",
  step: 1, maxStep: 1, price: "", result: null, req: null, models: null, options: [], method: null, useMethod: null,
};
const dateOk = () => S.date && S.date >= S.meta.date_min && S.date <= S.meta.date_max;

/* ---------- router ---------- */
function showPage() {
  let page = location.hash.replace(/^#\//, "") || "check";
  if (!["check", "result", "models", "how"].includes(page) || (page === "result" && !S.result)) page = "check";
  document.querySelectorAll(".page").forEach((p) => (p.hidden = p.id !== "page-" + page));
  document.querySelectorAll(".nav nav a").forEach((a) => {
    a.classList.toggle("on", a.dataset.page === page);
    a.classList.toggle("off", a.dataset.page === "result" && !S.result);
  });
  if (page === "result") requestAnimationFrame(drawChart);
  if (page === "models") loadModels();
  if (page === "how") renderHow();
}
window.addEventListener("hashchange", showPage);
window.addEventListener("resize", () => {
  clearTimeout(showPage.t);
  showPage.t = setTimeout(() => {
    if (!$("#page-result").hidden && S.result) { renderResult(); drawChart(); }
    if (!$("#page-models").hidden) drawModelChart();
  }, 120);
});

/* ---------- ticket ---------- */
function renderTicket() {
  $("#t-from").textContent = S.from; $("#t-to").textContent = S.to;
  const set = (id, v) => { const e = $(id); e.textContent = v || "Not set"; e.classList.toggle("empty", !v); };
  set("#t-date", S.date && fmtDate(S.date, true));
  set("#t-flight", S.maxStep >= 2 ? `${S.airline} · ${S.stops}` : null);
  set("#t-price", Number(S.price) > 0 ? inr(S.price) : null);
}

/* ---------- wizard ---------- */
const STEPS = ["Trip", "Flight", "Price"];
function valid() {
  if (S.step === 1) return S.from !== S.to && dateOk();
  if (S.step === 2) return !!S.airline && !!S.stops;
  return Number(S.price) > 0;
}
function updateNav() {
  $("#next").disabled = !valid();
  $("#next").textContent = S.step === 3 ? "Check fare" : "Next";
  $("#back").style.visibility = S.step === 1 ? "hidden" : "visible";
  $("#steps").innerHTML = STEPS.map((n, i) => {
    const k = i + 1, c = k === S.step ? "cur" : k < S.step ? "done" : "";
    return `<li><button type="button" class="${c}" data-s="${k}" ${k > S.maxStep ? "disabled" : ""}><span class="n">${k < S.step ? "✓" : k}</span><span>${n}</span></button></li>`;
  }).join("");
  document.querySelectorAll("#steps button").forEach((b) => (b.onclick = () => goStep(Number(b.dataset.s))));
  renderTicket();
}
function goStep(k) { S.step = k; S.maxStep = Math.max(S.maxStep, k); renderStep(); }

function renderStep() {
  const body = $("#step-body"), m = S.meta;
  if (S.step === 1) {
    const tos = m.cities.filter((c) => c !== S.from);
    if (!tos.includes(S.to)) S.to = tos[0];
    body.innerHTML = `<div class="step-inner">
      <h2>Where are you flying?</h2>
      <div class="route-row">
        <label class="f">From<select id="from">${m.cities.map((c) => `<option ${c === S.from ? "selected" : ""}>${c}</option>`).join("")}</select></label>
        <button type="button" class="swap" id="swap" aria-label="Swap cities"><svg viewBox="0 0 24 24"><path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <label class="f">To<select id="to">${tos.map((c) => `<option ${c === S.to ? "selected" : ""}>${c}</option>`).join("")}</select></label>
      </div>
      <label class="f">Departure date<input type="date" id="date" value="${S.date}" min="${m.date_min}" max="${m.date_max}"></label>
      <p class="cap" id="date-cap"></p></div>`;
    const cap = () => {
      const bad = S.date && !dateOk();
      $("#date-cap").className = "cap" + (bad ? " warn" : "");
      $("#date-cap").textContent = bad
        ? `Pick a date between ${fmtDate(m.date_min)} and ${fmtDate(m.date_max)}.`
        : `Fares cover ${fmtDate(m.date_min)} to ${fmtDate(m.date_max_data)}. Later dates are projected.`;
    };
    cap();
    $("#from").onchange = (e) => { S.from = e.target.value; S.maxStep = 1; renderStep(); };
    $("#to").onchange = (e) => { S.to = e.target.value; S.maxStep = 1; updateNav(); };
    $("#date").oninput = (e) => { S.date = e.target.value; S.maxStep = 1; cap(); updateNav(); };
    $("#swap").onclick = () => { [S.from, S.to] = [S.to, S.from]; S.maxStep = 1; renderStep(); };
  } else if (S.step === 2) {
    body.innerHTML = `<div class="step-inner">
      <h2>Which flight?</h2>
      <label class="f">Airline<select id="airline">${m.airlines.map((a) => `<option ${a === S.airline ? "selected" : ""}>${a}</option>`).join("")}</select></label>
      <div class="f field-gap">Stops
        <div class="seg4" role="radiogroup" aria-label="Number of stops">
          ${m.stops.map((s) => `<label><input type="radio" name="stops" value="${s}" ${s === S.stops ? "checked" : ""}><span>${s === "non-stop" ? "Non-stop" : s}</span></label>`).join("")}
        </div>
      </div>
      <p class="cap">In this data, the number of stops sets the expected fare. Airline, route and time did not change it.</p></div>`;
    $("#airline").onchange = (e) => { S.airline = e.target.value; updateNav(); };
    body.querySelectorAll("input[name=stops]").forEach((r) => (r.onchange = () => { S.stops = r.value; updateNav(); }));
  } else {
    body.innerHTML = `<div class="step-inner price-big">
      <h2>What price do you see?</h2>
      <label class="sr" for="price">Price in rupees</label>
      <span class="money"><i>₹</i><input type="number" id="price" min="1" step="1" inputmode="numeric" value="${S.price}" placeholder="0"></span>
      <p class="err" id="err" role="alert" hidden></p></div>`;
    const p = $("#price");
    p.oninput = () => { S.price = p.value; updateNav(); };
    p.onkeydown = (e) => { if (e.key === "Enter" && valid()) submit(); };
    p.focus();
  }
  updateNav();
}

/* ---------- check ---------- */
async function post(body) {
  const res = await fetch("/api/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Something went wrong");
  return data;
}
async function submit() {
  const body = { origin: S.from, dest: S.to, airline: S.airline, stops: S.stops, date: S.date, price: Number(S.price), method: S.useMethod };
  const btn = $("#next"); btn.disabled = true; btn.textContent = "Checking…";
  try {
    S.result = await post(body); S.req = body;
    renderResult(); location.hash = "#/result"; showPage();
  } catch (ex) {
    const err = $("#err"); if (err) { err.textContent = ex.message; err.hidden = false; }
  } finally { updateNav(); }
}

const saveMethod = () => { try { localStorage.setItem("fairfare_method", S.useMethod); } catch (e) {} };
async function ensureModels() {
  if (!S.models) { S.models = await (await fetch("/api/models")).json(); S.options = S.models.options; }
  if (!S.method) S.method = S.models.best;
  if (!S.useMethod) {
    let saved = null; try { saved = localStorage.getItem("fairfare_method"); } catch (e) {}
    S.useMethod = S.options.some((o) => o.model === saved) ? saved : S.models.best;
  }
}
async function applyMethod(m) {
  S.useMethod = m; saveMethod();
  if (S.req) { S.req = { ...S.req, method: m }; S.result = await post(S.req); renderResult(); if (!$("#page-result").hidden) drawChart(); }
}

/* ---------- result ---------- */
function renderResult() {
  const r = S.result, p = S.req.price, v = VERDICT[r.verdict], abs = Math.round(Math.abs(r.deviation_pct));
  const why = {
    underpriced: `${inr(p)} is ${abs}% below the expected ${inr(r.expected)}.`,
    fair: `${inr(p)} is within the normal range around ${inr(r.expected)}.`,
    overpriced: `${inr(p)} is ${abs}% above the expected ${inr(r.expected)}.`,
  }[r.verdict];

  const lo = Math.min(p, r.fair_low), hi = Math.max(p, r.fair_high);
  const pad = (hi - lo) * 0.2 || r.expected * 0.2, a = lo - pad, span = hi + pad - a;
  const pos = (x) => ((x - a) / span) * 100;
  const wide = window.innerWidth > 1400;
  const lu = pos(r.fair_low) < 22 || !wide ? "Under" : "Underpriced", lov = 100 - pos(r.fair_high) < 22 || !wide ? "Over" : "Overpriced";

  $("#r-verdict").className = "verdict " + r.verdict;
  $("#r-verdict").innerHTML = `
    <div>
      <div class="v-flight">${r.label} · ${S.req.origin} → ${S.req.dest} · ${fmtShort(S.req.date)} ${S.req.date.slice(0, 4)}${r.projected ? " · projected" : ""}</div>
      <div class="v-head">${ICON[r.verdict]}<span>${v.title}</span></div>
      <p class="v-why">${why}</p>
    </div>
    <div class="scale" aria-hidden="true">
      <div class="pin-row"><div class="pin" style="left:${pos(p)}%"><small>Your price</small>${inr(p)}</div></div>
      <div class="zones">
        <div class="z-u" style="width:${pos(r.fair_low)}%">${lu}</div>
        <div class="z-f" style="width:${pos(r.fair_high) - pos(r.fair_low)}%">Fair</div>
        <div class="z-o" style="width:${100 - pos(r.fair_high)}%">${lov}</div>
      </div>
      <div class="ticks"><span style="left:${pos(r.fair_low)}%">${inr(r.fair_low)}</span><span style="left:${pos(r.fair_high)}%">${inr(r.fair_high)}</span></div>
    </div>`;

  $("#r-stats").innerHTML = `
    <div class="stat"><div class="k">Expected fare</div><div class="v">${inr(r.expected)}</div><div class="n">for ${S.req.stops} on this date</div></div>
    <div class="stat"><div class="k">Fair range</div><div class="v">${inr(r.fair_low)} to ${inr(r.fair_high)}</div><div class="n">8 in 10 comparable fares</div></div>
    <div class="stat"><div class="k">Same-stops fares that cost less</div><div class="v">${r.peers.cost_less_pct}%</div><div class="n">of ${r.peers.count.toLocaleString("en-IN")} fares in the data</div></div>
    <div class="stat model"><label class="k" for="use-model">Forecast model</label>
      <select id="use-model">${S.options.map((o) => `<option value="${o.model}" ${o.model === S.useMethod ? "selected" : ""}>${o.rank}. ${o.model}${o.recommended ? " (recommended)" : ""}</option>`).join("")}</select>
      <div class="n">Ranked by accuracy, then simplicity</div></div>`;
  $("#use-model").onchange = (e) => applyMethod(e.target.value);

  $("#r-legend").innerHTML = '<span><i class="sw-pt"></i>Listed fares</span><span><i class="sw-weekly"></i>Weekly average</span><span><i class="sw-band"></i>Fair range</span><span><i class="sw-line"></i>Expected</span><span><i class="sw-you"></i>Your price</span>';

  $("#r-stops").innerHTML = '<span class="lbl">Other stops</span>' + Object.entries(r.by_stops).map(([s, e]) =>
    `<div class="schip ${s === S.req.stops ? "cur" : ""}">${s === "non-stop" ? "Non-stop" : s}<b>${inr(e)}</b></div>`).join("");
  $("#re-price").value = p;
}

/* ---------- charts (sized in rem so they scale with the page) ---------- */
function niceStep(range, n) {
  const raw = range / n, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}
const kfmt = (v) => (Math.abs(v) >= 1000 ? (v / 1000).toFixed(v % 1000 ? 1 : 0) + "k" : v);
function yearTicks(t0, t1, X, H, u, fs) {
  let s = "";
  for (let y = new Date(t0).getUTCFullYear() + 1; ; y++) {
    const t = Date.UTC(y, 0, 1); if (t > t1) break;
    s += `<text x="${X(t)}" y="${H - 0.5 * u}" text-anchor="middle" font-size="${fs}" fill="#5a6477">${y}</text>`;
  }
  return s;
}

function drawChart() {
  if (!S.result) return;
  const el = $("#chart"), c = S.result.chart, price = S.req.price, color = VERDICT[S.result.verdict].color;
  const W = el.clientWidth, H = el.clientHeight;
  if (!W || !H) return;
  const u = rem(), fs = (0.78 * u).toFixed(1);
  const m = { l: 3.6 * u, r: 0.9 * u, t: 0.7 * u, b: 1.9 * u }, iw = W - m.l - m.r, ih = H - m.t - m.b;
  const wk = c.weeks.map((d) => Date.parse(d)), t0 = wk[0], t1 = wk[wk.length - 1];
  const X = (t) => m.l + ((t - t0) / (t1 - t0)) * iw;
  const ymax = Math.max(...c.high, price, ...c.points.p) * 1.04;
  const step = niceStep(ymax, Math.max(3, Math.round(ih / (3.6 * u)))), top = Math.ceil(ymax / step) * step;
  const Y = (v) => m.t + ih - (v / top) * ih;

  let g = "";
  for (let v = 0; v <= top + 1e-9; v += step) g += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="#e3e7ee"/><text x="${m.l - 0.5 * u}" y="${Y(v) + 0.28 * u}" text-anchor="end" font-size="${fs}" fill="#5a6477">₹${kfmt(v)}</text>`;
  g += yearTicks(t0, t1, X, H, u, fs);

  const band = c.high.map((v, i) => `${X(wk[i])},${Y(v)}`).join(" ") + " " + c.low.map((v, i) => `${X(wk[i])},${Y(v)}`).reverse().join(" ");
  const line = c.expected.map((v, i) => `${i ? "L" : "M"}${X(wk[i])},${Y(v)}`).join(" ");
  const weekly = c.weekly_mean.map((v, i) => `${i ? "L" : "M"}${X(wk[i])},${Y(v)}`).join(" ");
  const pts = c.points.d.map((d, i) => `<circle cx="${X(Date.parse(d)).toFixed(1)}" cy="${Y(c.points.p[i]).toFixed(1)}" r="${(0.1 * u).toFixed(1)}"/>`).join("");
  const de = X(Date.parse(c.data_end));
  const proj = de < W - m.r ? `<rect x="${de}" y="${m.t}" width="${W - m.r - de}" height="${ih}" fill="#8a93a3" opacity=".1"/><text x="${de + 0.4 * u}" y="${m.t + 0.9 * u}" font-size="${fs}" fill="#5a6477">Projected</text>` : "";

  const sx = X(Date.parse(c.selected)), py = Y(price), nearTop = py < m.t + 2.4 * u;
  const you = `<line x1="${sx}" x2="${sx}" y1="${m.t}" y2="${m.t + ih}" stroke="${color}" stroke-dasharray="3 3" opacity=".7"/>
    <circle cx="${sx}" cy="${py}" r="${0.5 * u}" fill="${color}" stroke="#fff" stroke-width="2.5"/>
    <text x="${Math.max(m.l + 3 * u, Math.min(sx, W - 3.5 * u))}" y="${nearTop ? py + 1.7 * u : py - 0.9 * u}" text-anchor="middle" font-size="${(0.85 * u).toFixed(1)}" font-weight="700" fill="#0e1726" paint-order="stroke" stroke="#fff" stroke-width="4">Your price</text>`;

  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Listed fares over time with expected fare, fair range and your price">
      ${g}${proj}<g fill="#8a93a3" opacity=".35">${pts}</g>
      <polygon points="${band}" fill="#2a78d6" opacity=".16"/>
      <path d="${weekly}" fill="none" stroke="#0e1726" stroke-width="1" opacity=".6" stroke-linejoin="round"/>
      <path d="${line}" fill="none" stroke="#2a78d6" stroke-width="2.4"/>${you}
      <line id="cross" y1="${m.t}" y2="${m.t + ih}" stroke="#0e1726" opacity="0"/>
      <rect id="hit" x="${m.l}" y="${m.t}" width="${iw}" height="${ih}" fill="transparent"/></svg><div class="tip" id="tip" hidden></div>`;
  hover(el, W, u, (i) => ({
    x: X(wk[i]), y: Y(c.expected[i]),
    html: `<b>Week of ${fmtDate(c.weeks[i])}${wk[i] > Date.parse(c.data_end) ? " <i>(projected)</i>" : ""}</b>Expected ${inr(c.expected[i])}<br><i>Range ${inr(c.low[i])} to ${inr(c.high[i])}</i>${c.weekly_mean[i] ? `<br>Weekly average ${inr(c.weekly_mean[i])}` : ""}`,
  }), wk.length, (px) => Math.round(((px - m.l) / iw) * (wk.length - 1)));
}

function hover(el, W, u, info, n, idxOf) {
  const svg = el.querySelector("svg"), tip = el.querySelector("#tip"), cross = el.querySelector("#cross"), hit = el.querySelector("#hit");
  const move = (ev) => {
    const box = svg.getBoundingClientRect(), pt = ev.touches ? ev.touches[0] : ev;
    const i = Math.max(0, Math.min(n - 1, idxOf(pt.clientX - box.left)));
    const d = info(i);
    cross.setAttribute("x1", d.x); cross.setAttribute("x2", d.x); cross.setAttribute("opacity", ".3");
    tip.hidden = false; tip.innerHTML = d.html;
    tip.style.left = Math.max(7 * u, Math.min(W - 7 * u, d.x)) + "px";
    tip.style.top = Math.max(5 * u, d.y - 0.8 * u) + "px";
  };
  const hide = () => { tip.hidden = true; cross.setAttribute("opacity", "0"); };
  ["mousemove", "touchstart", "touchmove"].forEach((t) => hit.addEventListener(t, move, { passive: true }));
  ["mouseleave", "touchend"].forEach((t) => hit.addEventListener(t, hide));
}

/* ---------- models page ---------- */
let mData = null;
async function loadModels() {
  await ensureModels();
  renderTable();
  await loadForecast();
}
function renderTable() {
  const ml = S.models.ml;
  $("#m-table").innerHTML = `<thead><tr><th>#</th><th>Model</th><th>Error (₹)</th></tr></thead><tbody>` +
    S.options.map((o) => `<tr class="row ${o.model === S.method ? "sel" : ""}" data-m="${o.model}">
      <td class="rk">${o.rank}</td>
      <td><div class="mn">${o.model}${o.recommended ? '<span class="badge">Recommended</span>' : ""}${o.model === S.useMethod ? '<span class="badge act">In use</span>' : ""}</div><div class="ms">${o.note}</div></td>
      <td>${o.mae.toLocaleString("en-IN")}</td></tr>`).join("") +
    `<tr class="ml"><td></td><td><div class="mn">${ml.model}</div><div class="ms">Machine-learning comparison. Not selectable.</div></td><td>${ml.mae.toLocaleString("en-IN")}</td></tr></tbody>`;
  document.querySelectorAll("#m-table tr.row").forEach((tr) => (tr.onclick = () => { S.method = tr.dataset.m; renderTable(); loadForecast(); }));
  $("#m-note").textContent = "Models are nearly tied: after removing the stops effect, weekly fares have no trend or pattern, so a simple level is hard to beat.";
}
async function loadForecast() {
  const res = await fetch("/api/forecast?method=" + encodeURIComponent(S.method) + "&weeks=26");
  if (!res.ok) { $("#m-chart").innerHTML = '<p class="err">Could not load this forecast. Please try another model.</p>'; return; }
  mData = await res.json();
  $("#m-legend").innerHTML = '<span><i class="sw-line" style="border-color:#0e1726"></i>Actual fare level</span><span><i class="sw-fc"></i>Test forecast</span><span><i class="sw-line"></i>Future forecast</span><span><i class="sw-band"></i>Range</span>';
  const inUse = S.method === S.useMethod;
  $("#m-foot").innerHTML = `
    <div class="mini"><div class="k">Error on last 26 weeks</div><div class="v">${inr(mData.holdout.mae)}</div></div>
    <div class="mini"><div class="k">${S.method}</div>${inUse ? '<div class="v"><span class="badge act">In use</span></div>' : '<button type="button" class="btn primary sm" id="use-btn">Use in app</button>'}</div>`;
  const ub = $("#use-btn");
  if (ub) ub.onclick = async () => { await applyMethod(S.method); renderTable(); loadForecast(); };
  drawModelChart();
}
function drawModelChart() {
  const el = $("#m-chart"), d = mData;
  if (!d) return;
  const W = el.clientWidth, H = el.clientHeight;
  if (!W || !H) return;
  const u = rem(), fs = (0.78 * u).toFixed(1);
  const m = { l: 3.2 * u, r: 0.9 * u, t: 0.7 * u, b: 1.9 * u }, iw = W - m.l - m.r, ih = H - m.t - m.b;
  const all = [...d.history.v, ...d.holdout.actual, ...d.holdout.forecast, ...d.future.low, ...d.future.high];
  const ext = Math.max(Math.abs(Math.min(...all)), Math.max(...all)) * 1.1;
  const step = niceStep(ext * 2, 4), top = Math.ceil(ext / step) * step;
  const dates = [...d.history.d, ...d.holdout.d, ...d.future.d].map(Date.parse), t0 = dates[0], t1 = dates[dates.length - 1];
  const X = (t) => m.l + ((t - t0) / (t1 - t0)) * iw, Y = (v) => m.t + ih / 2 - (v / top) * (ih / 2);
  const path = (ds, vs) => ds.map((t, i) => `${i ? "L" : "M"}${X(Date.parse(t))},${Y(vs[i])}`).join(" ");

  let g = "";
  for (let v = -top; v <= top + 1e-9; v += step) g += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="${v === 0 ? "#b9bfcc" : "#e3e7ee"}"/><text x="${m.l - 0.5 * u}" y="${Y(v) + 0.28 * u}" text-anchor="end" font-size="${fs}" fill="#5a6477">${v > 0 ? "+" : ""}${kfmt(v)}</text>`;
  const tick = (i, a) => `<text x="${X(dates[i])}" y="${H - 0.5 * u}" text-anchor="${a}" font-size="${fs}" fill="#5a6477">${new Date(dates[i]).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" })}</text>`;
  g += tick(0, "start") + tick(Math.round(dates.length / 3), "middle") + tick(Math.round((dates.length * 2) / 3), "middle") + tick(dates.length - 1, "end");
  const xs = X(Date.parse(d.holdout.d[0])), xf = X(Date.parse(d.future.d[0]));
  const bandPts = d.future.d.map((t, i) => `${X(Date.parse(t))},${Y(d.future.high[i])}`).join(" ") + " " + d.future.d.map((t, i) => `${X(Date.parse(t))},${Y(d.future.low[i])}`).reverse().join(" ");
  const histPath = path([...d.history.d, ...d.holdout.d], [...d.history.v, ...d.holdout.actual]);

  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Fare level: history, test forecast and future forecast">
    ${g}
    <line x1="${xs}" x2="${xs}" y1="${m.t}" y2="${m.t + ih}" stroke="#8a93a3" stroke-dasharray="3 3"/><text x="${xs + 0.4 * u}" y="${m.t + 0.85 * u}" font-size="${fs}" fill="#5a6477">Test</text>
    <line x1="${xf}" x2="${xf}" y1="${m.t}" y2="${m.t + ih}" stroke="#8a93a3" stroke-dasharray="3 3"/><text x="${xf + 0.4 * u}" y="${m.t + 0.85 * u}" font-size="${fs}" fill="#5a6477">Future</text>
    <polygon points="${bandPts}" fill="#2a78d6" opacity=".16"/>
    <path d="${histPath}" fill="none" stroke="#0e1726" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="${path(d.holdout.d, d.holdout.forecast)}" fill="none" stroke="#2a78d6" stroke-width="2.4" stroke-dasharray="6 4"/>
    <path d="${path(d.future.d, d.future.forecast)}" fill="none" stroke="#2a78d6" stroke-width="2.4"/>
    <line id="cross" y1="${m.t}" y2="${m.t + ih}" stroke="#0e1726" opacity="0"/>
    <rect id="hit" x="${m.l}" y="${m.t}" width="${iw}" height="${ih}" fill="transparent"/></svg><div class="tip" id="tip" hidden></div>`;
  const hist = d.history.d.length, hold = d.holdout.d.length;
  hover(el, W, u, (i) => {
    const t = dates[i], x = X(t);
    let html = `<b>Week of ${fmtDate(new Date(t).toISOString().slice(0, 10))}</b>`, y = Y(0);
    if (i < hist) { html += `Actual ${inr(d.history.v[i])}`; y = Y(d.history.v[i]); }
    else if (i < hist + hold) { const j = i - hist; html += `Actual ${inr(d.holdout.actual[j])}<br>Forecast ${inr(d.holdout.forecast[j])}`; y = Y(d.holdout.actual[j]); }
    else { const j = i - hist - hold; html += `Forecast ${inr(d.future.forecast[j])}<br><i>Range ${inr(d.future.low[j])} to ${inr(d.future.high[j])}</i>`; y = Y(d.future.forecast[j]); }
    return { x, y, html };
  }, dates.length, (px) => Math.round(((px - m.l) / iw) * (dates.length - 1)));
}

/* ---------- how page ---------- */
async function renderHow() {
  await ensureModels();
  const order = ["Number of stops", "Airline", "Route", "Departure hour", "Duration", "Month", "Year"];
  const rows = S.models.drivers.filter((r) => order.includes(r.factor)).sort((a, b) => order.indexOf(a.factor) - order.indexOf(b.factor));
  $("#drivers").innerHTML = rows.map((r) => {
    const yes = r.effect === "Moves price";
    return `<span class="dv ${yes ? "yes" : "no"}">${yes ? ICON.yes : ICON.no}${r.factor}<small>${yes ? "moves fares" : "no effect"}</small></span>`;
  }).join("");
  $("#f-rows").textContent = S.meta.rows.toLocaleString("en-IN") + " fares";
}

/* ---------- events & start ---------- */
$("#next").onclick = () => (S.step < 3 ? goStep(S.step + 1) : submit());
$("#back").onclick = () => goStep(S.step - 1);
$("#recheck").onsubmit = async (e) => {
  e.preventDefault();
  const price = Number($("#re-price").value);
  if (!(price > 0)) return;
  try { S.req = { ...S.req, price, method: S.useMethod }; S.result = await post(S.req); S.price = price; renderResult(); drawChart(); }
  catch (ex) { alert(ex.message); }
};
$("#example").onclick = () => {
  Object.assign(S, { from: "Delhi", to: "Mumbai", date: "2024-06-15", airline: "IndiGo", stops: "1 stop", price: 13500, step: 3, maxStep: 3 });
  renderStep(); submit();
};

(async function init() {
  S.meta = await (await fetch("/api/meta")).json();
  await ensureModels();
  renderStep(); showPage();
})();