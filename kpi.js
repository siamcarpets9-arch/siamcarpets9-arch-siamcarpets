/* ============================================================
   แท็บ "KPI" — รวมผล KPI ของทุกแผนกไว้ที่เดียว (ย้ายมาจากที่เคยกระจายอยู่คนละหน้า)
   - KPI แยกตาม Designer (ย้ายมาจากหน้า Design)
   - นำเข้า/แสดงผล KPI แผนกย้อม, แผนกวางแผน (ส่งมอบ), แผนกตกแต่ง (ประสิทธิภาพ + การเบิกใช้กาว), แผนกขยายลาย/เจาะลาย
     (ย้ายมาจากหน้าใบวางแผนงาน / เจาะลาย-ขยายลาย / ทากาวตกแต่ง ตามลำดับ — ไม่ต้องแสดงซ้ำที่หน้าแผนกตัวเองอีก)
   ต้องโหลดหลัง app.js (ใช้ $, toast, designs, normalizeDesigner, toDate, periodRange, inPeriod, monthNames, tag, statusKind, REPORT_DATE)
   และหลัง sales.js (ใช้ SalesEngine ตอนนำเข้าไฟล์ Excel เพื่อจับคู่ M/O)
   ============================================================ */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const num = (v) => { const n = parseFloat(String(v == null ? "" : v).replace(/,/g, "")); return Number.isFinite(n) ? n : 0; };
  const has = (v) => String(v == null ? "" : v).trim() !== "";
  const fmt = (n, d = 2) => { const x = typeof n === "number" ? n : parseFloat(String(n == null ? "" : n).replace(/,/g, "")); return (Number.isFinite(x) ? x : 0).toLocaleString("th-TH", { minimumFractionDigits: d, maximumFractionDigits: d }); };
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const readJson = (k, fb) => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : fb; } catch (e) { return fb; } };
  const writeJson = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* บันทึกไม่ได้ก็ยังใช้ต่อได้ */ } };

  const KEY_DYE_KPI = "siam-dye-kpi";
  const KEY_PLANNING_KPI = "siam-planning-kpi";
  const KEY_FIN_PRODUCTIVITY_KPI = "siam-finishing-kpi";
  const KEY_FIN_GLUE_KPI = "siam-glue-kpi";
  const KEY_PATTERN_KPI = "siam-pattern-kpi";
  const KEY_DESIGNER_KPI_HIDDEN = "siam-designer-kpi-hidden"; // string[] ของชื่อ Designer (normalize แล้ว) ที่ไม่ใช่พนักงานจริง — ซ่อนออกจากตาราง KPI แยกตาม Designer

  function loadPlans() {
    const PE = window.PlanningEngine;
    if (PE && typeof PE.readJson === "function" && PE.KEY_PLANS) return PE.readJson(PE.KEY_PLANS, {});
    return readJson("siam-planning-worksheets", {});
  }

  function parseKpiDateCell(cell) {
    if (cell instanceof Date) return cell.toISOString().slice(0, 10);
    if (typeof cell === "number" && cell > 20000) { const d = XLSX.SSF ? XLSX.SSF.parse_date_code(cell) : null; if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`; }
    if (typeof cell === "string" && /^\d{4}-\d{2}-\d{2}/.test(cell)) return cell.slice(0, 10);
    return "";
  }

  /* ---------- Designer KPI (ย้ายมาจากหน้า Design) ---------- */
  function loadHiddenDesigners() { return readJson(KEY_DESIGNER_KPI_HIDDEN, []); }
  function hideDesignerName(name) {
    const list = loadHiddenDesigners();
    if (!list.includes(name)) { list.push(name); writeJson(KEY_DESIGNER_KPI_HIDDEN, list); }
  }
  function restoreDesignerName(name) {
    writeJson(KEY_DESIGNER_KPI_HIDDEN, loadHiddenDesigners().filter((n) => n !== name));
  }

  function renderDesignerKpi() {
    const selectedPeriod = $("#designerKpiPeriod") ? $("#designerKpiPeriod").value || "all" : "all";
    const range = periodRange(selectedPeriod);
    const hidden = new Set(loadHiddenDesigners());
    // KPI นี้ติดตามภาระงาน "คำขอทำแบบ" ของนักออกแบบเท่านั้น — ตัด M/O·S/O ที่เปิดงานจริงแล้ว (job==="OPENED")
    // ออกไป เพราะไม่มีนักออกแบบ/วันที่รับงานผูกอยู่ ไม่งั้นจะไปกองรวมเป็น "ไม่ระบุ" ปนกับงานทำแบบจริง
    const periodRows = designs.filter((row) => row.job !== "OPENED" && inPeriod(row.receivedDate, range));
    const groups = new Map();
    let countedRows = 0;
    periodRows.forEach((row) => {
      const key = normalizeDesigner(row.owner || row.designer);
      if (hidden.has(key)) return; // ชื่อนี้ถูกทำเครื่องหมายว่าไม่ใช่พนักงานบริษัทฯ — ไม่นับรวมในตาราง KPI
      countedRows++;
      if (!groups.has(key)) groups.set(key, { name: key, total: 0, submitted: 0, onTime: 0, pending: 0, overdue: 0, lead: [] });
      const item = groups.get(key);
      item.total += 1;
      const received = toDate(row.receivedDate);
      const due = toDate(row.dueDate);
      const submitted = toDate(row.submittedDate);
      if (submitted) {
        item.submitted += 1;
        if (due && submitted <= due) item.onTime += 1;
        if (received) { const days = (submitted - received) / 86400000; if (days >= 0) item.lead.push(days); }
      } else {
        item.pending += 1;
        if (due && due < REPORT_DATE) item.overdue += 1;
      }
    });
    const rows = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
    if ($("#designerKpiCount")) $("#designerKpiCount").textContent = `${rows.length} Designer · ${countedRows} งาน`;
    const hiddenList = [...hidden];
    if ($("#designerKpiHidden")) {
      $("#designerKpiHidden").innerHTML = hiddenList.length
        ? `<small>ซ่อนอยู่ (ไม่ใช่พนักงานบริษัทฯ):</small> ${hiddenList.map((n) => `<span class="kpi-hidden-chip">${esc(n)}<button type="button" data-restore-designer="${esc(n)}" title="กู้คืนกลับตาราง">กู้คืน</button></span>`).join("")}`
        : "";
    }
    if ($("#designerKpiTable")) {
      $("#designerKpiTable").innerHTML = rows.length ? rows.map((row) => {
        const rate = row.submitted ? `${(row.onTime / row.submitted * 100).toFixed(1)}%` : "ไม่มีข้อมูล";
        const avg = row.lead.length ? `${(row.lead.reduce((a, b) => a + b, 0) / row.lead.length).toFixed(1)} วัน` : "ไม่มีข้อมูล";
        const status = row.overdue ? "ต้องติดตาม" : row.pending ? "กำลังทำ" : "ตามแผน";
        const kind = row.overdue ? "blocked" : row.pending ? "review" : "";
        return `<tr><td class="designer-name">${esc(row.name)}</td><td>${row.total}</td><td>${row.submitted}</td><td>${row.onTime}</td><td><div class="designer-score"><span>${rate}</span>${row.submitted ? `<span class="score-bar"><i style="width:${Math.min(row.onTime / row.submitted * 100, 100)}%"></i></span>` : ""}</div></td><td>${row.pending}</td><td>${row.overdue}</td><td>${avg}</td><td>${tag(status, kind)}</td><td><button type="button" class="text-button" data-hide-designer="${esc(row.name)}" title="ชื่อนี้ไม่ใช่พนักงานบริษัทฯ — ซ่อนออกจากตารางนี้">ซ่อน</button></td></tr>`;
      }).join("") : `<tr><td colspan="10" class="empty-gantt">ยังไม่มีข้อมูล Designer</td></tr>`;
    }
  }
  function populateDesignerPeriods() {
    const select = $("#designerKpiPeriod");
    if (!select) return;
    const current = select.value || "all";
    const years = new Set();
    designs.forEach((row) => { const date = toDate(row.receivedDate); if (date) years.add(date.getFullYear()); });
    years.add(2026);
    const orderedYears = [...years].sort((a, b) => b - a);
    select.innerHTML = `<option value="all">ทุกช่วงเวลา</option>${orderedYears.map((year) => `
      <optgroup label="รายเดือน · ${year}">${monthNames.map((name, index) => `<option value="month-${year}-${String(index + 1).padStart(2, "0")}">${name} ${year}</option>`).join("")}</optgroup>
      <optgroup label="รายไตรมาส · ${year}">${[1, 2, 3, 4].map((quarter) => `<option value="quarter-${year}-Q${quarter}">ไตรมาส ${quarter} · ${year}</option>`).join("")}</optgroup>
      <option value="year-${year}">ปี ${year}</option>`).join("")}`;
    if ([...select.options].some((option) => option.value === current)) select.value = current;
  }

  /* ---------- M/O matching (คัดลอกมาปรับใช้ 3 รูปแบบ ตามไฟล์ต้นทางเดิม เพื่อคงพฤติกรรมการจับคู่เดิมทุกประการ) ---------- */
  // รูปแบบที่ 1: KPI แผนกย้อม + แผนกวางแผน (เดิมอยู่ planning.js) — ต้องตัดคำนำหน้า "M/O " ออกก่อนเทียบเสมอ
  function normMoKeyDyePlan(raw) {
    const s = String(raw || "").trim().toUpperCase().replace(/^M\/O\s*/, "");
    const m = s.match(/^([A-Z]*)\s*0*(\d+)\s*\/\s*0*(\d+)/);
    if (!m) return s.replace(/\s+/g, "");
    const [, prefix, num2, yy] = m;
    return `${prefix}|${num2}|${yy}`;
  }
  function findDesignIdByMoNoDyePlan(moNo) {
    try {
      if (typeof SalesEngine === "undefined" || !SalesEngine.getDocs) return null;
      const key = normMoKeyDyePlan(moNo);
      if (!key) return null;
      const doc = SalesEngine.getDocs().find((d) => normMoKeyDyePlan(d.no) === key);
      return doc ? doc.designId : null;
    } catch (e) { return null; }
  }
  // รูปแบบที่ 2: KPI ขยายลาย/เจาะลาย (เดิมอยู่ pattern.js) — ไม่มีคำนำหน้า "M/O " ในข้อมูลต้นทาง จึงไม่ต้องตัด
  function normMoKeyPattern(raw) {
    const s = String(raw || "").trim().toUpperCase();
    const m = s.match(/^([A-Z]*)\s*0*(\d+)\s*\/\s*0*(\d+)/);
    if (!m) return s.replace(/\s+/g, "");
    const [, prefix, num2, yy] = m;
    return `${prefix}|${num2}|${yy}`;
  }
  function findDesignIdByMoNoPattern(moNo) {
    try {
      if (typeof SalesEngine === "undefined" || !SalesEngine.getDocs) return null;
      const key = normMoKeyPattern(moNo);
      if (!key) return null;
      const doc = SalesEngine.getDocs().find((d) => normMoKeyPattern(d.no) === key);
      return doc ? doc.designId : null;
    } catch (e) { return null; }
  }
  // รูปแบบที่ 3: KPI แผนกตกแต่ง/ทากาว (เดิมอยู่ finishing.js) — ไฟล์บางไฟล์เขียน "M/O 109/26" / "S/O 12/26" ต้องตัดคำนำหน้าทั้งสองแบบ
  function normMoKeyFinishing(raw) {
    const s = String(raw || "").replace(/^[MS]\/O\s*/i, "").trim().toUpperCase();
    const m = s.match(/^([A-Z]*)\s*0*(\d+)\s*\/\s*0*(\d+)/);
    if (!m) return s.replace(/\s+/g, "");
    const [, prefix, num2, yy] = m;
    return `${prefix}|${num2}|${yy}`;
  }
  function findDesignIdByMoNoFinishing(moNo) {
    try {
      if (typeof SalesEngine === "undefined" || !SalesEngine.getDocs) return null;
      const key = normMoKeyFinishing(moNo);
      if (!key) return null;
      const doc = SalesEngine.getDocs().find((d) => normMoKeyFinishing(d.no) === key);
      return doc ? doc.designId : null;
    } catch (e) { return null; }
  }

  /* ---------- KPI แผนกย้อม (Dye_KPI.xlsx ชีต "MO" และ " ย้อมเพิ่ม ") ---------- */
  async function importDyeKpiExcel(file) {
    if (typeof XLSX === "undefined") { toast("ไม่พบไลบรารี XLSX"); return; }
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const DYE_SHEETS = ["MO", " ย้อมเพิ่ม "]; // ต้องตรงเป๊ะรวมช่องว่างนำ/ตาม — ชีตอื่น (เช่น Sheet1 รูปแบบเก่า) ข้ามทิ้ง
    const store = readJson(KEY_DYE_KPI, {});
    let imported = 0, skippedNoMatch = 0;
    const matchedDesigns = new Set(), unmatched = new Set();
    wb.SheetNames.forEach((sheetName) => {
      if (DYE_SHEETS.indexOf(sheetName) < 0) return;
      const isMoSheet = sheetName === "MO";
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: "", raw: true });
      aoa.forEach((row) => {
        const orderNo = row[1];
        if (!has(orderNo)) return;
        if (/order/i.test(String(orderNo))) return;
        const designId = findDesignIdByMoNoDyePlan(orderNo);
        if (!designId) { skippedNoMatch++; unmatched.add(String(orderNo)); return; }
        const rowObj = {
          colorNo: has(row[2]) ? String(row[2]) : "",
          colorCode: has(row[3]) ? String(row[3]) : "",
          yarnType: has(row[4]) ? String(row[4]) : "",
          lot: has(row[5]) ? String(row[5]) : "",
          orderedKg: num(row[6]),
          potNo: has(row[7]) ? String(row[7]) : "",
          reqKg: num(row[8]),
          actualKg: num(row[9]),
          planDue: parseKpiDateCell(row[10]),
          actualDone: parseKpiDateCell(row[11]),
          sendDue: isMoSheet ? parseKpiDateCell(row[13]) : parseKpiDateCell(row[12]),
          onTime: isMoSheet ? (num(row[12]) === 1) : null
        };
        if (!store[designId]) store[designId] = { moNo: String(orderNo), rows: [] };
        if (!store[designId].rows) store[designId].rows = [];
        store[designId].moNo = store[designId].moNo || String(orderNo);
        store[designId].rows.push(rowObj);
        store[designId].importedAt = new Date().toISOString();
        matchedDesigns.add(designId);
        imported++;
      });
    });
    writeJson(KEY_DYE_KPI, store);
    toast(`นำเข้าเสร็จ: บันทึก ${imported} แถว (${matchedDesigns.size} M/O) · ข้าม (ไม่พบ M/O ที่ตรงกัน) ${skippedNoMatch} แถว`);
    if (unmatched.size) console.warn("[kpi dye-kpi import] ไม่พบ M/O ที่ตรงกันในระบบ:", [...unmatched].slice(0, 30));
  }
  function dyeKpiSummaryRows() {
    const store = readJson(KEY_DYE_KPI, {});
    const plans = loadPlans();
    return Object.keys(store).map((designId) => {
      const rec = store[designId] || {};
      const rows = rec.rows || [];
      const orderedKgSum = rows.reduce((t, r) => t + num(r.orderedKg), 0);
      const actualKgSum = rows.reduce((t, r) => t + num(r.actualKg), 0);
      const onTimeCount = rows.filter((r) => r.onTime === true).length;
      const onTimeKnownCount = rows.filter((r) => r.onTime === true || r.onTime === false).length;
      const lastDone = rows.reduce((mx, r) => (r.actualDone && r.actualDone > mx ? r.actualDone : mx), "");
      const moNo = (plans[designId] && plans[designId].moNo) || rec.moNo || designId;
      return { designId, moNo, colorCount: rows.length, orderedKgSum, actualKgSum, onTimeCount, onTimeKnownCount, lastDone };
    }).sort((a, b) => String(a.moNo).localeCompare(String(b.moNo), "th"));
  }
  function renderDyeKpiResults() {
    const el = $("#kpiDyeResults");
    if (!el) return;
    const rows = dyeKpiSummaryRows();
    el.innerHTML = rows.length ? `<div class="table-wrap"><table class="calc-table">
      <thead><tr><th>M/O</th><th class="num">จำนวนสี</th><th class="num">นน.สั่งย้อมรวม (กก.)</th><th class="num">นน.โอนจริงรวม (กก.)</th><th class="num">ตรงแผน</th><th>วันที่ย้อมเสร็จล่าสุด</th></tr></thead>
      <tbody>${rows.map((r) => `<tr><td>${esc(r.moNo)}</td><td class="num">${r.colorCount}</td><td class="num">${fmt(r.orderedKgSum, 3)}</td><td class="num">${fmt(r.actualKgSum, 3)}</td><td class="num">${r.onTimeCount} / ${r.onTimeKnownCount}</td><td>${esc(r.lastDone || "-")}</td></tr>`).join("")}</tbody>
    </table></div>` : `<p class="col-empty">ยังไม่มีข้อมูล KPI แผนกย้อม — นำเข้าไฟล์ Excel ด้านบน</p>`;
  }

  /* ---------- KPI แผนกวางแผน/ส่งมอบ (Planning_KPI.xlsx ชีต "1.ส่งมอบทั้งหมด ") ---------- */
  async function importPlanningKpiExcel(file) {
    if (typeof XLSX === "undefined") { toast("ไม่พบไลบรารี XLSX"); return; }
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const SHEET_NAME = "1.ส่งมอบทั้งหมด "; // ต้องตรงเป๊ะรวมช่องว่างต่อท้าย
    if (wb.SheetNames.indexOf(SHEET_NAME) < 0) { toast(`ไม่พบชีต "${SHEET_NAME}" ในไฟล์นี้`); return; }
    const store = readJson(KEY_PLANNING_KPI, {});
    let imported = 0, skippedNoMatch = 0;
    const matchedDesigns = new Set(), unmatched = new Set();
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[SHEET_NAME], { header: 1, defval: "", raw: true });
    aoa.forEach((row) => {
      const moNo = row[1];
      if (!has(moNo)) return;
      if (String(moNo).trim().toUpperCase() === "M/O") return;
      const designId = findDesignIdByMoNoDyePlan(moNo);
      if (!designId) { skippedNoMatch++; unmatched.add(String(moNo)); return; }
      const docNo = has(row[15]) ? String(row[15]) : (has(row[17]) ? String(row[17]) : "");
      const rowObj = {
        receivedDate: parseKpiDateCell(row[0]),
        customer: has(row[2]) ? String(row[2]) : "",
        project: has(row[3]) ? String(row[3]) : "",
        quality: has(row[4]) ? String(row[4]) : "",
        dueDate: parseKpiDateCell(row[5]),
        pieceNo: has(row[6]) ? String(row[6]) : "",
        colorCount: num(row[7]),
        sqm: num(row[8]),
        grade: has(row[9]) ? String(row[9]) : "",
        location: has(row[10]) ? String(row[10]) : "",
        weaveStart: parseKpiDateCell(row[11]),
        weaveDone: parseKpiDateCell(row[12]),
        remaining: num(row[13]),
        transferDate: parseKpiDateCell(row[14]),
        docNo,
        shipDate: parseKpiDateCell(row[16])
      };
      if (!store[designId]) store[designId] = { moNo: String(moNo), rows: [] };
      if (!store[designId].rows) store[designId].rows = [];
      store[designId].moNo = store[designId].moNo || String(moNo);
      store[designId].rows.push(rowObj);
      store[designId].importedAt = new Date().toISOString();
      matchedDesigns.add(designId);
      imported++;
    });
    writeJson(KEY_PLANNING_KPI, store);
    toast(`นำเข้าเสร็จ: บันทึก ${imported} แถว (${matchedDesigns.size} M/O) · ข้าม (ไม่พบ M/O ที่ตรงกัน) ${skippedNoMatch} แถว`);
    if (unmatched.size) console.warn("[kpi planning-kpi import] ไม่พบ M/O ที่ตรงกันในระบบ:", [...unmatched].slice(0, 30));
  }
  function planningKpiSummaryRows() {
    const store = readJson(KEY_PLANNING_KPI, {});
    const plans = loadPlans();
    return Object.keys(store).map((designId) => {
      const rec = store[designId] || {};
      const rows = rec.rows || [];
      const sqmSum = rows.reduce((t, r) => t + num(r.sqm), 0);
      const customer = rows.length ? rows[0].customer : "";
      const project = rows.length ? rows[0].project : "";
      const grade = rows.length ? rows[0].grade : "";
      const dueDate = rows.length ? rows[0].dueDate : "";
      const lastWeaveDone = rows.reduce((mx, r) => (r.weaveDone && r.weaveDone > mx ? r.weaveDone : mx), "");
      let status = "-";
      if (has(dueDate) && has(lastWeaveDone)) status = lastWeaveDone <= dueDate ? "ตรงเวลา" : "ล่าช้า";
      const moNo = (plans[designId] && plans[designId].moNo) || rec.moNo || designId;
      return { designId, moNo, customer, project, sqmSum, grade, dueDate, lastWeaveDone, status };
    }).sort((a, b) => String(a.moNo).localeCompare(String(b.moNo), "th"));
  }
  function renderPlanningKpiResults() {
    const el = $("#kpiPlanningResults");
    if (!el) return;
    const rows = planningKpiSummaryRows();
    el.innerHTML = rows.length ? `<div class="table-wrap"><table class="calc-table">
      <thead><tr><th>M/O</th><th>ลูกค้า</th><th>Project</th><th class="num">พื้นที่รวม (ตร.ม.)</th><th>เกรด</th><th>กำหนดส่ง</th><th>ทอเสร็จล่าสุด</th><th>สถานะ</th></tr></thead>
      <tbody>${rows.map((r) => `<tr><td>${esc(r.moNo)}</td><td>${esc(r.customer || "-")}</td><td>${esc(r.project || "-")}</td><td class="num">${fmt(r.sqmSum, 2)}</td><td>${esc(r.grade || "-")}</td><td>${esc(r.dueDate || "-")}</td><td>${esc(r.lastWeaveDone || "-")}</td><td>${r.status === "ล่าช้า" ? `<span class="status-tag blocked">${esc(r.status)}</span>` : r.status === "ตรงเวลา" ? `<span class="status-tag">${esc(r.status)}</span>` : "-"}</td></tr>`).join("")}</tbody>
    </table></div>` : `<p class="col-empty">ยังไม่มีข้อมูล KPI แผนกวางแผน — นำเข้าไฟล์ Excel ด้านบน</p>`;
  }

  /* ---------- KPI แผนกตกแต่ง — ประสิทธิภาพ (Finishing_KPI.xlsx) ---------- */
  function findFinKpiGradeHeaderRow(aoa) {
    for (let r = 0; r < Math.min(aoa.length, 6); r++) {
      const row = aoa[r] || [];
      if (row.some((c) => /เกรด\s*[A-Za-z0-9]+/i.test(String(c == null ? "" : c)))) return r;
    }
    return -1;
  }
  async function importFinProductivityKpiExcel(file) {
    if (typeof XLSX === "undefined") { toast("ไม่พบไลบรารี XLSX"); return; }
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const all = readJson(KEY_FIN_PRODUCTIVITY_KPI, {});
    let imported = 0, skippedNoMatch = 0;
    const matchedDesigns = new Set();
    const unmatched = new Set();
    wb.SheetNames.forEach((sheetName) => {
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: "", raw: true });
      const gradeRowIdx = findFinKpiGradeHeaderRow(aoa);
      if (gradeRowIdx < 0) return;
      const gradeRow = aoa[gradeRowIdx] || [];
      const blocks = [];
      gradeRow.forEach((cell, c) => {
        const m = /เกรด\s*([A-Za-z0-9]+)/i.exec(String(cell == null ? "" : cell));
        if (m) blocks.push({ offset: c, grade: m[1].toUpperCase() });
      });
      const dataStart = gradeRowIdx + 2;
      for (let r = dataStart; r < aoa.length; r++) {
        const row = aoa[r] || [];
        blocks.forEach((b) => {
          const moRaw = row[b.offset];
          if (!has(moRaw)) return;
          const areaSqm = num(row[b.offset + 1]);
          const hours = num(row[b.offset + 2]);
          const productivity = num(row[b.offset + 3]);
          const designId = findDesignIdByMoNoFinishing(moRaw);
          if (!designId) { skippedNoMatch++; unmatched.add(String(moRaw)); return; }
          if (!all[designId]) all[designId] = { moNo: String(moRaw), rows: [] };
          all[designId].rows.push({ grade: b.grade, areaSqm, hours, productivity, sheet: sheetName });
          all[designId].importedAt = new Date().toISOString();
          matchedDesigns.add(designId);
          imported++;
        });
      }
    });
    writeJson(KEY_FIN_PRODUCTIVITY_KPI, all);
    toast(`นำเข้าเสร็จ: บันทึก ${imported} แถว (${matchedDesigns.size} M/O) · ข้าม (ไม่พบ M/O ที่ตรงกัน) ${skippedNoMatch} แถว`);
    if (unmatched.size) console.warn("[kpi finishing productivity import] ไม่พบ M/O ที่ตรงกันในระบบ:", [...unmatched].slice(0, 30));
  }
  function finProductivityKpiResultsHtml() {
    const all = readJson(KEY_FIN_PRODUCTIVITY_KPI, {});
    const ids = Object.keys(all);
    if (!ids.length) return `<p class="col-empty">ยังไม่มีข้อมูลนำเข้า — เลือกไฟล์ Excel รายงาน KPI ประสิทธิภาพตกแต่งด้านบน</p>`;
    const lines = [];
    ids.forEach((designId) => {
      const rec = all[designId];
      const byGrade = {};
      (rec.rows || []).forEach((r) => { if (!byGrade[r.grade]) byGrade[r.grade] = []; byGrade[r.grade].push(r); });
      Object.keys(byGrade).sort().forEach((grade) => {
        const rs = byGrade[grade];
        const areaSum = rs.reduce((s, r) => s + num(r.areaSqm), 0);
        const hoursSum = rs.reduce((s, r) => s + num(r.hours), 0);
        const prodAvg = rs.length ? rs.reduce((s, r) => s + num(r.productivity), 0) / rs.length : 0;
        lines.push(`<tr><td>${esc(rec.moNo || designId)}</td><td>${esc(grade)}</td><td class="num">${fmt(areaSum, 2)}</td><td class="num">${fmt(hoursSum, 1)}</td><td class="num">${fmt(prodAvg, 3)}</td></tr>`);
      });
    });
    return `<table class="calc-table"><thead><tr><th>M/O</th><th>เกรด</th><th class="num">พื้นที่ตกแต่งรวม(ตร.ม.)</th><th class="num">ชั่วโมงรวม</th><th class="num">Productivity เฉลี่ย</th></tr></thead><tbody>${lines.join("")}</tbody></table>`;
  }

  /* ---------- KPI แผนกตกแต่ง — การเบิกใช้กาว (Taakao_KPI.xlsx ชีต "การเบิกใช้กาว") ---------- */
  function findFinGlueHeaderRow(aoa) {
    for (let r = 0; r < Math.min(aoa.length, 8); r++) {
      const row = aoa[r] || [];
      if (row.some((c) => /M\/O/i.test(String(c == null ? "" : c)))) return r;
    }
    return -1;
  }
  async function importFinGlueKpiExcel(file) {
    if (typeof XLSX === "undefined") { toast("ไม่พบไลบรารี XLSX"); return; }
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const sheetName = wb.SheetNames.find((sn) => /เบิกใช้กาว/.test(sn)) || wb.SheetNames[0];
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: "", raw: true });
    const headerRowIdx = findFinGlueHeaderRow(aoa);
    const dataStart = headerRowIdx >= 0 ? headerRowIdx + 2 : 4;
    const all = readJson(KEY_FIN_GLUE_KPI, {});
    let imported = 0, skippedNoMatch = 0;
    const matchedDesigns = new Set();
    const unmatched = new Set();
    for (let r = dataStart; r < aoa.length; r++) {
      const row = aoa[r] || [];
      const moRaw = row[2];
      if (!has(moRaw)) continue;
      const dateCell = row[1];
      let iso = "";
      if (dateCell instanceof Date) iso = dateCell.toISOString().slice(0, 10);
      else if (typeof dateCell === "number" && dateCell > 20000 && XLSX.SSF) { const d = XLSX.SSF.parse_date_code(dateCell); if (d) iso = `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`; }
      else if (has(dateCell)) iso = String(dateCell);
      const area = num(row[3]);
      const stdKg = num(row[4]);
      const eur178 = num(row[5]);
      const g66012 = num(row[6]);
      const th31 = num(row[7]);
      const totalKg = num(row[8]);
      const pct = num(row[9]);
      const designId = findDesignIdByMoNoFinishing(moRaw);
      if (!designId) { skippedNoMatch++; unmatched.add(String(moRaw)); continue; }
      if (!all[designId]) all[designId] = { moNo: String(moRaw), rows: [] };
      all[designId].rows.push({ date: iso, area, stdKg, eur178, g66012, th31, totalKg, pct });
      all[designId].importedAt = new Date().toISOString();
      matchedDesigns.add(designId);
      imported++;
    }
    writeJson(KEY_FIN_GLUE_KPI, all);
    toast(`นำเข้าทากาวเสร็จ: บันทึก ${imported} แถว (${matchedDesigns.size} M/O) · ข้าม (ไม่พบ M/O ที่ตรงกัน) ${skippedNoMatch} แถว`);
    if (unmatched.size) console.warn("[kpi finishing glue import] ไม่พบ M/O ที่ตรงกันในระบบ:", [...unmatched].slice(0, 30));
  }
  const thaiDate = (iso) => { try { return new Date(iso + "T00:00:00").toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "numeric" }); } catch (e) { return iso || "-"; } };
  function finGlueKpiResultsHtml() {
    const all = readJson(KEY_FIN_GLUE_KPI, {});
    const ids = Object.keys(all);
    if (!ids.length) return `<p class="col-empty">ยังไม่มีข้อมูลนำเข้า — เลือกไฟล์ Excel รายงาน KPI การเบิกใช้กาวด้านบน</p>`;
    const rows = ids.map((designId) => {
      const rec = all[designId];
      const rs = rec.rows || [];
      const lastDate = rs.map((r) => r.date).filter(Boolean).sort().slice(-1)[0] || "";
      const areaSum = rs.reduce((s, r) => s + num(r.area), 0);
      const stdSum = rs.reduce((s, r) => s + num(r.stdKg), 0);
      const totalSum = rs.reduce((s, r) => s + num(r.totalKg), 0);
      const pctAvg = rs.length ? rs.reduce((s, r) => s + num(r.pct), 0) / rs.length : 0;
      return `<tr><td>${esc(rec.moNo || designId)}</td><td>${lastDate ? thaiDate(lastDate) : "-"}</td><td class="num">${fmt(areaSum, 2)}</td><td class="num">${fmt(stdSum, 2)}</td><td class="num">${fmt(totalSum, 2)}</td><td class="num">${fmt(pctAvg, 1)}%</td></tr>`;
    }).join("");
    return `<table class="calc-table"><thead><tr><th>M/O</th><th>วันที่เบิกล่าสุด</th><th class="num">พื้นที่รวม</th><th class="num">มาตรฐานรวม(กก.)</th><th class="num">เบิกจริงรวม(กก.)</th><th class="num">%เฉลี่ย</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  /* ---------- KPI แผนกขยายลาย/เจาะลาย (ไฟล์ "ใบโอน" รายเดือน) ---------- */
  function loadPatternKpi() { return readJson(KEY_PATTERN_KPI, {}); }
  function savePatternKpi(all) { writeJson(KEY_PATTERN_KPI, all); }
  async function importPatternKpiExcel(file) {
    if (typeof XLSX === "undefined") { toast("ไม่พบไลบรารี XLSX"); return; }
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const store = loadPatternKpi();
    let imported = 0, skippedNoMatch = 0;
    const matchedDesigns = new Set();
    const unmatched = new Set();
    wb.SheetNames.filter((sn) => sn.includes("ใบโอน")).forEach((sheetName) => {
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: "", raw: true });
      aoa.forEach((row, idx) => {
        if (idx === 0) return;
        const moNo = row[1];
        if (!has(moNo)) return;
        const designId = findDesignIdByMoNoPattern(moNo);
        if (!designId) { skippedNoMatch++; unmatched.add(String(moNo)); return; }
        matchedDesigns.add(designId);
        if (!store[designId]) store[designId] = { moNo: String(moNo), rows: [], importedAt: new Date().toISOString() };
        store[designId].rows.push({
          receivedDate: parseKpiDateCell(row[0]),
          pieceNo: row[2] == null ? "" : String(row[2]),
          fabricWidth: has(row[3]) ? String(row[3]) : "",
          areaSqm: num(row[4]),
          usedSqm: num(row[5]),
          scrapSqm: num(row[6]),
          qty: num(row[7]),
          unit: String(row[8] || "").trim(),
          transferDate: parseKpiDateCell(row[9]),
          note: String(row[10] || "").trim(),
          sheet: sheetName,
        });
        store[designId].importedAt = new Date().toISOString();
        imported++;
      });
    });
    savePatternKpi(store);
    toast(`นำเข้าเสร็จ: บันทึก ${imported} แถว (${matchedDesigns.size} M/O) · ข้าม (ไม่พบ M/O ที่ตรงกัน) ${skippedNoMatch} แถว`);
    if (unmatched.size) console.warn("[kpi pattern import] ไม่พบ M/O ที่ตรงกันในระบบ:", [...unmatched].slice(0, 30));
  }
  function patternKpiResultsHtml() {
    const store = loadPatternKpi();
    const ids = Object.keys(store);
    if (!ids.length) return `<p class="col-empty">ยังไม่มีข้อมูลนำเข้า</p>`;
    const rows = ids.map((designId) => {
      const rec = store[designId];
      const list = rec.rows || [];
      const totalArea = list.reduce((s, r) => s + num(r.areaSqm), 0);
      const totalUsed = list.reduce((s, r) => s + num(r.usedSqm), 0);
      const totalScrap = list.reduce((s, r) => s + num(r.scrapSqm), 0);
      const lastTransfer = list.reduce((mx, r) => (r.transferDate && r.transferDate > mx ? r.transferDate : mx), "");
      return `<tr><td>${esc(rec.moNo || designId)}</td><td class="num">${fmt(totalArea, 2)}</td><td class="num">${fmt(totalUsed, 2)}</td><td class="num">${fmt(totalScrap, 2)}</td><td class="num">${list.length}</td><td>${lastTransfer ? esc(lastTransfer) : "-"}</td></tr>`;
    }).join("");
    return `<table class="calc-table"><thead><tr><th>M/O</th><th class="num">พื้นที่รวม(ตร.ม.)</th><th class="num">ใช้จริงรวม(ตร.ม.)</th><th class="num">เศษผ้ารวม(ตร.ม.)</th><th class="num">จำนวนรายการ</th><th>วันที่โอนล่าสุด</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  /* ============================================================
     Render / Bind
     ============================================================ */
  function build() {
    const root = $("#kpiView");
    root.innerHTML = `
      <section class="page-heading">
        <div>
          <p class="eyebrow">KPI</p>
          <h1>สรุปผล KPI ทุกแผนก</h1>
          <p class="subtitle">รวม KPI ของ Designer และทุกแผนกผลิตไว้ที่หน้าเดียว — นำเข้าไฟล์ Excel รายงานแต่ละแผนกได้จากที่นี่ ไม่ต้องไปนำเข้าที่หน้าแผนกอีกต่อไป</p>
        </div>
      </section>

      <section class="designer-kpi-panel">
        <div class="panel-heading">
          <div><strong>KPI แยกตาม Designer</strong><small>รวมชื่อโดยไม่แยกตัวพิมพ์เล็ก-ใหญ่ และคำนวณจากวันที่ในตารางทำแบบ</small></div>
          <div class="designer-kpi-controls">
            <label>ช่วงเวลา
              <select id="designerKpiPeriod"><option value="all">ทุกช่วงเวลา</option></select>
            </label>
            <span id="designerKpiCount">0 Designer</span>
          </div>
        </div>
        <div id="designerKpiHidden" class="kpi-hidden-designers"></div>
        <div class="table-wrap">
          <table class="designer-kpi-table">
            <thead><tr><th>Designer</th><th>จำนวนงาน</th><th>ส่งงานแล้ว</th><th>ส่งตรงเวลา</th><th>อัตราตรงเวลา</th><th>งานค้าง</th><th>เกินกำหนด</th><th>Lead time เฉลี่ย</th><th>สถานะ</th><th>จัดการ</th></tr></thead>
            <tbody id="designerKpiTable"></tbody>
          </table>
        </div>
      </section>

      <section class="department-panel pw-card wide">
        <div class="panel-heading"><div><strong>นำเข้ารายงาน KPI แผนกย้อม (Dye)</strong><small>นำเข้าไฟล์ Excel รายงาน KPI แผนกย้อม (อ่านเฉพาะชีต "MO" และ " ย้อมเพิ่ม ") — จับคู่กับ M/O ในระบบอัตโนมัติ</small></div></div>
        <div class="pw-body">
          <div class="pw-row"><label class="file-picker">นำเข้าจาก Excel<input type="file" id="kpiDyeFile" accept=".xlsx,.xls" data-import-dye-kpi></label></div>
          <div id="kpiDyeResults"></div>
        </div>
      </section>

      <section class="department-panel pw-card wide">
        <div class="panel-heading"><div><strong>นำเข้ารายงาน KPI แผนกวางแผน (ส่งมอบ)</strong><small>นำเข้าไฟล์ Excel รายงาน KPI แผนกวางแผน (อ่านเฉพาะชีต "1.ส่งมอบทั้งหมด ") — จับคู่กับ M/O ในระบบอัตโนมัติ</small></div></div>
        <div class="pw-body">
          <div class="pw-row"><label class="file-picker">นำเข้าจาก Excel<input type="file" id="kpiPlanningFile" accept=".xlsx,.xls" data-import-planning-kpi></label></div>
          <div id="kpiPlanningResults"></div>
        </div>
      </section>

      <section class="department-panel pw-card wide">
        <div class="panel-heading"><div><strong>นำเข้ารายงาน KPI ขยายลาย/เบิกผ้าใบ</strong><small>นำเข้าไฟล์ Excel "ใบโอน" รายเดือน (ประมวลผลทุกชีตที่ชื่อมีคำว่า "ใบโอน") — จับคู่ด้วยเลข M/O/S/O No. กับข้อมูลในหน้ารายงานขาย สะสมข้อมูลทุกครั้งที่นำเข้าไฟล์ใหม่</small></div></div>
        <div class="pw-body">
          <div class="pw-row"><label class="file-picker">นำเข้าจาก Excel<input type="file" id="kpiPatternFile" accept=".xlsx,.xls" data-import-pattern-kpi></label></div>
          <div id="kpiPatternResults"></div>
        </div>
      </section>

      <section class="department-panel pw-card wide">
        <div class="panel-heading"><div><strong>นำเข้ารายงาน KPI ประสิทธิภาพตกแต่ง</strong><small>นำเข้าไฟล์ Excel รายงาน % ประสิทธิภาพการตกแต่งพรม (แยกตามเกรด A-X) — จับคู่ M/O กับข้อมูลในระบบนี้อัตโนมัติ ประมวลผลทุกชีตในไฟล์</small></div></div>
        <div class="pw-body">
          <div class="pw-row"><label class="file-picker">นำเข้าจาก Excel<input type="file" id="kpiFinProductivityFile" accept=".xlsx,.xls" data-import-fin-productivity-kpi></label></div>
          <div id="kpiFinProductivityResults"></div>
        </div>
      </section>

      <section class="department-panel pw-card wide">
        <div class="panel-heading"><div><strong>นำเข้ารายงาน KPI การเบิกใช้กาว</strong><small>นำเข้าไฟล์ Excel รายงานการเบิกใช้กาว (ชีต "การเบิกใช้กาว") — จับคู่ M/O กับข้อมูลในระบบนี้อัตโนมัติ</small></div></div>
        <div class="pw-body">
          <div class="pw-row"><label class="file-picker">นำเข้าจาก Excel<input type="file" id="kpiFinGlueFile" accept=".xlsx,.xls" data-import-fin-glue-kpi></label></div>
          <div id="kpiFinGlueResults"></div>
        </div>
      </section>`;
  }

  function renderAll() {
    populateDesignerPeriods();
    renderDesignerKpi();
    renderDyeKpiResults();
    renderPlanningKpiResults();
    if ($("#kpiPatternResults")) $("#kpiPatternResults").innerHTML = patternKpiResultsHtml();
    if ($("#kpiFinProductivityResults")) $("#kpiFinProductivityResults").innerHTML = finProductivityKpiResultsHtml();
    if ($("#kpiFinGlueResults")) $("#kpiFinGlueResults").innerHTML = finGlueKpiResultsHtml();
  }

  function bind() {
    const root = $("#kpiView");
    root.addEventListener("change", (e) => {
      const t = e.target;
      if (!t || !t.hasAttribute) return;
      if (t.id === "designerKpiPeriod") { renderDesignerKpi(); return; }
      if (t.hasAttribute("data-import-dye-kpi")) {
        const file = t.files && t.files[0];
        if (file) importDyeKpiExcel(file).then(() => { renderDyeKpiResults(); t.value = ""; });
        return;
      }
      if (t.hasAttribute("data-import-planning-kpi")) {
        const file = t.files && t.files[0];
        if (file) importPlanningKpiExcel(file).then(() => { renderPlanningKpiResults(); t.value = ""; });
        return;
      }
      if (t.hasAttribute("data-import-pattern-kpi")) {
        const file = t.files && t.files[0];
        if (file) importPatternKpiExcel(file).then(() => { $("#kpiPatternResults").innerHTML = patternKpiResultsHtml(); t.value = ""; });
        return;
      }
      if (t.hasAttribute("data-import-fin-productivity-kpi")) {
        const file = t.files && t.files[0];
        if (file) importFinProductivityKpiExcel(file).then(() => { $("#kpiFinProductivityResults").innerHTML = finProductivityKpiResultsHtml(); t.value = ""; });
        return;
      }
      if (t.hasAttribute("data-import-fin-glue-kpi")) {
        const file = t.files && t.files[0];
        if (file) importFinGlueKpiExcel(file).then(() => { $("#kpiFinGlueResults").innerHTML = finGlueKpiResultsHtml(); t.value = ""; });
        return;
      }
    });
    root.addEventListener("click", (e) => {
      const hideBtn = e.target.closest("[data-hide-designer]");
      if (hideBtn) {
        const name = hideBtn.dataset.hideDesigner;
        if (confirm(`ทำเครื่องหมายว่า "${name}" ไม่ใช่พนักงานบริษัทฯ และซ่อนออกจากตาราง KPI นี้?`)) {
          hideDesignerName(name);
          toast(`ซ่อน "${name}" ออกจากตาราง KPI แล้ว`);
          renderDesignerKpi();
        }
        return;
      }
      const restoreBtn = e.target.closest("[data-restore-designer]");
      if (restoreBtn) {
        restoreDesignerName(restoreBtn.dataset.restoreDesigner);
        renderDesignerKpi();
        return;
      }
    });
  }

  let built = false;
  function renderKpi() {
    if (!built) { build(); built = true; bind(); }
    renderAll();
  }

  window.renderKpi = renderKpi;
})();
