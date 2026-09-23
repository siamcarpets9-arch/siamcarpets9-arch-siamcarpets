/* ============================================================
   Design Cost — คำนวณต้นทุนแผนก Design ต่อ Project
   - ค่าแรง Designer = เงินเดือน ÷ ชั่วโมงทำงาน (เวลาปกติ / โอที / วันหยุด)
   - ตัวประมาณเวลาอัตโนมัติ: ชั่วโมงมาตรฐานต่อประเภทงาน + จัดสรรลงวันทำงานของ Designer
     (เต็ม 8 ชม./วันเป็นเวลาปกติ ส่วนเกินเป็นโอที) กรอกเวลาจริงทับได้
   - ทริปออกวัดพื้นที่ต่อ Project (ค่าแรงตามเวลาจริง + ค่าใช้จ่าย)
   - Sale ผู้ดำเนินการ = จับคู่ Customer → Sale (แก้รายโครงการได้)
   ต้องโหลดหลัง app.js (ใช้ designs, REPORT_DATE, normalizeDesigner, toast ฯลฯ)
   ============================================================ */
(function () {
  "use strict";

  const KEY_SETTINGS = "enterprise-design-cost-settings";
  const KEY_TRIPS = "enterprise-design-site-surveys";
  const KEY_OVERRIDES = "enterprise-design-cost-overrides";
  const NO_SALE = "ยังไม่ระบุ Sale";

  const STD_TYPES = ["ทำแบบ", "Layout", "Clean + Layout", "Clean", "แก้แบบ", "แก้สี", "SO"];
  const DEFAULTS = {
    hoursPerDay: 8,
    workDaysPerMonth: 22,
    otBaseDays: 30,
    workStart: "08:30",
    workEnd: "17:30",
    lunchStart: "12:00",
    lunchEnd: "13:00",
    workWeekdays: [1, 2, 3, 4, 5],
    extraHolidays: "",
    otMultiplier: 1.5,
    holidayMultiplier: 2,
    otCapPerDay: 3,
    holidayCapPerDay: 8,
    lookbackDays: 2,
    defaultSalary: 20000,
    salaries: {},
    stdHours: { "ทำแบบ": 4, "Layout": 2, "Clean + Layout": 3, "Clean": 1.5, "แก้แบบ": 1.5, "แก้สี": 1, "SO": 1 },
    customerSale: {},
    projectSale: {},
    confirmed: false
  };

  /* ---------- storage ---------- */
  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ใช้ต่อได้แม้บันทึกไม่ได้ */ }
  }
  function loadSettings() {
    const saved = readJson(KEY_SETTINGS, {}) || {};
    return {
      ...DEFAULTS, ...saved,
      workWeekdays: Array.isArray(saved.workWeekdays) ? saved.workWeekdays : [...DEFAULTS.workWeekdays],
      stdHours: { ...DEFAULTS.stdHours, ...(saved.stdHours || {}) },
      salaries: { ...(saved.salaries || {}) },
      customerSale: { ...(saved.customerSale || {}) },
      projectSale: { ...(saved.projectSale || {}) }
    };
  }

  /* ---------- helpers ---------- */
  const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const clean = (v) => String(v === undefined || v === null ? "" : v).trim().replace(/\s+/g, " ");
  const esc = (v) => String(v === undefined || v === null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pad = (n) => String(n).padStart(2, "0");
  const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12);
  const fmtMoney = (n) => "฿" + Math.round(n || 0).toLocaleString("th-TH");
  const fmtHr = (n) => (Math.round((n || 0) * 10) / 10).toLocaleString("th-TH", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const SHORT_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const fmtDate = (d) => d ? `${d.getDate()} ${SHORT_MONTHS[d.getMonth()]} ${d.getFullYear()}` : "-";
  const toMin = (t) => { const m = String(t || "").match(/^(\d{1,2}):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : 0; };
  const overlap = (a1, a2, b1, b2) => Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));
  const projectKey = (customer, project) => `${customer.toUpperCase()}||${project.toUpperCase()}`;

  /* ---------- วันที่ ---------- */
  function parseYMD(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return { y: value.getFullYear(), m: value.getMonth() + 1, d: value.getDate() };
    if (value === undefined || value === null) return null;
    const text = String(value).trim();
    if (!text) return null;
    let y, m, d, match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (match) { y = +match[1]; m = +match[2]; d = +match[3]; }
    else {
      match = text.replace(/\/{2,}/g, "/").match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/);
      if (!match) return null;
      d = +match[1]; m = +match[2]; y = +match[3];
      if (y < 100) y += 2000;
      if (y > 2400) y -= 543;
    }
    const check = new Date(y, m - 1, d, 12);
    if (check.getFullYear() !== y || check.getMonth() !== m - 1 || check.getDate() !== d) return null;
    return { y, m, d };
  }
  // วันที่ในอนาคตที่กลับวัน/เดือนแล้วไม่เกินวันรายงาน → Excel แปลง dd/mm เป็น mm/dd ผิด จึงสลับกลับ
  function resolveDate(value) {
    const p = parseYMD(value);
    if (!p) return null;
    let date = new Date(p.y, p.m - 1, p.d, 12), fixed = false;
    if (date > REPORT_DATE && p.d <= 12 && p.m !== p.d) {
      const alt = new Date(p.y, p.d - 1, p.m, 12);
      if (alt <= REPORT_DATE) { date = alt; fixed = true; }
    }
    return { date, fixed };
  }

  const SEED_IDS = new Set(["DES-26031", "DES-26042", "DES-26057", "DES-26063"]);
  const isSample = (row) => Boolean(row.sample) || (SEED_IDS.has(String(row.id)) && !row.receivedDate && !row.submittedDate);
  const lagDays = (a, b) => Math.round((b.date - a.date) / 86400000);
  const lagOk = (x) => x >= 0 && x <= 45;
  const swapAlt = (x) => {
    if (!x || x.fixed) return null;
    const y = x.date.getFullYear(), m = x.date.getMonth() + 1, d = x.date.getDate();
    if (d > 12 || d === m) return null;
    const alt = new Date(y, d - 1, m, 12);
    return alt <= REPORT_DATE ? { date: alt, fixed: true } : null;
  };
  // ซ่อมวันที่: ถ้าวันรับ→วันส่งห่างผิดปกติ (ติดลบหรือเกิน 45 วัน) ให้ลองสลับวัน/เดือนของวันใดวันหนึ่ง
  // แล้วเลือกแบบที่ทำให้ระยะห่างอยู่ใน 0–45 วัน (สลับน้อยที่สุด) ถ้าไม่ได้ก็คงค่าเดิมและแจ้งเตือน
  function resolveDates(row) {
    let recv = resolveDate(row.receivedDate);
    const due = resolveDate(row.dueDate);
    let sub = resolveDate(row.submittedDate);
    let suspect = false;
    if (recv && sub && !lagOk(lagDays(recv, sub))) {
      const sr = swapAlt(recv), su = swapAlt(sub), options = [];
      if (su && lagOk(lagDays(recv, su))) options.push({ recv, sub: su, cost: 1, lag: lagDays(recv, su) });
      if (sr && lagOk(lagDays(sr, sub))) options.push({ recv: sr, sub, cost: 1, lag: lagDays(sr, sub) });
      if (sr && su && lagOk(lagDays(sr, su))) options.push({ recv: sr, sub: su, cost: 2, lag: lagDays(sr, su) });
      options.sort((a, b) => a.cost - b.cost || a.lag - b.lag);
      if (options.length) { recv = options[0].recv; sub = options[0].sub; }
      else suspect = true;
    }
    return { recv, due, sub, suspect, fixed: [recv, due, sub].filter((x) => x && x.fixed).length };
  }

  /* ---------- ประเภทงาน ---------- */
  function workType(row) {
    const t = String(row.description || row.scope || "").toLowerCase();
    if (t.includes("แก้สี")) return "แก้สี";
    if (t.includes("แก้")) return "แก้แบบ";
    const hasClean = t.includes("clean"), hasLayout = t.includes("layout");
    if (hasClean && hasLayout) return "Clean + Layout";
    if (hasClean) return "Clean";
    if (hasLayout) return "Layout";
    if (t.trim() === "so") return "SO";
    return "ทำแบบ";
  }
  // Design No. ลงท้าย -01, -02 ... = แก้ไขครั้งที่ (ตัวเลขชุดที่ 3 หลังตัวอักษรนำหน้า)
  function isRevision(id) {
    const m = String(id).match(/^[A-Za-z]+-\d+-\d+-(\d+)/);
    return Boolean(m && Number(m[1]) > 0);
  }

  /* ---------- context / อัตราค่าแรง ---------- */
  function makeCtx(s) {
    const holidays = new Set(String(s.extraHolidays || "").split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean));
    const isWorkday = (d) => s.workWeekdays.includes(d.getDay()) && !holidays.has(dayKey(d));
    const rates = (name) => {
      const salary = has(s.salaries, name) ? num(s.salaries[name]) : num(s.defaultSalary);
      return {
        salary,
        normal: salary / Math.max(1, s.workDaysPerMonth * s.hoursPerDay),
        ot: salary / Math.max(1, s.otBaseDays * s.hoursPerDay)
      };
    };
    const hourCost = (name, h) => {
      const r = rates(name);
      const normal = h.n * r.normal;
      const ot = h.o * r.ot * s.otMultiplier + h.h * r.ot * s.holidayMultiplier;
      return { normal, ot, total: normal + ot };
    };
    return { s, isWorkday, rates, hourCost };
  }

  /* ---------- ทริปออกวัดพื้นที่: แยกชั่วโมงปกติ/โอที/วันหยุด ---------- */
  function splitTrip(trip, date, ctx) {
    const s = ctx.s;
    const a = toMin(trip.start), b = toMin(trip.end);
    if (!date || b <= a) return { n: 0, o: 0, h: 0, total: 0 };
    const ls = toMin(s.lunchStart), le = toMin(s.lunchEnd);
    const lunch = overlap(a, b, ls, le);
    const total = (b - a - lunch) / 60;
    if (!ctx.isWorkday(date)) return { n: 0, o: 0, h: total, total };
    const w1 = Math.max(a, toMin(s.workStart)), w2 = Math.min(b, toMin(s.workEnd));
    const normal = w2 > w1 ? ((w2 - w1) - overlap(w1, w2, ls, le)) / 60 : 0;
    return { n: normal, o: Math.max(0, total - normal), h: 0, total };
  }
  const EXPENSE_FIELDS = [["fuel", "ค่าน้ำมัน/ค่ารถ"], ["toll", "ค่าทางด่วน"], ["lodging", "ค่าที่พัก"], ["meal", "ค่าอาหาร/เบี้ยเลี้ยง"], ["other", "อื่น ๆ"]];
  function evalTrip(trip, ctx) {
    const p = parseYMD(trip.date);
    const date = p ? new Date(p.y, p.m - 1, p.d, 12) : null;
    const split = splitTrip(trip, date, ctx);
    const people = (trip.people || []).map((name) => {
      const c = ctx.hourCost(name, split);
      return { name, cost: c.total };
    });
    const labor = people.reduce((t, x) => t + x.cost, 0);
    const expenses = EXPENSE_FIELDS.reduce((t, [k]) => t + num((trip.expenses || {})[k]), 0);
    const customer = clean(trip.customer) || "(ไม่ระบุลูกค้า)";
    const project = clean(trip.project) || "(ไม่ระบุ Project)";
    return { trip, date, dayKey: date ? dayKey(date) : "", split, people, labor, expenses, total: labor + expenses, customer, project, key: projectKey(customer, project) };
  }

  /* ---------- ตัวคำนวณหลัก ---------- */
  function compute(designRows, tripRows, s, ovr, range) {
    const ctx = makeCtx(s);
    const ledger = new Map();
    const led = (who, key) => {
      let m = ledger.get(who);
      if (!m) { m = new Map(); ledger.set(who, m); }
      let l = m.get(key);
      if (!l) { l = { n: 0, o: 0, h: 0 }; m.set(key, l); }
      return l;
    };
    const inRange = (date) => !range || Boolean(date && date >= range.start && date < range.end);

    // 1) ทริปวัดพื้นที่ใช้เวลาของ Designer ก่อน → ลดเวลาว่างในวันนั้น
    const tripItems = tripRows.map((t) => evalTrip(t, ctx));
    tripItems.forEach((ti) => {
      if (!ti.date) return;
      ti.people.forEach((p) => { const l = led(p.name, ti.dayKey); l.n += ti.split.n; l.o += ti.split.o; l.h += ti.split.h; });
    });

    // 2) เตรียมรายการแบบ (ไม่รวมข้อมูลตัวอย่างของระบบ)
    const sampleCount = designRows.filter(isSample).length;
    const items = designRows.filter((row) => !isSample(row)).map((row) => {
      const type = workType(row);
      const designer = normalizeDesigner(row.owner || row.designer);
      const customer = clean(row.customer) || "(ไม่ระบุลูกค้า)";
      const project = clean(row.project) || "(ไม่ระบุ Project)";
      const dates = resolveDates(row);
      const end = dates.sub ? dates.sub.date : null;
      const recv = dates.recv ? dates.recv.date : null;
      const due = dates.due ? dates.due.date : null;
      return {
        row, id: String(row.id), type, designer, customer, project,
        key: projectKey(customer, project), custKey: customer.toUpperCase(),
        recv, due, end, refDate: end || recv || due,
        fixedDates: dates.fixed, suspectDates: dates.suspect,
        revision: isRevision(row.id),
        std: num(s.stdHours[type] !== undefined ? s.stdHours[type] : DEFAULTS.stdHours["ทำแบบ"]),
        h: { n: 0, o: 0, h: 0 }, source: "auto", mode: ""
      };
    });

    // 3) จัดสรรชั่วโมงลงวัน — งานที่ส่งแล้วจัดย้อนหลังจากวันส่ง เรียงตามวันส่ง
    const lookbackStart = (end, n) => { let d = end, c = 0, guard = 0; while (c < n && guard++ < 60) { d = addDays(d, -1); if (ctx.isWorkday(d)) c++; } return d; };
    const allocateBackward = (who, hours, start, end) => {
      const out = { n: 0, o: 0, h: 0 };
      let remain = hours;
      const days = [];
      for (let d = end, i = 0; d >= start && i < 120; d = addDays(d, -1), i++) days.push(d);
      if (!days.length) days.push(end);
      const take = (day, field, cap) => {
        const l = led(who, dayKey(day));
        const t = Math.min(Math.max(0, cap - l[field]), remain);
        if (t > 1e-9) { l[field] += t; out[field] += t; remain -= t; }
      };
      const endIsWork = ctx.isWorkday(end);
      if (!endIsWork) take(end, "h", s.holidayCapPerDay);
      days.forEach((d) => { if (remain > 1e-9 && ctx.isWorkday(d)) take(d, "n", s.hoursPerDay); });
      days.forEach((d) => { if (remain > 1e-9 && ctx.isWorkday(d)) take(d, "o", s.otCapPerDay); });
      days.forEach((d) => { if (remain > 1e-9 && !ctx.isWorkday(d)) take(d, "h", s.holidayCapPerDay); });
      if (remain > 1e-9) { const f = endIsWork ? "o" : "h"; led(who, dayKey(end))[f] += remain; out[f] += remain; }
      return out;
    };
    const allocateForward = (who, hours, start) => {
      const out = { n: 0, o: 0, h: 0 };
      let remain = hours, d = start, guard = 0;
      while (remain > 1e-9 && guard++ < 400) {
        if (ctx.isWorkday(d)) {
          const l = led(who, dayKey(d));
          const t = Math.min(Math.max(0, s.hoursPerDay - l.n), remain);
          if (t > 1e-9) { l.n += t; out.n += t; remain -= t; }
        }
        d = addDays(d, 1);
      }
      if (remain > 1e-9) out.n += remain;
      return out;
    };

    const hasOverride = (it) => has(ovr, it.id);
    items.forEach((it) => {
      if (hasOverride(it)) {
        const o = ovr[it.id];
        it.h = { n: num(o.n), o: num(o.o), h: num(o.h) };
        it.source = "actual";
      }
    });
    items.filter((it) => !hasOverride(it) && it.end)
      .sort((a, b) => a.end - b.end || (a.id < b.id ? -1 : 1))
      .forEach((it) => {
        const start = it.recv && it.recv <= it.end ? it.recv : (it.recv ? it.end : lookbackStart(it.end, s.lookbackDays));
        it.h = allocateBackward(it.designer, it.std, start, it.end);
        it.mode = it.recv ? "window" : "lookback";
      });
    items.filter((it) => !hasOverride(it) && !it.end && it.recv).forEach((it) => {
      it.h = allocateForward(it.designer, it.std, it.recv);
      it.mode = "wip";
    });
    items.filter((it) => !hasOverride(it) && !it.end && !it.recv).forEach((it) => {
      it.h = { n: it.std, o: 0, h: 0 };
      it.mode = "undated";
    });
    items.forEach((it) => {
      const c = ctx.hourCost(it.designer, it.h);
      it.costN = c.normal; it.costO = c.ot; it.cost = c.total;
    });

    // 4) รวมตาม Project / Designer / Sale ตามช่วงเวลาที่เลือก
    const projects = new Map();
    const designers = new Map();
    const saleOf = (key, custKey) => (has(s.projectSale, key) && s.projectSale[key]) || (has(s.customerSale, custKey) && s.customerSale[custKey]) || "";
    const getProject = (key, customer, project, custKey) => {
      let p = projects.get(key);
      if (!p) {
        p = { key, customer, project, custKey, sale: saleOf(key, custKey), items: [], trips: [], drawings: 0, revisions: 0, n: 0, o: 0, h: 0, costN: 0, costO: 0, designCost: 0, surveyLabor: 0, surveyExpense: 0, surveyCost: 0, surveyHours: 0, total: 0, designers: new Map(), types: {} };
        projects.set(key, p);
      }
      return p;
    };
    const getDesigner = (name) => {
      let d = designers.get(name);
      if (!d) { d = { name, rate: ctx.rates(name), drawings: 0, n: 0, o: 0, h: 0, designCost: 0, surveyLabor: 0, surveyHours: 0, total: 0 }; designers.set(name, d); }
      return d;
    };
    const quality = { total: items.length, sample: sampleCount, fixedDates: 0, suspectDates: 0, undated: 0, wip: 0, lookback: 0, actual: 0 };
    const visible = items.filter((it) => inRange(it.refDate));
    visible.forEach((it) => {
      const p = getProject(it.key, it.customer, it.project, it.custKey);
      p.items.push(it);
      p.drawings++; if (it.revision) p.revisions++;
      p.types[it.type] = (p.types[it.type] || 0) + 1;
      p.n += it.h.n; p.o += it.h.o; p.h += it.h.h;
      p.costN += it.costN; p.costO += it.costO; p.designCost += it.cost;
      p.designers.set(it.designer, (p.designers.get(it.designer) || 0) + 1);
      const d = getDesigner(it.designer);
      d.drawings++; d.n += it.h.n; d.o += it.h.o; d.h += it.h.h; d.designCost += it.cost;
      quality.fixedDates += it.fixedDates ? 1 : 0;
      quality.suspectDates += it.suspectDates ? 1 : 0;
      if (it.mode === "undated") quality.undated++;
      if (it.mode === "wip") quality.wip++;
      if (it.mode === "lookback") quality.lookback++;
      if (it.source === "actual") quality.actual++;
    });
    const visibleTrips = tripItems.filter((ti) => inRange(ti.date));
    visibleTrips.forEach((ti) => {
      const p = getProject(ti.key, ti.customer, ti.project, ti.customer.toUpperCase());
      p.trips.push(ti);
      p.surveyLabor += ti.labor; p.surveyExpense += ti.expenses; p.surveyCost += ti.total;
      p.surveyHours += ti.split.total * ti.people.length;
      ti.people.forEach((pp) => { const d = getDesigner(pp.name); d.surveyLabor += pp.cost; d.surveyHours += ti.split.total; });
    });
    projects.forEach((p) => { p.total = p.designCost + p.surveyCost; });
    designers.forEach((d) => { d.total = d.designCost + d.surveyLabor; });

    const sales = new Map();
    projects.forEach((p) => {
      const name = p.sale || NO_SALE;
      let x = sales.get(name);
      if (!x) { x = { name, projects: 0, drawings: 0, n: 0, o: 0, trips: 0, designCost: 0, surveyCost: 0, total: 0 }; sales.set(name, x); }
      x.projects++; x.drawings += p.drawings; x.n += p.n; x.o += p.o + p.h; x.trips += p.trips.length;
      x.designCost += p.designCost; x.surveyCost += p.surveyCost; x.total += p.total;
    });

    return { ctx, items, itemsById: new Map(items.map((it) => [it.id, it])), tripItems, visibleTrips, projects, designers, sales, quality, saleOf };
  }

  /* ---------- state ---------- */
  let S = loadSettings();
  let trips = readJson(KEY_TRIPS, []);
  if (!Array.isArray(trips)) trips = [];
  let overrides = readJson(KEY_OVERRIDES, {});
  if (!overrides || typeof overrides !== "object") overrides = {};
  let model = null;
  const ui = { period: "all", search: "", sale: "all", sort: "total", selected: null, settingsOpen: false, formOpen: false };
  const root = () => document.getElementById("costView");
  const $c = (sel) => root().querySelector(sel);
  const saveSettings = () => writeJson(KEY_SETTINGS, S);
  const saveTrips = () => writeJson(KEY_TRIPS, trips);
  const saveOverrides = () => writeJson(KEY_OVERRIDES, overrides);

  function recompute() {
    model = compute(designs, trips, S, overrides, periodRange(ui.period));
  }
  const allCustomers = () => {
    const map = new Map();
    designs.filter((row) => !isSample(row)).forEach((row) => { const c = clean(row.customer) || "(ไม่ระบุลูกค้า)"; const k = c.toUpperCase(); const e = map.get(k) || { key: k, name: c, designs: 0 }; e.designs++; map.set(k, e); });
    trips.forEach((t) => { const c = clean(t.customer) || "(ไม่ระบุลูกค้า)"; const k = c.toUpperCase(); if (!map.has(k)) map.set(k, { key: k, name: c, designs: 0 }); });
    return [...map.values()].sort((a, b) => b.designs - a.designs || a.name.localeCompare(b.name));
  };
  const allDesigners = () => {
    const set = new Set(Object.keys(S.salaries));
    designs.filter((row) => !isSample(row)).forEach((row) => set.add(normalizeDesigner(row.owner || row.designer)));
    return [...set].filter(Boolean).sort();
  };
  const allSaleNames = () => [...new Set([...Object.values(S.customerSale), ...Object.values(S.projectSale)].filter(Boolean))].sort();

  /* ---------- render: ส่วนสรุป ---------- */
  function totals() {
    const t = { drawings: 0, revisions: 0, n: 0, o: 0, h: 0, costN: 0, costO: 0, designCost: 0, surveyCost: 0, surveyLabor: 0, surveyExpense: 0, trips: 0, total: 0 };
    model.projects.forEach((p) => {
      t.drawings += p.drawings; t.revisions += p.revisions; t.n += p.n; t.o += p.o; t.h += p.h;
      t.costN += p.costN; t.costO += p.costO; t.designCost += p.designCost;
      t.surveyCost += p.surveyCost; t.surveyLabor += p.surveyLabor; t.surveyExpense += p.surveyExpense; t.trips += p.trips.length; t.total += p.total;
    });
    return t;
  }

  function renderNotices() {
    const q = model.quality, notes = [];
    if (!S.confirmed) {
      notes.push(`<div class="cost-notice warn"><span><strong>ยังใช้เงินเดือนค่าตั้งต้น ${fmtMoney(S.defaultSalary)} ต่อเดือนต่อคน</strong> ตัวเลขต้นทุนจึงเป็นเพียงตัวอย่าง กรุณากรอกเงินเดือนจริงของ Designer ในหน้าตั้งค่า</span><button class="action-button primary" data-act="open-settings">ตั้งค่าเงินเดือน</button></div>`);
    }
    const facts = [];
    if (q.sample) facts.push(`ไม่รวมข้อมูลตัวอย่างของระบบ ${q.sample} รายการ`);
    if (q.fixedDates) facts.push(`ซ่อมวันที่ที่ Excel สลับวัน/เดือนอัตโนมัติ ${q.fixedDates} รายการ`);
    if (q.suspectDates) facts.push(`${q.suspectDates} รายการวันรับ–ส่งห่างกันผิดปกติ (ติดลบหรือเกิน 45 วัน) ควรตรวจสอบใน Excel`);
    if (q.lookback) facts.push(`${q.lookback} รายการไม่มีวันที่รับงาน (สมมติเริ่มงานก่อนส่ง ${S.lookbackDays} วันทำงาน)`);
    if (q.wip) facts.push(`${q.wip} รายการยังไม่ส่งงาน (คิดเฉพาะเวลาปกติ)`);
    if (q.undated) facts.push(`${q.undated} รายการไม่มีวันที่เลย (คิดเป็นเวลาปกติ ไม่ขึ้นในช่วงเวลาที่เลือก)`);
    if (q.actual) facts.push(`${q.actual} รายการใช้ชั่วโมงที่กรอกจริง`);
    if (facts.length) notes.push(`<div class="cost-notice info"><span><strong>คุณภาพข้อมูล</strong> · ${facts.join(" · ")}</span></div>`);
    $c("#costNotices").innerHTML = notes.join("");
  }

  function renderSummary() {
    const t = totals();
    const otHours = t.o + t.h, allHours = t.n + t.o + t.h;
    const cards = [
      ["ต้นทุนรวม", fmtMoney(t.total), `${model.projects.size} Project`],
      ["ต้นทุนทำแบบ", fmtMoney(t.designCost), `ปกติ ${fmtMoney(t.costN)} · โอที ${fmtMoney(t.costO)}`],
      ["ต้นทุนออกวัดพื้นที่", fmtMoney(t.surveyCost), `${t.trips} ทริป · ค่าใช้จ่าย ${fmtMoney(t.surveyExpense)}`],
      ["จำนวนแบบ", t.drawings.toLocaleString("th-TH"), `แก้ไข (-01↑) ${t.revisions} รายการ`],
      ["ชั่วโมงปกติ / โอที", `${fmtHr(t.n)} / ${fmtHr(otHours)}`, `โอที ${allHours ? (otHours / allHours * 100).toFixed(1) : "0.0"}% ของชั่วโมงทำแบบ`],
      ["ต้นทุนเฉลี่ยต่อแบบ", t.drawings ? fmtMoney(t.designCost / t.drawings) : "-", "เฉพาะค่าแรงทำแบบ"]
    ];
    $c("#costSummary").innerHTML = cards.map(([label, value, note], i) => `<article class="cost-kpi ${i === 0 ? "primary" : ""}"><small>${label}</small><strong>${value}</strong><span>${note}</span></article>`).join("");
  }

  function renderInsights() {
    const t = totals();
    const list = [];
    const projects = [...model.projects.values()];
    if (!projects.length) { $c("#costInsights").innerHTML = "<li>ยังไม่มีข้อมูลในช่วงเวลาที่เลือก</li>"; return; }
    const isNamed = (p) => !p.project.startsWith("(ไม่ระบุ");
    const named = projects.filter(isNamed);
    const unnamed = projects.filter((p) => !isNamed(p));
    const top = [...named].sort((a, b) => b.total - a.total)[0];
    if (top) list.push(`<strong>${esc(top.project)}</strong> (${esc(top.customer)}) เป็น Project ต้นทุนสูงสุด ${fmtMoney(top.total)} หรือ ${t.total ? (top.total / t.total * 100).toFixed(1) : 0}% ของทั้งหมด`);
    if (unnamed.length) {
      const d = unnamed.reduce((x, p) => x + p.drawings, 0), c = unnamed.reduce((x, p) => x + p.total, 0);
      list.push(`มี ${d} แบบ (${fmtMoney(c)} หรือ ${t.total ? (c / t.total * 100).toFixed(1) : 0}%) ที่ไม่ได้ระบุชื่อ Project ใน Excel จึงจัดกลุ่มตามลูกค้า (แถว “(ไม่ระบุ Project)”)`);
    }
    const otTotal = t.o + t.h, all = t.n + otTotal;
    const byOt = [...model.designers.values()].sort((a, b) => (b.o + b.h) - (a.o + a.h))[0];
    if (byOt && otTotal > 0) list.push(`โอทีรวม ${fmtHr(otTotal)} ชม. (${(otTotal / all * 100).toFixed(1)}%) โดย <strong>${esc(byOt.name)}</strong> มีโอทีมากสุด ${fmtHr(byOt.o + byOt.h)} ชม. คิดเป็นค่าแรงโอที ${fmtMoney(t.costO)} รวมทั้งแผนก`);
    else list.push("ยังไม่พบชั่วโมงโอทีจากข้อมูลที่มี");
    const perDrawing = named.filter((p) => p.drawings >= 3).sort((a, b) => b.designCost / b.drawings - a.designCost / a.drawings)[0];
    if (perDrawing) list.push(`Project ที่ต้นทุนต่อแบบสูงสุด (ตั้งแต่ 3 แบบขึ้นไป): <strong>${esc(perDrawing.project)}</strong> ${fmtMoney(perDrawing.designCost / perDrawing.drawings)} ต่อแบบ (${perDrawing.drawings} แบบ)`);
    if (t.trips) {
      const topSurvey = [...projects].sort((a, b) => b.surveyCost - a.surveyCost)[0];
      list.push(`ออกวัดพื้นที่ ${t.trips} ทริป รวม ${fmtMoney(t.surveyCost)} สูงสุดที่ <strong>${esc(topSurvey.project)}</strong> ${fmtMoney(topSurvey.surveyCost)}`);
    }
    const sales = [...model.sales.values()].filter((x) => x.name !== NO_SALE).sort((a, b) => b.total - a.total);
    const noSale = model.sales.get(NO_SALE);
    if (sales.length) list.push(`Sale ที่ดูแล Project ต้นทุนรวมสูงสุดคือ <strong>${esc(sales[0].name)}</strong> ${fmtMoney(sales[0].total)} (${sales[0].projects} Project)`);
    if (noSale) list.push(`มี ${noSale.projects} Project (${fmtMoney(noSale.total)}) ที่ยังไม่ได้ระบุ Sale — กำหนดได้ในตั้งค่าตาราง Customer → Sale`);
    $c("#costInsights").innerHTML = list.map((x) => `<li>${x}</li>`).join("");
  }

  /* ---------- render: ตาราง Project ---------- */
  function filteredProjects() {
    const q = ui.search.trim().toLowerCase();
    let rows = [...model.projects.values()].filter((p) => {
      if (q && !`${p.project} ${p.customer} ${p.sale}`.toLowerCase().includes(q)) return false;
      if (ui.sale === "__none__") return !p.sale;
      if (ui.sale !== "all") return p.sale === ui.sale;
      return true;
    });
    const sorters = {
      total: (a, b) => b.total - a.total,
      name: (a, b) => a.project.localeCompare(b.project),
      drawings: (a, b) => b.drawings - a.drawings,
      ot: (a, b) => (b.o + b.h) - (a.o + a.h),
      perDrawing: (a, b) => (b.drawings ? b.designCost / b.drawings : 0) - (a.drawings ? a.designCost / a.drawings : 0)
    };
    rows.sort(sorters[ui.sort] || sorters.total);
    return rows;
  }
  const costBar = (p, max) => {
    const w = (v) => max ? Math.max(0, v / max * 100) : 0;
    return `<span class="cost-bar" title="ปกติ ${fmtMoney(p.costN)} · โอที ${fmtMoney(p.costO)} · วัดพื้นที่ ${fmtMoney(p.surveyCost)}"><i class="n" style="width:${w(p.costN)}%"></i><i class="o" style="width:${w(p.costO)}%"></i><i class="s" style="width:${w(p.surveyCost)}%"></i></span>`;
  };

  function renderProjectTable() {
    const rows = filteredProjects();
    const max = rows.reduce((m, p) => Math.max(m, p.total), 0);
    const sum = rows.reduce((t, p) => { t.drawings += p.drawings; t.n += p.n; t.o += p.o + p.h; t.design += p.designCost; t.survey += p.surveyCost; t.total += p.total; return t; }, { drawings: 0, n: 0, o: 0, design: 0, survey: 0, total: 0 });
    $c("#costProjectCount").textContent = `${rows.length} Project`;
    $c("#costProjectBody").innerHTML = rows.length ? rows.map((p) => {
      const designers = [...p.designers.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n).join(", ");
      return `<tr class="${ui.selected === p.key ? "selected" : ""}">
        <td><strong>${esc(p.project)}</strong><small>${esc(p.customer)}</small></td>
        <td><input class="sale-input" list="costSaleList" data-project-sale="${esc(p.key)}" value="${esc(p.sale)}" placeholder="${NO_SALE}"></td>
        <td class="num"><strong>${p.drawings}</strong><small>แก้ไข ${p.revisions}</small></td>
        <td class="num">${fmtHr(p.n)}</td>
        <td class="num ${p.o + p.h > 0 ? "ot" : ""}">${fmtHr(p.o + p.h)}${p.h > 0 ? `<small>วันหยุด ${fmtHr(p.h)}</small>` : ""}</td>
        <td class="num">${fmtMoney(p.designCost)}<small>ปกติ ${fmtMoney(p.costN)} · โอที ${fmtMoney(p.costO)}</small></td>
        <td class="num">${p.trips.length ? `${fmtMoney(p.surveyCost)}<small>${p.trips.length} ทริป</small>` : `<span class="muted">-</span>`}</td>
        <td class="num total"><strong>${fmtMoney(p.total)}</strong>${costBar(p, max)}</td>
        <td class="num">${p.drawings ? fmtMoney(p.designCost / p.drawings) : "-"}</td>
        <td>${esc(designers) || "-"}</td>
        <td><button class="action-button" data-act="detail" data-key="${esc(p.key)}">รายละเอียด</button></td>
      </tr>`;
    }).join("") : `<tr><td colspan="11" class="empty-gantt">ไม่พบ Project ตามเงื่อนไข</td></tr>`;
    $c("#costProjectFoot").innerHTML = rows.length ? `<tr><td colspan="2"><strong>รวม ${rows.length} Project</strong></td><td class="num"><strong>${sum.drawings}</strong></td><td class="num"><strong>${fmtHr(sum.n)}</strong></td><td class="num"><strong>${fmtHr(sum.o)}</strong></td><td class="num"><strong>${fmtMoney(sum.design)}</strong></td><td class="num"><strong>${fmtMoney(sum.survey)}</strong></td><td class="num total"><strong>${fmtMoney(sum.total)}</strong></td><td class="num">${sum.drawings ? fmtMoney(sum.design / sum.drawings) : "-"}</td><td colspan="2"></td></tr>` : "";
  }

  function renderSaleFilter() {
    const select = $c("#costSaleFilter");
    const names = [...new Set([...model.sales.keys()].filter((n) => n !== NO_SALE))].sort();
    const hasNone = model.sales.has(NO_SALE);
    select.innerHTML = `<option value="all">ทุก Sale</option>${names.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join("")}${hasNone ? `<option value="__none__">${NO_SALE}</option>` : ""}`;
    if ([...select.options].some((o) => o.value === ui.sale)) select.value = ui.sale; else { ui.sale = "all"; select.value = "all"; }
    $c("#costSaleList").innerHTML = allSaleNames().map((n) => `<option value="${esc(n)}"></option>`).join("");
  }

  /* ---------- render: รายละเอียด Project ---------- */
  function renderDetailHead() {
    const p = model.projects.get(ui.selected);
    if (!p) return;
    $c("#costDetailHead").innerHTML = `<div><strong>${esc(p.project)}</strong><small>${esc(p.customer)} · Sale: ${esc(p.sale || NO_SALE)}</small></div>
      <div class="cost-mini-kpis">
        <span><small>จำนวนแบบ</small><strong>${p.drawings}</strong></span>
        <span><small>ชม.ปกติ</small><strong>${fmtHr(p.n)}</strong></span>
        <span><small>ชม.โอที</small><strong>${fmtHr(p.o + p.h)}</strong></span>
        <span><small>ทำแบบ</small><strong>${fmtMoney(p.designCost)}</strong></span>
        <span><small>วัดพื้นที่</small><strong>${fmtMoney(p.surveyCost)}</strong></span>
        <span><small>รวม</small><strong>${fmtMoney(p.total)}</strong></span>
      </div>
      <button class="text-button" data-act="close-detail">ปิด</button>`;
  }
  const sourceLabel = (it) => it.source === "actual" ? `<span class="status-tag">กรอกจริง</span>` : it.mode === "wip" ? `<span class="status-tag review">ประมาณ · ยังไม่ส่ง</span>` : it.mode === "undated" ? `<span class="status-tag blocked">ประมาณ · ไม่มีวันที่</span>` : it.mode === "lookback" ? `<span class="status-tag review">ประมาณ · ไม่มีวันรับ</span>` : `<span class="status-tag review">ประมาณ</span>`;
  function detailRow(it) {
    const ovr = has(overrides, it.id);
    return `<tr data-row="${esc(it.id)}">
      <td><strong>${esc(it.id)}</strong><small>${esc(it.row.description || it.type)}${it.revision ? " · แก้ไข" : ""}</small></td>
      <td>${esc(it.type)}<small>มาตรฐาน ${fmtHr(it.std)} ชม.</small></td>
      <td>${esc(it.designer)}</td>
      <td>${fmtDate(it.recv)}</td><td>${fmtDate(it.end)}</td>
      <td class="num"><input class="hour-input" type="number" min="0" step="0.25" data-ovr="${esc(it.id)}" data-field="n" value="${Math.round(it.h.n * 100) / 100}"></td>
      <td class="num"><input class="hour-input" type="number" min="0" step="0.25" data-ovr="${esc(it.id)}" data-field="o" value="${Math.round(it.h.o * 100) / 100}"></td>
      <td class="num"><input class="hour-input" type="number" min="0" step="0.25" data-ovr="${esc(it.id)}" data-field="h" value="${Math.round(it.h.h * 100) / 100}"></td>
      <td class="num c-cost">${fmtMoney(it.cost)}</td>
      <td class="c-src">${sourceLabel(it)}${ovr ? ` <button class="text-button" data-act="clear-ovr" data-id="${esc(it.id)}">ใช้ค่าประมาณ</button>` : ""}</td>
    </tr>`;
  }
  function renderDetail() {
    const panel = $c("#costDetailPanel");
    const p = model.projects.get(ui.selected);
    if (!p) { panel.hidden = true; ui.selected = null; return; }
    panel.hidden = false;
    renderDetailHead();
    const items = [...p.items].sort((a, b) => (a.end || a.recv || 0) - (b.end || b.recv || 0) || (a.id < b.id ? -1 : 1));
    $c("#costDetailBody").innerHTML = items.length ? items.map(detailRow).join("") : `<tr><td colspan="10" class="empty-gantt">Project นี้ยังไม่มีรายการทำแบบในช่วงเวลาที่เลือก</td></tr>`;
    $c("#costDetailTrips").innerHTML = p.trips.length ? p.trips.sort((a, b) => b.date - a.date).map(tripRowHtml).join("") : `<tr><td colspan="9" class="empty-gantt">ยังไม่มีทริปวัดพื้นที่ — กด “+ บันทึกทริปวัดพื้นที่” เพื่อเพิ่ม</td></tr>`;
  }
  function patchDetailRow(id) {
    const it = model.itemsById.get(id);
    const tr = root().querySelector(`#costDetailBody tr[data-row="${CSS.escape(id)}"]`);
    if (!it || !tr) return;
    tr.querySelector(".c-cost").textContent = fmtMoney(it.cost);
    tr.querySelector(".c-src").innerHTML = `${sourceLabel(it)}${has(overrides, id) ? ` <button class="text-button" data-act="clear-ovr" data-id="${esc(id)}">ใช้ค่าประมาณ</button>` : ""}`;
  }

  /* ---------- render: Sale / Designer / ทริป ---------- */
  function renderSaleTable() {
    const rows = [...model.sales.values()].sort((a, b) => b.total - a.total);
    const all = rows.reduce((t, x) => t + x.total, 0);
    $c("#costSaleBody").innerHTML = rows.length ? rows.map((x) => `<tr class="${x.name === NO_SALE ? "muted-row" : ""}">
      <td><strong>${esc(x.name)}</strong></td><td class="num">${x.projects}</td><td class="num">${x.drawings}</td>
      <td class="num">${fmtHr(x.n)} / ${fmtHr(x.o)}</td><td class="num">${x.trips}</td>
      <td class="num"><strong>${fmtMoney(x.total)}</strong><small>${all ? (x.total / all * 100).toFixed(1) : 0}%</small></td></tr>`).join("") : `<tr><td colspan="6" class="empty-gantt">ไม่มีข้อมูล</td></tr>`;
  }
  function renderDesignerTable() {
    const rows = [...model.designers.values()].sort((a, b) => b.total - a.total);
    $c("#costDesignerBody").innerHTML = rows.length ? rows.map((d) => {
      const ot = d.o + d.h, all = d.n + ot;
      return `<tr><td><strong>${esc(d.name)}</strong><small>${fmtMoney(d.rate.salary)}/เดือน · ${fmtMoney(d.rate.normal)}/ชม.</small></td>
        <td class="num">${d.drawings}</td><td class="num">${fmtHr(d.n)}</td><td class="num ${ot > 0 ? "ot" : ""}">${fmtHr(ot)}<small>${all ? (ot / all * 100).toFixed(0) : 0}%</small></td>
        <td class="num">${fmtMoney(d.designCost)}</td><td class="num">${d.surveyHours ? `${fmtMoney(d.surveyLabor)}<small>${fmtHr(d.surveyHours)} ชม.</small>` : `<span class="muted">-</span>`}</td>
        <td class="num"><strong>${fmtMoney(d.total)}</strong></td></tr>`;
    }).join("") : `<tr><td colspan="7" class="empty-gantt">ไม่มีข้อมูล</td></tr>`;
  }
  function tripRowHtml(ti) {
    const hourText = `${fmtHr(ti.split.n)} / ${fmtHr(ti.split.o + ti.split.h)}`;
    return `<tr><td>${fmtDate(ti.date)}<small>${esc(ti.trip.start)}–${esc(ti.trip.end)}</small></td>
      <td><strong>${esc(ti.project)}</strong><small>${esc(ti.customer)}${ti.trip.place ? " · " + esc(ti.trip.place) : ""}</small></td>
      <td>${esc(model.saleOf(ti.key, ti.customer.toUpperCase()) || NO_SALE)}</td>
      <td>${esc(ti.people.map((p) => p.name).join(", "))}</td>
      <td class="num">${hourText}<small>ต่อคน (ปกติ / โอที)</small></td>
      <td class="num">${fmtMoney(ti.labor)}</td><td class="num">${fmtMoney(ti.expenses)}</td>
      <td class="num"><strong>${fmtMoney(ti.total)}</strong></td>
      <td><button class="action-button" data-act="del-trip" data-id="${esc(ti.trip.id)}">ลบ</button></td></tr>`;
  }
  function renderTripTable() {
    const rows = [...model.visibleTrips].sort((a, b) => (b.date || 0) - (a.date || 0));
    $c("#costTripCount").textContent = `${rows.length} ทริป`;
    $c("#costTripBody").innerHTML = rows.length ? rows.map(tripRowHtml).join("") : `<tr><td colspan="9" class="empty-gantt">ยังไม่มีทริปวัดพื้นที่ในช่วงเวลาที่เลือก — กด “+ บันทึกทริปวัดพื้นที่”</td></tr>`;
  }

  /* ---------- render: ตั้งค่า ---------- */
  const numField = (key, label, step = "1", hint = "") => `<label>${label}<input type="number" step="${step}" min="0" data-set="${key}" value="${S[key]}">${hint ? `<em>${hint}</em>` : ""}</label>`;
  const textField = (key, label, type = "time") => `<label>${label}<input type="${type}" data-set="${key}" value="${esc(S[key])}"></label>`;
  function renderSettings() {
    const weekdayNames = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
    const ctx = makeCtx(S);
    const designersList = allDesigners();
    const customers = allCustomers();
    $c("#costSettingsBody").innerHTML = `
      <div class="settings-block">
        <h3>1) ค่าแรง Designer <small>เงินเดือน ÷ ชั่วโมงทำงาน</small></h3>
        <table class="settings-table"><thead><tr><th>Designer</th><th>เงินเดือน (บาท/เดือน)</th><th>ค่าแรง/ชม. (ปกติ)</th><th>ฐานโอที/ชม.</th></tr></thead><tbody>
          ${designersList.map((name) => { const r = ctx.rates(name); return `<tr><td><strong>${esc(name)}</strong></td><td><input type="number" min="0" step="500" data-salary="${esc(name)}" value="${r.salary}"></td><td class="num">${fmtMoney(r.normal)}</td><td class="num">${fmtMoney(r.ot)}</td></tr>`; }).join("")}
        </tbody></table>
        <div class="settings-grid">${numField("defaultSalary", "เงินเดือนตั้งต้น (Designer ที่ไม่ได้ระบุ)", "500")}</div>
      </div>
      <div class="settings-block">
        <h3>2) เวลาทำงานและโอที</h3>
        <div class="settings-grid">
          ${numField("hoursPerDay", "ชั่วโมงทำงาน/วัน", "0.5")}
          ${numField("workDaysPerMonth", "วันทำงาน/เดือน (ตัวหารค่าแรงปกติ)", "1")}
          ${numField("otBaseDays", "ตัวหารวัน/เดือน (ฐานค่าแรงโอที)", "1", "ตามกฎหมายแรงงานใช้ 30 วัน")}
          ${textField("workStart", "เริ่มงาน")}${textField("workEnd", "เลิกงาน")}
          ${textField("lunchStart", "พักเที่ยงเริ่ม")}${textField("lunchEnd", "พักเที่ยงสิ้นสุด")}
          ${numField("otMultiplier", "ตัวคูณโอทีวันทำงาน", "0.25")}
          ${numField("holidayMultiplier", "ตัวคูณทำงานวันหยุด", "0.25", "ปรับตามนโยบายบริษัท")}
          ${numField("otCapPerDay", "โอทีสูงสุด/วัน (ชม.) ที่ตัวประมาณใช้", "0.5")}
          ${numField("holidayCapPerDay", "ทำงานวันหยุดสูงสุด/วัน (ชม.)", "0.5")}
          ${numField("lookbackDays", "ไม่มีวันรับงาน: เริ่มก่อนวันส่ง (วันทำงาน)", "1", "ยิ่งน้อย โอทียิ่งมาก")}
        </div>
        <div class="weekday-row"><span>วันทำงานประจำสัปดาห์</span>${weekdayNames.map((n, i) => `<label class="check-control"><input type="checkbox" data-weekday="${i}" ${S.workWeekdays.includes(i) ? "checked" : ""}> ${n}</label>`).join("")}</div>
        <label class="settings-wide">วันหยุดนักขัตฤกษ์/วันหยุดบริษัท (YYYY-MM-DD คั่นด้วยเว้นวรรคหรือขึ้นบรรทัดใหม่)<textarea data-extra-holidays rows="2" placeholder="2026-10-13 2026-10-23">${esc(S.extraHolidays)}</textarea></label>
      </div>
      <div class="settings-block">
        <h3>3) ชั่วโมงมาตรฐานต่อแบบ <small>ตัวประมาณใช้เมื่อไม่มีชั่วโมงจริง</small></h3>
        <div class="settings-grid">${STD_TYPES.map((t) => `<label>${t}<input type="number" step="0.25" min="0" data-std="${esc(t)}" value="${S.stdHours[t]}"></label>`).join("")}</div>
      </div>
      <div class="settings-block">
        <h3>4) Sale ผู้ดำเนินการ <small>จับคู่ Customer → Sale (แก้รายโครงการได้ในตาราง Project)</small></h3>
        <div class="customer-sale-grid">
          ${customers.map((c) => `<label><span>${esc(c.name)} <em>${c.designs} แบบ</em></span><input list="costSaleList" data-cust-sale="${esc(c.key)}" value="${esc(S.customerSale[c.key] || "")}" placeholder="${NO_SALE}"></label>`).join("") || "<em>ยังไม่มีข้อมูลลูกค้า</em>"}
        </div>
      </div>
      <div class="settings-actions"><button class="action-button" data-act="reset-settings">รีเซ็ตพารามิเตอร์เป็นค่าเริ่มต้น</button><small>ค่าที่แก้จะบันทึกในเบราว์เซอร์นี้ทันที (ไม่ลบเงินเดือนและ Sale ที่กรอกไว้)</small></div>`;
  }

  /* ---------- ฟอร์มทริปวัดพื้นที่ ---------- */
  function renderTripForm() {
    const customers = allCustomers();
    const projectNames = [...new Set([...model.projects.values()].map((p) => p.project))].sort();
    const designersList = allDesigners();
    $c("#tripCustomerList").innerHTML = customers.map((c) => `<option value="${esc(c.name)}"></option>`).join("");
    $c("#tripProjectList").innerHTML = projectNames.map((n) => `<option value="${esc(n)}"></option>`).join("");
    $c("#tripPeople").innerHTML = designersList.map((n) => `<label class="check-control"><input type="checkbox" name="people" value="${esc(n)}"> ${esc(n)}</label>`).join("");
    const form = $c("#tripForm");
    if (!form.elements.date.value) form.elements.date.value = dayKey(new Date(REPORT_DATE.getFullYear(), REPORT_DATE.getMonth(), REPORT_DATE.getDate(), 12));
    previewTrip();
  }
  function readTripForm() {
    const f = $c("#tripForm").elements;
    return {
      id: "TRIP-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      date: f.date.value, customer: clean(f.customer.value), project: clean(f.project.value), place: clean(f.place.value),
      start: f.start.value, end: f.end.value,
      people: [...$c("#tripForm").querySelectorAll('input[name="people"]:checked')].map((x) => x.value),
      expenses: Object.fromEntries(EXPENSE_FIELDS.map(([k]) => [k, num(f[k].value)])),
      note: clean(f.note.value)
    };
  }
  function previewTrip() {
    const t = readTripForm();
    const ti = evalTrip(t, makeCtx(S));
    const sale = t.customer || t.project ? model.saleOf(ti.key, ti.customer.toUpperCase()) : "";
    $c("#tripPreview").innerHTML = ti.date && ti.split.total > 0
      ? `<strong>ตัวอย่างการคำนวณ</strong> · ต่อคน: ปกติ ${fmtHr(ti.split.n)} ชม. · โอที ${fmtHr(ti.split.o)} ชม. · วันหยุด ${fmtHr(ti.split.h)} ชม. (หักพักเที่ยงแล้ว) · ${ti.people.length} คน → ค่าแรง ${fmtMoney(ti.labor)} + ค่าใช้จ่าย ${fmtMoney(ti.expenses)} = <strong>${fmtMoney(ti.total)}</strong>${sale ? ` · Sale: ${esc(sale)}` : ""}`
      : "กรอกวันที่ และเวลาออก–กลับ เพื่อดูตัวอย่างการคำนวณ";
  }

  /* ---------- period ---------- */
  function renderPeriodOptions() {
    const select = $c("#costPeriod");
    const years = new Set([2026]);
    designs.forEach((row) => { const r = resolveDate(row.submittedDate) || resolveDate(row.receivedDate); if (r) years.add(r.date.getFullYear()); });
    trips.forEach((t) => { const p = parseYMD(t.date); if (p) years.add(p.y); });
    const ordered = [...years].sort((a, b) => b - a);
    select.innerHTML = `<option value="all">ทุกช่วงเวลา</option>${ordered.map((y) => `
      <optgroup label="รายเดือน · ${y}">${monthNames.map((n, i) => `<option value="month-${y}-${pad(i + 1)}">${n} ${y}</option>`).join("")}</optgroup>
      <optgroup label="รายไตรมาส · ${y}">${[1, 2, 3, 4].map((q) => `<option value="quarter-${y}-Q${q}">ไตรมาส ${q} · ${y}</option>`).join("")}</optgroup>
      <option value="year-${y}">ปี ${y}</option>`).join("")}`;
    select.value = [...select.options].some((o) => o.value === ui.period) ? ui.period : "all";
    ui.period = select.value;
  }

  /* ---------- render รวม ---------- */
  function renderResults(opts = {}) {
    recompute();
    renderNotices();
    renderSummary();
    renderInsights();
    renderSaleFilter();
    if (!opts.keepProjectTable) renderProjectTable();
    if (!opts.keepDetail) renderDetail(); else renderDetailHead();
    renderSaleTable();
    renderDesignerTable();
    renderTripTable();
  }
  function renderCost() {
    if (!root()) return;
    renderPeriodOptions();
    recompute();
    renderSettings();
    renderResults();
    $c("#costSettingsPanel").hidden = !ui.settingsOpen;
    $c("#tripFormPanel").hidden = !ui.formOpen;
    if (ui.formOpen) renderTripForm();
  }

  /* ---------- events ---------- */
  function openSettings(open) {
    ui.settingsOpen = open;
    $c("#costSettingsPanel").hidden = !open;
    if (open) $c("#costSettingsPanel").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function openTripForm(open, prefill) {
    ui.formOpen = open;
    $c("#tripFormPanel").hidden = !open;
    if (!open) return;
    renderTripForm();
    if (prefill) { const f = $c("#tripForm").elements; f.customer.value = prefill.customer; f.project.value = prefill.project; previewTrip(); }
    $c("#tripFormPanel").scrollIntoView({ behavior: "smooth", block: "center" });
  }
  function onClick(event) {
    const el = event.target.closest("[data-act]");
    if (!el) return;
    const act = el.dataset.act;
    if (act === "toggle-settings") openSettings(!ui.settingsOpen);
    else if (act === "open-settings") openSettings(true);
    else if (act === "new-trip") openTripForm(true, null);
    else if (act === "close-trip-form") openTripForm(false);
    else if (act === "trip-for-project") { const p = model.projects.get(ui.selected); if (p) openTripForm(true, { customer: p.customer, project: p.project }); }
    else if (act === "detail") { ui.selected = el.dataset.key; renderProjectTable(); renderDetail(); $c("#costDetailPanel").scrollIntoView({ behavior: "smooth", block: "start" }); }
    else if (act === "close-detail") { ui.selected = null; renderProjectTable(); renderDetail(); }
    else if (act === "clear-ovr") { delete overrides[el.dataset.id]; saveOverrides(); renderResults({ keepDetail: true }); renderDetail(); toast("กลับไปใช้ค่าประมาณอัตโนมัติแล้ว"); }
    else if (act === "del-trip") {
      if (el.dataset.confirm !== "1") { el.dataset.confirm = "1"; el.textContent = "ยืนยันลบ"; el.classList.add("danger"); setTimeout(() => { el.dataset.confirm = ""; el.textContent = "ลบ"; el.classList.remove("danger"); }, 3000); return; }
      trips = trips.filter((t) => t.id !== el.dataset.id); saveTrips(); renderResults(); toast("ลบทริปแล้ว");
    }
    else if (act === "reset-settings") {
      const keep = { salaries: S.salaries, customerSale: S.customerSale, projectSale: S.projectSale, defaultSalary: S.defaultSalary, confirmed: S.confirmed };
      S = { ...loadDefaults(), ...keep }; saveSettings(); renderSettings(); renderResults(); toast("รีเซ็ตพารามิเตอร์แล้ว");
    }
  }
  const loadDefaults = () => ({ ...DEFAULTS, workWeekdays: [...DEFAULTS.workWeekdays], stdHours: { ...DEFAULTS.stdHours }, salaries: {}, customerSale: {}, projectSale: {} });

  function onChange(event) {
    const t = event.target;
    if (t.id === "costPeriod") { ui.period = t.value; renderResults(); return; }
    if (t.id === "costSaleFilter") { ui.sale = t.value; renderProjectTable(); return; }
    if (t.id === "costSort") { ui.sort = t.value; renderProjectTable(); return; }
    if (t.dataset.set !== undefined) {
      const key = t.dataset.set;
      S[key] = t.type === "number" ? num(t.value) : t.value;
      saveSettings(); renderResults(); refreshRates(); return;
    }
    if (t.dataset.weekday !== undefined) {
      const day = Number(t.dataset.weekday);
      S.workWeekdays = t.checked ? [...new Set([...S.workWeekdays, day])].sort() : S.workWeekdays.filter((d) => d !== day);
      saveSettings(); renderResults(); return;
    }
    if (t.dataset.extraHolidays !== undefined) { S.extraHolidays = t.value; saveSettings(); renderResults(); return; }
    if (t.dataset.salary !== undefined) { S.salaries[t.dataset.salary] = num(t.value); S.confirmed = true; saveSettings(); renderResults(); refreshRates(); return; }
    if (t.dataset.std !== undefined) { S.stdHours[t.dataset.std] = num(t.value); saveSettings(); renderResults(); return; }
    if (t.dataset.custSale !== undefined) {
      const v = clean(t.value);
      if (v) S.customerSale[t.dataset.custSale] = v; else delete S.customerSale[t.dataset.custSale];
      saveSettings(); renderResults(); return;
    }
    if (t.dataset.projectSale !== undefined) {
      const v = clean(t.value), key = t.dataset.projectSale;
      const custKey = (model.projects.get(key) || {}).custKey;
      const fallback = custKey && S.customerSale[custKey] ? S.customerSale[custKey] : "";
      if (v && v !== fallback) S.projectSale[key] = v; else delete S.projectSale[key];
      saveSettings(); renderResults({ keepProjectTable: true }); renderDetailHead(); return;
    }
    if (t.dataset.ovr !== undefined) {
      const id = t.dataset.ovr;
      const rowEl = t.closest("tr");
      const read = (f) => num(rowEl.querySelector(`[data-ovr="${CSS.escape(id)}"][data-field="${f}"]`).value);
      overrides[id] = { n: read("n"), o: read("o"), h: read("h") };
      saveOverrides();
      renderResults({ keepProjectTable: false, keepDetail: true });
      patchDetailRow(id);
    }
  }
  // อัปเดตช่องค่าแรง/ชม. ในตารางตั้งค่า โดยไม่สร้างตารางใหม่ (ไม่ให้โฟกัสหลุด)
  function refreshRates() {
    const ctx = makeCtx(S);
    root().querySelectorAll("[data-salary]").forEach((input) => {
      const cells = input.closest("tr").querySelectorAll("td.num");
      const r = ctx.rates(input.dataset.salary);
      cells[0].textContent = fmtMoney(r.normal); cells[1].textContent = fmtMoney(r.ot);
    });
  }
  function onInput(event) {
    const t = event.target;
    if (t.id === "costSearch") { ui.search = t.value; renderProjectTable(); return; }
    if (t.closest("#tripForm")) previewTrip();
  }
  function onSubmit(event) {
    if (event.target.id !== "tripForm") return;
    event.preventDefault();
    const trip = readTripForm();
    if (!trip.date) { toast("กรุณาระบุวันที่"); return; }
    if (!trip.customer || !trip.project) { toast("กรุณาระบุ Customer และ Project"); return; }
    if (!trip.people.length) { toast("เลือกผู้ไปวัดพื้นที่อย่างน้อย 1 คน"); return; }
    if (toMin(trip.end) <= toMin(trip.start)) { toast("เวลากลับต้องหลังเวลาออก"); return; }
    trips.push(trip); saveTrips();
    event.target.reset();
    ui.formOpen = false; $c("#tripFormPanel").hidden = true;
    renderResults();
    toast("บันทึกทริปวัดพื้นที่แล้ว");
  }

  let started = false;
  function init() {
    const el = root();
    if (!el || started) return;
    started = true;
    el.addEventListener("click", onClick);
    el.addEventListener("change", onChange);
    el.addEventListener("input", onInput);
    el.addEventListener("submit", onSubmit);
  }
  document.addEventListener("DOMContentLoaded", init);
  if (document.readyState !== "loading") init();

  /* ---------- exports ---------- */
  window.renderCost = renderCost;
  window.costSaleOf = (row) => {
    const customer = clean(row.customer) || "(ไม่ระบุลูกค้า)";
    const project = clean(row.project) || "(ไม่ระบุ Project)";
    const key = projectKey(customer, project);
    return (has(S.projectSale, key) && S.projectSale[key]) || (has(S.customerSale, customer.toUpperCase()) && S.customerSale[customer.toUpperCase()]) || "";
  };
  window.CostEngine = { compute, splitTrip, evalTrip, resolveDate, resolveDates, workType, isRevision, makeCtx, DEFAULTS, getState: () => ({ S, trips, overrides, model }) };
})();
