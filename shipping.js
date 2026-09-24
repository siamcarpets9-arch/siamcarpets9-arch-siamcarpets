/* ============================================================
   ใบส่งสินค้า (Delivery Note) + Marks & Nos
   - ดึงรายการจาก M/O และ SO ตัวอย่าง (SalesEngine) มารวมเป็น "ใบส่ง" เดียวกันได้หลายรายการ
     จัดกลุ่มพิมพ์รวมใต้เลข INVOICE เดียวกันได้ (ตรงตามตัวอย่างที่แนบ: M/O 109-115/26 รวมใน INVOICE 058/26)
     — แต่เลข INVOICE เป็นเพียง "ข้อมูลอ้างอิง/ป้ายพิมพ์" เท่านั้น ไม่มีผลต่อสต๊อก
   - แก้ไข MARKS / MEASURMENT / NOTE ต่อรายการได้อิสระ ไม่ผูกกับข้อมูลเดิมใน M/O
   - แต่ละรายการแตกเป็น "กล่อง/พาเลท" ได้หลายกล่อง (เลข NO. เรียงอัตโนมัติทั้งใบ Invoice) สำหรับพิมพ์ป้าย Marks & Nos ทีละกล่อง
   - พิมพ์ในแอปได้เลย (หน้าต่างพิมพ์ทับเต็มจอ แบบเดียวกับฟอร์ม M/O A3) ไม่ต้องออกไฟล์แยก
   - "ตัวตัด" สต๊อก: การเพิ่มรายการ M/O,S/O เข้าใบส่ง (มี Marks & Nos) คือจุดที่ทำให้ระบบบันทึกวันที่ส่งจริง
     (doc.actualShip = วันที่ในใบส่ง) ทันที ไม่ต้องรอกรอกเลข INVOICE ก่อน — ผลคือ Store จะเห็นรายการนั้น
     "ตัดออกแล้ว" ทันที (ดู markDocShipped/unmarkDocShippedIfOrphaned) ถ้าลบรายการออกจากใบส่งและไม่ได้อยู่ใน
     ใบส่งอื่นแล้ว ระบบจะคืนสถานะให้อัตโนมัติ ส่วนปุ่ม "ยืนยันส่งจริง" แบบ manual ในหน้าขาย (sales.js) ยังคงใช้
     เป็นทางเลือกเสริมสำหรับกรณีพิเศษ/ข้อมูลนำเข้าเก่าที่ไม่ได้ผ่านใบส่งนี้
   ต้องโหลดหลัง app.js, sales.js (ใช้ SalesEngine.getDocs/saveDocs, $, $$, toast)
   ============================================================ */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const has = (v) => String(v == null ? "" : v).trim() !== "";
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const readJson = (k, fb) => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : fb; } catch (e) { return fb; } };
  const writeJson = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ยังใช้ต่อได้ */ } };
  const uid = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const nl2br = (v) => esc(v).replace(/\n/g, "<br>");

  const KEY_SHIP = "siam-shipments";
  const MARKET_LABEL = { FOREIGN: "ต่างประเทศ", DOMESTIC: "ในประเทศ" };
  const SE = () => window.SalesEngine;

  /* ============================================================
     ข้อมูล — ทะเบียนใบส่ง
     shipment: { id, invoiceNo, shipDate, shipMethod, consigneeName, consigneeAddress, reference,
                 packingNote, createdAt, updatedAt,
                 lines: [{id, docId, market, type, no, customer, project, marks, measurement, note}],
                 cartons: [{id, lineId, pieceRange, sizeDim, description, reference}] }
     ============================================================ */
  function loadShipments() { const s = readJson(KEY_SHIP, null); return Array.isArray(s) ? s : []; }
  function saveShipments(list) { writeJson(KEY_SHIP, list); }
  function findShip(id) { return loadShipments().find((s) => s.id === id) || null; }
  function upsertShip(ship) {
    const list = loadShipments();
    const i = list.findIndex((s) => s.id === ship.id);
    ship.updatedAt = new Date().toISOString();
    if (i >= 0) list[i] = ship; else list.push(ship);
    saveShipments(list);
  }
  function deleteShipment(id) { saveShipments(loadShipments().filter((s) => s.id !== id)); }

  function blankShipment() {
    return {
      id: uid("SHP"), invoiceNo: "", shipDate: new Date().toISOString().slice(0, 10), shipMethod: "",
      consigneeName: "", consigneeAddress: "", reference: "", packingNote: "",
      createdAt: new Date().toISOString(), lines: [], cartons: [],
    };
  }

  function docLabel(d) { return `${d.type === "SO" ? "SO " : "M/O "}${d.no}`; }

  // รูปดีไซน์ — ใช้รูปที่อัปโหลดไว้ที่หน้าขาย (แก้ไข M/O) เป็นหลัก ถ้าไม่มีค่อย fallback ไปรูปแบบพรมแผนกทอ (ผูกกับ designId ของ M/O/SO นั้น ไม่ใช่ docId ของใบส่ง)
  const designPhotoCache = {};
  function designPhoto(docId) {
    if (designPhotoCache[docId] !== undefined) return designPhotoCache[docId];
    const se = SE();
    const DP = window.DesignPhotoStore;
    const WF = window.WeaveFloorEngine;
    let photo = "";
    try {
      const doc = se && typeof se.getDocs === "function" ? se.getDocs().find((d) => d.id === docId) : null;
      if (doc && doc.designId) {
        if (DP && typeof DP.getDesignPhoto === "function") photo = DP.getDesignPhoto(doc.designId) || "";
        if (!photo && WF && typeof WF.getDesignImage === "function") photo = WF.getDesignImage(doc.designId) || "";
      }
    } catch (e) { photo = ""; }
    designPhotoCache[docId] = photo;
    return photo;
  }

  function allSalesDocs() {
    const se = SE();
    if (!se || typeof se.getDocs !== "function") return [];
    return se.getDocs().filter((d) => d.type === "MO" || d.type === "SO");
  }

  // ผูกเลข INVOICE กลับเข้าไปในตัว M/O/SO เอง (ช่อง "INV No." เดิมที่มีอยู่แล้วในหน้ารายงานขาย)
  // หมายเหตุ: เลข INVOICE เป็น "ข้อมูลอ้างอิง/ป้ายพิมพ์" เท่านั้น ไม่มีผลต่อการตัดสต๊อก (ดู markDocShipped ด้านล่าง)
  function markDocInvoice(docId, invoiceNo) {
    const se = SE();
    if (!se || typeof se.getDocs !== "function") return;
    const doc = se.getDocs().find((d) => d.id === docId);
    if (doc) { doc.inv = invoiceNo || ""; if (typeof se.saveDocs === "function") se.saveDocs(); }
  }

  // ใบส่งของ (มี Marks & Nos) คือตัว "ตัด" M/O,S/O ออกจากสต๊อกสินค้าสำเร็จรูปจริง — เขียนวันที่ส่งจริง (doc.actualShip)
  // ทันทีที่รายการนั้นถูกเพิ่มเข้าใบส่ง โดยไม่ต้องรอกรอกเลข INVOICE ก่อน (INVOICE เป็นแค่ข้อมูลอ้างอิง)
  function markDocShipped(docId, shipDate) {
    const se = SE();
    if (!se || typeof se.getDocs !== "function") return;
    const doc = se.getDocs().find((d) => d.id === docId);
    if (doc) { doc.actualShip = shipDate || new Date().toISOString().slice(0, 10); if (typeof se.saveDocs === "function") se.saveDocs(); }
  }

  // ถ้าลบรายการออกจากใบส่งแล้ว M/O,S/O นั้นไม่ได้อยู่ในใบส่งอื่นใดอีกเลย ให้คืนสถานะ (ยกเลิกการตัด) อัตโนมัติ
  function unmarkDocShippedIfOrphaned(docId, excludeShipId) {
    const stillIn = loadShipments().some((s) => s.id !== excludeShipId && s.lines.some((l) => l.docId === docId));
    if (stillIn) return;
    const se = SE();
    if (!se || typeof se.getDocs !== "function") return;
    const doc = se.getDocs().find((d) => d.id === docId);
    if (doc) { doc.actualShip = ""; if (typeof se.saveDocs === "function") se.saveDocs(); }
  }

  function rollRangeForLine(ship, lineId) {
    const idxs = [];
    ship.cartons.forEach((c, i) => { if (c.lineId === lineId) idxs.push(i + 1); });
    if (!idxs.length) return "-";
    return idxs.length === 1 ? String(idxs[0]) : `${idxs[0]}-${idxs[idxs.length - 1]}`;
  }

  const state = { openId: null, pickerQuery: "" };

  /* ============================================================
     รายการใบส่ง (การ์ด)
     ============================================================ */
  function listHtml() {
    const ships = loadShipments().slice().sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    if (!ships.length) return `<p class="col-empty">ยังไม่มีใบส่ง — กด “+ สร้างใบส่งใหม่” ด้านบนเพื่อเริ่ม</p>`;
    return `<div class="shp-grid">${ships.map((s) => `
      <div class="shp-card ${state.openId === s.id ? "active" : ""}" data-ship-open="${esc(s.id)}">
        <div class="shp-card-top"><strong>INVOICE ${esc(s.invoiceNo || "(ยังไม่ระบุ)")}</strong><span>${s.lines.length} รายการ · ${s.cartons.length} กล่อง</span></div>
        <div class="shp-card-mid">${esc(s.consigneeName || "ยังไม่ระบุผู้รับ")}</div>
        <div class="shp-card-bot">
          <small>${s.shipDate ? new Date(s.shipDate).toLocaleDateString("th-TH") : "-"}</small>
          <button type="button" class="text-button" data-ship-del="${esc(s.id)}">ลบ</button>
        </div>
      </div>`).join("")}</div>`;
  }

  /* ============================================================
     ตัวเลือกเพิ่ม M/O หรือ SO เข้าใบส่ง
     ============================================================ */
  function pickerResultsHtml(ship) {
    const q = state.pickerQuery.trim().toLowerCase();
    if (!q) return `<p class="col-empty shp-tight">พิมพ์เลข M/O, SO, ชื่อลูกค้า หรือโปรเจกต์เพื่อค้นหาแล้วกดเพิ่ม</p>`;
    const already = new Set(ship.lines.map((l) => l.docId));
    const docs = allSalesDocs()
      .filter((d) => !already.has(d.id) && `${d.no} ${d.customer} ${d.project}`.toLowerCase().includes(q))
      .slice(0, 25);
    if (!docs.length) return `<p class="col-empty shp-tight">ไม่พบรายการที่ตรงกับ “${esc(state.pickerQuery)}”</p>`;
    return `<div class="shp-pick-list">${docs.map((d) => `
      <button type="button" class="shp-pick-item" data-ship-add="${esc(d.id)}">
        <b>${esc(docLabel(d))}</b><span>${esc(d.customer)}</span><small>${esc(d.project)} · ${esc(MARKET_LABEL[d.market] || d.market)}</small>
      </button>`).join("")}</div>`;
  }

  function renderPickerOnly() {
    const el = $("#shipPickerResults");
    const ship = state.openId && findShip(state.openId);
    if (el && ship) el.innerHTML = pickerResultsHtml(ship);
  }

  /* ============================================================
     หน้าแก้ไขใบส่ง 1 ใบ
     ============================================================ */
  function linesTableHtml(ship) {
    if (!ship.lines.length) return `<p class="col-empty shp-tight">ยังไม่มีรายการ — ค้นหาแล้วเพิ่ม M/O หรือ SO ด้านบน</p>`;
    // เลขที่ M/O/SO แสดงแค่ตัวเลขเฉยๆ (ไม่ใส่คำว่า "M/O"/"SO" นำหน้าซ้ำกับหัวคอลัมน์ที่มีป้ายประเภทแยกให้อยู่แล้ว)
    return `<div class="table-wrap"><table class="shp-table">
      <thead><tr><th>รูป</th><th>M/O / SO</th><th>ลูกค้า</th><th>MARKS</th><th>MEASURMENT</th><th>NOTE</th><th>ROLL NO.</th><th></th></tr></thead>
      <tbody>${ship.lines.map((l) => `<tr>
        <td>${designPhoto(l.docId) ? `<img class="dept-row-photo" src="${designPhoto(l.docId)}" alt="">` : `<span class="dept-row-photo-empty">-</span>`}</td>
        <td><span class="ovw-type ovw-type-${l.type}">${esc(l.type)}</span> <b>${esc(l.no)}</b><br><small>${esc(MARKET_LABEL[l.market] || l.market)}</small></td>
        <td>${esc(l.customer)}<br><small>${esc(l.project)}</small></td>
        <td><input data-ship-line="marks" data-line-id="${esc(l.id)}" value="${esc(l.marks)}" placeholder="ชื่อห้อง/ตำแหน่งที่ระบุบนป้าย"></td>
        <td><input data-ship-line="measurement" data-line-id="${esc(l.id)}" value="${esc(l.measurement)}" placeholder="เช่น 50X87 CM."></td>
        <td><input data-ship-line="note" data-line-id="${esc(l.id)}" value="${esc(l.note)}" placeholder="เช่น วางพาเลทเดียวกัน"></td>
        <td class="shp-roll">${esc(rollRangeForLine(ship, l.id))}</td>
        <td class="shp-line-actions">
          <button type="button" class="text-button" data-ship-addcarton="${esc(l.id)}">+ กล่อง</button>
          <button type="button" class="text-button shp-danger" data-ship-rmline="${esc(l.id)}">ลบ</button>
        </td>
      </tr>`).join("")}</tbody>
    </table></div>`;
  }

  function cartonsTableHtml(ship) {
    if (!ship.cartons.length) return `<p class="col-empty shp-tight">ยังไม่มีกล่อง/พาเลท — กด “+ กล่อง” ที่รายการ M/O/SO ด้านบน แล้วกรอกช่วงชิ้น/ขนาดต่อกล่อง</p>`;
    return `<div class="table-wrap"><table class="shp-table">
      <thead><tr><th>NO.</th><th>M/O / SO อ้างอิง</th><th>ช่วงชิ้น (เช่น No.1-5)</th><th>ขนาด/DIM</th><th>รายละเอียดสินค้า</th><th>REFERENCE</th><th></th></tr></thead>
      <tbody>${ship.cartons.map((c, i) => {
        const line = ship.lines.find((l) => l.id === c.lineId);
        return `<tr>
        <td class="shp-roll">${i + 1}</td>
        <td>
          <select data-ship-carton="lineId" data-carton-id="${esc(c.id)}">
            ${ship.lines.map((l) => `<option value="${esc(l.id)}" ${l.id === c.lineId ? "selected" : ""}>${esc(docLabel(l))}</option>`).join("")}
          </select>
        </td>
        <td><input data-ship-carton="pieceRange" data-carton-id="${esc(c.id)}" value="${esc(c.pieceRange)}" placeholder="No.1-5"></td>
        <td><input data-ship-carton="sizeDim" data-carton-id="${esc(c.id)}" value="${esc(c.sizeDim)}" placeholder="50X87X50CM."></td>
        <td><input data-ship-carton="description" data-carton-id="${esc(c.id)}" value="${esc(c.description)}" placeholder="เช่น BEDSIDE RUGS"></td>
        <td><input data-ship-carton="reference" data-carton-id="${esc(c.id)}" value="${esc(c.reference)}" placeholder="เช่น SC#... หรือ D/N#..."></td>
        <td><button type="button" class="text-button shp-danger" data-ship-rmcarton="${esc(c.id)}">ลบ</button></td>
      </tr>${line ? "" : ""}`;
      }).join("")}</tbody>
    </table></div>`;
  }

  function editorHtml(ship) {
    return `
    <section class="department-panel shp-editor">
      <div class="panel-heading">
        <div><strong>แก้ไขใบส่ง</strong><small>รวมได้หลาย M/O/SO ต่อ 1 ใบ Invoice — แก้ MARKS/ขนาด/หมายเหตุได้อิสระ ไม่กระทบข้อมูลเดิมในหน้ารายงานขาย · เพิ่มรายการที่นี่ = ตัด M/O,S/O ออกจากสต๊อก Store ทันที (ไม่ต้องรอเลข INVOICE)</small></div>
        <div class="shp-editor-actions">
          <button type="button" class="action-button primary" data-ship-print="note">พิมพ์ใบส่ง</button>
          <button type="button" class="action-button" data-ship-print="marks">พิมพ์ Marks &amp; Nos</button>
          <button type="button" class="text-button" data-ship-close>ปิด</button>
        </div>
      </div>
      <div class="shp-body">
        <div class="shp-head-grid">
          <label class="pf">เลขที่ INVOICE<input data-ship-h="invoiceNo" value="${esc(ship.invoiceNo)}" placeholder="058/26"></label>
          <label class="pf">วันที่ส่ง<input type="date" data-ship-h="shipDate" value="${esc(ship.shipDate)}"></label>
          <label class="pf">วิธีส่ง<input data-ship-h="shipMethod" list="shpShipMethods" value="${esc(ship.shipMethod)}" placeholder="Air Freight / Sea Freight"></label>
          <datalist id="shpShipMethods"><option value="Air Freight"><option value="Sea Freight"><option value="Truck / รถบรรทุก"><option value="Courier"></datalist>
          <label class="pf">REFERENCE เริ่มต้น (ใช้เติมให้กล่องใหม่)<input data-ship-h="reference" value="${esc(ship.reference)}" placeholder="เช่น D/N# หรือ SC#..."></label>
        </div>
        <div class="shp-head-grid">
          <label class="pf span2">ชื่อ/ที่อยู่ผู้รับ (Consignee)<textarea data-ship-h="consigneeName" rows="1" placeholder="ชื่อผู้รับ">${esc(ship.consigneeName)}</textarea></label>
        </div>
        <div class="shp-head-grid">
          <label class="pf span2">ที่อยู่ผู้รับ (ต่อ)<textarea data-ship-h="consigneeAddress" rows="3" placeholder="ที่อยู่เต็มสำหรับพิมพ์บนป้าย Marks &amp; Nos">${esc(ship.consigneeAddress)}</textarea></label>
          <label class="pf span2">หมายเหตุการแพ็ค (พิมพ์สีแดงในใบส่ง)<textarea data-ship-h="packingNote" rows="3" placeholder="เช่น ใส่ไฟเบอร์กล๊าส / วางบนพาเลท">${esc(ship.packingNote)}</textarea></label>
        </div>

        <div class="shp-sub-head">เพิ่ม M/O หรือ SO เข้าใบส่งนี้</div>
        <input id="shipPickerInput" class="shp-search" placeholder="ค้นหาเลข M/O, SO, ชื่อลูกค้า หรือโปรเจกต์" value="${esc(state.pickerQuery)}">
        <div id="shipPickerResults">${pickerResultsHtml(ship)}</div>

        <div class="shp-sub-head">รายการที่รวมในใบส่งนี้</div>
        ${linesTableHtml(ship)}

        <div class="shp-sub-head">กล่อง/พาเลท (สำหรับพิมพ์ป้าย Marks &amp; Nos ทีละกล่อง — เลข NO. เรียงอัตโนมัติทั้งใบ)</div>
        ${cartonsTableHtml(ship)}
      </div>
    </section>`;
  }

  /* ============================================================
     build / render
     ============================================================ */
  function build() {
    const root = $("#shippingView");
    root.innerHTML = `
      <section class="page-heading">
        <div>
          <p class="eyebrow">SHIPPING</p>
          <h1>ใบส่งสินค้า + Marks &amp; Nos</h1>
          <p class="subtitle">รวม M/O และ SO ตัวอย่างหลายรายการเข้าใบส่งเดียวกันได้ พิมพ์ใบส่ง/ป้าย Marks &amp; Nos ได้จากในแอปทันที — การเพิ่มรายการเข้าใบส่งคือตัว "ตัด" M/O,S/O ออกจากสต๊อก Store ทันที ส่วนเลข INVOICE เป็นแค่ข้อมูลอ้างอิง/ป้ายพิมพ์เท่านั้น</p>
        </div>
        <div class="heading-actions"><button class="action-button primary" data-ship-new>+ สร้างใบส่งใหม่</button></div>
      </section>
      <div id="shipList"></div>
      <div id="shipEditor"></div>`;
  }

  function renderAll() {
    $("#shipList").innerHTML = listHtml();
    const ship = state.openId && findShip(state.openId);
    $("#shipEditor").innerHTML = ship ? editorHtml(ship) : "";
  }

  let built = false;
  function renderShipping() {
    if (!built) { build(); built = true; bind(); }
    renderAll();
  }

  /* ============================================================
     พิมพ์ในแอป (overlay เต็มจอ แบบเดียวกับฟอร์ม M/O)
     ============================================================ */
  function buildDeliveryNoteHtml(ship) {
    const rows = ship.lines.map((l) => `<tr>
      <td>${designPhoto(l.docId) ? `<img class="shp-doc-photo dept-row-photo" src="${designPhoto(l.docId)}" alt="">` : ""}</td>
      <td>${esc(ship.invoiceNo || "-")}</td>
      <td>${esc(l.customer)}</td>
      <td>${esc(rollRangeForLine(ship, l.id))}</td>
      <td>${esc(l.no)}</td>
      <td>${esc(l.marks)}</td>
      <td>${esc(l.measurement)}</td>
      <td>${esc(l.note)}</td>
    </tr>`).join("");
    return `<div class="shp-sheet">
      <div class="shp-doc-head">
        <div><strong>SIAM CARPETS MANUFACTURING CO., LTD.</strong><br>บริษัท อุตสาหกรรมพรมสยาม จำกัด</div>
        <div class="shp-doc-title">ใบส่งสินค้า<br>DELIVERY NOTE</div>
      </div>
      <div class="shp-doc-meta">
        <span><b>INVOICE NO.</b> ${esc(ship.invoiceNo || "-")}</span>
        <span><b>DATE</b> ${ship.shipDate ? new Date(ship.shipDate).toLocaleDateString("th-TH") : "-"}</span>
        <span><b>SHIP VIA</b> ${esc(ship.shipMethod || "-")}</span>
      </div>
      <div class="shp-doc-consignee"><b>CONSIGNEE:</b> ${esc(ship.consigneeName || "-")}<br>${nl2br(ship.consigneeAddress || "")}</div>
      <table class="shp-doc-table">
        <thead><tr><th>รูป</th><th>INV. NO.</th><th>CUSTOMER</th><th>ROLL NO.</th><th>M/O</th><th>MARKS</th><th>MEASURMENT</th><th>NOTE</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="8" style="text-align:center;color:#888">ยังไม่มีรายการ</td></tr>`}</tbody>
      </table>
      ${ship.packingNote ? `<p class="shp-pack-note">หมายเหตุการแพ็ค: ${esc(ship.packingNote)}${ship.shipDate ? ` / พาเลทส่งวันที่ ${new Date(ship.shipDate).toLocaleDateString("th-TH")}` : ""}</p>` : ""}
    </div>`;
  }

  function buildMarksNosHtml(ship) {
    if (!ship.cartons.length) return `<p style="padding:30px;text-align:center;color:#888">ยังไม่มีกล่อง/พาเลท — เพิ่มในตารางกล่อง/พาเลทก่อนพิมพ์</p>`;
    const labels = ship.cartons.map((c, i) => {
      const line = ship.lines.find((l) => l.id === c.lineId);
      const sizeLine = has(c.pieceRange) || has(c.sizeDim)
        ? `<div>SIZE: ${esc(c.pieceRange)}${has(c.pieceRange) && has(c.sizeDim) ? " :" : ""}${has(c.sizeDim) ? "DIM:" + esc(c.sizeDim) : ""}</div>` : "";
      const photo = line ? designPhoto(line.docId) : "";
      return `<div class="shp-label-page"><div class="shp-label">
        <div class="shp-label-top"><b>MARKS &amp; NOS</b><span>HANDLE WITH CARE</span></div>
        ${photo ? `<img class="shp-label-photo" src="${photo}" alt="">` : ""}
        <div class="shp-label-consignee">${esc(ship.consigneeName || "-")}<br>${nl2br(ship.consigneeAddress || "")}</div>
        <div class="shp-label-no">NO.${i + 1}</div>
        <div>MADE IN THAILAND</div>
        ${has(c.reference) ? `<div>REFERENCE: ${esc(c.reference)}</div>` : ""}
        ${has(c.description) ? `<div>${esc(c.description)}</div>` : ""}
        ${sizeLine}
        ${line ? `<div>M/O ${esc(line.no)}</div>` : ""}
        ${line && has(line.project) ? `<div>PROJECT: ${esc(line.project)}</div>` : ""}
        <div class="shp-label-inv">*INVOICE ${esc(ship.invoiceNo || "-")}*</div>
      </div></div>`;
    }).join("");
    return labels;
  }

  function ensurePrintRoot() {
    let root = $("#shipPrint");
    if (root) return root;
    root = document.createElement("div");
    root.id = "shipPrint";
    root.hidden = true;
    root.innerHTML = `<div class="shp-bar"><strong class="shp-print-title"></strong><span class="shp-spacer"></span><span class="shp-tip">เลือกกระดาษ A4 แนวนอน (Landscape) · ระยะขอบ “ไม่มี”</span><button class="primary" data-ship-print-action="print">พิมพ์ / บันทึกเป็น PDF</button><button data-ship-print-action="close">ปิด</button></div><div class="shp-print-scroll"></div>`;
    document.body.appendChild(root);
    root.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-ship-print-action]");
      if (!btn) return;
      if (btn.dataset.shipPrintAction === "print") window.print(); else closePrint();
    });
    return root;
  }
  function openPrint(kind, ship) {
    const root = ensurePrintRoot();
    $(".shp-print-title", root).textContent = kind === "marks" ? `Marks & Nos — INVOICE ${ship.invoiceNo || "-"}` : `ใบส่งสินค้า — INVOICE ${ship.invoiceNo || "-"}`;
    $(".shp-print-scroll", root).innerHTML = kind === "marks" ? buildMarksNosHtml(ship) : buildDeliveryNoteHtml(ship);
    root.hidden = false;
    document.body.classList.add("ship-printing");
  }
  function closePrint() {
    const root = $("#shipPrint");
    if (root) root.hidden = true;
    document.body.classList.remove("ship-printing");
  }
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && $("#shipPrint") && !$("#shipPrint").hidden) closePrint(); });

  /* ============================================================
     bind
     ============================================================ */
  function updateHeader(shipId, field, value) {
    const ship = findShip(shipId); if (!ship) return;
    ship[field] = value;
    upsertShip(ship);
    if (field === "invoiceNo") ship.lines.forEach((l) => markDocInvoice(l.docId, value));
    // แก้วันที่ส่งของทั้งใบ ต้องอัปเดตวันที่ตัดของทุกรายการในใบส่งนี้ให้ตรงกันด้วย
    if (field === "shipDate") ship.lines.forEach((l) => markDocShipped(l.docId, value));
  }
  function updateLine(shipId, lineId, field, value) {
    const ship = findShip(shipId); if (!ship) return;
    const line = ship.lines.find((l) => l.id === lineId); if (!line) return;
    line[field] = value;
    upsertShip(ship);
  }
  function updateCarton(shipId, cartonId, field, value) {
    const ship = findShip(shipId); if (!ship) return;
    const carton = ship.cartons.find((c) => c.id === cartonId); if (!carton) return;
    carton[field] = value;
    upsertShip(ship);
  }

  function bind() {
    const root = $("#shippingView");
    root.addEventListener("click", (e) => {
      const newBtn = e.target.closest("[data-ship-new]");
      if (newBtn) { const s = blankShipment(); upsertShip(s); state.openId = s.id; state.pickerQuery = ""; renderAll(); return; }

      // ต้องเช็คปุ่ม "ลบ" ก่อนตัวการ์ด (data-ship-open) เพราะปุ่มลบซ้อนอยู่ข้างในการ์ดนั้นเอง
      // (closest() จะไปเจอ data-ship-open ของการ์ดแม่ก่อนเสมอถ้าเช็ค data-ship-open ก่อน ทำให้กดลบแล้วกลายเป็นเปิดใบส่งแทน)
      const delBtn = e.target.closest("[data-ship-del]");
      if (delBtn) {
        const id = delBtn.dataset.shipDel;
        if (confirm("ลบใบส่งนี้ทั้งใบ? (ลบแล้วกู้คืนไม่ได้)")) {
          const doomed = findShip(id);
          const docIds = doomed ? doomed.lines.map((l) => l.docId) : [];
          deleteShipment(id);
          // ลบใบส่งทั้งใบแล้ว รายการที่ไม่ได้อยู่ในใบส่งอื่นอีกเลย ให้คืนสถานะ (ยกเลิกการตัด) อัตโนมัติ
          docIds.forEach((docId) => unmarkDocShippedIfOrphaned(docId, id));
          if (state.openId === id) state.openId = null;
          renderAll();
        }
        return;
      }

      const openBtn = e.target.closest("[data-ship-open]");
      if (openBtn) { state.openId = openBtn.dataset.shipOpen; state.pickerQuery = ""; renderAll(); return; }

      const closeBtn = e.target.closest("[data-ship-close]");
      if (closeBtn) { state.openId = null; renderAll(); return; }

      const addDoc = e.target.closest("[data-ship-add]");
      if (addDoc && state.openId) {
        const ship = findShip(state.openId);
        const doc = allSalesDocs().find((d) => d.id === addDoc.dataset.shipAdd);
        if (ship && doc) {
          ship.lines.push({ id: uid("LN"), docId: doc.id, market: doc.market, type: doc.type, no: doc.no, customer: doc.customer, project: doc.project, marks: doc.project || "", measurement: "", note: "" });
          upsertShip(ship);
          if (ship.invoiceNo) markDocInvoice(doc.id, ship.invoiceNo);
          markDocShipped(doc.id, ship.shipDate); // ใบส่ง (Marks & Nos) คือตัวตัด M/O,S/O — ไม่ต้องรอเลข INVOICE
          state.pickerQuery = "";
          toast(`เพิ่ม ${docLabel(doc)} เข้าใบส่งแล้ว — ตัดออกจากสต๊อก Store แล้ว`);
          renderAll();
        }
        return;
      }

      const rmLine = e.target.closest("[data-ship-rmline]");
      if (rmLine && state.openId) {
        const ship = findShip(state.openId);
        if (ship) {
          const lineId = rmLine.dataset.shipRmline;
          const removedLine = ship.lines.find((l) => l.id === lineId);
          ship.lines = ship.lines.filter((l) => l.id !== lineId);
          ship.cartons = ship.cartons.filter((c) => c.lineId !== lineId);
          upsertShip(ship);
          // ลบรายการออกจากใบส่งนี้แล้ว ถ้าไม่ได้อยู่ในใบส่งอื่นอีกเลย ให้คืนสถานะ (ยกเลิกการตัด) อัตโนมัติ
          if (removedLine) unmarkDocShippedIfOrphaned(removedLine.docId, ship.id);
          renderAll();
        }
        return;
      }

      const addCarton = e.target.closest("[data-ship-addcarton]");
      if (addCarton && state.openId) {
        const ship = findShip(state.openId);
        const lineId = addCarton.dataset.shipAddcarton;
        const line = ship && ship.lines.find((l) => l.id === lineId);
        if (ship && line) {
          ship.cartons.push({ id: uid("CT"), lineId, pieceRange: "", sizeDim: line.measurement || "", description: "", reference: ship.reference || "" });
          upsertShip(ship);
          renderAll();
        }
        return;
      }

      const rmCarton = e.target.closest("[data-ship-rmcarton]");
      if (rmCarton && state.openId) {
        const ship = findShip(state.openId);
        if (ship) {
          ship.cartons = ship.cartons.filter((c) => c.id !== rmCarton.dataset.shipRmcarton);
          upsertShip(ship);
          renderAll();
        }
        return;
      }

      const printBtn = e.target.closest("[data-ship-print]");
      if (printBtn && state.openId) {
        const ship = findShip(state.openId);
        if (ship) openPrint(printBtn.dataset.shipPrint, ship);
        return;
      }
    });

    root.addEventListener("input", (e) => {
      if (e.target && e.target.id === "shipPickerInput") { state.pickerQuery = e.target.value; renderPickerOnly(); }
    });

    root.addEventListener("change", (e) => {
      const t = e.target;
      if (!state.openId) return;
      if (t.dataset && t.dataset.shipH) { updateHeader(state.openId, t.dataset.shipH, t.value); renderAll(); return; }
      if (t.dataset && t.dataset.shipLine) { updateLine(state.openId, t.dataset.lineId, t.dataset.shipLine, t.value); renderAll(); return; }
      if (t.dataset && t.dataset.shipCarton) { updateCarton(state.openId, t.dataset.cartonId, t.dataset.shipCarton, t.value); renderAll(); return; }
    });
  }

  window.ShippingEngine = { loadShipments, findShip };
  window.renderShipping = renderShipping;
})();
