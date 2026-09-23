/* ============================================================
   เครื่องคำนวณ — พื้นที่พรม (ฟุต/นิ้ว → ตร.ม., วงกลม, วงรี, พื้นที่ Blank) และขนาดม้วนพรม
   สูตรอ้างอิงจากตาราง Excel ของฝ่ายผลิต (วิธีการคำนวณพรมเวลาม้วน / สูตรพื้นที่)
   ต้องโหลดหลัง app.js (ใช้ toast)
   ============================================================ */
(function () {
  "use strict";
  const FT_CM = 30.48, IN_CM = 2.54, SQFT_TO_SQM = 0.09290304;
  const $ = (s, r = document) => r.querySelector(s);
  const num = (v) => { const n = parseFloat(String(v).replace(/,/g, "")); return Number.isFinite(n) ? n : 0; };
  const has = (v) => String(v).trim() !== "" && Number.isFinite(parseFloat(String(v).replace(/,/g, "")));
  const fmt = (n, d = 2) => (Number.isFinite(n) ? n : 0).toLocaleString("th-TH", { minimumFractionDigits: d, maximumFractionDigits: d });
  const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------- สูตร (ฟังก์ชันล้วน ทดสอบได้) ---------- */
  const ftInToCm = (ft, inch) => num(ft) * FT_CM + num(inch) * IN_CM;
  // 1) สี่เหลี่ยม: กว้าง/ยาว เป็นฟุต+นิ้ว → ซม. → ม. → ตร.ม. และ ตร.ฟุต
  function ftInArea(wFt, wIn, lFt, lIn, qty) {
    const wCm = ftInToCm(wFt, wIn), lCm = ftInToCm(lFt, lIn), wM = wCm / 100, lM = lCm / 100;
    const sqm = wM * lM, sqft = (wCm / FT_CM) * (lCm / FT_CM), q = qty === undefined || qty === "" ? 1 : num(qty);
    return { wCm, lCm, wM, lM, sqm, sqft, qty: q, totalSqm: sqm * q, totalSqft: sqft * q };
  }
  const toMeter = (v, unit) => ({ m: 1, cm: 0.01, ft: FT_CM / 100, in: IN_CM / 100 }[unit] || 1) * num(v);
  // 2) วงกลม: ใส่เส้นผ่านศูนย์กลาง → r, พื้นที่ = π r², บวกเผื่อ %
  function circle(diameter, unit, pi, allowPct, qty) {
    const dM = toMeter(diameter, unit), r = dM / 2, area = pi * r * r, allow = area * (num(allowPct) / 100), q = qty === undefined || qty === "" ? 1 : num(qty);
    return { dM, r, area, allow, total: area + allow, qty: q, grand: (area + allow) * q };
  }
  // 3) วงรี: พื้นที่ = π × D × d / 4 (D แกนเอก, d แกนโท)
  function oval(D, d, unit, pi, allowPct, qty) {
    const DM = toMeter(D, unit), dM = toMeter(d, unit), area = (pi * DM * dM) / 4, allow = area * (num(allowPct) / 100), q = qty === undefined || qty === "" ? 1 : num(qty);
    return { DM, dM, area, allow, total: area + allow, qty: q, grand: (area + allow) * q };
  }
  // 4) พื้นที่ Blank: Design = กว้าง × ยาว, Blank = Design × %, พรมจริง = Design − Blank
  function blank(w, l, plan, opts) {
    const design = num(w) * num(l);
    let blankArea, pct;
    if (opts && opts.by === "area") { blankArea = num(opts.area); pct = design > 0 ? (blankArea / design) * 100 : 0; }
    else { pct = num(opts && opts.pct); blankArea = design * (pct / 100); }
    return { design, blankArea, pct, actual: design - blankArea, plan: num(plan), planPct: design > 0 ? (num(plan) / design) * 100 : 0 };
  }
  // 5) ม้วนพรม: ความหนา t = pile + backing (มม.); รอบที่ k มีเส้นผ่านศูนย์กลาง D_k = D0 + 2·k·t; ความยาวสะสม L_n = π·ΣD_k/100 (เมตร)
  const rollT = (pileMm, backMm) => num(pileMm) + num(backMm);
  const rollDia = (n, d0, tMm) => num(d0) + 2 * n * (num(tMm) / 10);
  const rollLen = (n, d0, tMm) => { const t = num(tMm) / 10, D0 = num(d0); return (Math.PI / 100) * (n * D0 + t * n * (n + 1)); };
  function rollTable(d0, tMm, count) {
    const rows = [];
    for (let n = 1; n <= count; n++) rows.push({ n, len: rollLen(n, d0, tMm), dia: rollDia(n, d0, tMm) });
    return rows;
  }
  function rollFromLength(lenM, d0, tMm) { // หารอบ/เส้นผ่านศูนย์กลางจากความยาวพรม (แก้สมการกำลังสอง)
    const t = num(tMm) / 10, D0 = num(d0), L = num(lenM);
    if (t <= 0 || L <= 0) return { n: 0, dia: D0 };
    const k = (100 * L) / Math.PI, b = D0 + t, n = (-b + Math.sqrt(b * b + 4 * t * k)) / (2 * t);
    return { n, dia: D0 + 2 * t * n };
  }
  function rollLengthFromDia(diaCm, d0, tMm) {
    const t = num(tMm) / 10, D0 = num(d0), n = t > 0 ? Math.max(0, (num(diaCm) - D0) / (2 * t)) : 0;
    return { n, len: rollLen(n, D0, tMm) };
  }

  /* ---------- หน้าจอ ---------- */
  const PI_OPTS = { "22/7": 22 / 7, "3.14": 3.14, "pi": Math.PI };
  const state = { blankBy: "pct" };

  function field(id, label, attrs = "", extra = "") {
    return `<label class="cf">${label}<input id="${id}" inputmode="decimal" ${attrs}>${extra}</label>`;
  }
  const unitSel = (id, def = "m") => `<select id="${id}">${[["m", "เมตร"], ["cm", "ซม."], ["ft", "ฟุต"], ["in", "นิ้ว"]].map(([v, t]) => `<option value="${v}" ${v === def ? "selected" : ""}>${t}</option>`).join("")}</select>`;
  const piSel = (id, def) => `<select id="${id}"><option value="22/7" ${def === "22/7" ? "selected" : ""}>22/7 (ตามตารางเดิม)</option><option value="3.14" ${def === "3.14" ? "selected" : ""}>3.14 (ตามตารางเดิม)</option><option value="pi" ${def === "pi" ? "selected" : ""}>π = 3.14159265</option></select>`;
  const res = (label, id, cls = "") => `<div class="cr ${cls}"><small>${label}</small><strong id="${id}">-</strong></div>`;

  function build() {
    const root = $("#calcView");
    root.innerHTML = `
      <section class="page-heading">
        <div>
          <p class="eyebrow">CALCULATOR</p>
          <h1>เครื่องคำนวณพื้นที่พรมและม้วนพรม</h1>
          <p class="subtitle">แปลงฟุต/นิ้วเป็น ตร.ม. · พื้นที่วงกลม/วงรี · พื้นที่ Blank · ขนาดม้วนพรม — สูตรตามตาราง Excel ของฝ่ายผลิต กรอกแล้วคำนวณทันที</p>
        </div>
        <div class="heading-actions"><button data-calc="reset">ล้างทุกช่อง</button></div>
      </section>
      <div class="calc-grid">
        <section class="department-panel calc-card" data-card="ft">
          <div class="panel-heading"><div><strong>1) ฟุต / นิ้ว → ตารางเมตร</strong><small>1 ฟุต = 30.48 ซม. · 1 นิ้ว = 2.54 ซม. · 1 ตร.ฟุต = 0.09290304 ตร.ม.</small></div></div>
          <div class="calc-body">
            <div class="calc-row"><span class="cl">กว้าง</span>${field("ftWf", "ฟุต")}${field("ftWi", "นิ้ว")}<span class="cx">×</span><span class="cl">ยาว</span>${field("ftLf", "ฟุต")}${field("ftLi", "นิ้ว")}${field("ftQ", "จำนวน (ชิ้น)", 'value="1"')}</div>
            <div class="calc-res">${res("กว้าง (ซม.)", "ftWcm")}${res("ยาว (ซม.)", "ftLcm")}${res("กว้าง (ม.)", "ftWm")}${res("ยาว (ม.)", "ftLm")}${res("พื้นที่ 1 ชิ้น (ตร.ม.)", "ftSqm", "main")}${res("พื้นที่ 1 ชิ้น (ตร.ฟุต)", "ftSqft")}${res("รวมทุกชิ้น (ตร.ม.)", "ftTot", "main")}${res("รวมทุกชิ้น (ตร.ฟุต)", "ftTotFt")}</div>
            <div class="calc-actions"><button class="action-button" data-copy="ftSqm">คัดลอก ตร.ม. ต่อชิ้น</button><button class="action-button" data-copy="ftTot">คัดลอก ตร.ม. รวม</button></div>
            <div class="calc-row quick"><span class="cl">แปลงตรง ๆ</span>${field("qFt", "ตร.ฟุต")}<span class="cx">⇄</span>${field("qM", "ตร.ม.")}</div>
          </div>
        </section>

        <section class="department-panel calc-card" data-card="circle">
          <div class="panel-heading"><div><strong>2) พื้นที่วงกลม</strong><small>พื้นที่ = π × r² (r = เส้นผ่านศูนย์กลาง ÷ 2) · ตารางเดิมใช้ 22/7 และเผื่อ 10%</small></div></div>
          <div class="calc-body">
            <div class="calc-row">${field("ciD", "เส้นผ่านศูนย์กลาง")}<label class="cf">หน่วย${unitSel("ciU")}</label><label class="cf">ค่า π${piSel("ciPi", "22/7")}</label>${field("ciA", "เผื่อ (%)", 'value="10"')}${field("ciQ", "จำนวน (ชิ้น)", 'value="1"')}</div>
            <div class="calc-res">${res("รัศมี r (ม.)", "ciR")}${res("พื้นที่ (ตร.ม.)", "ciArea")}${res("ส่วนเผื่อ (ตร.ม.)", "ciAllow")}${res("พื้นที่รวมเผื่อ (ตร.ม.)", "ciTot", "main")}${res("รวมทุกชิ้น (ตร.ม.)", "ciGrand", "main")}</div>
            <div class="calc-actions"><button class="action-button" data-copy="ciTot">คัดลอก ตร.ม. (รวมเผื่อ)</button></div>
          </div>
        </section>

        <section class="department-panel calc-card" data-card="oval">
          <div class="panel-heading"><div><strong>3) พื้นที่วงรี</strong><small>พื้นที่ = π × D × d ÷ 4 (D = ความยาวแกนเอก, d = ความยาวแกนโท) · ตารางเดิมใช้ π = 3.14</small></div></div>
          <div class="calc-body">
            <div class="calc-row">${field("ovD", "D (แกนเอก)")}${field("ovd", "d (แกนโท)")}<label class="cf">หน่วย${unitSel("ovU")}</label><label class="cf">ค่า π${piSel("ovPi", "3.14")}</label>${field("ovA", "เผื่อ (%)", 'value="10"')}${field("ovQ", "จำนวน (ชิ้น)", 'value="1"')}</div>
            <div class="calc-res">${res("พื้นที่ (ตร.ม.)", "ovArea")}${res("ส่วนเผื่อ (ตร.ม.)", "ovAllow")}${res("พื้นที่รวมเผื่อ (ตร.ม.)", "ovTot", "main")}${res("รวมทุกชิ้น (ตร.ม.)", "ovGrand", "main")}</div>
            <div class="calc-actions"><button class="action-button" data-copy="ovTot">คัดลอก ตร.ม. (รวมเผื่อ)</button></div>
          </div>
        </section>

        <section class="department-panel calc-card" data-card="blank">
          <div class="panel-heading"><div><strong>4) พื้นที่ Blank / พื้นที่พรมจริง</strong><small>Design = กว้าง × ยาว · Blank = Design × % (หรือกรอกพื้นที่ Blank แล้วคิด %) · พรมจริง = Design − Blank</small></div></div>
          <div class="calc-body">
            <div class="calc-row">${field("blW", "ขนาดกว้าง (ม.)")}${field("blL", "ขนาดยาว (ม.)")}${field("blPlan", "พื้นที่ตาม Plan (ตร.ม.)")}${field("blPct", "เปอร์เซ็นต์ Blank (%)")}${field("blArea", "พื้นที่ว่าง Blank (ตร.ม.)")}</div>
            <div class="calc-res">${res("พื้นที่ Design พรม (ตร.ม.)", "blDesign", "main")}${res("เปอร์เซ็นต์ Blank", "blPctR")}${res("พื้นที่ว่าง Blank (ตร.ม.)", "blAreaR")}${res("พื้นที่พรมจริง (ตร.ม.)", "blActual", "main")}${res("Plan ÷ Design", "blPlanPct")}</div>
            <div class="calc-actions"><button class="action-button" data-copy="blActual">คัดลอก ตร.ม. พรมจริง</button></div>
          </div>
        </section>

        <section class="department-panel calc-card wide" data-card="roll">
          <div class="panel-heading"><div><strong>5) ขนาดม้วนพรม (เส้นผ่านศูนย์กลางม้วน)</strong><small>ความหนาพรม = Fin Pile high + Backing (ปกติ 4 มม., ทากาว 2 ครั้ง 5 มม.) · รอบที่ n: D = แกน + 2·n·ความหนา · ความยาวสะสม = π × ΣD ÷ 100</small></div></div>
          <div class="calc-body">
            <div class="calc-row">${field("rlPile", "Fin Pile high (มม.)", 'value="10"')}<label class="cf">ความหนา Backing (มม.)<select id="rlBack"><option value="4" selected>4 (ปกติ)</option><option value="5">5 (ทากาว 2 ครั้ง)</option></select></label><label class="cf">แกนกระดาษ<select id="rlCore"><option value="12.15" selected>ใหญ่ 12.15 ซม.</option><option value="7">เล็ก 7.00 ซม.</option></select></label>${field("rlLen", "ความยาวพรมจริง (ม.)", 'placeholder="กรอกเพื่อหาเส้นผ่านศูนย์กลาง"')}${field("rlDia", "หรือ เส้นผ่านศูนย์กลางม้วน (ซม.)", 'placeholder="กรอกเพื่อหาความยาว"')}</div>
            <div class="calc-res">${res("ความหนาพรม (มม.)", "rlT")}${res("จำนวนรอบที่ม้วน", "rlN", "main")}${res("เส้นผ่านศูนย์กลางม้วน (ซม.)", "rlD", "main")}${res("ความยาวพรมที่ม้วนได้ (ม.)", "rlL")}</div>
            <div class="roll-scroll"><table class="calc-table"><thead><tr><th>ม้วนพรมรอบที่</th><th class="num">ความยาวพรม (เมตร)</th><th class="num">เส้นผ่านศูนย์กลาง (ซม.)</th></tr></thead><tbody id="rlBody"></tbody></table></div>
          </div>
        </section>
      </div>`;
  }

  const set = (id, v) => { const el = $("#" + id); if (el) el.textContent = v; };
  const val = (id) => ($("#" + id) ? $("#" + id).value : "");

  function calcFt() {
    const r = ftInArea(val("ftWf"), val("ftWi"), val("ftLf"), val("ftLi"), val("ftQ"));
    set("ftWcm", fmt(r.wCm)); set("ftLcm", fmt(r.lCm)); set("ftWm", fmt(r.wM, 4)); set("ftLm", fmt(r.lM, 4));
    set("ftSqm", fmt(r.sqm)); set("ftSqft", fmt(r.sqft)); set("ftTot", fmt(r.totalSqm)); set("ftTotFt", fmt(r.totalSqft));
  }
  function calcCircle() {
    const r = circle(val("ciD"), val("ciU"), PI_OPTS[val("ciPi")], val("ciA"), val("ciQ"));
    set("ciR", fmt(r.r, 3)); set("ciArea", fmt(r.area)); set("ciAllow", fmt(r.allow)); set("ciTot", fmt(r.total)); set("ciGrand", fmt(r.grand));
  }
  function calcOval() {
    const r = oval(val("ovD"), val("ovd"), val("ovU"), PI_OPTS[val("ovPi")], val("ovA"), val("ovQ"));
    set("ovArea", fmt(r.area)); set("ovAllow", fmt(r.allow)); set("ovTot", fmt(r.total)); set("ovGrand", fmt(r.grand));
  }
  function calcBlank() {
    const byArea = state.blankBy === "area";
    const r = blank(val("blW"), val("blL"), val("blPlan"), byArea ? { by: "area", area: val("blArea") } : { by: "pct", pct: val("blPct") });
    if (byArea) { if (document.activeElement !== $("#blPct")) $("#blPct").value = has(val("blArea")) ? String(Math.round(r.pct * 100) / 100) : ""; }
    else if (document.activeElement !== $("#blArea")) $("#blArea").value = has(val("blPct")) ? String(Math.round(r.blankArea * 10000) / 10000) : "";
    set("blDesign", fmt(r.design)); set("blPctR", fmt(r.pct) + "%"); set("blAreaR", fmt(r.blankArea)); set("blActual", fmt(r.actual)); set("blPlanPct", r.plan ? fmt(r.planPct) + "%" : "-");
  }
  function calcRoll() {
    const d0 = num(val("rlCore")), tMm = rollT(val("rlPile"), val("rlBack"));
    set("rlT", fmt(tMm, 1));
    let hi = 0, tn = 0;
    if (has(val("rlLen")) && num(val("rlLen")) > 0) {
      const r = rollFromLength(val("rlLen"), d0, tMm);
      set("rlN", fmt(r.n, 1)); set("rlD", fmt(r.dia)); set("rlL", fmt(num(val("rlLen")))); hi = num(val("rlLen")); tn = r.n;
    } else if (has(val("rlDia")) && num(val("rlDia")) > 0) {
      const r = rollLengthFromDia(val("rlDia"), d0, tMm);
      set("rlN", fmt(r.n, 1)); set("rlD", fmt(num(val("rlDia")))); set("rlL", fmt(r.len)); hi = r.len; tn = r.n;
    } else { set("rlN", "-"); set("rlD", "-"); set("rlL", "-"); }
    const count = Math.min(100, Math.max(30, Math.ceil(tn) + 2));
    const rows = rollTable(d0, tMm, count), target = hi > 0 ? Math.ceil(tn) : 0;
    $("#rlBody").innerHTML = rows.map((r) => `<tr class="${r.n === target ? "hit" : ""}"><td>${r.n}</td><td class="num">${fmt(r.len)}</td><td class="num">${fmt(r.dia)}</td></tr>`).join("");
  }
  const calcAll = () => { calcFt(); calcCircle(); calcOval(); calcBlank(); calcRoll(); };

  let built = false;
  function renderCalc() {
    if (!built) { build(); built = true; bind(); }
    calcAll();
  }
  function bind() {
    const root = $("#calcView");
    root.addEventListener("input", (e) => {
      const id = e.target.id, card = e.target.closest("[data-card]");
      if (!card) return;
      if (id === "qFt") { $("#qM").value = has(e.target.value) ? String(Math.round(num(e.target.value) * SQFT_TO_SQM * 10000) / 10000) : ""; return; }
      if (id === "qM") { $("#qFt").value = has(e.target.value) ? String(Math.round((num(e.target.value) / SQFT_TO_SQM) * 10000) / 10000) : ""; return; }
      if (id === "blPct") state.blankBy = "pct";
      if (id === "blArea") state.blankBy = "area";
      if (id === "rlLen" && has(e.target.value)) $("#rlDia").value = "";
      if (id === "rlDia" && has(e.target.value)) $("#rlLen").value = "";
      ({ ft: calcFt, circle: calcCircle, oval: calcOval, blank: calcBlank, roll: calcRoll })[card.dataset.card]();
    });
    root.addEventListener("click", (e) => {
      const b = e.target.closest("[data-copy],[data-calc]");
      if (!b) return;
      if (b.dataset.calc === "reset") {
        root.querySelectorAll("input").forEach((i) => { i.value = i.defaultValue; });
        root.querySelectorAll("select").forEach((s) => { s.selectedIndex = [...s.options].findIndex((o) => o.defaultSelected) < 0 ? 0 : [...s.options].findIndex((o) => o.defaultSelected); });
        state.blankBy = "pct"; calcAll(); return;
      }
      const text = ($("#" + b.dataset.copy).textContent || "").replace(/,/g, "");
      try { navigator.clipboard.writeText(text).then(() => toast(`คัดลอก ${text} แล้ว`), () => toast(`ค่า: ${text}`)); } catch (err) { toast(`ค่า: ${text}`); }
    });
  }

  window.renderCalc = renderCalc;
  window.CalcEngine = { ftInArea, circle, oval, blank, rollT, rollDia, rollLen, rollTable, rollFromLength, rollLengthFromDia, FT_CM, IN_CM, SQFT_TO_SQM };
})();
