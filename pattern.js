/* ============================================================
   แผนกเจาะลาย/ขยายลาย (Pattern Punching & Enlarging Department)
   - รับใบสั่งจากแผนกวางแผน (เกรด/ระยะเวลา มาจากใบวางแผนงานที่บันทึกไว้แล้ว — ตารางประสิทธิภาพเดียวกับ Planning)
   - คำนวณหน้าผ้าใบที่ต้องใช้ (3 / 5 / 6 เมตร) + ความยาวผ้าใบ จากขนาดแบบ (กว้าง × ยาว) + ค่าเผื่อขึงผ้า
   - ออกใบเบิกผ้าใบกับแผนก Store แล้วส่งมอบให้แผนกทอ (วันที่อ้างอิงจาก Master Plan เดียวกับ Planning/ส่งแผนกทอ)
   ต้องโหลดหลัง app.js, planning.js (ใช้ PlanningEngine, designs, baseTasks, $, $$, toast)
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
  const writeJson = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ยังใช้ต่อได้ */ } };
  const PE = () => window.PlanningEngine;
  // แก้ปัญหาช่องกรอกข้อมูล "เด้งออก" (เสียโฟกัส) ทุกครั้งที่พิมพ์ — saveField() เรียก renderAll() ซึ่งเขียนทับ
  // #ppForm ทั้งก้อนทุกครั้ง ทำให้ input ที่กำลังโฟกัสอยู่ถูกทำลายทิ้งแล้วสร้างใหม่ ต้องจับตำแหน่งไว้ก่อน render แล้วคืนกลับ
  function captureFocus(root) {
    const el = document.activeElement;
    if (!el || !root.contains(el) || !el.name) return null;
    let node = el, dataAttr = null;
    while (node && node !== root) {
      if (node.attributes) {
        for (const attr of node.attributes) {
          if (attr.name.startsWith("data-")) { dataAttr = { name: attr.name, value: attr.value }; break; }
        }
      }
      if (dataAttr) break;
      node = node.parentElement;
    }
    return {
      name: el.name, dataAttr,
      selStart: (typeof el.selectionStart === "number") ? el.selectionStart : null,
      selEnd: (typeof el.selectionEnd === "number") ? el.selectionEnd : null,
      scrollTop: root.scrollTop
    };
  }
  function restoreFocus(root, info) {
    if (!info) return;
    let candidates = [...root.querySelectorAll(`[name="${CSS.escape(info.name)}"]`)];
    if (info.dataAttr && candidates.length > 1) {
      candidates = candidates.filter((c) => {
        let n = c;
        while (n && n !== root) {
          if (n.getAttribute && n.getAttribute(info.dataAttr.name) === info.dataAttr.value) return true;
          n = n.parentElement;
        }
        return false;
      });
    }
    const el = candidates[0];
    if (!el) return;
    el.focus();
    if (info.selStart != null && typeof el.setSelectionRange === "function") {
      try { el.setSelectionRange(info.selStart, info.selEnd); } catch (e) { /* บาง input type ไม่รองรับ */ }
    }
    root.scrollTop = info.scrollTop;
  }

  const KEY_PATTERN = "siam-pattern-orders"; // { [designId]: {designWidthM, designLengthM, sideAllowanceM, endAllowanceM, storeBufferPct, requisitionIssued, requisitionAt} }

  /* ============================================================
     สูตรเลือกหน้าผ้าใบ + ความยาว
     หน้าผ้าใบที่มีจริง: 3 / 5 / 6 เมตร (ตามที่แจ้ง) — เลือกหน้าแคบสุดที่พอกับ (ความกว้างแบบ + เผื่อขึงผ้า 2 ด้าน)
     ============================================================ */
  const CANVAS_WIDTHS = [3, 5, 6]; // เมตร
  function pickCanvasWidth(requiredWidthM) {
    const fit = CANVAS_WIDTHS.filter((w) => w >= requiredWidthM - 1e-9).sort((a, b) => a - b);
    return fit.length ? fit[0] : null; // null = เกินหน้าผ้าใบสูงสุดที่มี ต้องต่อผ้า
  }
  function computeCanvasNeed({ designWidthM, designLengthM, sideAllowanceM, endAllowanceM }) {
    designWidthM = num(designWidthM); designLengthM = num(designLengthM); sideAllowanceM = num(sideAllowanceM); endAllowanceM = num(endAllowanceM);
    const requiredWidthM = designWidthM + 2 * sideAllowanceM;   // เผื่อขึงผ้าด้านข้าง 2 ฝั่ง
    const requiredLengthM = designLengthM + 2 * endAllowanceM;  // เผื่อขึงผ้าหัว-ท้าย 2 ฝั่ง
    const canvasWidthM = pickCanvasWidth(requiredWidthM);
    const wasteWidthM = canvasWidthM != null ? canvasWidthM - requiredWidthM : null;
    return { requiredWidthM, requiredLengthM, canvasWidthM, wasteWidthM, needsSplice: canvasWidthM == null };
  }

  window.PatternEngine = { CANVAS_WIDTHS, pickCanvasWidth, computeCanvasNeed };

  /* ============================================================
     รายชื่อพนักงานแผนกเจาะลาย/ขยายลาย
     เก็บแยกจากทะเบียนพนักงานทอ/ตกแต่ง (siam-workforce) เพราะเป็นคนละแผนกกัน
     ไม่ใส่รายชื่อตั้งต้นให้ (ไม่มีข้อมูลจริง) — ให้แผนกกรอกเองผ่านหน้าจอนี้ครั้งเดียวแล้วใช้ซ้ำได้ทุก Job
     ============================================================ */
  const KEY_PATTERN_WORKERS = "siam-workforce-pattern";
  function loadPatternWorkers() { const w = readJson(KEY_PATTERN_WORKERS, null); return Array.isArray(w) ? w : []; }
  function savePatternWorkers(list) { writeJson(KEY_PATTERN_WORKERS, list); }
  function addPatternWorker(name) {
    name = String(name || "").trim();
    if (!name) return;
    const list = loadPatternWorkers();
    if (list.some((w) => w.toLowerCase() === name.toLowerCase())) { toast(`มีชื่อ "${name}" อยู่แล้ว`); return; }
    list.push(name);
    savePatternWorkers(list);
  }
  function removePatternWorker(idx) {
    const list = loadPatternWorkers();
    list.splice(idx, 1);
    savePatternWorkers(list);
  }
  function exportPatternWorkersExcel() {
    if (typeof XLSX === "undefined") { toast("ไม่พบไลบรารี XLSX"); return; }
    const rows = [["แผนก", "ชื่อ-นามสกุล"], ...loadPatternWorkers().map((w) => ["เจาะลาย/ขยายลาย/ปั๊มผ้า", w])];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "พนักงานเจาะลาย-ปั๊มผ้า");
    XLSX.writeFile(wb, "รายชื่อพนักงาน-เจาะลาย-ปั๊มผ้า.xlsx");
  }
  const KEY_WORKERS_SHARED_EXT = "siam-workforce"; // ทะเบียนทอ/ตกแต่ง — ไฟล์นำเข้าเดียวแยกลงได้ทั้ง 2 ทะเบียนไม่ว่าจะอัปโหลดจากหน้าไหน
  async function importPatternWorkersExcel(file) {
    if (typeof XLSX === "undefined") { toast("ไม่พบไลบรารี XLSX"); return; }
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const patternList = loadPatternWorkers();
    const sharedList = readJson(KEY_WORKERS_SHARED_EXT, []);
    let patternAdded = 0, sharedAdded = 0;
    wb.SheetNames.forEach((sn) => {
      XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: "", raw: false }).forEach((row) => {
        const dept = String(row[0] || "").trim();
        const name = String(row[1] || "").trim();
        if (!name || /ชื่อ.?นามสกุล|ตัวอย่าง/.test(name)) return;
        const isPattern = /เจาะลาย|ขยายลาย|ปั๊ม|ดีไซน์/.test(dept);
        const isShared = /ทอ|ตกแต่ง|แต่ง/.test(dept);
        // ไม่ระบุแผนก = ถือว่าเป็นแผนกของหน้านี้ (เจาะลาย/ปั๊มผ้า)
        if (isPattern || (!dept && !isShared)) {
          if (!patternList.some((w) => w.toLowerCase() === name.toLowerCase())) { patternList.push(name); patternAdded++; }
        }
        if (isShared) {
          if (!sharedList.some((w) => w.toLowerCase() === name.toLowerCase())) { sharedList.push(name); sharedAdded++; }
        }
      });
    });
    savePatternWorkers(patternList);
    writeJson(KEY_WORKERS_SHARED_EXT, sharedList);
    toast(`นำเข้ารายชื่อพนักงานแล้ว — เจาะลาย/ปั๊มผ้า ${patternAdded} คน, ทอ/ตกแต่ง ${sharedAdded} คน`);
  }

  /* ============================================================
     UI
     ============================================================ */
  function loadOrders() { return readJson(KEY_PATTERN, {}); }
  function saveOrder(designId, rec) { const all = loadOrders(); all[designId] = rec; writeJson(KEY_PATTERN, all); }
  function ensureOrder(designId) {
    const all = loadOrders();
    if (all[designId]) {
      const rec = all[designId];
      if (!Array.isArray(rec.workerNames)) { rec.workerNames = has(rec.workerName) ? [rec.workerName] : []; delete rec.workerName; } // migrate จากเวอร์ชันก่อนที่มอบหมายได้คนเดียว
      return rec;
    }
    return { designWidthM: "", designLengthM: "", sideAllowanceM: 0.15, endAllowanceM: 0.15, storeBufferPct: 0, workerNames: [], requisitionIssued: false, requisitionAt: null };
  }

  const state = { designId: null };

  function field(label, inner) { return `<label class="pf">${label}${inner}</label>`; }
  function inp(name, value, attrs = "") { return `<input name="${esc(name)}" value="${esc(value == null ? "" : value)}" inputmode="decimal" ${attrs}>`; }
  function res(label, value, cls = "") { return `<div class="pr ${cls}"><small>${label}</small><strong>${value}</strong></div>`; }

  function jobPickerHtml() {
    const plans = PE() ? PE().readJson(PE().KEY_PLANS, {}) : {};
    const isSkipped = (id) => typeof OverviewEngine !== "undefined" && OverviewEngine.isSkipped ? OverviewEngine.isSkipped(id) : false;
    const typeOf = (d) => typeof OverviewEngine !== "undefined" && OverviewEngine.typeOf ? OverviewEngine.typeOf(d) : "MO";
    const ready = designs.filter((d) => d.job === "OPENED" && plans[d.id] && plans[d.id].savedAt && !isSkipped(d.id) && typeOf(d) !== "SO");
    if (!ready.length) return `<p class="col-empty">ยังไม่มี Job ที่ Planning บันทึกแผน (ทำใบวางแผนงานให้เสร็จก่อน)</p>`;
    return `<div class="pw-job-grid">${ready.map((d) => `<div class="pw-job-card-wrap">
      <button type="button" class="pw-job-card dept-pattern ${state.designId === d.id ? "active" : ""}" data-ppick="${esc(d.id)}">
        <strong>${esc(d.id)}</strong><span>${esc(d.project)}</span><small>${esc(plans[d.id].moNo || "ยังไม่มีเลข M/O")}</small>
      </button>${typeof OverviewEngine !== "undefined" && OverviewEngine.skipButtonHtml ? OverviewEngine.skipButtonHtml(d.id, d.id) : ""}
    </div>`).join("")}</div>`;
  }

  function rosterCardHtml() {
    const workers = loadPatternWorkers();
    return `
    <section class="department-panel pw-card">
      <div class="panel-heading"><div><strong>รายชื่อพนักงานแผนกเจาะลาย/ขยายลาย</strong><small>เพิ่ม/ลบรายชื่อได้อิสระ — ใช้เลือกมอบหมายผู้รับผิดชอบต่อใบสั่งด้านล่าง (ยังไม่มีข้อมูลจริงตั้งต้น กรุณากรอกรายชื่อจริงของแผนก)</small></div></div>
      <div class="pw-body">
        <div class="pw-row">
          ${field("ชื่อพนักงาน", `<input id="ppNewWorkerName" placeholder="พิมพ์ชื่อแล้วกดเพิ่มรายชื่อ">`)}
          <button type="button" class="action-button primary" data-add-worker>+ เพิ่มรายชื่อ</button>
          <button type="button" class="action-button" data-export-pattern-workers>ส่งออก Excel</button>
          <label class="file-picker">นำเข้าจาก Excel<input type="file" id="ppWorkersImportFile" accept=".xlsx,.xls" data-import-pattern-workers></label>
        </div>
        ${workers.length
          ? `<div class="pw-worker-tags">${workers.map((w, i) => `<span>${esc(w)}<button type="button" class="pw-worker-x" data-remove-worker="${i}" title="ลบรายชื่อนี้">×</button></span>`).join("")}</div>`
          : `<p class="col-empty">ยังไม่มีรายชื่อพนักงาน — เพิ่มด้านบน</p>`}
      </div>
    </section>`;
  }

  function workerAssignHtml(rec, workersList) {
    if (!workersList.length) return `<p class="col-empty">ยังไม่มีรายชื่อ (เพิ่มรายชื่อพนักงานด้านบนสุดของหน้านี้ก่อน)</p>`;
    return `<div class="pw-worker-check-grid">${workersList.map((w, i) => `<label class="pw-worker-check">
      <input type="checkbox" data-worker-assign="${i}" value="${esc(w)}" ${(rec.workerNames || []).includes(w) ? "checked" : ""}> ${esc(w)}
    </label>`).join("")}</div>`;
  }

  function productionSeg(designId) {
    const t = baseTasks.find((x) => x.designId === designId && x.dept === "Production");
    return t ? { start: t.start, end: t.end } : null;
  }
  function weaveSeg(designId) {
    const t = baseTasks.find((x) => x.designId === designId && x.dept === "Weaving");
    return t ? { start: t.start, end: t.end } : null;
  }

  function buildJobPanel() {
    const plan = PE().readJson(PE().KEY_PLANS, {})[state.designId];
    if (!plan) return `<p class="col-empty">ไม่พบใบวางแผนงานของ Job นี้</p>`;
    const rec = ensureOrder(state.designId);
    const info = designs.find((d) => d.id === state.designId) || {};
    const workersList = loadPatternWorkers();
    const punchGrade = plan.punchMethodOverride ? PE().PUNCH_GRADES.find((g) => `${g.grade}|${g.method}` === plan.punchMethodOverride) : PE().suggestGrade(PE().PUNCH_GRADES, plan.patternPct);
    const prodSeg = productionSeg(state.designId), weSeg = weaveSeg(state.designId);
    const canvas = computeCanvasNeed(rec);
    const finalLengthM = canvas.requiredLengthM * (1 + num(rec.storeBufferPct) / 100);

    return `
    <section class="department-panel pw-card">
      <div class="panel-heading"><div><strong>ใบสั่งเจาะลาย/ขยายลาย</strong><small>รับจากแผนกวางแผน — เกรดและระยะเวลาดึงจากใบวางแผนงานที่บันทึกไว้ (ตารางประสิทธิภาพเดียวกัน)</small></div></div>
      <div class="pw-body">
        <div class="pw-row">
          ${res("Design", esc(state.designId))}${res("M/O", esc(plan.moNo || "-"))}${res("โปรเจกต์", esc(info.project || "-"))}
          ${res("วันที่รับงาน (ตาม Master Plan)", prodSeg ? PE().fmtThaiDate(PE().offsetToDate(prodSeg.start)) : "ยังไม่บันทึกแผน")}
        </div>
        <div class="pw-res-row">
          ${res("เกรดแผนกเจาะลาย", punchGrade ? `เกรด ${punchGrade.grade} (${punchGrade.method})` : "-", "main")}
          ${res("ใช้เวลา", prodSeg ? `${fmt(prodSeg.end - prodSeg.start, 1)} วัน` : "-")}
          ${res("เสร็จ/พร้อมส่งมอบ", prodSeg ? PE().fmtThaiDate(PE().offsetToDate(prodSeg.end)) : "-", "main")}
        </div>
        <div class="pw-row" style="margin-top:8px;flex-direction:column;align-items:stretch;gap:4px">
          <label class="pf" style="margin-bottom:0">ผู้รับผิดชอบปั๊มผ้า/เจาะลาย (ปั๊มผ้ามีได้หลายคน — ติ๊กเลือกได้มากกว่า 1)</label>
          ${workerAssignHtml(rec, workersList)}
          ${(rec.workerNames || []).length ? `<small style="color:var(--muted);font-size:9px">มอบหมายแล้ว ${rec.workerNames.length} คน: ${rec.workerNames.map(esc).join(", ")}</small>` : ""}
        </div>
      </div>
    </section>

    <section class="department-panel pw-card wide">
      <div class="panel-heading"><div><strong>คำนวณผ้าใบสำหรับเจาะลาย</strong><small>หน้าผ้าใบที่มี: 3 / 5 / 6 เมตร — เลือกหน้าแคบสุดที่พอกับ (ความกว้างแบบ + เผื่อขึงผ้า 2 ด้าน) ระบบคำนวณความยาวผ้าใบที่ต้องเบิกให้อัตโนมัติ</small></div></div>
      <div class="pw-body">
        <div class="pw-row">
          ${field("ความกว้างแบบ (ม.)", inp("designWidthM", rec.designWidthM, 'class="pw-num"'))}
          ${field("ความยาวแบบ (ม.)", inp("designLengthM", rec.designLengthM, 'class="pw-num"'))}
          ${field("เผื่อขึงผ้าด้านข้าง/ฝั่ง (ม.)", inp("sideAllowanceM", rec.sideAllowanceM, 'class="pw-num"'))}
          ${field("เผื่อขึงผ้าหัว-ท้าย/ฝั่ง (ม.)", inp("endAllowanceM", rec.endAllowanceM, 'class="pw-num"'))}
        </div>
        <small class="pw-dye-warn" style="color:var(--muted);font-weight:400">สมมติฐาน: ค่าเผื่อขึงผ้าเริ่มต้น 0.15 ม./ฝั่ง (ยังไม่ยืนยันกับหน้างานจริง) แก้ได้ตามมาตรฐานจริงของแผนก</small>
        ${!has(rec.designWidthM) || !has(rec.designLengthM) ? `<p class="col-empty">กรอกความกว้าง/ยาวแบบเพื่อคำนวณ</p>` : `
        <div class="pw-res-row" style="margin-top:8px">
          ${res("ความกว้างที่ต้องใช้ (รวมเผื่อ)", `${fmt(canvas.requiredWidthM, 2)} ม.`)}
          ${canvas.needsSplice ? `<div class="pr warn"><small>หน้าผ้าใบที่เลือก</small><strong>เกิน 6 ม. — ต้องต่อผ้า</strong></div>` : res("หน้าผ้าใบที่ต้องใช้", `${canvas.canvasWidthM} ม.`, "main")}
          ${canvas.wasteWidthM != null ? res("เหลือหน้าผ้าใบ (Waste)", `${fmt(canvas.wasteWidthM, 2)} ม.`) : ""}
          ${res("ความยาวผ้าใบที่ต้องใช้ (รวมเผื่อ)", `${fmt(canvas.requiredLengthM, 2)} ม.`, "main")}
        </div>`}
      </div>
    </section>

    <section class="department-panel pw-card">
      <div class="panel-heading"><div><strong>ใบเบิกผ้าใบกับแผนก Store</strong><small>เบิกตามหน้าผ้าใบและความยาวที่คำนวณได้ — บวกเผื่อตัดขาด/เศษเพิ่มได้</small></div></div>
      <div class="pw-body">
        <div class="pw-row">
          ${field("เผื่อตัด/เศษเพิ่ม (%)", inp("storeBufferPct", rec.storeBufferPct, 'class="pw-num tiny"'))}
          ${res("หน้าผ้าใบที่เบิก", canvas.needsSplice ? "ต้องต่อผ้า" : (canvas.canvasWidthM ? `${canvas.canvasWidthM} ม.` : "-"))}
          ${res("ความยาวที่เบิกสุทธิ", `${fmt(finalLengthM, 2)} ม.`, "main")}
        </div>
        <div class="pw-save-bar">
          <button type="button" class="action-button primary" data-issue-req ${!has(rec.designWidthM) || !has(rec.designLengthM) ? "disabled" : ""}>ออกใบเบิกกับ Store</button>
          ${rec.requisitionIssued ? `<small>เบิกแล้ว ${new Date(rec.requisitionAt).toLocaleString("th-TH")}</small>` : `<small>ยังไม่ได้เบิก</small>`}
        </div>
      </div>
    </section>

    <section class="department-panel pw-card">
      <div class="panel-heading"><div><strong>ส่งมอบให้แผนกทอ</strong><small>ผ้าใบพร้อมตั้งแต่เจาะลายเสร็จ แต่แผนกทอจะเริ่มงานจริงตามคิวใน Master Plan (หลังย้อมไหมเสร็จ)</small></div></div>
      <div class="pw-body">
        <div class="pw-res-row">
          ${res("ผ้าใบพร้อม (เจาะลายเสร็จ)", prodSeg ? PE().fmtThaiDate(PE().offsetToDate(prodSeg.end)) : "-", "main")}
          ${res("แผนกทอเริ่มงานตาม Master Plan", weSeg ? PE().fmtThaiDate(PE().offsetToDate(weSeg.start)) : "-")}
        </div>
        <p style="color:var(--muted);font-size:10px;margin:6px 2px 0">เมื่อออกใบเบิกกับ Store แล้ว ให้ไปติ๊ก “ผ้าใบสำหรับทอพร้อมแล้ว” ในหน้า “ส่งแผนกทอ” เพื่อยืนยันครบวัตถุดิบก่อนแผนกทอขึ้นทอ</p>
      </div>
    </section>

    ${typeof CostEngine !== "undefined" && CostEngine.extraCostWidgetHtml ? CostEngine.extraCostWidgetHtml(state.designId, "pattern") : ""}`;
  }

  function build() {
    const root = $("#patternView");
    root.innerHTML = `
      <section class="page-heading">
        <div>
          <p class="eyebrow">PATTERN PUNCHING DEPARTMENT</p>
          <h1>เจาะลาย/ขยายลาย</h1>
          <p class="subtitle">รับใบสั่งจากแผนกวางแผน → กำหนดหน้าผ้าใบและความยาวที่ต้องใช้ → ออกใบเบิกกับ Store → ส่งมอบให้แผนกทอตาม Master Plan</p>
        </div>
      </section>
      <div id="ppRoster"></div>
      <section class="department-panel pw-card">
        <div class="panel-heading"><div><strong>เลือก Job ที่บันทึกแผนแล้ว</strong><small>ต้องทำ "ใบวางแผนงาน" และกดบันทึกแผนก่อน</small></div></div>
        <div class="pw-body" id="ppJobPicker"></div>
      </section>
      <div id="ppForm"></div>`;
  }

  function renderAll() {
    $("#ppRoster").innerHTML = rosterCardHtml();
    $("#ppJobPicker").innerHTML = jobPickerHtml();
    const formEl = $("#ppForm");
    const focusInfo = captureFocus(formEl);
    formEl.innerHTML = state.designId ? buildJobPanel() : `<p class="col-empty">เลือก Job ด้านบนเพื่อดูใบสั่งเจาะลาย/ขยายลาย</p>`;
    restoreFocus(formEl, focusInfo);
  }

  let built = false;
  function renderPattern() {
    if (!built) { build(); built = true; bind(); }
    renderAll();
  }

  const CANVAS_FIELDS = ["designWidthM", "designLengthM", "sideAllowanceM", "endAllowanceM", "storeBufferPct"];

  function saveField(name, value) {
    if (!state.designId || !name) return;
    const rec = loadOrders()[state.designId] || ensureOrder(state.designId);
    rec[name] = value;
    if (CANVAS_FIELDS.includes(name)) { rec.requisitionIssued = false; rec.requisitionAt = null; } // แก้ตัวเลขผ้าใบแล้วต้องเบิกใหม่
    saveOrder(state.designId, rec);
    renderAll();
  }

  function bind() {
    const root = $("#patternView");
    root.addEventListener("click", (e) => {
      const pick = e.target.closest("[data-ppick]");
      if (pick) { state.designId = pick.dataset.ppick; renderAll(); return; }
      const issue = e.target.closest("[data-issue-req]");
      if (issue && !issue.disabled) {
        const rec = loadOrders()[state.designId] || ensureOrder(state.designId);
        rec.requisitionIssued = true;
        rec.requisitionAt = new Date().toISOString();
        saveOrder(state.designId, rec);
        toast(`${state.designId}: ออกใบเบิกผ้าใบกับ Store แล้ว`);
        renderAll();
        return;
      }
      const addW = e.target.closest("[data-add-worker]");
      if (addW) {
        const input = $("#ppNewWorkerName");
        const name = input ? input.value : "";
        if (has(name)) { addPatternWorker(name); renderAll(); const again = $("#ppNewWorkerName"); if (again) again.focus(); }
        return;
      }
      const rmW = e.target.closest("[data-remove-worker]");
      if (rmW) {
        removePatternWorker(Number(rmW.dataset.removeWorker));
        renderAll();
        return;
      }
      const expW = e.target.closest("[data-export-pattern-workers]");
      if (expW) { exportPatternWorkersExcel(); return; }
      const moSkip = e.target.closest("[data-mo-skip]");
      if (moSkip) {
        if (typeof OverviewEngine === "undefined" || !OverviewEngine.setSkipped) return;
        const designId = moSkip.dataset.moSkip;
        if (!confirm(`ยืนยันกดผ่าน M/O,S/O "${moSkip.dataset.moSkipMono || designId}" — จะหายจากคิวงานของทุกแผนกทันที (ใช้เมื่องานนี้ส่งไปนานแล้ว ไม่อยู่ในกระบวนการผลิตแล้วเท่านั้น)`)) return;
        OverviewEngine.setSkipped(designId, moSkip.dataset.moSkipMono);
        if (state.designId === designId) state.designId = null;
        toast("กดผ่านแล้ว — ยกเลิกได้ที่หน้าภาพรวมการผลิต");
        renderAll();
        return;
      }
      if (typeof CostEngine !== "undefined" && CostEngine.handleExtraCostClick && CostEngine.handleExtraCostClick(e, renderAll)) return;
    });
    root.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.target && e.target.id === "ppNewWorkerName") {
        e.preventDefault();
        addPatternWorker(e.target.value);
        renderAll();
        const again = $("#ppNewWorkerName");
        if (again) again.focus();
      }
    });
    root.addEventListener("input", (e) => {
      if (typeof CostEngine !== "undefined" && CostEngine.handleExtraCostFieldChange && CostEngine.handleExtraCostFieldChange(e)) return;
      if (!e.target.name) return;
      saveField(e.target.name, e.target.value);
    });
    root.addEventListener("change", (e) => {
      if (e.target && e.target.hasAttribute && e.target.hasAttribute("data-import-pattern-workers")) {
        const file = e.target.files && e.target.files[0];
        if (file) importPatternWorkersExcel(file).then(() => { renderAll(); e.target.value = ""; });
        return;
      }
      const wcb = e.target.hasAttribute && e.target.hasAttribute("data-worker-assign") ? e.target : null;
      if (wcb && state.designId) {
        const rec = loadOrders()[state.designId] || ensureOrder(state.designId);
        const set = new Set(rec.workerNames || []);
        if (wcb.checked) set.add(wcb.value); else set.delete(wcb.value);
        rec.workerNames = Array.from(set);
        saveOrder(state.designId, rec); // มอบหมาย/ถอดคนปั๊มผ้าไม่กระทบสถานะใบเบิก Store
        renderAll();
      }
    });
  }

  window.renderPattern = renderPattern;
})();
