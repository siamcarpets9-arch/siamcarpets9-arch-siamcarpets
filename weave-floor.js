/* ============================================================
   แผนกทอ — หน้าจอทอรายวัน (Weaving Floor Daily Production) + QC Dashboard
   - ขึ้นทอ: กำหนดจอทอ/เกรด/แบบอ้างอิงต่อ M/O แต่ละชิ้น (ผ้าใบต้องพร้อมจากขั้น "ส่งแผนกทอ" — ไหมพร้อมได้ทีละสี ไม่ต้องรอครบทุกสี)
   - บันทึกประจำวันต่อจอ: ช่วงปกติ 08.00-16.30 (พัก 30 นาที) + โอที 17.00-20.00 แยกกัน คำนวณ ตร.ม./คน/ชม. อัตโนมัติ คงเหลือยกไปวันถัดไปอัตโนมัติ
   - ไหมเข้าจอต่อวันต่อสี (จากหม้อย้อมของใบวางแผนงาน) + คำขอไหมเพิ่มถ้าไม่พอ (ส่งให้แผนกวางแผนออกใบสั่งย้อม)
   - ช่างปรับปืน (ระยะเวลา/เหตุผล/ผู้รับผิดชอบ) ทั้งกะปกติและโอที
   - QC ต่อจอ (วันที่ตรวจ/ผู้ตรวจ/ผล/รายละเอียด) → แสดงในหน้า QC Dashboard
   - สรุปประจำวัน + แยกตามเกรด (ตรงตามฟอร์แมต Excel รายงานการผลิตพรมทอมือ) + ส่งออก/นำเข้า Excel + แจ้งเตือน (จำลอง — ยังไม่ได้ต่อ LINE จริง)
   ต้องโหลดหลัง app.js, sales.js, planning.js, weaving.js (ใช้ PlanningEngine, WeavingEngine, SalesEngine, designs, $, $$, toast, XLSX)
   ============================================================ */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const num = (v) => { const n = parseFloat(String(v == null ? "" : v).replace(/,/g, "")); return Number.isFinite(n) ? n : 0; };
  const has = (v) => String(v == null ? "" : v).trim() !== "";
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n, d = 2) => { const x = typeof n === "number" ? n : parseFloat(String(n == null ? "" : n).replace(/,/g, "")); return (Number.isFinite(x) ? x : 0).toLocaleString("th-TH", { minimumFractionDigits: d, maximumFractionDigits: d }); };
  const uid = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const readJson = (k, fb) => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : fb; } catch (e) { return fb; } };
  const writeJson = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ยังใช้ต่อได้ */ } };
  const todayIso = () => new Date().toISOString().slice(0, 10);
  const thaiDate = (iso) => { try { return new Date(iso + "T00:00:00").toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "numeric" }); } catch (e) { return iso; } };

  const PE = () => window.PlanningEngine;
  const WE = () => window.WeavingEngine;
  const KEY_WORKERS_SHARED = "siam-workforce"; // ทะเบียนพนักงานทอ/ตกแต่ง (ตั้งต้นจากหน้าใบวางแผนงาน)

  const KEY_FLOOR = "siam-weave-floor";              // { [designId]: { pieces:{[lineIdx]:PieceRec}, yarnDraw:{[potKey]:{[iso]:kg}} } }
  const KEY_YARN_REQ = "siam-yarn-topup-requests";   // [ {id,designId,potKey,label,colorCode,requestedKg,reason,neededDate,requestedAt,approver,resolved,resolvedAt} ]
  const KEY_QC = "siam-loom-qc";                     // [ {id,designId,lineIdx,loomNo,date,inspector,result,detail,createdAt} ]
  const KEY_NOTIFY = "siam-line-notify-log";         // [ {id,date,message,sentAt} ]

  const QC_RESULTS = ["ผ่าน", "ไม่ผ่าน", "มีข้อสังเกต"];

  /* ============================================================
     Engine — โครงสร้างข้อมูล
     ============================================================ */
  function loadFloorAll() { return readJson(KEY_FLOOR, {}); }
  function saveFloorAll(all) { writeJson(KEY_FLOOR, all); }
  function ensureDesignFloor(designId) {
    const all = loadFloorAll();
    if (!all[designId]) all[designId] = { pieces: {}, yarnDraw: {} };
    if (!all[designId].pieces) all[designId].pieces = {};
    if (!all[designId].yarnDraw) all[designId].yarnDraw = {};
    return all[designId];
  }
  function saveDesignFloor(designId, rec) { const all = loadFloorAll(); all[designId] = rec; saveFloorAll(all); }

  function ensurePieceRec(dfloor, lineIdx) {
    if (!dfloor.pieces[lineIdx]) dfloor.pieces[lineIdx] = { loomNo: "", gradeOverride: "", patternImage: "", days: {} };
    return dfloor.pieces[lineIdx];
  }
  function ensureDayRec(piece, iso) {
    if (!piece.days[iso]) piece.days[iso] = {
      normal: { doneSqm: "", workers: [], start: "08:00", end: "16:30", breakMin: 30 },
      ot: { doneSqm: "", workers: [], start: "17:00", end: "20:00", breakMin: 0 },
      gunAdjust: []
    };
    return piece.days[iso];
  }

  function timeToDec(t) { const parts = String(t || "0:0").split(":"); const h = num(parts[0]), m = num(parts[1]); return h + m / 60; }
  function shiftHours(shift) { const h = timeToDec(shift.end) - timeToDec(shift.start) - num(shift.breakMin) / 60; return Math.max(0, h); }
  function shiftManHours(shift) { return shiftHours(shift) * ((shift.workers || []).length); }
  function shiftEff(shift) { const mh = shiftManHours(shift); return mh > 0 ? num(shift.doneSqm) / mh : 0; }

  function sortedDates(piece) { return Object.keys(piece.days).sort(); }
  function cumulativeDoneBefore(piece, iso) {
    let sum = 0;
    sortedDates(piece).forEach((d) => { if (d < iso) { const day = piece.days[d]; sum += num(day.normal.doneSqm) + num(day.ot.doneSqm); } });
    return sum;
  }
  function dayCarryNormal(piece, iso, totalArea) { return Math.max(0, totalArea - cumulativeDoneBefore(piece, iso)); }
  function dayCarryOt(piece, iso, totalArea) { const day = piece.days[iso]; return Math.max(0, dayCarryNormal(piece, iso, totalArea) - num(day.normal.doneSqm)); }
  function dayRemaining(piece, iso, totalArea) { const day = piece.days[iso]; return Math.max(0, dayCarryOt(piece, iso, totalArea) - num(day.ot.doneSqm)); }
  function pieceDoneTotal(piece) { return sortedDates(piece).reduce((s, d) => { const day = piece.days[d]; return s + num(day.normal.doneSqm) + num(day.ot.doneSqm); }, 0); }

  /* ---------- Yarn top-up requests (ใบขอไหมเพิ่ม → แผนกวางแผนออกใบสั่งย้อม) ---------- */
  function loadYarnRequests() { return readJson(KEY_YARN_REQ, []); }
  function saveYarnRequests(list) { writeJson(KEY_YARN_REQ, list); }
  function addYarnRequest(req) { const all = loadYarnRequests(); all.push({ id: uid("yr"), requestedAt: new Date().toISOString(), approver: "", resolved: false, resolvedAt: null, ...req }); saveYarnRequests(all); return all; }
  function updateYarnRequest(id, patch) { const all = loadYarnRequests(); const i = all.findIndex((r) => r.id === id); if (i >= 0) { all[i] = { ...all[i], ...patch }; saveYarnRequests(all); } return all; }
  function pendingYarnRequests() { return loadYarnRequests().filter((r) => !r.resolved); }

  /* ---------- QC log ---------- */
  function loadQc() { return readJson(KEY_QC, []); }
  function saveQc(list) { writeJson(KEY_QC, list); }
  function addQc(entry) { const all = loadQc(); all.push({ id: uid("qc"), createdAt: new Date().toISOString(), ...entry }); saveQc(all); return all; }

  /* ---------- LINE notify log (จำลอง — ยังไม่เชื่อมต่อ LINE จริง) ---------- */
  function loadNotify() { return readJson(KEY_NOTIFY, []); }
  function saveNotify(list) { writeJson(KEY_NOTIFY, list); }
  function logNotify(date, message) { const all = loadNotify(); all.push({ id: uid("ln"), date, message, sentAt: new Date().toISOString() }); saveNotify(all); return all; }

  /* ---------- ข้อมูลอ้างอิงจาก Planning / Sales / WeavingEngine ---------- */
  function planFor(designId) { const plans = PE().readJson(PE().KEY_PLANS, {}); return plans[designId] || null; }
  function dyePlanOf(plan) { return PE().computeDyePlan(plan.zones, num(plan.totalAreaSqm), plan.bufferPct); }
  function moDocOf(designId) {
    try { if (typeof SalesEngine !== "undefined" && SalesEngine.getDocs) return SalesEngine.getDocs().find((d) => d.designId === designId && d.type === "MO"); } catch (e) { /* ไม่มี SalesEngine */ }
    return null;
  }
  function issueRecOf(designId) { return readJson(WE().KEY_ISSUES, {})[designId] || null; }
  function loadWeaveWorkers() { const w = readJson(KEY_WORKERS_SHARED, null); return Array.isArray(w) ? w : []; }
  function saveWeaveWorkers(list) { writeJson(KEY_WORKERS_SHARED, list); }
  function addWeaveWorker(name) {
    name = String(name || "").trim();
    if (!name) return;
    const list = loadWeaveWorkers();
    if (list.some((w) => w.toLowerCase() === name.toLowerCase())) { toast(`มีชื่อ "${name}" อยู่แล้ว`); return; }
    list.push(name);
    saveWeaveWorkers(list);
  }
  function removeWeaveWorker(idx) {
    const list = loadWeaveWorkers();
    list.splice(idx, 1);
    saveWeaveWorkers(list);
  }
  function exportWeaveWorkersExcel() {
    if (typeof XLSX === "undefined") { toast("ไม่พบไลบรารี XLSX"); return; }
    const rows = [["แผนก", "ชื่อ-นามสกุล"], ...loadWeaveWorkers().map((w) => ["ทอ/ตกแต่ง", w])];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "พนักงานทอ-ตกแต่ง");
    XLSX.writeFile(wb, "รายชื่อพนักงาน-ทอ-ตกแต่ง.xlsx");
  }
  const KEY_PATTERN_WORKERS_EXT = "siam-workforce-pattern"; // ทะเบียนเจาะลาย/ปั๊มผ้า — ไฟล์นำเข้าเดียวแยกลงได้ทั้ง 2 ทะเบียนไม่ว่าจะอัปโหลดจากหน้าไหน
  async function importWeaveWorkersExcel(file) {
    if (typeof XLSX === "undefined") { toast("ไม่พบไลบรารี XLSX"); return; }
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const sharedList = loadWeaveWorkers();
    const patternList = readJson(KEY_PATTERN_WORKERS_EXT, []);
    let sharedAdded = 0, patternAdded = 0;
    wb.SheetNames.forEach((sn) => {
      XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: "", raw: false }).forEach((row) => {
        const dept = String(row[0] || "").trim();
        const name = String(row[1] || "").trim();
        if (!name || /ชื่อ.?นามสกุล|ตัวอย่าง/.test(name)) return;
        const isShared = /ทอ|ตกแต่ง|แต่ง/.test(dept);
        const isPattern = /เจาะลาย|ขยายลาย|ปั๊ม|ดีไซน์/.test(dept);
        // ไม่ระบุแผนก = ถือว่าเป็นแผนกของหน้านี้ (ทอ/ตกแต่ง)
        if (isShared || (!dept && !isPattern)) {
          if (!sharedList.some((w) => w.toLowerCase() === name.toLowerCase())) { sharedList.push(name); sharedAdded++; }
        }
        if (isPattern) {
          if (!patternList.some((w) => w.toLowerCase() === name.toLowerCase())) { patternList.push(name); patternAdded++; }
        }
      });
    });
    saveWeaveWorkers(sharedList);
    writeJson(KEY_PATTERN_WORKERS_EXT, patternList);
    toast(`นำเข้ารายชื่อพนักงานแล้ว — ทอ/ตกแต่ง ${sharedAdded} คน, เจาะลาย/ปั๊มผ้า ${patternAdded} คน`);
  }
  function sharedRosterHtml() {
    const workers = loadWeaveWorkers();
    return `<section class="department-panel pw-card">
      <div class="panel-heading"><div><strong>รายชื่อพนักงานทอ/ตกแต่ง</strong><small>เพิ่ม/ลบรายชื่อได้ที่นี่ — ใช้ร่วมกันทั้งแผนกทอและแผนกตกแต่ง</small></div></div>
      <div class="pw-body">
        <div class="pw-row">
          ${field("ชื่อพนักงาน", `<input id="wfNewWorkerName" placeholder="พิมพ์ชื่อแล้วกดเพิ่มรายชื่อ">`)}
          <button type="button" class="action-button primary" data-add-weaver>+ เพิ่มรายชื่อ</button>
          <button type="button" class="action-button" data-export-weavers>ส่งออก Excel</button>
          <label class="file-picker">นำเข้าจาก Excel<input type="file" id="wfWorkersImportFile" accept=".xlsx,.xls" data-import-weavers></label>
        </div>
        ${workers.length
          ? `<div class="pw-worker-tags">${workers.map((w, i) => `<span>${esc(w)}<button type="button" class="pw-worker-x" data-remove-weaver="${i}" title="ลบรายชื่อนี้">×</button></span>`).join("")}</div>`
          : `<p class="col-empty">ยังไม่มีรายชื่อพนักงาน — เพิ่มด้านบน</p>`}
      </div>
    </section>`;
  }
  function linesOf(designId, plan) {
    const doc = moDocOf(designId);
    return (doc && doc.lines && doc.lines.length) ? doc.lines : [{ location: (designs.find((d) => d.id === designId) || {}).project || designId, sqm: plan ? plan.totalAreaSqm : 0 }];
  }
  function suggestedGradeFor(plan) { return plan.weaveGradeOverride ? plan.weaveGradeOverride : ((PE().suggestGrade(PE().WEAVE_GRADES, plan.patternPct) || {}).grade || ""); }
  /* M/O vs S/O — ใช้ type จากเอกสารฝ่ายขายเป็นหลัก เหมือนหน้าภาพรวมการผลิต (overview.js) */
  function typeOfDesign(designId) {
    try {
      if (typeof SalesEngine !== "undefined" && SalesEngine.getDocs) {
        const doc = SalesEngine.getDocs().find((x) => x.designId === designId);
        if (doc && doc.type) return doc.type === "SO" ? "SO" : "MO";
      }
    } catch (e) { /* ไม่มี SalesEngine */ }
    return /^SO/i.test(designId) ? "SO" : "MO";
  }

  /* ============================================================
     M/O ที่พร้อมขึ้นทอ — เกต: มีแผนบันทึกแล้ว + ผ้าใบพร้อม (canvasReady จากขั้น "ส่งแผนกทอ")
     ไม่บังคับรอไหมครบทุกสี — สีไหนพร้อมก่อนก็เริ่มบันทึกจอนั้นได้ก่อน
     ============================================================ */
  function readyDesigns() {
    const plans = PE().readJson(PE().KEY_PLANS, {});
    return designs.filter((d) => {
      const plan = plans[d.id];
      if (!plan || !plan.savedAt) return false;
      const issue = issueRecOf(d.id);
      return issue && issue.canvasReady;
    });
  }

  /* ============================================================
     สรุปประจำวัน / แยกตามเกรด (ข้ามทุก M/O ที่มีการบันทึกจอ)
     ============================================================ */
  function allPieceRefs() {
    const all = loadFloorAll();
    const refs = [];
    Object.keys(all).forEach((designId) => {
      const plan = planFor(designId);
      if (!plan) return;
      const lines = linesOf(designId, plan);
      const pieces = all[designId].pieces || {};
      Object.keys(pieces).forEach((lineIdx) => {
        const line = lines[lineIdx] || { location: `ชิ้นที่ ${Number(lineIdx) + 1}`, sqm: 0 };
        const grade = pieces[lineIdx].gradeOverride || suggestedGradeFor(plan);
        refs.push({ designId, lineIdx, plan, line, piece: pieces[lineIdx], grade, totalArea: num(line.sqm) || num(plan.totalAreaSqm) });
      });
    });
    return refs;
  }

  function daySummary(iso) {
    const refs = allPieceRefs();
    const gradeTotals = {}; // grade -> {sqm, hours}
    let normalSqm = 0, otSqm = 0, normalHours = 0, otHours = 0;
    const normalWorkers = new Set(), otWorkers = new Set();
    const rows = [];
    refs.forEach((r) => {
      const day = r.piece.days[iso];
      if (!day) return;
      const nMh = shiftManHours(day.normal), oMh = shiftManHours(day.ot);
      const nSqm = num(day.normal.doneSqm), oSqm = num(day.ot.doneSqm);
      normalSqm += nSqm; otSqm += oSqm; normalHours += nMh; otHours += oMh;
      (day.normal.workers || []).forEach((w) => normalWorkers.add(w));
      (day.ot.workers || []).forEach((w) => otWorkers.add(w));
      if (!gradeTotals[r.grade]) gradeTotals[r.grade] = { sqm: 0, hours: 0 };
      gradeTotals[r.grade].sqm += nSqm + oSqm;
      gradeTotals[r.grade].hours += nMh + oMh;
      rows.push({ ...r, day, nSqm, oSqm, nMh, oMh });
    });
    const totalSqm = normalSqm + otSqm, totalHours = normalHours + otHours;
    return { iso, rows, gradeTotals, normalSqm, otSqm, normalHours, otHours, totalSqm, totalHours, eff: totalHours > 0 ? totalSqm / totalHours : 0, headcount: new Set([...normalWorkers, ...otWorkers]).size, normalHeadcount: normalWorkers.size, otHeadcount: otWorkers.size };
  }

  function allLoggedDates() {
    const set = new Set();
    allPieceRefs().forEach((r) => sortedDates(r.piece).forEach((d) => set.add(d)));
    return [...set].sort();
  }

  /* ---------------- เงินเดือนพนักงานทอ (คงที่ต่อคน/เดือน แบบเดียวกับนักออกแบบ) ---------------- */
  const KEY_WEAVE_SALARY = "siam-weave-worker-salary"; // { [ชื่อพนักงานทอ]: เงินเดือนต่อเดือน (บาท) }
  function loadWeaveSalaries() { return readJson(KEY_WEAVE_SALARY, {}); }
  function saveWeaveSalaries(all) { writeJson(KEY_WEAVE_SALARY, all); }
  function setWeaveSalary(name, amount) {
    if (!has(name)) return;
    const all = loadWeaveSalaries();
    if (num(amount) > 0) all[name] = num(amount); else delete all[name];
    saveWeaveSalaries(all);
  }

  // สรุปผลงานพนักงานทอตามช่วงเวลาที่เลือก (วัน/เดือน/ปี — กำหนดด้วย datePredicate รับ iso คืน true/false)
  // ตร.ม.ของแต่ละกะแบ่งเฉลี่ยเท่า ๆ กันตามจำนวนคนที่เข้ากะนั้น (ทำงานเป็นทีมต่อจอ แยกผลงานรายคนจริงไม่ได้) · ชั่วโมงนับเต็มชั่วโมงกะต่อคนที่เข้ากะ
  function workerPeriodSummary(datePredicate) {
    const byWorker = new Map();
    const get = (name) => {
      let w = byWorker.get(name);
      if (!w) { w = { name, sqm: 0, hours: 0, days: new Set() }; byWorker.set(name, w); }
      return w;
    };
    allPieceRefs().forEach((r) => {
      Object.keys(r.piece.days || {}).forEach((iso) => {
        if (!datePredicate(iso)) return;
        const day = r.piece.days[iso];
        ["normal", "ot"].forEach((shiftName) => {
          const shift = day[shiftName];
          const workers = shift.workers || [];
          if (!workers.length) return;
          const hrs = shiftHours(shift), sqmPer = num(shift.doneSqm) / workers.length;
          workers.forEach((w) => { const rec = get(w); rec.sqm += sqmPer; rec.hours += hrs; rec.days.add(iso); });
        });
      });
    });
    const salaries = loadWeaveSalaries();
    return [...byWorker.values()]
      .map((w) => ({ name: w.name, sqm: w.sqm, hours: w.hours, days: w.days.size, eff: w.hours > 0 ? w.sqm / w.hours : 0, salary: num(salaries[w.name]) }))
      .sort((a, b) => b.sqm - a.sqm);
  }

  // ดึงรูปแบบพรม (patternImage) ที่แนบไว้ในหน้าแผนกทอสำหรับ M/O,S/O นี้ — ใช้แสดงรูปดีไซน์ในหน้าภาพรวม/ใบส่งของ
  // (ยังไม่มีช่องเก็บรูปต่อดีไซน์โดยตรงในระบบ จึงดึงจากรูปที่ช่างทอแนบไว้ต่อชิ้น/ล็อกการทอแทน — คืนรูปแรกที่พบ)
  function getDesignImage(designId) {
    try {
      const dfloor = loadFloorAll()[designId];
      if (!dfloor || !dfloor.pieces) return "";
      const rec = Object.values(dfloor.pieces).find((p) => p && p.patternImage);
      return rec ? rec.patternImage : "";
    } catch (e) { return ""; }
  }

  window.WeaveFloorEngine = {
    KEY_FLOOR, KEY_YARN_REQ, KEY_QC, KEY_NOTIFY, QC_RESULTS,
    loadFloorAll, ensureDesignFloor, saveDesignFloor, ensurePieceRec, ensureDayRec,
    timeToDec, shiftHours, shiftManHours, shiftEff, sortedDates, cumulativeDoneBefore,
    dayCarryNormal, dayCarryOt, dayRemaining, pieceDoneTotal,
    loadYarnRequests, saveYarnRequests, addYarnRequest, updateYarnRequest, pendingYarnRequests,
    loadQc, saveQc, addQc, loadNotify, saveNotify, logNotify,
    planFor, dyePlanOf, moDocOf, issueRecOf, loadWeaveWorkers, linesOf, suggestedGradeFor,
    readyDesigns, allPieceRefs, daySummary, allLoggedDates, readJson, writeJson, getDesignImage,
    KEY_WEAVE_SALARY, loadWeaveSalaries, saveWeaveSalaries, setWeaveSalary, workerPeriodSummary
  };

  /* ============================================================
     UI — แผนกทอ (จอทอรายวัน)
     ============================================================ */
  const state = { tab: "setup", designId: null, lineIdx: null, day: todayIso(), workerMode: "day", workerDay: todayIso(), workerMonth: todayIso().slice(0, 7), workerYear: todayIso().slice(0, 4) };

  function field(label, inner) { return `<label class="pf">${label}${inner}</label>`; }
  function res(label, value, cls = "") { return `<div class="pr ${cls}"><small>${label}</small><strong>${value}</strong></div>`; }
  function checkGrid(name, options, selected) {
    return `<div class="pw-worker-check-grid">${options.map((w, i) => `<label class="pw-worker-check"><input type="checkbox" data-check="${esc(name)}" value="${esc(w)}" ${(selected || []).includes(w) ? "checked" : ""}> ${esc(w)}</label>`).join("")}</div>`;
  }

  function tabBar() {
    const tabs = [["setup", "ตั้งค่าขึ้นทอ"], ["daily", "บันทึกประจำวัน"], ["board", "หน้าจอทอ (ภาพรวม)"], ["report", "สรุป/ส่งออก/แจ้งเตือน"]];
    return `<div class="control-strip"><div class="segmented">${tabs.map(([k, l]) => `<button type="button" class="view-btn ${state.tab === k ? "active" : ""}" data-wftab="${k}">${l}</button>`).join("")}</div></div>`;
  }

  function jobPickerHtml(pickAttr) {
    const ready = readyDesigns();
    if (!ready.length) return `<p class="col-empty">ยังไม่มี M/O ที่ผ้าใบพร้อม (ต้องติ๊ก “ผ้าใบสำหรับทอพร้อมแล้ว” ในหน้า “ส่งแผนกทอ” ก่อน — ไม่ต้องรอไหมครบทุกสี)</p>`;
    const plans = PE().readJson(PE().KEY_PLANS, {});
    return `<div class="pw-job-grid">${ready.map((d) => `<button type="button" class="pw-job-card dept-weaving ${state.designId === d.id ? "active" : ""}" data-${pickAttr}="${esc(d.id)}">
      <strong>${esc(d.id)}</strong><span>${esc(d.project)}</span><small>${esc(plans[d.id].moNo || "ยังไม่มีเลข M/O")}</small>
    </button>`).join("")}</div>`;
  }

  /* ---------------- Tab 1: ตั้งค่าขึ้นทอ ---------------- */
  function pieceCardHtml(designId, plan, lines, dfloor, idx) {
    const line = lines[idx];
    const piece = ensurePieceRec(dfloor, idx);
    const grade = piece.gradeOverride || suggestedGradeFor(plan);
    const totalArea = num(line.sqm) || num(plan.totalAreaSqm);
    const done = pieceDoneTotal(piece);
    const remain = Math.max(0, totalArea - done);
    return `<div class="department-panel pw-card" data-piece="${idx}">
      <div class="pw-body">
        <div class="pw-row">
          ${res("ชิ้น/Location", esc(line.location || line.design || `ชิ้นที่ ${idx + 1}`))}
          ${res("พื้นที่รวม", `${fmt(totalArea, 2)} ตร.ม.`)}
          ${res("ทอไปแล้ว", `${fmt(done, 2)} ตร.ม.`)}
          ${res("คงเหลือ", `${fmt(remain, 2)} ตร.ม.`, remain <= 0.0005 ? "main" : "")}
        </div>
        <div class="pw-row">
          ${field("จอทอเบอร์", `<input data-pf="loomNo" value="${esc(piece.loomNo)}" placeholder="เช่น 3" class="pw-num tiny">`)}
          ${field("เกรดทอ (ว่าง = อัตโนมัติจากใบวางแผนงาน)", `<select data-pf="gradeOverride"><option value="">อัตโนมัติ (${esc(grade)})</option>${(PE().WEAVE_GRADES || []).map((g) => `<option value="${esc(g.grade)}" ${piece.gradeOverride === g.grade ? "selected" : ""}>${esc(g.grade)}</option>`).join("")}</select>`)}
          ${field("แนบรูปแบบพรม (เก็บในเบราว์เซอร์นี้เท่านั้น)", `<input type="file" accept="image/*" data-pf="patternImageFile">`)}
        </div>
        ${piece.patternImage ? `<div class="pw-row"><img src="${piece.patternImage}" alt="แบบพรม" style="max-width:140px;border:1px solid var(--line)"><button type="button" class="action-button" data-pf-clear-image>ลบรูป</button></div>` : ""}
      </div>
    </div>`;
  }

  function yarnPotsHtml(designId, plan) {
    const dye = dyePlanOf(plan);
    const issue = issueRecOf(designId);
    const dfloor = ensureDesignFloor(designId);
    return `<section class="department-panel pw-card wide">
      <div class="panel-heading"><div><strong>ไหมเข้าจอต่อวันต่อสี</strong><small>M/O ผ้าใบครบ แต่ไหมอาจครบบางสี — สีไหนพร้อมก็บันทึก กก. ที่เข้าจอวันนี้ได้เลย (ไม่ต้องรอครบทุกสี)</small></div></div>
      <div class="pw-body">
        <table class="calc-table">
          <thead><tr><th>หม้อย้อม/สี</th><th>สถานะไหมย้อม</th><th class="num">รวมส่งมอบ (กก.)</th><th class="num">เข้าจอสะสม (กก.)</th><th>กก. เข้าจอวันที่ ${thaiDate(state.day)}</th><th></th></tr></thead>
          <tbody>${dye.pots.map((pot) => {
      const ps = issue && issue.pots && issue.pots[pot.key];
      const ready = ps ? ps.yarnReady : false;
      const delivered = pot.netKg + num(ps ? ps.surplusDrawn : 0);
      const drawMap = dfloor.yarnDraw[pot.key] || {};
      const cumDrawn = Object.values(drawMap).reduce((s, v) => s + num(v), 0);
      const todayVal = drawMap[state.day] || "";
      return `<tr data-potdraw="${esc(pot.key)}">
              <td>${esc(pot.label)}</td>
              <td>${ready ? `<span class="status-tag">พร้อม</span>` : `<span class="status-tag blocked">ยังไม่พร้อม</span>`}</td>
              <td class="num">${fmt(delivered, 3)}</td>
              <td class="num">${fmt(cumDrawn, 3)} ${cumDrawn > delivered + 0.0005 ? `<br><small class="pw-dye-warn">เกินยอดส่งมอบ</small>` : ""}</td>
              <td><input name="drawKg" value="${esc(todayVal)}" inputmode="decimal" class="pw-num tiny"> กก.</td>
              <td><button type="button" class="action-button" data-request-yarn="${esc(pot.key)}" data-request-label="${esc(pot.label)}">ขอไหมเพิ่ม</button></td>
            </tr>`;
    }).join("")}</tbody>
        </table>
      </div>
    </section>`;
  }

  function setupTabHtml() {
    if (!state.designId) return `<p class="col-empty">เลือก M/O ด้านบนก่อน</p>`;
    const plan = planFor(state.designId);
    if (!plan) return `<p class="col-empty">ไม่พบใบวางแผนงานของ Job นี้</p>`;
    const lines = linesOf(state.designId, plan);
    const dfloor = ensureDesignFloor(state.designId);
    return `
    <section class="department-panel pw-card">
      <div class="panel-heading"><div><strong>ตั้งค่าขึ้นทอต่อชิ้น</strong><small>กำหนดจอทอ/เกรด/แบบอ้างอิงต่อชิ้น (M/O มีหลายชิ้นแยกจอกันได้)</small></div></div>
    </section>
    ${lines.map((l, i) => pieceCardHtml(state.designId, plan, lines, dfloor, i)).join("")}
    ${yarnPotsHtml(state.designId, plan)}`;
  }

  /* ---------------- Tab 2: บันทึกประจำวัน ---------------- */
  function loomChoiceHtml() {
    const refs = allPieceRefs().filter((r) => r.designId === state.designId);
    if (!refs.length) return `<p class="col-empty">ยังไม่ได้ตั้งค่าขึ้นทอสำหรับ M/O นี้ (ไปที่แท็บ “ตั้งค่าขึ้นทอ” ก่อน)</p>`;
    return `<div class="pw-job-grid">${refs.map((r) => `<button type="button" class="pw-job-card ${state.lineIdx == r.lineIdx ? "active" : ""}" data-lpick="${r.lineIdx}">
      <strong>จอ ${esc(r.piece.loomNo || "?")}</strong><span>${esc(r.line.location || `ชิ้นที่ ${Number(r.lineIdx) + 1}`)}</span><small>เกรด ${esc(r.grade)}</small>
    </button>`).join("")}</div>`;
  }

  function gunAdjustRowHtml(idx, g) {
    return `<tr data-gun="${idx}">
      <td><select name="shift"><option value="normal" ${g.shift === "normal" ? "selected" : ""}>ปกติ</option><option value="ot" ${g.shift === "ot" ? "selected" : ""}>โอที</option></select></td>
      <td><input name="start" type="time" value="${esc(g.start)}"></td>
      <td><input name="end" type="time" value="${esc(g.end)}"></td>
      <td class="num">${fmt(Math.max(0, timeToDec(g.end) - timeToDec(g.start)) * 60, 0)} นาที</td>
      <td><input name="technician" value="${esc(g.technician)}" placeholder="ชื่อช่าง"></td>
      <td><input name="reason" value="${esc(g.reason)}" placeholder="เหตุผลที่ปรับ"></td>
      <td><button type="button" class="pw-worker-x" data-remove-gun="${idx}" title="ลบ">×</button></td>
    </tr>`;
  }

  function qcRowsHtml(designId, lineIdx, loomNo) {
    const list = loadQc().filter((q) => q.designId === designId && String(q.lineIdx) === String(lineIdx)).sort((a, b) => b.date.localeCompare(a.date));
    if (!list.length) return `<p class="col-empty">ยังไม่มีประวัติ QC ของจอนี้</p>`;
    return `<table class="calc-table"><thead><tr><th>วันที่ตรวจ</th><th>ผู้ตรวจ</th><th>ผล</th><th>รายละเอียด</th></tr></thead><tbody>${list.map((q) => `<tr><td>${thaiDate(q.date)}</td><td>${esc(q.inspector)}</td><td><span class="status-tag ${q.result === "ไม่ผ่าน" ? "blocked" : q.result === "มีข้อสังเกต" ? "review" : ""}">${esc(q.result)}</span></td><td>${esc(q.detail)}</td></tr>`).join("")}</tbody></table>`;
  }

  function dailyTabHtml() {
    if (!state.designId) return `<p class="col-empty">เลือก M/O ด้านบนก่อน</p>`;
    const plan = planFor(state.designId);
    if (!plan) return `<p class="col-empty">ไม่พบใบวางแผนงานของ Job นี้</p>`;
    const lines = linesOf(state.designId, plan);
    const dfloor = ensureDesignFloor(state.designId);
    const loomPicker = `<section class="department-panel pw-card"><div class="panel-heading"><div><strong>เลือกจอทอของ M/O นี้</strong></div></div><div class="pw-body">${loomChoiceHtml()}</div></section>`;
    if (state.lineIdx == null) return loomPicker + `<p class="col-empty">เลือกจอด้านบนเพื่อบันทึกประจำวัน</p>`;
    const piece = ensurePieceRec(dfloor, state.lineIdx);
    const line = lines[state.lineIdx] || { location: `ชิ้นที่ ${Number(state.lineIdx) + 1}`, sqm: 0 };
    const totalArea = num(line.sqm) || num(plan.totalAreaSqm);
    const day = ensureDayRec(piece, state.day);
    const workers = loadWeaveWorkers();
    const carryN = dayCarryNormal(piece, state.day, totalArea);
    const carryOt = dayCarryOt(piece, state.day, totalArea);
    const remain = dayRemaining(piece, state.day, totalArea);
    const nMh = shiftManHours(day.normal), oMh = shiftManHours(day.ot);
    const nEff = shiftEff(day.normal), oEff = shiftEff(day.ot);
    const totalSqm = num(day.normal.doneSqm) + num(day.ot.doneSqm), totalMh = nMh + oMh;

    return loomPicker + `
    <section class="department-panel pw-card wide">
      <div class="panel-heading"><div><strong>บันทึกประจำวัน — จอ ${esc(piece.loomNo || "?")} · ${esc(line.location || "-")}</strong><small>เลือกวันที่แล้วกรอกข้อมูลกะปกติ/โอที — ระบบคำนวณคงเหลือยกไปวันถัดไปให้อัตโนมัติ</small></div></div>
      <div class="pw-body">
        <div class="pw-row">${field("วันที่บันทึก", `<input type="date" id="wfDayPicker" value="${esc(state.day)}">`)}${res("พื้นที่รวมชิ้นนี้", `${fmt(totalArea, 2)} ตร.ม.`)}${res("คงเหลือหลังวันนี้", `${fmt(remain, 2)} ตร.ม.`, remain <= 0.0005 ? "main" : "")}</div>

        <div class="pw-job-card" style="cursor:default;align-items:stretch;width:100%">
          <strong>ช่วงเวลาปกติ 08.00–16.30 น. (ปรับเวลาได้)</strong>
          <div class="pw-row" style="margin-top:6px">
            ${res("คงเหลือยกมา", `${fmt(carryN, 2)} ตร.ม.`)}
            ${field("พ.ท. ทำได้วันนี้ (ตร.ม.)", `<input data-shift="normal" data-field="doneSqm" value="${esc(day.normal.doneSqm)}" inputmode="decimal" class="pw-num tiny">`)}
            ${field("เริ่ม", `<input data-shift="normal" data-field="start" type="time" value="${esc(day.normal.start)}">`)}
            ${field("เลิก", `<input data-shift="normal" data-field="end" type="time" value="${esc(day.normal.end)}">`)}
            ${field("พักเที่ยง (นาที)", `<input data-shift="normal" data-field="breakMin" value="${esc(day.normal.breakMin)}" inputmode="numeric" class="pw-num tiny">`)}
          </div>
          <label class="pf" style="margin-top:6px">รายชื่อพนักงานกะปกติ</label>
          ${workers.length ? checkGrid("normal", workers, day.normal.workers) : `<p class="col-empty">ยังไม่มีทะเบียนพนักงานทอ (เปิดหน้า “ใบวางแผนงาน” ครั้งหนึ่งเพื่อสร้างทะเบียน)</p>`}
          <div class="pw-res-row" style="margin-top:6px">${res("จำนวนคน", `${(day.normal.workers || []).length} คน`)}${res("รวมชั่วโมง (คน×ชม.)", fmt(nMh, 1))}${res("ประสิทธิภาพ (ตรม./คน/ชม.)", fmt(nEff, 3), "main")}</div>
        </div>

        <div class="pw-job-card" style="cursor:default;align-items:stretch;width:100%;margin-top:8px">
          <strong>ช่วงเวลาโอที 17.00–20.00 น. (ปรับเวลาได้)</strong>
          <div class="pw-row" style="margin-top:6px">
            ${res("คงเหลือยกมา (ต่อจากกะปกติ)", `${fmt(carryOt, 2)} ตร.ม.`)}
            ${field("พ.ท. ทำได้โอที (ตร.ม.)", `<input data-shift="ot" data-field="doneSqm" value="${esc(day.ot.doneSqm)}" inputmode="decimal" class="pw-num tiny">`)}
            ${field("เริ่ม", `<input data-shift="ot" data-field="start" type="time" value="${esc(day.ot.start)}">`)}
            ${field("เลิก", `<input data-shift="ot" data-field="end" type="time" value="${esc(day.ot.end)}">`)}
            ${field("พัก (นาที)", `<input data-shift="ot" data-field="breakMin" value="${esc(day.ot.breakMin)}" inputmode="numeric" class="pw-num tiny">`)}
          </div>
          <label class="pf" style="margin-top:6px">รายชื่อพนักงานโอที</label>
          ${workers.length ? checkGrid("ot", workers, day.ot.workers) : ""}
          <div class="pw-res-row" style="margin-top:6px">${res("จำนวนคน", `${(day.ot.workers || []).length} คน`)}${res("รวมชั่วโมง (คน×ชม.)", fmt(oMh, 1))}${res("ประสิทธิภาพ (ตรม./คน/ชม.)", fmt(oEff, 3), "main")}</div>
        </div>

        <div class="pw-res-row" style="margin-top:8px">${res("รวมพื้นที่ทั้งวัน", `${fmt(totalSqm, 2)} ตร.ม.`, "main")}${res("รวมชั่วโมงทั้งวัน", fmt(totalMh, 1))}${res("ประสิทธิภาพรวม", fmt(totalMh > 0 ? totalSqm / totalMh : 0, 3))}</div>
      </div>
    </section>

    <section class="department-panel pw-card wide">
      <div class="panel-heading"><div><strong>ช่างปรับปืน (ปรับความตึง/ปืนทอ)</strong><small>บันทึกทุกครั้งที่มีการปรับ ทั้งกะปกติและโอที — ระยะเวลาคำนวณจากเวลาเริ่ม-เลิกอัตโนมัติ</small></div></div>
      <div class="pw-body">
        <table class="calc-table"><thead><tr><th>กะ</th><th>เริ่ม</th><th>เลิก</th><th>ระยะเวลา</th><th>ช่างผู้รับผิดชอบ</th><th>เหตุผล</th><th></th></tr></thead>
        <tbody>${(day.gunAdjust || []).map((g, i) => gunAdjustRowHtml(i, g)).join("") || `<tr><td colspan="7" class="col-empty">ยังไม่มีรายการปรับปืนวันนี้</td></tr>`}</tbody></table>
        <div class="pw-save-bar"><button type="button" class="action-button" data-add-gun>+ เพิ่มรายการปรับปืน</button></div>
      </div>
    </section>

    <section class="department-panel pw-card wide">
      <div class="panel-heading"><div><strong>QC ตรวจจอทอ</strong><small>บันทึกวันที่ตรวจ/ผู้ตรวจ/ผล/รายละเอียด — แสดงผลรวมในหน้า QC Dashboard</small></div></div>
      <div class="pw-body">
        <div class="pw-row">
          ${field("วันที่ตรวจ", `<input type="date" id="qcDate" value="${esc(state.day)}">`)}
          ${field("ผู้ตรวจ", `<input id="qcInspector" placeholder="ชื่อผู้ตรวจ QC">`)}
          ${field("ผล", `<select id="qcResult">${QC_RESULTS.map((r) => `<option value="${esc(r)}">${esc(r)}</option>`).join("")}</select>`)}
        </div>
        <div class="pw-row">${field("รายละเอียด", `<input id="qcDetail" placeholder="รายละเอียดที่ตรวจพบ" style="min-width:320px">`)}</div>
        <div class="pw-save-bar"><button type="button" class="action-button primary" data-add-qc>บันทึก QC</button></div>
        ${qcRowsHtml(state.designId, state.lineIdx)}
      </div>
    </section>`;
  }

  /* ---------------- Tab 3: หน้าจอทอ (ภาพรวม) ---------------- */
  function boardTabHtml() {
    const refs = allPieceRefs();
    if (!refs.length) return `<p class="col-empty">ยังไม่มีจอทอที่ตั้งค่าไว้ — ไปที่แท็บ “ตั้งค่าขึ้นทอ” ก่อน</p>`;
    const byLoom = [...refs].sort((a, b) => String(a.piece.loomNo || "999").localeCompare(String(b.piece.loomNo || "999"), "th", { numeric: true }));
    const grades = PE().WEAVE_GRADES || [];
    const designsList = typeof designs !== "undefined" ? designs : [];
    const todayKey = todayIso();
    const activeToday = byLoom.filter((r) => { const d = r.piece.days[todayKey]; return d && (num(d.normal.doneSqm) > 0 || num(d.ot.doneSqm) > 0); }).length;
    return `<p class="col-empty" style="text-align:left;padding:0 2px 10px">ภาพรวมจอทอวันนี้ (${thaiDate(todayKey)}) — ทำงานแล้ว ${activeToday} จาก ${byLoom.length} จอ</p>
    <div class="wfb-grid">${byLoom.map((r) => {
      const design = designsList.find((d) => d.id === r.designId) || {};
      const type = typeOfDesign(r.designId);
      const market = design.market === "DOMESTIC" ? "ในประเทศ" : design.market === "FOREIGN" ? "ต่างประเทศ" : "-";
      const dates = sortedDates(r.piece);
      const workedDates = dates.filter((d) => { const day = r.piece.days[d]; return num(day.normal.doneSqm) > 0 || num(day.ot.doneSqm) > 0; });
      const lastIso = dates[dates.length - 1];
      const done = pieceDoneTotal(r.piece), remain = Math.max(0, r.totalArea - done);
      const donePct = r.totalArea > 0 ? Math.min(100, (done / r.totalArea) * 100) : 0;
      const todayRec = r.piece.days[todayKey];
      const todaySqm = todayRec ? num(todayRec.normal.doneSqm) + num(todayRec.ot.doneSqm) : 0;

      let totalMh = 0;
      const allWeavers = new Set();
      dates.forEach((d) => {
        const day = r.piece.days[d];
        totalMh += shiftManHours(day.normal) + shiftManHours(day.ot);
        (day.normal.workers || []).forEach((w) => allWeavers.add(w));
        (day.ot.workers || []).forEach((w) => allWeavers.add(w));
      });
      const actualEff = totalMh > 0 ? done / totalMh : 0;
      const gradeInfo = grades.find((g) => g.grade === r.grade);
      const pctVsGrade = gradeInfo && gradeInfo.rateSqmPerHr > 0 ? (actualEff / gradeInfo.rateSqmPerHr) * 100 : null;

      return `<div class="wfb-card">
        <div class="wfb-head">
          <div class="wfb-loom"><small>จอที่</small><strong>${esc(r.piece.loomNo || "?")}</strong></div>
          <div class="wfb-headinfo">
            <div class="wfb-badges">
              <span class="ovw-type ovw-type-${type}">${type}</span>
              <span class="wfb-market">${esc(market)}</span>
              <strong>${esc(r.plan.moNo || r.designId)}</strong>
            </div>
            <div class="wfb-cust">${esc(design.customer || "-")}</div>
            <small class="wfb-due">กำหนดส่ง: ${esc(design.due || "-")} · ${esc(r.line.location || "-")}</small>
          </div>
          <button type="button" class="wfb-edit" data-goto-daily="${esc(r.designId)}" data-goto-line="${esc(r.lineIdx)}" title="ไปที่บันทึกประจำวันของจอนี้">✎</button>
        </div>
        ${r.piece.patternImage ? `<img class="wfb-img" src="${r.piece.patternImage}" alt="แบบพรม">` : `<div class="wfb-img wfb-img-empty">ยังไม่แนบรูปแบบ (แนบได้ที่แท็บ “ตั้งค่าขึ้นทอ”)</div>`}
        <div class="wfb-weavers"><small>คนทอ</small><span>${allWeavers.size ? [...allWeavers].map((w) => esc(w)).join(", ") : "ยังไม่มีบันทึก"}</span></div>
        <div class="wfb-stats">
          <div class="wfb-stat main"><small>เกรด</small><strong>${esc(r.grade || "-")}</strong></div>
          <div class="wfb-stat${pctVsGrade != null && pctVsGrade < 90 ? " warn" : ""}"><small>% เทียบเกรด (มาตรฐาน)</small><strong>${pctVsGrade != null ? fmt(pctVsGrade, 1) + "%" : "-"}</strong></div>
          <div class="wfb-stat"><small>ใช้เวลารวม</small><strong>${fmt(totalMh, 1)} ชม.</strong></div>
          <div class="wfb-stat"><small>จำนวนวันที่ทอ</small><strong>${workedDates.length} วัน</strong></div>
        </div>
        <div class="wfb-progress"><div class="wfb-progress-bar" style="width:${donePct}%"></div></div>
        <div class="wfb-stats">
          <div class="wfb-stat"><small>ตร.ม. รวม</small><strong>${fmt(r.totalArea, 2)}</strong></div>
          <div class="wfb-stat"><small>ทอไปแล้ว</small><strong>${fmt(done, 2)}</strong></div>
          <div class="wfb-stat${remain <= 0.0005 ? " main" : ""}"><small>คงเหลือ</small><strong>${fmt(remain, 2)}</strong></div>
        </div>
        <div class="wfb-stats">
          <div class="wfb-stat${todaySqm > 0 ? " main" : ""}"><small>ทำได้วันนี้</small><strong>${fmt(todaySqm, 2)}</strong></div>
          <div class="wfb-stat"><small>ยกไปวันถัดไป</small><strong>${fmt(remain, 2)}</strong></div>
        </div>
        <div class="wfb-foot"><small>บันทึกล่าสุด ${lastIso ? thaiDate(lastIso) : "ยังไม่บันทึก"}</small></div>
        <div class="pw-save-bar">
          <button type="button" class="action-button primary" data-transfer-glue="${esc(r.designId)}" data-transfer-line="${esc(r.lineIdx)}" ${remain > 0.0005 ? "disabled" : ""}>โอนให้แผนกทากาวตกแต่ง</button>
          ${r.piece.transferredToGlueAt ? `<small>โอนแล้ว ${new Date(r.piece.transferredToGlueAt).toLocaleString("th-TH")}</small>` : `<small>${remain > 0.0005 ? "ทอยังไม่เสร็จ" : "ยังไม่โอน"}</small>`}
        </div>
      </div>`;
    }).join("")}</div>`;
  }

  /* ---------------- Tab 4: สรุป/ส่งออก/แจ้งเตือน ---------------- */
  function gradeSummaryTableHtml(sum) {
    const grades = (PE().WEAVE_GRADES || []).map((g) => g.grade);
    return `<table class="calc-table"><thead><tr><th>เกรด</th><th class="num">ตร.ม.</th><th class="num">ชั่วโมง</th></tr></thead><tbody>
      ${grades.map((g) => `<tr><td>${esc(g)}</td><td class="num">${fmt((sum.gradeTotals[g] || { sqm: 0 }).sqm, 2)}</td><td class="num">${fmt((sum.gradeTotals[g] || { hours: 0 }).hours, 1)}</td></tr>`).join("")}
    </tbody></table>`;
  }

  function yarnReqRowHtml(r) {
    return `<tr data-yreq="${r.id}">
      <td>${esc(r.designId)}</td><td>${esc(r.label)}</td><td class="num">${fmt(r.requestedKg, 3)} กก.</td><td>${esc(r.neededDate ? thaiDate(r.neededDate) : "-")}</td><td>${esc(r.reason)}</td>
      <td>${r.resolved ? `<span class="status-tag">ออกใบสั่งย้อมแล้ว</span>` : `<span class="status-tag review">รอแผนกวางแผน</span>`}</td>
      <td>${r.resolved ? esc(r.approver || "-") : `<input data-yreq-approver="${r.id}" placeholder="ผู้อนุมัติสั่งย้อม" value="${esc(r.approver)}" class="pw-num tiny">`}</td>
      <td>${r.resolved ? "" : `<button type="button" class="action-button primary" data-yreq-resolve="${r.id}">แผนกวางแผนออกใบสั่งย้อมแล้ว</button>`}</td>
    </tr>`;
  }

  // สรุปพนักงานทอตามช่วงเวลา — เรียกดูรายวัน/รายเดือน/รายปีได้ + ตั้งเงินเดือนคงที่ต่อคน/เดือนได้ในตารางเดียวกัน
  function workerReportHtml() {
    const mode = state.workerMode || "day";
    let predicate, label;
    if (mode === "month") { predicate = (iso) => iso.slice(0, 7) === state.workerMonth; label = state.workerMonth; }
    else if (mode === "year") { predicate = (iso) => iso.slice(0, 4) === String(state.workerYear); label = state.workerYear; }
    else { predicate = (iso) => iso === state.workerDay; label = thaiDate(state.workerDay); }
    const rows = workerPeriodSummary(predicate);
    return `<section class="department-panel pw-card wide">
      <div class="panel-heading">
        <div><strong>สรุปพนักงานทอตามช่วงเวลา</strong><small>ตร.ม. แบ่งเฉลี่ยตามจำนวนคนที่เข้ากะ (ทอเป็นทีมต่อจอ แยกผลงานรายคนจริงไม่ได้) · ตั้งเงินเดือนคงที่ต่อคน/เดือนได้ในตารางนี้</small></div>
        <div class="pw-row">
          <select data-wf-worker-mode>
            <option value="day" ${mode === "day" ? "selected" : ""}>รายวัน</option>
            <option value="month" ${mode === "month" ? "selected" : ""}>รายเดือน</option>
            <option value="year" ${mode === "year" ? "selected" : ""}>รายปี</option>
          </select>
          ${mode === "day" ? `<input type="date" data-wf-worker-day value="${esc(state.workerDay)}">` : ""}
          ${mode === "month" ? `<input type="month" data-wf-worker-month value="${esc(state.workerMonth)}">` : ""}
          ${mode === "year" ? `<input type="number" min="2020" max="2100" step="1" class="pw-num tiny" data-wf-worker-year value="${esc(state.workerYear)}">` : ""}
        </div>
      </div>
      <div class="pw-body">
        ${rows.length ? `<table class="calc-table"><thead><tr><th>พนักงานทอ</th><th class="num">ตร.ม.</th><th class="num">ชั่วโมง</th><th class="num">ประสิทธิภาพ (ตร.ม./ชม.)</th><th class="num">จำนวนวันที่ทำงาน</th><th class="num">เงินเดือน (บาท/เดือน)</th></tr></thead><tbody>
          ${rows.map((w) => `<tr><td>${esc(w.name)}</td><td class="num">${fmt(w.sqm, 2)}</td><td class="num">${fmt(w.hours, 1)}</td><td class="num">${fmt(w.eff, 3)}</td><td class="num">${w.days}</td><td class="num"><input class="pw-num tiny" data-weaver-salary="${esc(w.name)}" inputmode="decimal" placeholder="เช่น 12000" value="${w.salary ? esc(w.salary) : ""}"></td></tr>`).join("")}
        </tbody></table>` : `<p class="col-empty">ไม่มีข้อมูลการทอในช่วงเวลาที่เลือก (${esc(label)})</p>`}
      </div>
    </section>

    `;
  }

  function reportTabHtml() {
    const sum = daySummary(state.day);
    const notify = loadNotify().slice().reverse().slice(0, 10);
    const reqs = loadYarnRequests().slice().reverse();
    const message = `รายงานการทอประจำวัน ${thaiDate(state.day)}\nรวมพื้นที่: ${fmt(sum.totalSqm, 2)} ตร.ม. (ปกติ ${fmt(sum.normalSqm, 2)} + โอที ${fmt(sum.otSqm, 2)})\nชั่วโมงรวม: ${fmt(sum.totalHours, 1)} ชม. | ประสิทธิภาพ: ${fmt(sum.eff, 3)} ตรม./คน/ชม.\nพนักงานทอวันนี้: ${sum.headcount} คน (ปกติ ${sum.normalHeadcount} · โอที ${sum.otHeadcount})`;
    return `
    <section class="department-panel pw-card wide">
      <div class="panel-heading"><div><strong>สรุปประจำวัน</strong><small>เลือกวันที่เพื่อดูสรุป — รวมทุกจอที่บันทึกในวันนั้น</small></div></div>
      <div class="pw-body">
        <div class="pw-row">${field("วันที่", `<input type="date" id="repDayPicker" value="${esc(state.day)}">`)}</div>
        <div class="pw-res-row">${res("รวมพื้นที่ (ปกติ)", `${fmt(sum.normalSqm, 2)} ตร.ม.`)}${res("รวมพื้นที่ (โอที)", `${fmt(sum.otSqm, 2)} ตร.ม.`)}${res("รวมพื้นที่ทั้งวัน", `${fmt(sum.totalSqm, 2)} ตร.ม.`, "main")}${res("ประสิทธิภาพรวม", fmt(sum.eff, 3))}${res("พนักงานทอวันนี้", `${sum.headcount} คน`)}</div>
        <label class="pf" style="margin-top:8px">แยกตามเกรด</label>
        ${gradeSummaryTableHtml(sum)}
      </div>
    </section>

    ${workerReportHtml()}

    <section class="department-panel pw-card wide">
      <div class="panel-heading"><div><strong>คำขอไหมเพิ่ม (ส่งแผนกวางแผนออกใบสั่งย้อม)</strong><small>เมื่อสีใดไหมไม่พอ กดปุ่ม “ขอไหมเพิ่ม” ในแท็บตั้งค่าขึ้นทอ — รายการจะมาแสดงที่นี่และในหน้า Planning</small></div></div>
      <div class="pw-body">
        ${reqs.length ? `<table class="calc-table"><thead><tr><th>M/O (Design)</th><th>หม้อย้อม/สี</th><th class="num">ขอเพิ่ม</th><th>ต้องการภายใน</th><th>เหตุผล</th><th>สถานะ</th><th>ผู้อนุมัติสั่งย้อม</th><th></th></tr></thead><tbody>${reqs.map(yarnReqRowHtml).join("")}</tbody></table>` : `<p class="col-empty">ยังไม่มีคำขอไหมเพิ่ม</p>`}
      </div>
    </section>

    <section class="department-panel pw-card wide">
      <div class="panel-heading"><div><strong>ส่งออก / นำเข้า Excel</strong><small>รูปแบบตรงกับ “รายงานการผลิตประจำวันพรมทอมือ” — ส่งออกได้ทันที / นำเข้าไฟล์เดือนก่อนหน้าเพื่อย้อนกลับข้อมูล (จับคู่ด้วยเลข M/O)</small></div></div>
      <div class="pw-body">
        <div class="pw-row">
          ${field("เดือนที่ส่งออก", `<input type="month" id="exportMonth" value="${esc(state.day.slice(0, 7))}">`)}
          <button type="button" class="action-button primary" data-export-excel>ส่งออก Excel</button>
        </div>
        <div class="pw-row" style="margin-top:8px">
          ${field("นำเข้าไฟล์ Excel (รูปแบบรายงานการผลิตประจำวันพรมทอมือ)", `<input type="file" id="importExcelFile" accept=".xlsx,.xls">`)}
          <button type="button" class="action-button" data-import-excel>นำเข้า</button>
        </div>
        <p style="color:var(--muted);font-size:10px;margin:6px 2px 0">นำเข้าได้เฉพาะแถวที่จับคู่เลข M/O กับข้อมูลในระบบนี้ได้เท่านั้น (เทียบจากเลขที่ M/O ในหน้ารายงานขาย) แถวที่จับคู่ไม่ได้จะถูกข้ามและสรุปจำนวนให้หลังนำเข้า</p>
      </div>
    </section>

    <section class="department-panel pw-card wide">
      <div class="panel-heading"><div><strong>แจ้งเตือนเข้า LINE</strong><small>สร้างข้อความสรุปประจำวันสำหรับส่งเข้ากลุ่ม LINE — ระบบนี้ยังไม่ได้เชื่อมต่อ LINE Notify/Messaging API จริง (ต้องใช้ Token ของบริษัท) จึงทำได้แค่สร้างข้อความ + คัดลอก/บันทึกประวัติเท่านั้น</small></div></div>
      <div class="pw-body">
        <textarea id="lineMessage" rows="5" style="width:100%;font:inherit;padding:8px;border:1px solid var(--line)">${esc(message)}</textarea>
        <div class="pw-save-bar">
          <button type="button" class="action-button" data-copy-line>คัดลอกข้อความ</button>
          <button type="button" class="action-button primary" data-log-line>บันทึกว่าส่งแล้ว</button>
        </div>
        ${notify.length ? `<table class="calc-table" style="margin-top:8px"><thead><tr><th>วันที่รายงาน</th><th>ข้อความ</th><th>บันทึกเมื่อ</th></tr></thead><tbody>${notify.map((n) => `<tr><td>${thaiDate(n.date)}</td><td style="white-space:pre-line">${esc(n.message)}</td><td>${new Date(n.sentAt).toLocaleString("th-TH")}</td></tr>`).join("")}</tbody></table>` : `<p class="col-empty">ยังไม่มีประวัติแจ้งเตือน</p>`}
      </div>
    </section>`;
  }

  /* ============================================================
     Excel Export
     ============================================================ */
  function exportExcel(month) {
    if (typeof XLSX === "undefined") { toast("ไม่พบไลบรารี XLSX"); return; }
    const dates = allLoggedDates().filter((d) => d.startsWith(month));
    if (!dates.length) { toast(`ไม่มีข้อมูลบันทึกในเดือน ${month}`); return; }
    const header1 = ["วันที่", "จอที่", "M/O", "คุณภาพ", "เกรด", "ชิ้นที่", "กว้าง X ยาว", "พื้นที่",
      "ปกติ:คงเหลือยกมา", "ปกติ:พ.ท.ทำได้", "ปกติ:คงเหลือ", "ปกติ:จำนวนพนักงาน", "ปกติ:เริ่ม", "ปกติ:เลิก", "ปกติ:จำนวนชม.", "ปกติ:ประสิทธิภาพ", "ปกติ:รายชื่อพนักงาน",
      "โอที:คงเหลือยกมา", "โอที:พ.ท.ทำได้", "โอที:คงเหลือ", "โอที:จำนวนพนักงาน", "โอที:เริ่ม", "โอที:เลิก", "โอที:จำนวนชม.", "โอที:ประสิทธิภาพ", "โอที:รายชื่อพนักงาน",
      "รวมพื้นที่/วัน", "รวมชั่วโมง/วัน", "ประสิทธิภาพรวม", "ตารางเมตรคงเหลือ"];
    const rows = [header1];
    const refs = allPieceRefs();
    refs.forEach((r) => {
      dates.forEach((iso) => {
        const day = r.piece.days[iso];
        if (!day) return;
        const carryN = dayCarryNormal(r.piece, iso, r.totalArea), carryOt = dayCarryOt(r.piece, iso, r.totalArea), remain = dayRemaining(r.piece, iso, r.totalArea);
        const nMh = shiftManHours(day.normal), oMh = shiftManHours(day.ot);
        const nSqm = num(day.normal.doneSqm), oSqm = num(day.ot.doneSqm);
        rows.push([iso, r.piece.loomNo || "", r.plan.moNo || r.designId, r.line.quality || "", r.grade, r.line.location || "-", "", r.totalArea,
          carryN, nSqm || "", carryN - nSqm, (day.normal.workers || []).length || "", day.normal.start, day.normal.end, nMh || "", nMh > 0 ? nSqm / nMh : "", (day.normal.workers || []).join(", "),
          carryOt, oSqm || "", carryOt - oSqm, (day.ot.workers || []).length || "", day.ot.start, day.ot.end, oMh || "", oMh > 0 ? oSqm / oMh : "", (day.ot.workers || []).join(", "),
          nSqm + oSqm, nMh + oMh, (nMh + oMh) > 0 ? (nSqm + oSqm) / (nMh + oMh) : "", remain]);
      });
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), month);
    // สรุปแยกตามเกรด รวมทั้งเดือน
    const gradeTotals = {};
    dates.forEach((iso) => { const s = daySummary(iso); Object.keys(s.gradeTotals).forEach((g) => { if (!gradeTotals[g]) gradeTotals[g] = { sqm: 0, hours: 0 }; gradeTotals[g].sqm += s.gradeTotals[g].sqm; gradeTotals[g].hours += s.gradeTotals[g].hours; }); });
    const gradeRows = [["เกรด", "ตร.ม.", "ชั่วโมง"], ...(PE().WEAVE_GRADES || []).map((g) => [g.grade, (gradeTotals[g.grade] || { sqm: 0 }).sqm, (gradeTotals[g.grade] || { hours: 0 }).hours])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(gradeRows), "สรุปเกรด");
    XLSX.writeFile(wb, `weaving-daily-production-${month}.xlsx`);
    toast(`ส่งออก Excel เดือน ${month} แล้ว (${dates.length} วัน)`);
  }

  /* ============================================================
     Excel Import — จับคู่ M/O กับ SalesEngine เพื่อหา designId
     รองรับตารางแบบแถวเดียวต่อวัน/จอ (เหมือนชีตสรุปรายเดือน) คอลัมน์ตามที่ export ไว้ หรือไฟล์รายงานต้นฉบับ (ชีต SEP)
     ============================================================ */
  // M/O ในรายงานการผลิตรายวัน (เช่น "148/26", "TH128/26") มักไม่มีเลข 0 นำหน้าเหมือนในหน้ารายงานขาย
  // (เช่น "0148/26") และบางเลขในประเทศมี PO ต่อท้าย (เช่น "TH 128/26 CC046/26") — ใช้ normalize key
  // แบบเดียวกับตอนนำเข้า MASTER PLAN เพื่อจับคู่ให้ตรงข้ามรูปแบบเหล่านี้ได้
  function normMoKey(raw) {
    const s = String(raw || "").trim().toUpperCase();
    const m = s.match(/^([A-Z]*)\s*0*(\d+)\s*\/\s*0*(\d+)/);
    if (!m) return s.replace(/\s+/g, "");
    const [, prefix, num2, yy] = m;
    return `${prefix}|${num2}|${yy}`;
  }
  function findDesignIdByMoNo(moNo) {
    try {
      if (typeof SalesEngine === "undefined" || !SalesEngine.getDocs) return null;
      const key = normMoKey(moNo);
      if (!key) return null;
      const doc = SalesEngine.getDocs().find((d) => normMoKey(d.no) === key);
      return doc ? doc.designId : null;
    } catch (e) { return null; }
  }

  // ถ้า M/O ที่จับคู่ได้ยังไม่มี "แผน" บันทึกไว้ในหน้าใบวางแผนงาน (ปกติจะเกิดกับ M/O ที่นำเข้าจาก
  // Master Plan/QC Check Sheet โดยตรง ยังไม่เคยผ่านหน้าวางแผนงานในระบบนี้) ให้สร้างแผนพื้นฐานให้อัตโนมัติ
  // จากพื้นที่รวมของ M/O นั้น (จากหน้ารายงานขาย) พร้อมทำเครื่องหมายผ้าใบพร้อมแล้ว เพื่อให้ข้อมูลที่นำเข้า
  // ไปแสดงผลในหน้าจอทอ/รายงาน/สรุปได้ทันที ไม่ใช่แค่บันทึกเงียบ ๆ ไว้เฉย ๆ
  function ensurePlanForImport(designId) {
    const plans = PE().readJson(PE().KEY_PLANS, {});
    if (plans[designId] && plans[designId].savedAt) return plans[designId];
    const doc = moDocOf(designId);
    const totalAreaSqm = doc && doc.lines ? doc.lines.reduce((t, l) => t + num(l.sqm), 0) : 0;
    const existing = plans[designId] || {};
    plans[designId] = {
      designId, moNo: (doc && doc.no) || existing.moNo || "",
      totalAreaSqm: totalAreaSqm || existing.totalAreaSqm || 0,
      areaSource: existing.areaSource || "auto",
      patternPct: existing.patternPct != null ? existing.patternPct : 50,
      weaveGradeOverride: existing.weaveGradeOverride || "", punchMethodOverride: existing.punchMethodOverride || "", finishGradeOverride: existing.finishGradeOverride || "",
      bufferPct: existing.bufferPct != null ? existing.bufferPct : 10, zones: existing.zones || [],
      weaveWorkers: existing.weaveWorkers || [], punchWorkerNames: existing.punchWorkerNames || [], finishWorkerNames: existing.finishWorkerNames || [], dyeOrders: existing.dyeOrders || {},
      savedAt: existing.savedAt || new Date().toISOString(),
      importedFrom: "weave-floor-excel-import",
    };
    PE().writeJson(PE().KEY_PLANS, plans);
    // ทำเครื่องหมายผ้าใบพร้อมแล้ว — เพราะถ้ามีข้อมูลกำลังทอบันทึกอยู่จริง แสดงว่าผ้าใบต้องพร้อมไปแล้ว
    const issues = readJson(WE().KEY_ISSUES, {});
    if (!issues[designId]) issues[designId] = { pots: {}, lines: {}, canvasReady: true, issuedAt: new Date().toISOString(), usage: [] };
    else if (!issues[designId].canvasReady) issues[designId].canvasReady = true;
    writeJson(WE().KEY_ISSUES, issues);
    return plans[designId];
  }

  async function importExcel(file) {
    if (typeof XLSX === "undefined") { toast("ไม่พบไลบรารี XLSX"); return; }
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    let imported = 0, skippedNoMatch = 0, skippedNoDate = 0;
    const unmatched = new Set();
    wb.SheetNames.forEach((sheetName) => {
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: "", raw: true });
      aoa.forEach((row) => {
        const dateCell = row[0];
        let iso = null;
        if (dateCell instanceof Date) iso = dateCell.toISOString().slice(0, 10);
        else if (typeof dateCell === "number" && dateCell > 20000) { const d = XLSX.SSF ? XLSX.SSF.parse_date_code(dateCell) : null; if (d) iso = `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`; }
        else if (typeof dateCell === "string" && /^\d{4}-\d{2}-\d{2}/.test(dateCell)) iso = dateCell.slice(0, 10);
        const moNo = row[2];
        if (!has(moNo) || String(moNo).toLowerCase().includes("m/o")) return; // ข้ามหัวตาราง
        if (!iso) { skippedNoDate++; return; }
        const designId = findDesignIdByMoNo(moNo);
        if (!designId) { skippedNoMatch++; unmatched.add(String(moNo)); return; }
        const plan = ensurePlanForImport(designId); // สร้างแผนพื้นฐานอัตโนมัติถ้ายังไม่เคยวางแผนไว้ในระบบนี้
        const dfloor = ensureDesignFloor(designId);
        const lines = linesOf(designId, plan);
        let lineIdx = lines.findIndex((l) => (l.location || "").trim() === String(row[5] || "").trim());
        if (lineIdx < 0) lineIdx = 0;
        const piece = ensurePieceRec(dfloor, lineIdx);
        if (!piece.loomNo && has(row[1])) piece.loomNo = String(row[1]);
        if (!piece.gradeOverride && has(row[4])) piece.gradeOverride = String(row[4]).trim(); // เกรดจริงจากรายงาน (คอลัมน์ E)
        const day = ensureDayRec(piece, iso);
        // คอลัมน์ตามฟอร์แมต SEP: 8=คงเหลือยกมา(ปกติ) 9=พ.ท.ทำได้ 11=จำนวนพนักงาน 12=เริ่ม 13=เลิก 17=รายชื่อ ; OT: 18.. 27=รายชื่อ
        if (has(row[9])) day.normal.doneSqm = num(row[9]);
        if (has(row[12])) day.normal.start = String(row[12]);
        if (has(row[13])) day.normal.end = String(row[13]);
        if (has(row[17])) day.normal.workers = String(row[17]).split(/[,/]/).map((s) => s.trim()).filter(Boolean);
        if (has(row[19])) day.ot.doneSqm = num(row[19]);
        if (has(row[22])) day.ot.start = String(row[22]);
        if (has(row[23])) day.ot.end = String(row[23]);
        if (has(row[27])) day.ot.workers = String(row[27]).split(/[,/]/).map((s) => s.trim()).filter(Boolean);
        saveDesignFloor(designId, dfloor);
        imported++;
      });
    });
    toast(`นำเข้าเสร็จ: บันทึก ${imported} แถว · ข้าม (ไม่พบ M/O ที่ตรงกัน) ${skippedNoMatch} แถว · ข้าม (อ่านวันที่ไม่ได้) ${skippedNoDate} แถว`);
    if (unmatched.size) console.warn("[weave-floor import] ไม่พบ M/O ที่ตรงกันในระบบ:", [...unmatched].slice(0, 30));
    renderAll();
  }

  /* ============================================================
     Render / Bind
     ============================================================ */
  function resizeImageToDataUrl(file, maxW, cb) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        cb(canvas.toDataURL("image/jpeg", 0.6));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function build() {
    const root = $("#weavefloorView");
    root.innerHTML = `
      <section class="page-heading">
        <div>
          <p class="eyebrow">WEAVING FLOOR</p>
          <h1>แผนกทอ — จอทอรายวัน</h1>
          <p class="subtitle">ขึ้นทอต่อจอ/ชิ้น → บันทึกผลผลิตประจำวัน (ปกติ/โอที) → ปรับปืน/QC ต่อจอ → สรุปเกรด/ส่งออก Excel/แจ้งเตือน LINE</p>
        </div>
      </section>
      ${tabBar()}
      <div id="wfRoster"></div>
      <section class="department-panel pw-card">
        <div class="panel-heading"><div><strong>เลือก M/O</strong><small>ผ้าใบต้องพร้อมก่อน (ติ๊กในหน้า “ส่งแผนกทอ”) — ไหมพร้อมได้ทีละสี</small></div></div>
        <div class="pw-body" id="wfJobPicker"></div>
      </section>
      <div id="wfTabBody"></div>`;
  }

  function renderAll() {
    $("#wfRoster").innerHTML = sharedRosterHtml();
    if (state.tab !== "board") $("#wfJobPicker").closest("section").style.display = "";
    else $("#wfJobPicker").closest("section").style.display = "none";
    $("#wfJobPicker").innerHTML = jobPickerHtml("wfpick");
    let html = "";
    if (state.tab === "setup") html = setupTabHtml();
    else if (state.tab === "daily") html = dailyTabHtml();
    else if (state.tab === "board") html = boardTabHtml();
    else if (state.tab === "report") html = reportTabHtml();
    $("#wfTabBody").innerHTML = html;
    $$(".view-btn[data-wftab]").forEach((b) => b.classList.toggle("active", b.dataset.wftab === state.tab));
  }

  let built = false;
  function renderWeaveFloor() {
    if (!built) { build(); built = true; bind(); }
    renderAll();
  }

  function bind() {
    const root = $("#weavefloorView");
    root.addEventListener("click", (e) => {
      const tabBtn = e.target.closest("[data-wftab]");
      if (tabBtn) { state.tab = tabBtn.dataset.wftab; if (state.tab !== "daily") state.lineIdx = null; renderAll(); return; }
      const addWv = e.target.closest("[data-add-weaver]");
      if (addWv) {
        const input = $("#wfNewWorkerName");
        const name = input ? input.value : "";
        if (has(name)) { addWeaveWorker(name); renderAll(); const again = $("#wfNewWorkerName"); if (again) again.focus(); }
        return;
      }
      const rmWv = e.target.closest("[data-remove-weaver]");
      if (rmWv) { removeWeaveWorker(Number(rmWv.dataset.removeWeaver)); renderAll(); return; }
      const expWv = e.target.closest("[data-export-weavers]");
      if (expWv) { exportWeaveWorkersExcel(); return; }
      const pick = e.target.closest("[data-wfpick]");
      if (pick) { state.designId = pick.dataset.wfpick; state.lineIdx = null; renderAll(); return; }
      const lpick = e.target.closest("[data-lpick]");
      if (lpick) { state.lineIdx = lpick.dataset.lpick; renderAll(); return; }
      const gotoDaily = e.target.closest("[data-goto-daily]");
      if (gotoDaily) {
        state.designId = gotoDaily.dataset.gotoDaily;
        state.lineIdx = gotoDaily.dataset.gotoLine;
        state.tab = "daily";
        renderAll(); return;
      }
      const clearImg = e.target.closest("[data-pf-clear-image]");
      if (clearImg) {
        const idx = clearImg.closest("[data-piece]").dataset.piece;
        const dfloor = ensureDesignFloor(state.designId);
        ensurePieceRec(dfloor, idx).patternImage = "";
        saveDesignFloor(state.designId, dfloor);
        renderAll(); return;
      }
      const reqYarn = e.target.closest("[data-request-yarn]");
      if (reqYarn) {
        const potKey = reqYarn.dataset.requestYarn, label = reqYarn.dataset.requestLabel;
        const kg = prompt(`ขอไหมเพิ่มสำหรับ "${label}" — ต้องการเพิ่มกี่กิโลกรัม?`);
        if (kg === null || !has(kg)) return;
        const reason = prompt("เหตุผลที่ต้องขอไหมเพิ่ม (เช่น สั่งย้อมขาดจาก spec, ทอเสียเพิ่ม ฯลฯ)") || "";
        const neededDate = prompt("ต้องการภายในวันที่ (YYYY-MM-DD, เว้นว่างได้)") || "";
        addYarnRequest({ designId: state.designId, potKey, label, requestedKg: num(kg), reason, neededDate });
        toast("บันทึกคำขอไหมเพิ่มแล้ว — แผนกวางแผนจะเห็นในหน้า Planning และแท็บสรุป/ส่งออก");
        renderAll(); return;
      }
      const resolveReq = e.target.closest("[data-yreq-resolve]");
      if (resolveReq) {
        const id = resolveReq.dataset.yreqResolve;
        const row = resolveReq.closest("[data-yreq]");
        const approverInput = row.querySelector("[data-yreq-approver]");
        const approver = approverInput ? approverInput.value : "";
        if (!has(approver)) { toast("กรอกชื่อผู้อนุมัติสั่งย้อมก่อน"); return; }
        updateYarnRequest(id, { resolved: true, resolvedAt: new Date().toISOString(), approver });
        toast("บันทึกแล้ว: แผนกวางแผนออกใบสั่งย้อมเพิ่มแล้ว");
        renderAll(); return;
      }
      const addGun = e.target.closest("[data-add-gun]");
      if (addGun) {
        const dfloor = ensureDesignFloor(state.designId);
        const piece = ensurePieceRec(dfloor, state.lineIdx);
        const day = ensureDayRec(piece, state.day);
        day.gunAdjust.push({ shift: "normal", start: "10:00", end: "10:15", technician: "", reason: "" });
        saveDesignFloor(state.designId, dfloor);
        renderAll(); return;
      }
      const rmGun = e.target.closest("[data-remove-gun]");
      if (rmGun) {
        const dfloor = ensureDesignFloor(state.designId);
        const piece = ensurePieceRec(dfloor, state.lineIdx);
        const day = ensureDayRec(piece, state.day);
        day.gunAdjust.splice(Number(rmGun.dataset.removeGun), 1);
        saveDesignFloor(state.designId, dfloor);
        renderAll(); return;
      }
      const addQcBtn = e.target.closest("[data-add-qc]");
      if (addQcBtn) {
        const dfloor = ensureDesignFloor(state.designId);
        const piece = ensurePieceRec(dfloor, state.lineIdx);
        const inspector = $("#qcInspector").value, result = $("#qcResult").value, detail = $("#qcDetail").value, date = $("#qcDate").value || state.day;
        if (!has(inspector)) { toast("กรอกชื่อผู้ตรวจ QC ก่อน"); return; }
        addQc({ designId: state.designId, lineIdx: state.lineIdx, loomNo: piece.loomNo, dept: "weaving", date, inspector, result, detail });
        toast("บันทึก QC แล้ว");
        renderAll(); return;
      }
      const transferBtn = e.target.closest("[data-transfer-glue]");
      if (transferBtn && !transferBtn.disabled) {
        const designId = transferBtn.dataset.transferGlue, lineIdx = transferBtn.dataset.transferLine;
        const dfloor = ensureDesignFloor(designId);
        const piece = ensurePieceRec(dfloor, lineIdx);
        piece.transferredToGlueAt = new Date().toISOString();
        saveDesignFloor(designId, dfloor);
        toast(`${designId}: โอนให้แผนกทากาวตกแต่งแล้ว`);
        renderAll(); return;
      }
      const copyLine = e.target.closest("[data-copy-line]");
      if (copyLine) {
        const msg = $("#lineMessage").value;
        try { navigator.clipboard.writeText(msg); toast("คัดลอกข้อความแล้ว"); } catch (err) { toast("คัดลอกไม่สำเร็จ — เลือกข้อความแล้วคัดลอกเองได้"); }
        return;
      }
      const logLine = e.target.closest("[data-log-line]");
      if (logLine) {
        logNotify(state.day, $("#lineMessage").value);
        toast("บันทึกประวัติแจ้งเตือนแล้ว (ยังไม่ได้ส่งเข้า LINE จริง — ต้องเชื่อมต่อ LINE Notify/Messaging API ด้วย Token ของบริษัทก่อน)");
        renderAll(); return;
      }
      const exportBtn = e.target.closest("[data-export-excel]");
      if (exportBtn) { exportExcel($("#exportMonth").value); return; }
      const importBtn = e.target.closest("[data-import-excel]");
      if (importBtn) {
        const f = $("#importExcelFile").files[0];
        if (!f) { toast("เลือกไฟล์ก่อน"); return; }
        importExcel(f);
        return;
      }
    });

    root.addEventListener("change", (e) => {
      if (e.target && e.target.hasAttribute && e.target.hasAttribute("data-import-weavers")) {
        const file = e.target.files && e.target.files[0];
        if (file) importWeaveWorkersExcel(file).then(() => { renderAll(); e.target.value = ""; });
        return;
      }
      const pf = e.target.closest("[data-pf]");
      if (pf) {
        const idx = pf.closest("[data-piece]").dataset.piece;
        const dfloor = ensureDesignFloor(state.designId);
        const piece = ensurePieceRec(dfloor, idx);
        if (pf.dataset.pf === "patternImageFile") {
          const file = pf.files[0];
          if (file) resizeImageToDataUrl(file, 320, (dataUrl) => { piece.patternImage = dataUrl; saveDesignFloor(state.designId, dfloor); renderAll(); });
          return;
        }
        piece[pf.dataset.pf] = pf.value;
        saveDesignFloor(state.designId, dfloor);
        renderAll(); return;
      }
      const potdraw = e.target.closest("[data-potdraw]");
      if (potdraw && e.target.name === "drawKg") {
        const dfloor = ensureDesignFloor(state.designId);
        const potKey = potdraw.dataset.potdraw;
        if (!dfloor.yarnDraw[potKey]) dfloor.yarnDraw[potKey] = {};
        dfloor.yarnDraw[potKey][state.day] = e.target.value;
        saveDesignFloor(state.designId, dfloor);
        renderAll(); return;
      }
      const check = e.target.closest("[data-check]");
      if (check) {
        const shiftName = check.dataset.check;
        const dfloor = ensureDesignFloor(state.designId);
        const piece = ensurePieceRec(dfloor, state.lineIdx);
        const day = ensureDayRec(piece, state.day);
        const set = new Set(day[shiftName].workers || []);
        if (check.checked) set.add(check.value); else set.delete(check.value);
        day[shiftName].workers = Array.from(set);
        saveDesignFloor(state.designId, dfloor);
        renderAll(); return;
      }
      const shiftField = e.target.closest("[data-shift]");
      if (shiftField) {
        const dfloor = ensureDesignFloor(state.designId);
        const piece = ensurePieceRec(dfloor, state.lineIdx);
        const day = ensureDayRec(piece, state.day);
        day[shiftField.dataset.shift][shiftField.dataset.field] = shiftField.value;
        saveDesignFloor(state.designId, dfloor);
        renderAll(); return;
      }
      const gunRow = e.target.closest("[data-gun]");
      if (gunRow) {
        const dfloor = ensureDesignFloor(state.designId);
        const piece = ensurePieceRec(dfloor, state.lineIdx);
        const day = ensureDayRec(piece, state.day);
        day.gunAdjust[Number(gunRow.dataset.gun)][e.target.name] = e.target.value;
        saveDesignFloor(state.designId, dfloor);
        renderAll(); return;
      }
      if (e.target.id === "wfDayPicker" || e.target.id === "repDayPicker") { state.day = e.target.value; renderAll(); return; }
      if (e.target.matches("[data-wf-worker-mode]")) { state.workerMode = e.target.value; renderAll(); return; }
      if (e.target.matches("[data-wf-worker-day]")) { state.workerDay = e.target.value; renderAll(); return; }
      if (e.target.matches("[data-wf-worker-month]")) { state.workerMonth = e.target.value; renderAll(); return; }
      if (e.target.matches("[data-wf-worker-year]")) { state.workerYear = e.target.value; renderAll(); return; }
      const salaryInput = e.target.closest("[data-weaver-salary]");
      if (salaryInput) { setWeaveSalary(salaryInput.dataset.weaverSalary, salaryInput.value); renderAll(); return; }
    });

    root.addEventListener("input", (e) => {
      const gunRow = e.target.closest("[data-gun]");
      if (gunRow && (e.target.name === "technician" || e.target.name === "reason")) {
        const dfloor = ensureDesignFloor(state.designId);
        const piece = ensurePieceRec(dfloor, state.lineIdx);
        const day = ensureDayRec(piece, state.day);
        day.gunAdjust[Number(gunRow.dataset.gun)][e.target.name] = e.target.value;
        saveDesignFloor(state.designId, dfloor);
        return;
      }
    });
    root.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.target && e.target.id === "wfNewWorkerName") {
        e.preventDefault();
        addWeaveWorker(e.target.value);
        renderAll();
        const again = $("#wfNewWorkerName");
        if (again) again.focus();
      }
    });
  }

  window.renderWeaveFloor = renderWeaveFloor;

  /* ============================================================
     Store — ส่วนรับสินค้าสำเร็จรูป: M/O · S/O ที่ "เสร็จแล้ว" ทุกตัว (ใช้ตรรกะเดียวกับหน้าภาพรวมการผลิต)
     ============================================================ */
  function storeReceivingHtml() {
    const OE = window.OverviewEngine;
    if (!OE) return "";
    const rows = OE.jobs()
      .map((d) => ({ d, st: OE.statusOf(d), type: OE.typeOf(d) }))
      .filter((r) => r.st.dept === "done")
      .sort((a, b) => (b.st.updatedAt || "").localeCompare(a.st.updatedAt || ""));
    const shipped = rows.filter((r) => r.st.state === "done").length;
    const waiting = rows.length - shipped;
    return `
    <section class="department-panel pw-card wide qc-sticky-panel" style="margin-bottom:14px">
      <div class="panel-heading"><div><strong>Store — ส่วนรับสินค้าสำเร็จรูป</strong><small>M/O · S/O ที่ทอ/ตกแต่ง/QC ผ่านครบแล้วทุกตัว จะย้ายมาอยู่ที่นี่โดยอัตโนมัติ (ตรรกะเดียวกับหน้าภาพรวมการผลิต)</small></div></div>
      <div class="pw-body">
        <div class="pw-res-row">${res("รับเข้า Store แล้วทั้งหมด", `${rows.length} รายการ`, "main")}${res("รอนำส่ง", `${waiting} รายการ`)}${res("จัดส่งแล้ว", `${shipped} รายการ`)}</div>
        ${rows.length ? `<div class="table-wrap"><table class="calc-table"><thead><tr><th>ประเภท</th><th>เลขที่</th><th>ลูกค้า</th><th>Project / PO</th><th>สถานะ</th></tr></thead><tbody>${rows.map((r) => `<tr>
          <td><span class="ovw-type ovw-type-${r.type}">${r.type}</span></td>
          <td><strong>${esc(r.d.id)}</strong><small>${esc(r.d.moNo || "")}</small></td>
          <td>${esc(r.d.customer || "-")}</td>
          <td>${esc(r.d.project || "-")}</td>
          <td><span class="status-tag ${r.st.state === "done" ? "" : "review"}">${esc(r.st.stateLabel)}</span></td>
        </tr>`).join("")}</tbody></table></div>` : `<p class="col-empty">ยังไม่มี M/O · S/O ที่เสร็จครบทุกแผนกแล้ว</p>`}
      </div>
    </section>`;
  }

  /* ============================================================
     QC Dashboard — หน้ารายงาน QC รวมทุกจอ
     ============================================================ */
  function qcDashboardHtml() {
    const list = loadQc().slice().sort((a, b) => b.date.localeCompare(a.date));
    const total = list.length, pass = list.filter((q) => q.result === "ผ่าน").length, fail = list.filter((q) => q.result === "ไม่ผ่าน").length, note = list.filter((q) => q.result === "มีข้อสังเกต").length;
    const deptLabel = (d) => d === "finishing" ? "แผนกทากาวตกแต่ง" : "แผนกทอ";
    return `
    <section class="page-heading">
      <div><p class="eyebrow">QC DASHBOARD</p><h1>รายงาน QC ทุกแผนก</h1><p class="subtitle">รวมผลตรวจ QC ของแผนกทอ (ต่อจอ) และแผนกทากาวตกแต่ง (ต่อชิ้น) ทุก M/O — บันทึกได้จากแท็บ “บันทึกประจำวัน” ในหน้าแผนกทอ และจากหน้าแผนกทากาวตกแต่ง</p></div>
    </section>
    ${storeReceivingHtml()}
    <div class="summary-cards workflow-cards">
      <div class="summary-card"><small>ตรวจทั้งหมด</small><strong>${total}</strong><span>รายการ</span></div>
      <div class="summary-card"><small>ผ่าน</small><strong>${pass}</strong><span>${total ? fmt(pass / total * 100, 0) : 0}%</span></div>
      <div class="summary-card"><small>ไม่ผ่าน</small><strong>${fail}</strong><span>${total ? fmt(fail / total * 100, 0) : 0}%</span></div>
      <div class="summary-card"><small>มีข้อสังเกต</small><strong>${note}</strong><span>${total ? fmt(note / total * 100, 0) : 0}%</span></div>
    </div>
    <section class="department-panel pw-card wide qc-sticky-panel">
      <div class="panel-heading"><div><strong>ประวัติการตรวจ QC ทั้งหมด</strong></div></div>
      <div class="pw-body">
        ${list.length ? `<table class="calc-table"><thead><tr><th>วันที่ตรวจ</th><th>แผนก</th><th>M/O (Design)</th><th>จอ/ชิ้น</th><th>ผู้ตรวจ</th><th>ผล</th><th>รายละเอียด</th></tr></thead><tbody>${list.map((q) => {
      const plan = planFor(q.designId);
      return `<tr><td>${thaiDate(q.date)}</td><td>${esc(deptLabel(q.dept))}</td><td>${esc(plan ? (plan.moNo || q.designId) : q.designId)}</td><td>${esc(q.loomNo || q.lineIdx || "-")}</td><td>${esc(q.inspector)}</td><td><span class="status-tag ${q.result === "ไม่ผ่าน" ? "blocked" : q.result === "มีข้อสังเกต" ? "review" : ""}">${esc(q.result)}</span></td><td>${esc(q.detail)}</td></tr>`;
    }).join("")}</tbody></table>` : `<p class="col-empty">ยังไม่มีประวัติ QC</p>`}
      </div>
    </section>`;
  }
  function renderQcDashboard() {
    const host = $("#qcdashView");
    host.innerHTML = qcDashboardHtml();
    // ตรึงหัวการ์ด (panel-heading) และหัวคอลัมน์ตาราง (thead) ของแต่ละส่วน (Store, ประวัติ QC) ไว้ด้านบน
    // ขณะเลื่อนหน้าลง/ขึ้น เหมือนกับหน้าภาพรวมการผลิต — ส่วนเนื้อหาด้านล่างเลื่อนได้ตามปกติ
    host.querySelectorAll(".qc-sticky-panel").forEach((panel) => {
      const heading = panel.querySelector(".panel-heading");
      const theadCells = panel.querySelectorAll("thead th");
      if (heading && theadCells.length) {
        const top = `${heading.offsetHeight}px`;
        theadCells.forEach((th) => { th.style.top = top; });
      }
    });
  }
  window.renderQcDashboard = renderQcDashboard;
})();
