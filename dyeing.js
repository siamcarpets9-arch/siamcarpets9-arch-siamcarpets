/* ============================================================
   แผนกย้อม (Dyeing Department)
   - นำเข้า "รายงานการผลิตแผนกย้อม" รายวันจากไฟล์ Excel จริงของโรงงาน (1 ชีต = 1 วัน ชื่อชีตเป็นวันที่ เช่น "1-9-2026")
   - แต่ละแถว = 1 การเบิกไหม/ย้อม 1 สี: M/O,S/O ใด · ชนิดไหม · เบิกจาก Lot อะไร (หรือดึง Surplus มาย้อมทับ) ·
     Colour No./Colour code · Batch No. · น้ำหนักที่ย้อมได้จริง (กก.) · หมายเหตุ (เช่น "ย้อมเพิ่ม","แก้สี")
   - เชื่อมทุกแถวเข้ากับ "ใบสั่งย้อม" ของ M/O,S/O นั้นจากหน้า "ใบวางแผนงาน" ด้วยเลข M/O,S/O (ผ่าน SalesEngine/plan.moNo)
     + รหัสสี (zone.colorCode ตรงกับ Colour code ในรายงาน) เพื่อเทียบ "วางแผนกี่กิโล" กับ "ย้อมจริงกี่กิโล" ต่อสี
   ต้องโหลดหลัง app.js, sales.js, planning.js (ใช้ PlanningEngine, SalesEngine, designs, $, $$, toast)
   ============================================================ */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const has = (v) => String(v == null ? "" : v).trim() !== "";
  const num = (v) => { const n = parseFloat(String(v == null ? "" : v).replace(/,/g, "")); return Number.isFinite(n) ? n : 0; };
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n, d = 2) => { const x = typeof n === "number" ? n : parseFloat(String(n == null ? "" : n).replace(/,/g, "")); return (Number.isFinite(x) ? x : 0).toLocaleString("th-TH", { minimumFractionDigits: d, maximumFractionDigits: d }); };
  const readJson = (k, fb) => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : fb; } catch (e) { return fb; } };
  const writeJson = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ยังใช้ต่อได้ */ } };

  const PE = () => window.PlanningEngine;

  const KEY_LOG = "siam-dyeing-execution-log";      // [{id,date,seq,orderRaw,orderType,orders:[],yarnType,lotNo,isSurplus,colourNo,colourCode,hang,batchNo,kg,remark,isExtra,isColorFix}]
  const KEY_DAY_TOTALS = "siam-dyeing-day-totals";  // { [iso]: {reportedKg, reportedColors, computedKg, computedColors} } — ไว้ตรวจทานยอดกับที่ฟอร์มสรุปไว้เอง

  // เลข M/O,S/O เทียบกันได้แม้เขียนต่างรูปแบบ (เว้นวรรค/เลข 0 นำหน้า) — ใช้กติกาเดียวกับหน้า "แผนกทอ" (weave-floor.js)
  function normMoKey(raw) {
    const s = String(raw || "").trim().toUpperCase();
    const m = s.match(/^([A-Z]*)\s*0*(\d+)\s*\/\s*0*(\d+)/);
    if (!m) return s.replace(/\s+/g, "");
    const [, prefix, num2, yy] = m;
    return `${prefix}|${num2}|${yy}`;
  }

  function loadLog() { return readJson(KEY_LOG, []); }
  function saveLog(list) { writeJson(KEY_LOG, list); }
  function loadDayTotals() { return readJson(KEY_DAY_TOTALS, {}); }
  function saveDayTotals(v) { writeJson(KEY_DAY_TOTALS, v); }

  /* ============================================================
     นำเข้า Excel — 1 ชีตต่อ 1 วัน ชื่อชีตเป็นวันที่ "d-m-yyyy"
     ============================================================ */
  function parseSheetDate(sheetName) {
    const m = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(String(sheetName || "").trim());
    if (!m) return null;
    const day = Number(m[1]), month = Number(m[2]), year = Number(m[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  // "129+137/26" -> ["129/26","137/26"] ; "SC 0360+0361/26" -> ["SC 0360/26","SC 0361/26"] ; "TH126+127/26" -> ["TH126/26","TH127/26"]
  function splitCombinedOrder(rest) {
    const parts = String(rest || "").split("+").map((s) => s.trim()).filter(Boolean);
    if (parts.length <= 1) return parts;
    const last = parts[parts.length - 1];
    const suffixMatch = last.match(/\/[A-Za-z0-9]+$/);
    const suffix = suffixMatch ? suffixMatch[0] : "";
    const prefixMatch = parts[0].match(/^[A-Za-z]+\s*/);
    const prefix = prefixMatch ? prefixMatch[0] : "";
    return parts.map((p) => {
      let base = p;
      const hasOwnPrefix = /^[A-Za-z]/.test(p);
      if (!base.includes("/")) base = `${base}${suffix}`;
      if (!hasOwnPrefix && prefix) base = `${prefix}${base}`;
      return base.trim();
    });
  }

  function parseOrderCell(raw) {
    const s = String(raw || "").trim();
    let type = null, rest = s;
    if (/^M\/?O\b/i.test(s)) { type = "MO"; rest = s.replace(/^M\/?O\s*/i, ""); }
    else if (/^S\/?O\b/i.test(s)) { type = "SO"; rest = s.replace(/^S\/?O\s*/i, ""); }
    const orders = rest ? splitCombinedOrder(rest) : [];
    return { type, orders };
  }

  function extractDaySummary(aoa) {
    let reportedKg = null, reportedColors = null;
    aoa.forEach((row) => {
      const labelCell = row.find((c) => typeof c === "string" && c.includes("ยอดรวม"));
      if (labelCell) { const v = row.find((c) => typeof c === "number"); if (typeof v === "number") reportedKg = v; }
      const colorLabelCell = row.find((c) => typeof c === "string" && c.includes("จำนวนสี"));
      if (colorLabelCell) { const v = row.find((c) => typeof c === "number"); if (typeof v === "number") reportedColors = v; }
    });
    return { reportedKg, reportedColors };
  }

  async function importDyeingExcel(file) {
    if (typeof XLSX === "undefined") { toast("ไม่พบไลบรารี XLSX"); return; }
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const dateSheets = wb.SheetNames.map((sn) => ({ sn, iso: parseSheetDate(sn) })).filter((x) => x.iso);
    if (!dateSheets.length) { toast('ไม่พบชีตที่ตั้งชื่อเป็นวันที่ (เช่น "1-9-2026") ในไฟล์นี้'); return; }

    const newRows = [];
    const dayTotals = loadDayTotals();
    let skipped = 0;

    dateSheets.forEach(({ sn, iso }) => {
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: "", raw: true });
      let prevOrderRaw = "", prevYarn = "";
      const dayRows = [];
      aoa.forEach((row) => {
        const a = row[0];
        const seqStr = a == null ? "" : String(a).trim();
        if (!/^\d+$/.test(seqStr)) return; // ข้ามหัวตาราง/แถวหมายเหตุ/แถวสรุปยอด
        let orderCell = row[1] == null ? "" : String(row[1]).trim();
        if (orderCell === '"' || orderCell === "") orderCell = prevOrderRaw; else prevOrderRaw = orderCell;
        let yarnCell = row[2] == null ? "" : String(row[2]).trim();
        if (yarnCell === '"' || yarnCell === "") yarnCell = prevYarn; else prevYarn = yarnCell;
        if (!has(orderCell)) { skipped++; return; }
        const lotNo = row[3] == null ? "" : String(row[3]).trim();
        const colourNo = row[4] == null ? "" : String(row[4]).trim();
        const colourCode = row[5] == null ? "" : String(row[5]).trim();
        const hang = row[6] == null ? "" : String(row[6]).trim();
        const batchNo = row[7] == null ? "" : String(row[7]).trim();
        const kg = num(row[8]);
        const remark = row[9] == null ? "" : String(row[9]).trim();
        const parsed = parseOrderCell(orderCell);
        const rec = {
          id: `${iso}-${seqStr}`, date: iso, seq: Number(seqStr),
          orderRaw: orderCell, orderType: parsed.type, orders: parsed.orders,
          yarnType: yarnCell, lotNo, isSurplus: /surplus/i.test(lotNo),
          colourNo, colourCode, hang, batchNo, kg, remark,
          isExtra: /ย้อมเพิ่ม/.test(remark), isColorFix: /แก้สี/.test(remark)
        };
        dayRows.push(rec);
      });
      newRows.push(...dayRows);
      const { reportedKg, reportedColors } = extractDaySummary(aoa);
      const computedKg = dayRows.reduce((t, r) => t + r.kg, 0);
      const computedColors = dayRows.length;
      dayTotals[iso] = { reportedKg, reportedColors, computedKg, computedColors };
    });

    // นำเข้าไฟล์เดิมซ้ำได้อย่างปลอดภัย: แทนที่เฉพาะวันที่พบในไฟล์นี้ วันอื่นที่เคยนำเข้าไว้ก่อนหน้าคงเดิม
    const datesInFile = new Set(dateSheets.map((d) => d.iso));
    const kept = loadLog().filter((r) => !datesInFile.has(r.date));
    const merged = [...kept, ...newRows].sort((a, b) => (a.date === b.date ? a.seq - b.seq : a.date.localeCompare(b.date)));
    saveLog(merged);
    saveDayTotals(dayTotals);

    const mismatches = Object.entries(dayTotals).filter(([iso]) => datesInFile.has(iso))
      .filter(([, t]) => t.reportedKg != null && Math.abs(t.reportedKg - t.computedKg) > 0.01);
    toast(`นำเข้าแล้ว: ${dateSheets.length} วัน · ${newRows.length} แถว${skipped ? ` · ข้าม ${skipped} แถว (ไม่มีเลข M/O,S/O)` : ""}${mismatches.length ? ` · ⚠ ยอดไม่ตรง ${mismatches.length} วัน (ดูตารางตรวจสอบด้านล่าง)` : ""}`);
    renderAll();
  }

  /* ============================================================
     เชื่อมกับใบสั่งย้อม (Dye Order) ของแผนกวางแผน
     ============================================================ */
  function findDesignIdForOrder(orderNo) {
    try {
      if (typeof SalesEngine === "undefined" || !SalesEngine.getDocs) return null;
      const key = normMoKey(orderNo);
      if (!key) return null;
      const doc = SalesEngine.getDocs().find((d) => normMoKey(d.no) === key);
      return doc ? doc.designId : null;
    } catch (e) { return null; }
  }
  function planForOrder(orderNo) {
    const plans = PE() ? PE().readJson(PE().KEY_PLANS, {}) : {};
    const designId = findDesignIdForOrder(orderNo);
    if (designId && plans[designId]) return { designId, plan: plans[designId] };
    // สำรอง: บาง M/O อาจไม่มีเอกสารฝ่ายขายที่ตรงกัน แต่ผูก moNo ไว้ตรง ๆ ในใบวางแผนงานแล้ว
    const key = normMoKey(orderNo);
    const found = Object.entries(plans).find(([, p]) => p.moNo && normMoKey(p.moNo) === key);
    if (found) return { designId: found[0], plan: found[1] };
    return { designId: designId || null, plan: null };
  }

  function groupRowsByOrder(log) {
    const map = new Map();
    log.forEach((rec) => {
      (rec.orders && rec.orders.length ? rec.orders : [rec.orderRaw]).forEach((orderNo) => {
        const key = `${rec.orderType || "?"}|${normMoKey(orderNo)}`;
        if (!map.has(key)) map.set(key, { key, orderType: rec.orderType, orderNo, rows: [] });
        map.get(key).rows.push(rec);
      });
    });
    return [...map.values()];
  }

  function enrichGroup(g) {
    const { designId, plan } = planForOrder(g.orderNo);
    const info = designId ? designs.find((d) => d.id === designId) : null;
    let pots = [];
    if (plan && PE()) {
      const dye = PE().computeDyePlan(plan.zones, num(plan.totalAreaSqm), plan.bufferPct);
      pots = dye.pots.map((pot) => {
        const zone0 = pot.zones[0] || {};
        const cc = String(zone0.colorCode || "").trim().toUpperCase();
        const matched = cc ? g.rows.filter((r) => String(r.colourCode || "").trim().toUpperCase() === cc) : [];
        const actualKg = matched.reduce((t, r) => t + r.kg, 0);
        const order = plan.dyeOrders && plan.dyeOrders[pot.key];
        return { pot, colorCode: cc, actualKg, matched, order };
      });
    }
    const matchedIds = new Set(pots.flatMap((p) => p.matched.map((r) => r.id)));
    const unmatchedRows = g.rows.filter((r) => !matchedIds.has(r.id));
    const totalActualKg = g.rows.reduce((t, r) => t + r.kg, 0);
    const usedSurplus = g.rows.some((r) => r.isSurplus);
    const lastDate = g.rows.reduce((d, r) => (r.date > d ? r.date : d), "");
    return { ...g, designId, plan, info, pots, unmatchedRows, totalActualKg, usedSurplus, lastDate };
  }

  /* ============================================================
     UI
     ============================================================ */
  const state = { selectedKey: null, query: "" };

  function orderCardHtml(g) {
    const label = g.info ? (g.info.project || g.designId) : "";
    return `<button type="button" class="pw-job-card dept-dyeing ${state.selectedKey === g.key ? "active" : ""}" data-dpick="${esc(g.key)}">
      <strong>${esc(g.orderNo)}</strong><span>${esc(label || (g.orderType === "MO" ? "M/O" : g.orderType === "SO" ? "S/O" : ""))}</span>
      <small>${g.rows.length} แถว · ${fmt(g.totalActualKg, 2)} กก. · ${new Date(g.lastDate).toLocaleDateString("th-TH")}</small>
      ${g.plan ? tag("เชื่อมแผนแล้ว", "") : tag("ไม่พบใบวางแผนงาน", "review")}
      ${g.usedSurplus ? tag("ใช้ Surplus", "blocked") : ""}
    </button>`;
  }
  function tag(text, cls) { return `<span class="status-tag ${cls}">${esc(text)}</span>`; }

  function actualRowHtml(r) {
    return `<tr>
      <td>${new Date(r.date).toLocaleDateString("th-TH")}</td>
      <td>${esc(r.yarnType)}</td>
      <td>${r.isSurplus ? `<span class="status-tag blocked">Surplus</span>` : esc(r.lotNo || "-")}</td>
      <td>${esc(r.colourNo || "-")}</td>
      <td>${esc(r.colourCode || "-")}</td>
      <td>${esc(r.batchNo || "-")}</td>
      <td class="num">${fmt(r.kg, 3)}</td>
      <td>${r.isExtra ? `<span class="status-tag review">ย้อมเพิ่ม</span>` : ""}${r.isColorFix ? `<span class="status-tag review">แก้สี</span>` : ""}${!r.isExtra && !r.isColorFix ? esc(r.remark || "-") : ""}</td>
    </tr>`;
  }

  function potPlanRowHtml(p) {
    const order = p.order;
    const srcLabel = order ? (order.source === "outsource" ? `จ้างย้อมนอก${order.vendor ? ` (${esc(order.vendor)})` : ""}` : "ย้อมภายในบริษัท") : "-";
    const variance = p.actualKg - p.pot.netKg;
    return `<tr>
      <td>${esc(p.pot.label)}</td>
      <td>${esc(p.colorCode || "-")}</td>
      <td class="num">${fmt(p.pot.netKg, 3)}</td>
      <td class="num">${fmt(p.actualKg, 3)}</td>
      <td class="num ${Math.abs(variance) > 0.05 ? "pw-dye-warn" : ""}">${variance >= 0 ? "+" : ""}${fmt(variance, 3)}</td>
      <td>${srcLabel}</td>
      <td>${p.matched.length} แถว</td>
    </tr>`;
  }

  function buildDetail(g) {
    const doc = (function () { try { return SalesEngine && SalesEngine.getDocs ? SalesEngine.getDocs().find((d) => normMoKey(d.no) === normMoKey(g.orderNo)) : null; } catch (e) { return null; } })();
    return `
    <section class="department-panel pw-card wide">
      <div class="panel-heading">
        <div><strong>${esc(g.orderNo)}</strong><small>${g.info ? esc(`${g.info.project || ""} · ${g.info.customer || doc && doc.customer || ""}`) : "ไม่พบข้อมูลลูกค้า/โปรเจกต์ใน Design/Sales"}</small></div>
        ${g.plan ? tag("เชื่อมกับใบวางแผนงานแล้ว", "") : tag("ไม่พบใบวางแผนงานของเลขนี้ในระบบ", "review")}
      </div>
      <div class="pw-body">
        <div class="pw-row">
          ${res("รวมน้ำหนักย้อมจริง", `${fmt(g.totalActualKg, 3)} กก.`, "main")}
          ${res("จำนวนแถว/สี", `${g.rows.length}`)}
          ${res("ใช้ไหม Surplus", g.usedSurplus ? "ใช่ (ดูรายการที่ขึ้นป้าย Surplus)" : "ไม่มี")}
          ${res("ย้อมล่าสุด", new Date(g.lastDate).toLocaleDateString("th-TH"))}
        </div>
      </div>
    </section>

    ${g.plan ? `
    <section class="department-panel pw-card wide">
      <div class="panel-heading"><div><strong>แผนสั่งย้อม (จากใบวางแผนงาน) เทียบย้อมจริง</strong><small>จับคู่ด้วยรหัสสี (Colour code) ของแต่ละหม้อย้อมในแผน — ถ้าไม่พบรหัสสีตรงกันจะไม่โชว์ยอดย้อมจริงในแถวนั้น (ดูรายการทั้งหมดที่ยังไม่จับคู่ด้านล่าง)</small></div></div>
      <div class="pw-body">
        <table class="calc-table">
          <thead><tr><th>หม้อย้อม/สี</th><th>รหัสสีในแผน</th><th class="num">วางแผนสั่งย้อม (กก.)</th><th class="num">ย้อมจริง (กก.)</th><th class="num">ส่วนต่าง</th><th>แหล่งย้อม</th><th>จำนวนแถวที่จับคู่ได้</th></tr></thead>
          <tbody>${g.pots.map(potPlanRowHtml).join("")}</tbody>
        </table>
      </div>
    </section>` : ""}

    <section class="department-panel pw-card wide">
      <div class="panel-heading"><div><strong>บันทึกย้อมจริงที่จับคู่กับหม้อย้อมในแผนแล้ว</strong><small>ทุกเบอร์ทุกสีที่ย้อมให้ M/O,S/O นี้ตามรายงานประจำวัน</small></div></div>
      <div class="pw-body">
        ${g.rows.length - g.unmatchedRows.length ? `<table class="calc-table"><thead><tr><th>วันที่</th><th>ชนิดไหม</th><th>เบิกจาก Lot / Surplus</th><th>Colour No.</th><th>Colour code</th><th>Batch No.</th><th class="num">กก.</th><th>หมายเหตุ</th></tr></thead><tbody>${g.rows.filter((r) => !g.unmatchedRows.includes(r)).map(actualRowHtml).join("")}</tbody></table>` : `<p class="col-empty">ยังไม่มีแถวที่จับคู่รหัสสีกับแผนได้</p>`}
      </div>
    </section>

    ${g.unmatchedRows.length ? `
    <section class="department-panel pw-card wide">
      <div class="panel-heading"><div><strong>บันทึกย้อมจริงที่ยังไม่พบหม้อย้อมตรงกันในแผน</strong><small>${g.plan ? "รหัสสีในรายงานไม่ตรงกับรหัสสี (colorCode) ที่กรอกไว้ในใบวางแผนงาน — ตรวจสอบรหัสสีทั้ง 2 ฝั่ง" : "ยังไม่พบใบวางแผนงานของเลขนี้เลย — แสดงเฉพาะบันทึกย้อมจริง"}</small></div></div>
      <div class="pw-body">
        <table class="calc-table"><thead><tr><th>วันที่</th><th>ชนิดไหม</th><th>เบิกจาก Lot / Surplus</th><th>Colour No.</th><th>Colour code</th><th>Batch No.</th><th class="num">กก.</th><th>หมายเหตุ</th></tr></thead><tbody>${g.unmatchedRows.map(actualRowHtml).join("")}</tbody></table>
      </div>
    </section>` : ""}

    ${g.designId && typeof CostEngine !== "undefined" && CostEngine.extraCostWidgetHtml ? CostEngine.extraCostWidgetHtml(g.designId, "dyeing") : ""}`;
  }

  function res(label, value, cls = "") { return `<div class="pr ${cls}"><small>${label}</small><strong>${value}</strong></div>`; }

  function dayCheckRowHtml(iso, t) {
    const mismatch = t.reportedKg != null && Math.abs(t.reportedKg - t.computedKg) > 0.01;
    return `<tr class="${mismatch ? "pw-dye-warn" : ""}">
      <td>${new Date(iso).toLocaleDateString("th-TH")}</td>
      <td class="num">${t.reportedKg != null ? fmt(t.reportedKg, 3) : "-"}</td>
      <td class="num">${fmt(t.computedKg, 3)}</td>
      <td class="num">${t.reportedColors != null ? t.reportedColors : "-"}</td>
      <td class="num">${t.computedColors}</td>
      <td>${mismatch ? "⚠ ยอดไม่ตรงกับที่ระบุในไฟล์" : "ตรงกัน"}</td>
    </tr>`;
  }

  function rawLogRowHtml(r) {
    return `<tr>
      <td>${new Date(r.date).toLocaleDateString("th-TH")}</td>
      <td>${esc(r.orderRaw)}</td>
      <td>${esc(r.yarnType)}</td>
      <td>${r.isSurplus ? `<span class="status-tag blocked">Surplus</span>` : esc(r.lotNo || "-")}</td>
      <td>${esc(r.colourNo || "-")}</td>
      <td>${esc(r.colourCode || "-")}</td>
      <td>${esc(r.batchNo || "-")}</td>
      <td class="num">${fmt(r.kg, 3)}</td>
      <td>${esc(r.remark || "-")}</td>
    </tr>`;
  }

  function build() {
    const root = $("#dyeingView");
    root.innerHTML = `
      <section class="page-heading">
        <div>
          <p class="eyebrow">DYEING DEPARTMENT</p>
          <h1>แผนกย้อม (Dyeing)</h1>
          <p class="subtitle">นำเข้ารายงานการผลิตแผนกย้อมรายวัน (ไฟล์ Excel จริงจากโรงงาน 1 ชีตต่อ 1 วัน) แล้วเชื่อมกับใบสั่งย้อมของ M/O,S/O จากหน้า "ใบวางแผนงาน" อัตโนมัติด้วยเลข M/O,S/O + รหัสสี</p>
        </div>
      </section>

      <section class="department-panel pw-card">
        <div class="panel-heading"><div><strong>นำเข้ารายงานการผลิตแผนกย้อม</strong><small>รองรับไฟล์ที่มีหลายชีต ชื่อชีตเป็นวันที่ (เช่น "1-9-2026") — นำเข้าไฟล์เดิมซ้ำได้ ระบบจะแทนที่เฉพาะวันที่มีอยู่ในไฟล์นั้น</small></div></div>
        <div class="pw-body">
          <div class="pw-row">
            ${`<label class="pf">ไฟล์ Excel รายงานย้อม<input type="file" id="dyImportFile" accept=".xlsx,.xls"></label>`}
            <button type="button" class="action-button primary" data-dy-import>นำเข้า</button>
          </div>
          <div class="pw-row" id="dySummary"></div>
          <details><summary style="cursor:pointer;font-size:9px;color:var(--muted);font-weight:900">ตรวจสอบยอดรวมต่อวัน เทียบกับที่ระบุไว้ในไฟล์</summary>
            <div id="dyDayCheck" style="margin-top:8px"></div>
          </details>
        </div>
      </section>

      <section class="department-panel pw-card">
        <div class="panel-heading">
          <div><strong>เลือก M/O, S/O</strong><small>รายการที่มีบันทึกการย้อมจริงจากไฟล์ที่นำเข้าแล้ว</small></div>
          <label>ค้นหา<input type="text" id="dySearch" placeholder="เลข M/O, S/O, ชนิดไหม, รหัสสี"></label>
        </div>
        <div class="pw-body" id="dyJobPicker"></div>
      </section>

      <div id="dyDetail"></div>

      <section class="department-panel pw-card wide" style="margin-top:10px">
        <div class="panel-heading"><div><strong>บันทึกย้อมทั้งหมด (ทุกเบอร์ทุกสี)</strong><small>รายการดิบทุกแถวจากรายงานที่นำเข้า เรียงล่าสุดก่อน</small></div></div>
        <div class="pw-body" id="dyRawLog"></div>
      </section>`;
  }

  function renderAll() {
    const log = loadLog();
    const groups = groupRowsByOrder(log).map(enrichGroup);

    const totalKg = log.reduce((t, r) => t + r.kg, 0);
    const days = new Set(log.map((r) => r.date)).size;
    const surplusRows = log.filter((r) => r.isSurplus).length;
    const extraRows = log.filter((r) => r.isExtra || r.isColorFix).length;
    $("#dySummary").innerHTML = log.length ? [
      ["รวมน้ำหนักย้อม", `${fmt(totalKg, 2)} กก.`],
      ["จำนวนวันที่นำเข้า", `${days} วัน`],
      ["จำนวนแถว (ทุกเบอร์ทุกสี)", `${log.length} แถว`],
      ["ใช้ไหม Surplus", `${surplusRows} แถว`],
      ["ย้อมเพิ่ม/แก้สี", `${extraRows} แถว`]
    ].map(([l, v]) => res(l, v)).join("") : `<p class="col-empty">ยังไม่เคยนำเข้ารายงานย้อม</p>`;

    const dayTotals = loadDayTotals();
    const dayIsos = Object.keys(dayTotals).sort().reverse();
    $("#dyDayCheck").innerHTML = dayIsos.length ? `<table class="calc-table"><thead><tr><th>วันที่</th><th class="num">ยอดรวมในไฟล์ (กก.)</th><th class="num">ยอดรวมที่ระบบคำนวณ (กก.)</th><th class="num">จำนวนสีในไฟล์</th><th class="num">จำนวนสีที่คำนวณ</th><th>ผล</th></tr></thead><tbody>${dayIsos.map((iso) => dayCheckRowHtml(iso, dayTotals[iso])).join("")}</tbody></table>` : `<p class="col-empty">ยังไม่มีข้อมูล</p>`;

    const q = state.query.trim().toLowerCase();
    const filtered = groups.filter((g) => !q || `${g.orderNo} ${g.info ? `${g.info.project || ""} ${g.info.customer || ""}` : ""} ${g.rows.map((r) => `${r.yarnType} ${r.colourCode} ${r.lotNo}`).join(" ")}`.toLowerCase().includes(q))
      .sort((a, b) => b.lastDate.localeCompare(a.lastDate));
    $("#dyJobPicker").innerHTML = filtered.length ? `<div class="pw-job-grid">${filtered.map(orderCardHtml).join("")}</div>` : `<p class="col-empty">${log.length ? "ไม่พบรายการที่ตรงกับคำค้นหา" : 'ยังไม่มีข้อมูล — นำเข้ารายงานย้อมด้านบนก่อน'}</p>`;

    const selected = groups.find((g) => g.key === state.selectedKey);
    $("#dyDetail").innerHTML = selected ? buildDetail(selected) : `<p class="col-empty" style="padding:16px;text-align:center;color:var(--muted)">${filtered.length ? "เลือก M/O, S/O ด้านบนเพื่อดูรายละเอียด" : ""}</p>`;

    const rawSorted = log.slice().sort((a, b) => (a.date === b.date ? b.seq - a.seq : b.date.localeCompare(a.date)));
    $("#dyRawLog").innerHTML = rawSorted.length ? `<table class="calc-table"><thead><tr><th>วันที่</th><th>M/O, S/O</th><th>ชนิดไหม</th><th>เบิกจาก Lot / Surplus</th><th>Colour No.</th><th>Colour code</th><th>Batch No.</th><th class="num">กก.</th><th>หมายเหตุ</th></tr></thead><tbody>${rawSorted.map(rawLogRowHtml).join("")}</tbody></table>` : `<p class="col-empty">ยังไม่มีข้อมูล</p>`;
  }

  let built = false;
  function renderDyeing() {
    if (!built) { build(); built = true; bind(); }
    renderAll();
  }

  function bind() {
    const root = $("#dyeingView");
    root.addEventListener("click", (e) => {
      const importBtn = e.target.closest("[data-dy-import]");
      if (importBtn) {
        const f = $("#dyImportFile").files[0];
        if (!f) { toast("เลือกไฟล์ก่อน"); return; }
        importDyeingExcel(f);
        return;
      }
      const pick = e.target.closest("[data-dpick]");
      if (pick) { state.selectedKey = pick.dataset.dpick; renderAll(); return; }
      if (typeof CostEngine !== "undefined" && CostEngine.handleExtraCostClick && CostEngine.handleExtraCostClick(e, renderAll)) return;
    });
    root.addEventListener("input", (e) => {
      if (e.target && e.target.id === "dySearch") { state.query = e.target.value; renderAll(); return; }
      if (typeof CostEngine !== "undefined" && CostEngine.handleExtraCostFieldChange) CostEngine.handleExtraCostFieldChange(e);
    });
  }

  window.DyeingEngine = { KEY_LOG, KEY_DAY_TOTALS, loadLog, groupRowsByOrder, enrichGroup, normMoKey };
  window.renderDyeing = renderDyeing;
})();
