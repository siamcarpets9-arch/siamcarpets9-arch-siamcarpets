/* ============================================================
   แผนกสโตร์ (Store)
   1) เบิกเข้า-ออกวัตถุดิบ — บัญชีทั่วไป กรอกชื่อวัตถุดิบเองได้ทุกประเภท (ไหม/ผ้าใบ/กาว/อื่นๆ)
      เพิ่ม/ลบรายการได้เอง มียอดคงเหลือสรุปต่อรายการวัตถุดิบให้ด้วย
   2) รับเข้า/ตัดออก สินค้าสำเร็จรูป (M/O,S/O + ตร.ม.) — ดึงจากข้อมูลเดิมในระบบอัตโนมัติ ไม่ต้องคีย์ซ้ำ:
      - "รับเข้า Store" = งานที่ผ่าน QC ตกแต่งครบทุกชิ้นแล้ว (สถานะ dept "done" ตาม OverviewEngine)
        วันที่รับเข้า = วันที่ QC ผ่าน (ผลตรวจ "ผ่าน") ล่าสุดของแผนกตกแต่งสำหรับงานนั้น
      - "ตัดออก" = งานที่มีวันที่ส่งจริงแล้ว (shipDateOf) — บันทึกอัตโนมัติทันทีที่เพิ่มรายการ M/O,S/O นั้นเข้า
        "ใบส่งสินค้า/Marks&Nos" ในหน้า Shipping (ไม่ต้องรอเลข INVOICE) หรือกดยืนยันเองที่ปุ่ม "ยืนยันส่งจริง"
        ในหน้ารายงานขาย (กรณีพิเศษ/ข้อมูลนำเข้าเก่าที่ไม่ได้ผ่านใบส่งนี้)
   ต้องโหลดหลัง app.js, sales.js, weave-floor.js, overview.js
   (ใช้ designs, $, $$, toast, esc, SalesEngine, WeaveFloorEngine, OverviewEngine)
   ============================================================ */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const num = (v) => { const n = parseFloat(String(v == null ? "" : v).replace(/,/g, "")); return Number.isFinite(n) ? n : 0; };
  const has = (v) => String(v == null ? "" : v).trim() !== "";
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n, d = 2) => { const x = typeof n === "number" ? n : parseFloat(String(n == null ? "" : n).replace(/,/g, "")); return (Number.isFinite(x) ? x : 0).toLocaleString("th-TH", { minimumFractionDigits: d, maximumFractionDigits: d }); };
  const readJson = (k, fb) => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : fb; } catch (e) { return fb; } };
  const writeJson = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* บันทึกไม่ได้ก็ยังใช้ต่อได้ */ } };
  const uid = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const field = (label, inner) => `<label class="pf">${label}${inner}</label>`;
  const res = (label, value, cls = "") => `<div class="pr ${cls}"><small>${label}</small><strong>${value}</strong></div>`;
  const todayIso = () => new Date().toISOString().slice(0, 10);

  const KEY_LEDGER = "siam-store-raw-material-ledger"; // [{id,date,direction:"in"|"out",materialName,unit,qty,refNo,note,createdAt}]

  const state = { fgQuery: "", fgFilter: "all", fgSelected: new Set(), fgBulkDate: todayIso() };

  /* ============================================================
     1) เบิกเข้า-ออกวัตถุดิบ — บัญชีทั่วไป
     ============================================================ */
  function loadLedger() { return readJson(KEY_LEDGER, []); }
  function saveLedger(list) { writeJson(KEY_LEDGER, list); }
  function addLedgerEntry(entry) { const list = loadLedger(); list.push({ id: uid("mat"), createdAt: new Date().toISOString(), ...entry }); saveLedger(list); return list; }
  function deleteLedgerEntry(id) { saveLedger(loadLedger().filter((e) => e.id !== id)); }

  function materialBalances() {
    const map = new Map();
    loadLedger().forEach((e) => {
      const key = `${String(e.materialName || "").trim().toUpperCase()}|${String(e.unit || "").trim().toUpperCase()}`;
      if (!map.has(key)) map.set(key, { materialName: e.materialName, unit: e.unit, in: 0, out: 0 });
      const row = map.get(key);
      if (e.direction === "in") row.in += num(e.qty); else row.out += num(e.qty);
    });
    return [...map.values()].map((r) => ({ ...r, balance: r.in - r.out })).sort((a, b) => String(a.materialName).localeCompare(String(b.materialName)));
  }

  function ledgerFormHtml() {
    return `
    <section class="department-panel pw-card wide">
      <div class="panel-heading"><div><strong>บันทึกรายการเบิก/รับวัตถุดิบ</strong><small>กรอกชื่อวัตถุดิบเองได้ทุกประเภท (ไหม, ผ้าใบ, กาว, อะไหล่ ฯลฯ)</small></div></div>
      <div class="pw-body">
        <form id="storeLedgerForm" class="pw-row store-ledger-form">
          ${field("วันที่", `<input type="date" name="date" value="${esc(todayIso())}" required>`)}
          ${field("รายการ", `<select name="direction"><option value="in">รับเข้า</option><option value="out">เบิกออก</option></select>`)}
          ${field("ชื่อวัตถุดิบ", `<input type="text" name="materialName" placeholder="เช่น ไหมขนสัตว์ Tex360, ผ้าใบหน้า 5 เมตร, กาวลาเท็กซ์" required style="min-width:220px">`)}
          ${field("จำนวน", `<input type="text" name="qty" inputmode="decimal" placeholder="0" required class="pw-num">`)}
          ${field("หน่วย", `<input type="text" name="unit" placeholder="กก./ม./ม้วน/ชิ้น" style="min-width:90px">`)}
          ${field("อ้างอิง (M/O, ใบสั่งซื้อ ฯลฯ)", `<input type="text" name="refNo" placeholder="ถ้ามี">`)}
          ${field("หมายเหตุ", `<input type="text" name="note" placeholder="ถ้ามี" style="min-width:160px">`)}
          <button type="submit" class="action-button primary">บันทึกรายการ</button>
        </form>
      </div>
    </section>`;
  }

  function ledgerRowHtml(e) {
    return `<tr>
      <td>${esc(e.date || "-")}</td>
      <td><span class="status-tag ${e.direction === "in" ? "" : "blocked"}">${e.direction === "in" ? "รับเข้า" : "เบิกออก"}</span></td>
      <td><strong>${esc(e.materialName)}</strong></td>
      <td class="num">${fmt(num(e.qty), 2)} ${esc(e.unit || "")}</td>
      <td>${esc(e.refNo || "-")}</td>
      <td>${esc(e.note || "-")}</td>
      <td><button type="button" class="text-button" data-del-ledger="${esc(e.id)}" title="ลบรายการนี้ทิ้ง">ลบ</button></td>
    </tr>`;
  }

  function balanceRowHtml(r) {
    const negative = r.balance < -0.0005;
    return `<tr>
      <td><strong>${esc(r.materialName)}</strong></td>
      <td>${esc(r.unit || "-")}</td>
      <td class="num">${fmt(r.in, 2)}</td>
      <td class="num">${fmt(r.out, 2)}</td>
      <td class="num ${negative ? "store-balance-neg" : ""}"><strong>${fmt(r.balance, 2)}</strong>${negative ? " ⚠" : ""}</td>
    </tr>`;
  }

  function materialLedgerSectionHtml() {
    const list = loadLedger().slice().sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.createdAt || "").localeCompare(a.createdAt || ""));
    const balances = materialBalances();
    return `
    ${ledgerFormHtml()}
    <section class="department-panel pw-card wide">
      <div class="panel-heading"><div><strong>ยอดคงเหลือวัตถุดิบ (สรุปตามรายการ)</strong><small>รับเข้าสะสม − เบิกออกสะสม ของแต่ละชื่อวัตถุดิบ+หน่วย</small></div></div>
      <div class="pw-body">
        ${balances.length ? `<table class="calc-table"><thead><tr><th>วัตถุดิบ</th><th>หน่วย</th><th class="num">รับเข้าสะสม</th><th class="num">เบิกออกสะสม</th><th class="num">คงเหลือ</th></tr></thead><tbody>${balances.map(balanceRowHtml).join("")}</tbody></table>` : `<p class="col-empty">ยังไม่มีรายการ</p>`}
      </div>
    </section>
    <section class="department-panel pw-card wide">
      <div class="panel-heading"><div><strong>ประวัติรายการเบิกเข้า-ออกวัตถุดิบ</strong><small>${list.length} รายการ</small></div></div>
      <div class="pw-body">
        ${list.length ? `<table class="calc-table"><thead><tr><th>วันที่</th><th>รายการ</th><th>ชื่อวัตถุดิบ</th><th class="num">จำนวน</th><th>อ้างอิง</th><th>หมายเหตุ</th><th></th></tr></thead><tbody>${list.map(ledgerRowHtml).join("")}</tbody></table>` : `<p class="col-empty">ยังไม่มีรายการเบิก/รับวัตถุดิบ — บันทึกรายการแรกด้านบน</p>`}
      </div>
    </section>`;
  }

  /* ============================================================
     2) สินค้าสำเร็จรูป — รับเข้า/ตัดออก (ดึงจากข้อมูลเดิมอัตโนมัติ)
     ============================================================ */
  // ใช้ตัวจับคู่ doc ฝ่ายขาย <-> design record ชุดเดียวกับ OverviewEngine (เทียบ designId ก่อน แล้ว fallback ไปเทียบ
  // เลข M/O,S/O ให้ข้อมูลเก่าที่ designId ไม่ตรง/ไม่มี ยังจับคู่ได้ถูก) กันตรรกะเพี้ยนถ้าเขียนแยกกันคนละที่
  function docOfDesign(id) {
    const OE = window.OverviewEngine;
    if (OE && typeof OE.docForDesign === "function") return OE.docForDesign(id);
    const SE = window.SalesEngine;
    return SE && typeof SE.getDocs === "function" ? SE.getDocs().find((x) => x.designId === id) : null;
  }
  function sqmOfDesign(id) {
    const doc = docOfDesign(id);
    if (!doc || !Array.isArray(doc.lines)) return 0;
    return doc.lines.reduce((t, l) => t + num(l.sqm), 0);
  }
  function moNoOfDesign(d) {
    const doc = docOfDesign(d.id);
    return (doc && doc.no) || d.moNo || "-";
  }
  function receivedDateOf(id) {
    const WF = window.WeaveFloorEngine;
    if (!WF || typeof WF.loadQc !== "function") return null;
    const passes = WF.loadQc().filter((q) => q.designId === id && q.dept === "finishing" && q.result === "ผ่าน").map((q) => q.date).filter(Boolean).sort();
    return passes.length ? passes[passes.length - 1] : null;
  }

  // ตัดออกหลายรายการพร้อมกัน (สำหรับ M/O,S/O เก่าที่ส่งจริงไปแล้วในอดีต ไม่ต้องไล่กดยืนยันทีละใบ) — เขียน
  // doc.actualShip ตรงๆ เหมือนปุ่ม "ยืนยันส่งจริง" ในหน้าขาย/การเพิ่มเข้าใบส่งของในหน้า Shipping ทุกจุดจึงอ่านค่าตรงกัน
  function bulkMarkShipped(designIds, shipDate) {
    const SE = window.SalesEngine;
    if (!SE || typeof SE.getDocs !== "function") return 0;
    const date = shipDate || todayIso();
    let n = 0;
    designIds.forEach((id) => {
      const doc = docOfDesign(id);
      if (doc) { doc.actualShip = date; n++; }
    });
    if (n && typeof SE.saveDocs === "function") SE.saveDocs();
    return n;
  }

  function finishedGoodsRows() {
    const OE = window.OverviewEngine;
    if (!OE) return [];
    return OE.jobs()
      .map((d) => ({ d, st: OE.statusOf(d), type: OE.typeOf(d) }))
      .filter((r) => r.st.dept === "done")
      .map((r) => ({ d: r.d, type: r.type, shipped: r.st.state === "done", shipDate: r.st.state === "done" ? r.st.updatedAt : null, sqm: sqmOfDesign(r.d.id), moNo: moNoOfDesign(r.d), receivedDate: receivedDateOf(r.d.id) }));
  }

  function fgRowHtml(r) {
    const checked = state.fgSelected.has(r.d.id);
    return `<tr>
      <td>${r.shipped ? "" : `<input type="checkbox" data-fg-select="${esc(r.d.id)}" ${checked ? "checked" : ""}>`}</td>
      <td><span class="status-tag">${esc(r.type)}</span></td>
      <td><strong>${esc(r.moNo)}</strong><small>${esc(r.d.id)}</small></td>
      <td>${esc(r.d.customer || "-")}<small>${esc(r.d.project || "-")}</small></td>
      <td class="num"><strong>${fmt(r.sqm, 2)}</strong></td>
      <td>${esc(r.receivedDate || "ไม่ทราบวันที่แน่ชัด")}</td>
      <td>${r.shipped ? `<span class="status-tag blocked">ตัดออกแล้ว (${esc(r.shipDate || "")})</span>` : `<span class="status-tag">อยู่ใน Store</span>`}</td>
    </tr>`;
  }

  // ใช้ตัวกรอง (สถานะ + คำค้นหา) ชุดเดียวกันทั้งตอนวาดตาราง และตอนคำนวณว่าปุ่ม "เลือกทั้งหมดที่แสดง" ควรเลือกอะไรบ้าง
  // กันไม่ให้ตรรกะสองที่เพี้ยนไปคนละทาง
  function filteredFgRows() {
    const all = finishedGoodsRows();
    const q = state.fgQuery.trim().toLowerCase();
    return all
      .filter((r) => state.fgFilter === "all" || (state.fgFilter === "instore" && !r.shipped) || (state.fgFilter === "shipped" && r.shipped))
      .filter((r) => !q || `${r.d.id} ${r.moNo} ${r.d.customer || ""} ${r.d.project || ""}`.toLowerCase().includes(q))
      .sort((a, b) => (b.receivedDate || "").localeCompare(a.receivedDate || ""));
  }

  function finishedGoodsSectionHtml() {
    const all = finishedGoodsRows();
    const inStore = all.filter((r) => !r.shipped);
    const shipped = all.filter((r) => r.shipped);
    const inStoreSqm = inStore.reduce((t, r) => t + r.sqm, 0);
    const shippedSqm = shipped.reduce((t, r) => t + r.sqm, 0);
    const receivedSqm = all.reduce((t, r) => t + r.sqm, 0);
    const rows = filteredFgRows();
    // ยกเลิกรายการที่เลือกไว้ทิ้งถ้าตัดออกไปแล้ว (เช่น เพิ่งตัดออกหลายรายการไปเมื่อกี้) กันเลือกค้างของที่ไม่อยู่ในสถานะ "อยู่ใน Store" แล้ว
    const stillSelectable = new Set(inStore.map((r) => r.d.id));
    [...state.fgSelected].forEach((id) => { if (!stillSelectable.has(id)) state.fgSelected.delete(id); });
    const visibleSelectableIds = rows.filter((r) => !r.shipped).map((r) => r.d.id);
    const allVisibleSelected = visibleSelectableIds.length > 0 && visibleSelectableIds.every((id) => state.fgSelected.has(id));
    const bulkBar = `<div class="pw-row store-bulk-bar" style="margin-bottom:8px;align-items:center">
        ${visibleSelectableIds.length ? `<label class="pf tiny" style="flex-direction:row;align-items:center;gap:5px"><input type="checkbox" id="storeFgSelectAll" ${allVisibleSelected ? "checked" : ""}> เลือกทั้งหมดที่แสดง (${visibleSelectableIds.length})</label>` : ""}
        ${state.fgSelected.size ? `
          <span class="tag-total">เลือกแล้ว ${state.fgSelected.size} รายการ</span>
          <label class="pf tiny">วันที่ส่งจริง<input type="date" id="storeFgBulkDate" value="${esc(state.fgBulkDate)}"></label>
          <button type="button" class="action-button primary" data-fg-bulk-cut>ตัดออกที่เลือก (${state.fgSelected.size})</button>
          <button type="button" class="text-button" data-fg-bulk-clear>ยกเลิกการเลือก</button>
        ` : ""}
      </div>`;
    return `
    <section id="storeSummary" class="summary-cards"></section>
    <section class="department-panel pw-card wide">
      <div class="panel-heading">
        <div><strong>รับเข้า/ตัดออก สินค้าสำเร็จรูป (M/O, S/O)</strong><small>ดึงจากข้อมูลเดิมของระบบอัตโนมัติ — รับเข้า = ผ่าน QC ตกแต่งครบแล้ว, ตัดออก = ฝ่ายขายยืนยันส่งจริงแล้ว หรือติ๊กเลือกหลายรายการแล้วกด "ตัดออกที่เลือก" ด้านล่าง (สำหรับ M/O,S/O เก่าที่ส่งจริงไปแล้ว ไม่ต้องไล่กดยืนยันทีละใบ) ไม่ต้องคีย์ซ้ำ</small></div>
        <label>ค้นหา<input id="storeFgSearch" placeholder="เลข M/O, S/O, ลูกค้า, Project" value="${esc(state.fgQuery)}"></label>
      </div>
      <div class="pw-body">
        <div class="pw-res-row" style="margin-bottom:10px">${res("รับเข้า Store สะสม", `${fmt(receivedSqm, 2)} ตร.ม.`)}${res("อยู่ใน Store ตอนนี้", `${fmt(inStoreSqm, 2)} ตร.ม.`, "main")}${res("ตัดออก/จัดส่งแล้ว", `${fmt(shippedSqm, 2)} ตร.ม.`)}</div>
        <div class="control-strip" style="margin-bottom:8px">
          <div class="segmented">
            <button type="button" class="view-btn ${state.fgFilter === "all" ? "active" : ""}" data-fg-filter="all">ทั้งหมด (${all.length})</button>
            <button type="button" class="view-btn ${state.fgFilter === "instore" ? "active" : ""}" data-fg-filter="instore">อยู่ใน Store (${inStore.length})</button>
            <button type="button" class="view-btn ${state.fgFilter === "shipped" ? "active" : ""}" data-fg-filter="shipped">ตัดออกแล้ว (${shipped.length})</button>
          </div>
        </div>
        ${rows.length ? bulkBar : ""}
        ${rows.length ? `<table class="calc-table"><thead><tr><th></th><th>ประเภท</th><th>เลขที่ M/O,S/O</th><th>ลูกค้า/Project</th><th class="num">ตร.ม.</th><th>วันที่รับเข้า Store</th><th>สถานะ</th></tr></thead><tbody>${rows.map(fgRowHtml).join("")}</tbody></table>` : `<p class="col-empty">${all.length ? "ไม่พบรายการที่ตรงกับตัวกรอง" : "ยังไม่มี M/O, S/O ที่ผ่าน QC เข้า Store"}</p>`}
      </div>
    </section>`;
  }

  /* ============================================================
     Render / Bind
     ============================================================ */
  function build() {
    const root = $("#storeView");
    root.innerHTML = `
      <section class="page-heading">
        <div>
          <p class="eyebrow">STORE DEPARTMENT</p>
          <h1>แผนกสโตร์ (Store)</h1>
          <p class="subtitle">เบิกเข้า-ออกวัตถุดิบ (บันทึกเองได้ทุกประเภท) + รับเข้า/ตัดออกสินค้าสำเร็จรูปตาม M/O, S/O (ดึงจากข้อมูลเดิมของระบบอัตโนมัติ)</p>
        </div>
      </section>
      <div id="storeFgBody"></div>
      <div id="storeLedgerBody" style="margin-top:10px"></div>`;
  }

  function renderAll() {
    const all = finishedGoodsRows();
    const inStore = all.filter((r) => !r.shipped);
    const shipped = all.filter((r) => r.shipped);
    $("#storeFgBody").innerHTML = finishedGoodsSectionHtml();
    $("#storeSummary").innerHTML = [
      ["รับเข้า Store สะสม", `${all.length} รายการ`, "M/O, S/O ทั้งหมดที่เคยเข้า Store"],
      ["อยู่ใน Store ตอนนี้", `${inStore.length} รายการ`, `${fmt(inStore.reduce((t, r) => t + r.sqm, 0), 2)} ตร.ม.`],
      ["ตัดออก/จัดส่งแล้ว", `${shipped.length} รายการ`, `${fmt(shipped.reduce((t, r) => t + r.sqm, 0), 2)} ตร.ม.`],
      ["รายการวัตถุดิบที่มีสต๊อกติดลบ", materialBalances().filter((b) => b.balance < -0.0005).length, "ตรวจสอบยอดเบิก-รับให้ถูกต้อง", materialBalances().some((b) => b.balance < -0.0005) ? "risk" : ""]
    ].map(([label, value, note, kind]) => `<article class="summary-card ${kind || ""}"><small>${label}</small><strong>${value}</strong><span>${note}</span></article>`).join("");
    $("#storeLedgerBody").innerHTML = materialLedgerSectionHtml();
  }

  function bind() {
    const root = $("#storeView");
    root.addEventListener("input", (e) => {
      if (e.target && e.target.id === "storeFgSearch") { state.fgQuery = e.target.value; renderAll(); return; }
      // ไม่ renderAll() ตอนพิมพ์/เลือกวันที่ กันโฟกัส-ตัวเลือกวันที่หลุดระหว่างพิมพ์ — อ่านค่าจริงตอนกดปุ่ม "ตัดออกที่เลือก" อีกที
      if (e.target && e.target.id === "storeFgBulkDate") { state.fgBulkDate = e.target.value; }
    });
    root.addEventListener("change", (e) => {
      const cb = e.target.closest("[data-fg-select]");
      if (cb) {
        const id = cb.dataset.fgSelect;
        if (cb.checked) state.fgSelected.add(id); else state.fgSelected.delete(id);
        renderAll();
        return;
      }
      if (e.target && e.target.id === "storeFgSelectAll") {
        const visible = filteredFgRows().filter((r) => !r.shipped);
        if (e.target.checked) visible.forEach((r) => state.fgSelected.add(r.d.id));
        else visible.forEach((r) => state.fgSelected.delete(r.d.id));
        renderAll();
        return;
      }
    });
    root.addEventListener("click", (e) => {
      const filterBtn = e.target.closest("[data-fg-filter]");
      if (filterBtn) { state.fgFilter = filterBtn.dataset.fgFilter; renderAll(); return; }
      const delBtn = e.target.closest("[data-del-ledger]");
      if (delBtn) {
        if (!confirm("ลบรายการนี้ทิ้ง? (ลบแล้วกู้คืนไม่ได้)")) return;
        deleteLedgerEntry(delBtn.dataset.delLedger);
        toast("ลบรายการแล้ว");
        renderAll();
        return;
      }
      const bulkCutBtn = e.target.closest("[data-fg-bulk-cut]");
      if (bulkCutBtn) {
        const ids = [...state.fgSelected];
        if (!ids.length) return;
        const dateInput = $("#storeFgBulkDate");
        const date = (dateInput && dateInput.value) || state.fgBulkDate || todayIso();
        if (!confirm(`ตัดออก ${ids.length} รายการที่เลือก โดยบันทึกวันที่ส่งจริง = ${date}? (แก้ไขทีหลังได้ที่หน้ารายงานขาย)`)) return;
        const n = bulkMarkShipped(ids, date);
        state.fgSelected.clear();
        toast(`ตัดออกแล้ว ${n} รายการ`);
        renderAll();
        return;
      }
      const bulkClearBtn = e.target.closest("[data-fg-bulk-clear]");
      if (bulkClearBtn) { state.fgSelected.clear(); renderAll(); return; }
    });
    root.addEventListener("submit", (e) => {
      if (e.target && e.target.id === "storeLedgerForm") {
        e.preventDefault();
        const f = e.target;
        const materialName = f.elements.materialName.value.trim();
        const qty = f.elements.qty.value;
        if (!materialName) { toast("กรอกชื่อวัตถุดิบก่อน"); return; }
        if (!has(qty) || num(qty) <= 0) { toast("กรอกจำนวนให้ถูกต้อง"); return; }
        addLedgerEntry({
          date: f.elements.date.value || todayIso(),
          direction: f.elements.direction.value === "out" ? "out" : "in",
          materialName, qty: num(qty),
          unit: f.elements.unit.value.trim(),
          refNo: f.elements.refNo.value.trim(),
          note: f.elements.note.value.trim()
        });
        toast("บันทึกรายการวัตถุดิบแล้ว");
        renderAll();
      }
    });
  }

  let built = false;
  function renderStore() {
    if (!built) { build(); built = true; bind(); }
    renderAll();
  }

  window.StoreEngine = { KEY_LEDGER, loadLedger, addLedgerEntry, deleteLedgerEntry, materialBalances, finishedGoodsRows };
  window.renderStore = renderStore;
})();
