/* ============================================================
   แผนกวางแผน (Planning) — ใบวางแผนงาน ต่อ M/O
   รับใบงานจากฝ่ายขาย → ตรวจรายละเอียดงาน → กำหนด spec การทอ (เกรด/ความยาก)
   → คำนวณน้ำหนักไหมสั่งย้อม (Main Color + โซนสี) → คำนวณระยะเวลาทำงานแต่ละแผนก → บันทึกลง Master Plan Gantt

   ที่มาของสูตร/ตารางอ้างอิง (ไฟล์จริงของฝ่ายผลิตที่ผู้ใช้อัปโหลด):
   - ฟอร์มคำนวณไหม.xlsx ชีต "Tufting Spec." → สูตรน้ำหนัก/ตร.ม. จาก Stitch, Row, Pile Height, Tex, จำนวนเส้นไหม
     ยืนยันตัวเลขตรงกับชีต "1" (ตารางชนิด/คุณภาพ→น้ำหนัก แถว 28-56) ทุกค่า (เช่น HWO 45C = 2694 ก./ตร.ม., HWO 45L = 2387 ก./ตร.ม.)
     และตรงกับตัวอย่างที่ผู้ใช้ยืนยันไว้ (HBBVC 45C, Tex 360, 4 เส้น → 2552 ก./ตร.ม. = 2.552 กก./ตร.ม.)
   - ★ กฎที่ยืนยันกับผู้ใช้แล้ว: ค่าที่ใช้คำนวณ "น้ำหนักไหมสั่งย้อม" ของงาน CUT/Tip-Shear คือค่าที่คำนวณจาก
     Tuft Pile Height (TPH, ความสูงก่อนเจียร์/ก่อนตัดแต่งหน้าพรม) ไม่ใช่ Fin Pile Height (FPH, ความสูงหลังเจียร์)
     แม้ในบางเอกสารจะเรียกชื่อคอลัมน์ต่างกัน — ตัวแปรในไฟล์นี้ตั้งชื่อว่า tuftWeight/beforeShear ให้ตรงกับตัวเลขจริงเสมอ
   - เกรดการทอ แต่ง.xlsx ชีต "GREAD รวม" → ตารางประสิทธิภาพ 3 แผนก (ทอ/ตอกลาย-ขยายลาย/ตกแต่ง) ตาม % พื้น-ลาย ของดีไซน์
   ต้องโหลดหลัง app.js (ใช้ $, $$, toast, designs, baseTasks, saveDesigns) และหลัง sales.js ถ้าต้องการดึงพื้นที่จากใบ M/O จริง (SalesEngine)
   ============================================================ */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const num = (v) => { const n = parseFloat(String(v == null ? "" : v).replace(/,/g, "")); return Number.isFinite(n) ? n : 0; };
  const has = (v) => String(v == null ? "" : v).trim() !== "";
  const fmt = (n, d = 2) => { const x = typeof n === "number" ? n : parseFloat(String(n == null ? "" : n).replace(/,/g, "")); return (Number.isFinite(x) ? x : 0).toLocaleString("th-TH", { minimumFractionDigits: d, maximumFractionDigits: d }); };
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const uid = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const readJson = (k, fb) => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : fb; } catch (e) { return fb; } };
  const writeJson = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* บันทึกไม่ได้ก็ยังใช้ต่อได้ */ } };

  const KEY_PRESETS = "siam-quality-presets";
  const KEY_WORKERS = "siam-workforce";
  const KEY_PLANS = "siam-planning-worksheets";
  const ANCHOR_DATE = new Date(2026, 8, 21); // จ. 21 ก.ย. 2026 — วันแรกของสัปดาห์ในตาราง Gantt (app.js: const days=[["จ.",21],...])

  /* ============================================================
     1) ชนิดไหม (Tex ยืนยันจากชื่อ/การถอดสูตรย้อนกลับ) — แก้ไขได้ในหน้าตั้งค่า
     ============================================================ */
  const YARN_TYPES_DEFAULT = [
    { code: "BBVC", name: "Bamboo Viscose", tex: 360, note: "ยืนยันจากถอดสูตรย้อนกลับ HBBVC 45C = 2.552 กก./ตร.ม." },
    { code: "HPA", name: "Nylon 306/2 Tex", tex: 306, note: "Tex ตามชื่อชนิดไหม" },
    { code: "H332", name: "Nylon 333/2 Tex", tex: 333, note: "Tex ตามชื่อชนิดไหม" },
    { code: "HPRSK", name: "Prism Toray 260/2 Tex", tex: 260, note: "Tex ตามชื่อชนิดไหม" },
    { code: "HWO", name: "WO 380/1", tex: 380, note: "ยืนยันตรงกับ Tufting Spec. sheet ทุกค่า" }
  ];

  /* ============================================================
     2) สูตรน้ำหนัก/ตร.ม. — ทดสอบตรงกับไฟล์ฟอร์มคำนวณไหม.xlsx ชีต "Tufting Spec." 100%
     ============================================================ */
  // CUT: ให้ Stitch(S)/10cm, Row(R)/5cm, Fin Pile Height(FPH,มม.,หลังเจียร์), Tuft Pile Height(TPH,มม.,ก่อนเจียร์), Tex, จำนวนเส้นไหม(N)
  function cutWeight({ S, R, FPH, TPH, Tex, N }) {
    S = num(S); R = num(R); FPH = num(FPH); TPH = num(TPH); Tex = num(Tex); N = num(N);
    const FPL = (100 / S) + 0.8 + FPH * 2;   // Fin Pile Length (มม.)
    const TPL = (100 / S) + 0.8 + TPH * 2;   // Tuft Pile Length (มม.)
    const finWeight = S * R * FPL * Tex * N / 5000;   // ก./ตร.ม. — น้ำหนักหลังเจียร์ (หน้าพรมสำเร็จ)
    const tuftWeight = S * R * Tex * N * TPL / 5000;  // ก./ตร.ม. — น้ำหนักก่อนเจียร์ (★ ใช้คำนวณสั่งย้อม)
    return { FPL, TPL, finWeight, tuftWeight };
  }
  // LOOP: ไม่มีการเจียร์ จึงมีน้ำหนักค่าเดียว
  function loopWeight({ S, R, PH, Tex, N }) {
    S = num(S); R = num(R); PH = num(PH); Tex = num(Tex); N = num(N);
    const PL = (100 / S) + 0.8 + PH * 2 + 1; // Pile Length (มม.)
    const weight = S * R * PL * Tex * N / 5000; // ก./ตร.ม.
    return { PL, weight };
  }
  // ★ น้ำหนักที่ใช้ตัดสินใจสั่งย้อม (กก./ตร.ม.) ตามกฎที่ยืนยันแล้ว: CUT/Tip-Shear ใช้ tuftWeight(ก่อนเจียร์), LOOP ใช้ weight
  function dyeWeightPerSqmKg(spec) {
    if (spec.structure === "loop") return loopWeight(spec).weight / 1000;
    return cutWeight(spec).tuftWeight / 1000;
  }

  function seedPresets() {
    const S = 28; // Stitch/10cm เท่ากันทุกความสูงในตารางต้นฉบับ (Wool)
    const heights = [
      { q: 35, R: 10, FPH: 8, TPH: 10, N: 4 },
      { q: 40, R: 11, FPH: 8, TPH: 10, N: 4 },
      { q: 45, R: 12, FPH: 9, TPH: 11, N: 4 },
      { q: 50, R: 12, FPH: 10, TPH: 12, N: 4 },
      { q: 55, R: 12, FPH: 11, TPH: 13, N: 4 },
      { q: 60, R: 12, FPH: 12, TPH: 14, N: 4 },
      { q: 65, R: 12, FPH: 13, TPH: 15, N: 4 },
      { q: 75, R: 12, FPH: 12, TPH: 14, N: 5 }
    ];
    const out = [];
    // HWO — ยืนยันตรงกับ Tufting Spec. sheet ทุกค่า (CUT + LOOP)
    heights.forEach((h) => {
      out.push({ id: uid("q"), yarnCode: "HWO", quality: String(h.q), structure: "cut", S, R: h.R, FPH: h.FPH, TPH: h.TPH, N: h.N, verified: true, label: `HWO ${h.q}C` });
      out.push({ id: uid("q"), yarnCode: "HWO", quality: String(h.q), structure: "loop", S, R: h.R, PH: h.FPH, N: h.N, verified: true, label: `HWO ${h.q}L` });
    });
    // HBBVC 45C — ยืนยันจากถอดสูตรย้อนกลับตรงกับตัวอย่างที่ผู้ใช้ยืนยัน (2.552 กก./ตร.ม.)
    out.push({ id: uid("q"), yarnCode: "BBVC", quality: "45", structure: "cut", S: 28, R: 12, FPH: 9, TPH: 11, N: 4, verified: true, label: "HBBVC 45C" });
    return out;
  }

  /* ============================================================
     3) ตารางประสิทธิภาพ 3 แผนก — จาก เกรดการทอ แต่ง.xlsx ชีต "GREAD รวม" (คัดลอกค่าตรงทุกตัว)
     จัดเกรดตาม % พื้นที่มีลวดลาย (% ลาย) ของดีไซน์
     ============================================================ */
  const WEAVE_GRADES = [
    { grade: "A", plainPct: 80, patternPct: 20, maxColor: 3, cut: true, loop: true, cutLoopSame: false, stitchDiff: "N", rateSqmPerHr: 0.42, size: "65×65 ซม.", wage: 800 },
    { grade: "B", plainPct: 60, patternPct: 40, maxColor: 5, cut: true, loop: true, cutLoopSame: false, stitchDiff: "N", rateSqmPerHr: 0.39, size: "62.5×62.5 ซม.", wage: 900 },
    { grade: "C", plainPct: 50, patternPct: 50, maxColor: 7, cut: true, loop: true, cutLoopSame: false, stitchDiff: "N", rateSqmPerHr: 0.30, size: "55×55 ซม.", wage: 1000 },
    { grade: "C+", plainPct: 40, patternPct: 60, maxColor: 9, cut: true, loop: true, cutLoopSame: false, stitchDiff: "N", rateSqmPerHr: 0.25, size: "50×50 ซม.", wage: 1000 },
    { grade: "D", plainPct: 30, patternPct: 70, maxColor: 12, cut: true, loop: true, cutLoopSame: true, stitchDiff: "D", rateSqmPerHr: 0.20, size: "45×45 ซม.", wage: 1100 },
    { grade: "D+", plainPct: 25, patternPct: 75, maxColor: 14, cut: true, loop: true, cutLoopSame: true, stitchDiff: "D", rateSqmPerHr: 0.15, size: "39×39 ซม.", wage: 1100 },
    { grade: "E", plainPct: 20, patternPct: 80, maxColor: 16, cut: true, loop: true, cutLoopSame: true, stitchDiff: "VD", rateSqmPerHr: 0.1296, size: "36×36 ซม.", wage: 1200 },
    { grade: "X", plainPct: 10, patternPct: 90, maxColor: 20, cut: true, loop: true, cutLoopSame: true, stitchDiff: "VD", rateSqmPerHr: 0.10, size: "31×31 ซม.", wage: 1200 },
    { grade: "Z", plainPct: 0, patternPct: 100, maxColor: ">20", cut: true, loop: true, cutLoopSame: true, stitchDiff: "VD", rateSqmPerHr: 0.05, size: "22×22 ซม.", wage: 1200 }
  ];
  const WAGE_GLUE_FINISH = 400; // ทากาว/แต่ง บาท (คงที่ทุกเกรด)

  const PUNCH_GRADES = [
    { grade: "A&B", method: "ฆ้อน", plainPct: 100, patternPct: 0, rateSqmPerHr: 1.25, note: "ตีกรอบ/ตีเส้นตามแปลน" },
    { grade: "C", method: "ฆ้อน", plainPct: 80, patternPct: 20, rateSqmPerHr: 1.15, note: "ลายห่าง 20% ของพื้นที่" },
    { grade: "D", method: "ฆ้อน", plainPct: 50, patternPct: 50, rateSqmPerHr: 0.45, note: "Repeat ทั้งหมด ลาย 50%" },
    { grade: "E", method: "ฆ้อน", plainPct: 20, patternPct: 80, rateSqmPerHr: 0.25, note: "ไม่ Repeat ลายเต็มผืน" },
    { grade: "E", method: "เครื่องเจาะ", plainPct: 20, patternPct: 80, rateSqmPerHr: 0.43, note: "ใช้เครื่องเจาะแทนฆ้อน" }
  ];

  const FINISH_GRADES = [
    { grade: "A", plainPct: 100, patternPct: 0, shearPct: null, rateSqmPerHr: 1.00, note: "ไม่มีลาย สีเดี่ยว" },
    { grade: "B", plainPct: 80, patternPct: 20, shearPct: 0.2, rateSqmPerHr: 0.75, note: "มีลาย 20%" },
    { grade: "C", plainPct: 50, patternPct: 50, shearPct: 0.5, rateSqmPerHr: 0.50, note: "มีลายไม่เกิน 50%" },
    { grade: "D", plainPct: 40, patternPct: 60, shearPct: 0.7, rateSqmPerHr: 0.40, note: "มีลายมากกว่า 50%" },
    { grade: "E", plainPct: 20, patternPct: 80, shearPct: 0.8, rateSqmPerHr: 0.16, note: "ลายจัด" },
    { grade: "X", plainPct: 10, patternPct: 90, shearPct: 0.9, rateSqmPerHr: 0.10, note: "ลายจัด / แกะลายพิเศษ" }
  ];

  function suggestGrade(table, patternPct) {
    const p = num(patternPct);
    const sorted = [...table].sort((a, b) => a.patternPct - b.patternPct);
    return sorted.find((g) => p <= g.patternPct) || sorted[sorted.length - 1];
  }

  /* ============================================================
     4) การจัดกลุ่มหม้อย้อม (Pot grouping) ตามกฎที่ยืนยันแล้ว
        - Loop และ Tip Shear รวมหม้อเดียวกันได้ (เนื้อไหมนุ่ม/ผสมกันได้)
        - Cut-to-Side และ Cut-to-Cut ต้องแยกหม้อเด็ดขาดจากกันและจากหม้อ Loop/TipShear
        - โซนสีเดียวกัน (colorCode ตรงกัน) + ประเภทเดียวกัน จะถูกรวมหม้อเดียวกันเสมอ
     ============================================================ */
  function potKeyOf(zone) {
    const soft = zone.weaveType === "loop" || zone.weaveType === "tipshear";
    const bucket = soft ? "SOFT" : zone.weaveType.toUpperCase(); // CUTSIDE / CUTCUT / CUSTOM
    // โซนกลุ่ม Loop/Tip Shear รวมหม้อเดียวกันได้เสมอตามค่าเริ่มต้น (ตามกฎที่ยืนยัน) เว้นแต่ระบุรหัสสีต่างกันชัดเจน
    // โซนกลุ่ม Cut (Cut-to-Side / Cut-to-Cut) ถ้าไม่ระบุรหัสสี ให้แยกหม้อต่อแถวไว้ก่อน (ปลอดภัยกว่า เพราะมักเป็นคนละสี)
    const colorKey = has(zone.colorCode) ? zone.colorCode.trim().toUpperCase() : (soft ? "DEFAULT" : `Z-${zone.id}`);
    return `${bucket}::${colorKey}`;
  }
  function potLabelOf(zone) {
    const soft = zone.weaveType === "loop" || zone.weaveType === "tipshear";
    const kind = soft ? "Loop/Tip Shear" : zone.weaveType === "cutside" ? "Cut to Side" : zone.weaveType === "cutcut" ? "Cut to Cut" : "อื่น ๆ";
    return has(zone.colorCode) ? `${kind} · สี ${zone.colorCode}` : `${kind}`;
  }

  function computeZone(zone, totalAreaSqm) {
    const areaSqm = zone.byArea ? num(zone.area) : totalAreaSqm * (num(zone.pct) / 100);
    const structure = (zone.weaveType === "loop") ? "loop" : "cut"; // tipshear ใช้สูตร cut (ก่อนเจียร์) ตามกฎที่ยืนยัน
    const spec = { structure, S: zone.S, R: zone.R, FPH: zone.FPH, TPH: zone.TPH, PH: zone.FPH, Tex: zone.Tex, N: zone.N };
    const weightPerSqmKg = (has(zone.S) && has(zone.Tex) && has(zone.N) && (structure === "loop" ? has(zone.FPH) : (has(zone.FPH) && has(zone.TPH)))) ? dyeWeightPerSqmKg(spec) : 0;
    const baseKg = areaSqm * weightPerSqmKg;
    return { ...zone, areaSqm, weightPerSqmKg, baseKg };
  }

  function computeDyePlan(zones, totalAreaSqm, bufferPct) {
    const computedZones = zones.map((z) => computeZone(z, totalAreaSqm));
    const potMap = new Map();
    computedZones.forEach((z) => {
      const key = potKeyOf(z);
      if (!potMap.has(key)) potMap.set(key, { key, label: potLabelOf(z), zones: [], baseKg: 0 });
      const pot = potMap.get(key);
      pot.zones.push(z);
      pot.baseKg += z.baseKg;
    });
    const pots = [...potMap.values()].map((p) => ({ ...p, netKg: p.baseKg * (1 + num(bufferPct) / 100) }));
    const totalPct = zones.reduce((t, z) => t + (z.byArea ? (totalAreaSqm ? num(z.area) / totalAreaSqm * 100 : 0) : num(z.pct)), 0);
    const totalBaseKg = pots.reduce((t, p) => t + p.baseKg, 0);
    const totalNetKg = pots.reduce((t, p) => t + p.netKg, 0);
    return { zones: computedZones, pots, totalPct, totalBaseKg, totalNetKg };
  }

  /* ============================================================
     5) ระยะเวลาผลิต — days = ceil( พื้นที่(ตร.ม.) / (อัตรา ตร.ม./ชม./คน × ชม./วัน × จำนวนคน) )
     ============================================================ */
  function deptDays(areaSqm, rateSqmPerHr, headcount, hoursPerDay) {
    const capacityPerDay = num(rateSqmPerHr) * num(headcount) * num(hoursPerDay);
    if (capacityPerDay <= 0) return 0;
    return Math.ceil((areaSqm / capacityPerDay) * 10) / 10; // ปัดทศนิยม 1 ตำแหน่งแบบ ceil
  }
  function dateToOffset(date) { return (date - ANCHOR_DATE) / 86400000; }
  function offsetToDate(off) { return new Date(ANCHOR_DATE.getTime() + off * 86400000); }
  function fmtThaiDate(d) {
    const months = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  }

  function computeSchedule(p) {
    const area = num(p.totalAreaSqm), hrs = num(p.hoursPerDay) || 8;
    const punchDays = Math.max(deptDays(area, p.punchRate, p.punchWorkers, hrs), 0.5);
    const dyeDays = Math.max(num(p.dyeDays), 0);
    const weaveDays = Math.max(deptDays(area, p.weaveRate, p.loomCount, hrs), 0.5);
    const finishDays = Math.max(deptDays(area, p.finishRate, p.finishWorkers, hrs), 0.5);
    const storeDays = 1;
    const startOffset = dateToOffset(new Date());
    let cursor = startOffset;
    const seg = (name, dept, color, dur) => { const s = cursor, e = cursor + dur; cursor = e; return { name, dept, color, start: s, end: e, days: dur }; };
    const segs = [
      seg("ตอกลาย/ขยายลาย", "Production", "production", punchDays),
      seg("สั่งย้อมไหม", "Dyeing", "dyeing", dyeDays || 0.5),
      seg("ทอพรม", "Weaving", "weaving", weaveDays),
      seg("ตกแต่ง/เจียร์", "Finishing", "finishing", finishDays),
      seg("ตรวจ/แพ็ค/สโตร์", "Store", "store", storeDays)
    ];
    const totalDays = Math.round((cursor - startOffset) * 10) / 10;
    return { punchDays, dyeDays, weaveDays, finishDays, storeDays, totalDays, segs, startDate: offsetToDate(startOffset), endDate: offsetToDate(cursor) };
  }

  /* ============================================================
     6) ต้นทุนแรงงานโดยประมาณ (สมมติฐาน: อัตราค่าแรงต่อเกรดในตาราง = บาท/ตร.ม. — โปรดยืนยันกับฝ่ายบัญชี/ฝ่ายผลิต)
     ============================================================ */
  function laborCost(area, weaveGrade) {
    const weaveWage = (weaveGrade ? weaveGrade.wage : 0) * area;
    const finishWage = WAGE_GLUE_FINISH * area;
    return { weaveWage, finishWage, total: weaveWage + finishWage };
  }

  /* ============================================================
     7) ใบสั่งย้อม (Dye Order) — ต่อยอดจากหม้อย้อมในข้อ 4
     หมายเหตุ: อัตราค่าใช้จ่ายทั้งหมด (ราคาไหม/ค่าจ้างย้อม/ค่ากรอ-ทวิส-ควบ/ค่า hank/% surcharge/% EPZ)
     ไม่มีข้อมูลต้นทางยืนยัน — ค่าเริ่มต้น = 0 ทุกช่อง ต้องกรอกอัตราจริงเองต่อออเดอร์/ผู้รับจ้าง
     ============================================================ */
  const DYE_METHODS = [
    { value: "CtoC", label: "Cone to Cone (C to C)" },
    { value: "hank", label: "Hank" },
    { value: "package", label: "Package" },
    { value: "other", label: "อื่น ๆ" }
  ];
  function isoDate(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
  function isoToDate(s) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "")); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
  function blankDyeOrder(dyeSeg) {
    return {
      source: "inhouse", vendor: "", lot: "", method: "CtoC", methodOther: "",
      rewind: false, twist: false, ply: false,
      buyYarn: false, yarnPricePerKg: 0, serviceFeePerKg: 0,
      special: false, surchargePct: 0,
      plyCostPerKg: 0, windCostPerKg: 0, twistCostPerKg: 0, hankCostPerKg: 0, epzPct: 0,
      issueDate: isoDate(offsetToDate(dyeSeg.start)), needDate: isoDate(offsetToDate(dyeSeg.end)),
      issueDateAuto: true, needDateAuto: true
    };
  }
  function dyeOrderCost(order, netKg) {
    netKg = num(netKg);
    const yarnCost = order.buyYarn ? netKg * num(order.yarnPricePerKg) : 0;
    const serviceCost = order.source === "outsource" ? netKg * num(order.serviceFeePerKg) : 0;
    const surcharge = order.special ? (yarnCost + serviceCost) * (num(order.surchargePct) / 100) : 0;
    const plyCost = order.ply ? netKg * num(order.plyCostPerKg) : 0;
    const windCost = order.rewind ? netKg * num(order.windCostPerKg) : 0;
    const twistCost = order.twist ? netKg * num(order.twistCostPerKg) : 0;
    const hankCost = order.method === "hank" ? netKg * num(order.hankCostPerKg) : 0;
    const subtotal = yarnCost + serviceCost + surcharge + plyCost + windCost + twistCost + hankCost;
    const epzTax = subtotal * (num(order.epzPct) / 100);
    return { yarnCost, serviceCost, surcharge, plyCost, windCost, twistCost, hankCost, subtotal, epzTax, total: subtotal + epzTax };
  }

  window.PlanningEngine = {
    YARN_TYPES_DEFAULT, cutWeight, loopWeight, dyeWeightPerSqmKg, seedPresets,
    WEAVE_GRADES, PUNCH_GRADES, FINISH_GRADES, WAGE_GLUE_FINISH, suggestGrade,
    potKeyOf, potLabelOf, computeZone, computeDyePlan,
    deptDays, dateToOffset, offsetToDate, fmtThaiDate, computeSchedule, laborCost,
    DYE_METHODS, isoDate, isoToDate, blankDyeOrder, dyeOrderCost,
    KEY_PRESETS, KEY_WORKERS, KEY_PLANS, readJson, writeJson
  };

  /* ============================================================
     7) หน้าจอ — ใบวางแผนงาน (job picker + ฟอร์ม 4 ส่วน + บันทึกเข้า Master Plan Gantt)
     ============================================================ */
  const WORKERS_DEFAULT = ["สมพร คิดแต่ง", "พนารัตน์ ทองสาย", "ปิ่นรัช อาจหาญ", "อรพินน์ ปู่จินะ", "สุพัฒตา แซ่โง้ว", "ปราณี แสงทอง", "PAN WAR", "รัตนา จ้อยประดิษฐ์", "NAN HTAY HTAY AUNG", "จุฑามาศ แสงหิรัญ", "THOMGDAM SI OUTHAI", "บุษบา เพียรักษ์", "อภิเชษ เพียรักษ์", "AYE WIN THEIN", "HKIN SU HLAING", "KHUM"];
  const WEAVE_TYPE_LABEL = { loop: "Loop", tipshear: "Tip Shear", cutside: "Cut to Side", cutcut: "Cut to Cut", custom: "Cut (อื่น ๆ)" };

  function loadPresets() { const p = readJson(KEY_PRESETS, null); return Array.isArray(p) && p.length ? p : (() => { const seeded = seedPresets(); writeJson(KEY_PRESETS, seeded); return seeded; })(); }
  function loadWorkers() { const w = readJson(KEY_WORKERS, null); return Array.isArray(w) && w.length ? w : (() => { writeJson(KEY_WORKERS, WORKERS_DEFAULT); return WORKERS_DEFAULT.slice(); })(); }
  function saveWorkers(list) { writeJson(KEY_WORKERS, list); }
  // หมายเหตุ: การเพิ่ม/ลบ/นำเข้า/ส่งออกรายชื่อพนักงาน จัดการที่แท็บ "แผนกทอ (จอทอรายวัน)" แล้ว (ใช้คีย์ localStorage ร่วมกัน — KEY_WORKERS)
  function loadPlans() { return readJson(KEY_PLANS, {}); }
  function savePlan(designId, plan) { const all = loadPlans(); all[designId] = plan; writeJson(KEY_PLANS, all); }

  // สร้างโซนใหม่ 1 แถว — ให้ "AI" (ระบบ) เลือกคุณภาพ (preset) ที่ใกล้เคียงที่สุดให้อัตโนมัติ แทนที่จะบังคับกรอกพารามิเตอร์ทอเองทุกครั้ง
  // like: โซนก่อนหน้า (ใช้เทคนิคทอ/ชนิดไหมเดียวกันต่อ) — ไม่ระบุ = เริ่มจากค่าเริ่มต้นมาตรฐาน (HWO 45, Cut to Side)
  function blankZone(like, presets) {
    const yarnCode = (like && like.yarnCode) || "HWO";
    const weaveType = (like && like.weaveType) || "cutside";
    const structure = weaveType === "loop" ? "loop" : "cut";
    const yt = YARN_TYPES_DEFAULT.find((y) => y.code === yarnCode) || YARN_TYPES_DEFAULT[0];
    const zone = { id: uid("z"), name: "", colorCode: "", weaveType, byArea: false, pct: 0, area: 0, presetId: "", yarnCode: yt.code, S: 28, R: 12, FPH: 9, TPH: 11, N: 4, Tex: yt.tex };
    const list = presets || [];
    const preset = list.find((p) => p.yarnCode === yt.code && p.structure === structure && p.quality === "45") || list.find((p) => p.yarnCode === yt.code && p.structure === structure);
    if (preset) applyPresetToZone(zone, preset);
    return zone;
  }
  function blankPlan(designId, moNo, totalAreaSqm) {
    return {
      designId, moNo: moNo || "", totalAreaSqm: totalAreaSqm || 0, areaSource: totalAreaSqm ? "auto" : "manual",
      patternPct: 50, weaveGradeOverride: "", punchMethodOverride: "", finishGradeOverride: "",
      bufferPct: 10, zones: [blankZone(null, loadPresets())],
      hoursPerDay: 8, loomCount: 2, punchWorkers: 1, finishWorkers: 2, dyeDays: 3,
      weaveWorkers: [], punchWorkerNames: [], finishWorkerNames: [], dyeOrders: {}, savedAt: null
    };
  }

  function moInfoFor(designId) {
    const row = designs.find((d) => d.id === designId);
    let totalAreaSqm = 0, moNo = row && row.moNo;
    try {
      if (typeof SalesEngine !== "undefined" && SalesEngine.getDocs) {
        const doc = SalesEngine.getDocs().find((d) => d.designId === designId && d.type === "MO");
        if (doc) { moNo = doc.no || moNo; totalAreaSqm = (doc.lines || []).reduce((t, l) => t + num(l.sqm), 0); }
      }
    } catch (e) { /* ไม่มี SalesEngine ก็ให้กรอกพื้นที่เอง */ }
    return { row, moNo, totalAreaSqm };
  }

  const state = { designId: null, plan: null, editGrades: false };

  function ensurePlan(designId) {
    const all = loadPlans();
    if (all[designId]) { if (!all[designId].dyeOrders) all[designId].dyeOrders = {}; return all[designId]; }
    const info = moInfoFor(designId);
    return blankPlan(designId, info.moNo, info.totalAreaSqm);
  }

  function field(label, inner, cls = "") { return `<label class="pf ${cls}">${label}${inner}</label>`; }
  function inp(name, value, attrs = "") { return `<input name="${esc(name)}" value="${esc(value == null ? "" : value)}" inputmode="decimal" ${attrs}>`; }
  function res(label, value, cls = "") { return `<div class="pr ${cls}"><small>${label}</small><strong>${value}</strong></div>`; }

  function jobPickerHtml() {
    // sample:true = ข้อมูลตัวอย่างของระบบ (ไม่ใช่งานจริงของบริษัท) ไม่ควรปนกับคิว Planning จริง
    const opened = designs.filter((d) => d.job === "OPENED" && !d.sample);
    const plans = loadPlans();
    if (!opened.length) return `<p class="col-empty">ยังไม่มี Job ที่ฝ่ายขายส่งมา Planning</p>`;
    return `<div class="pw-job-grid">${opened.map((d) => {
      const has_plan = Boolean(plans[d.id] && plans[d.id].savedAt);
      return `<button type="button" class="pw-job-card dept-planning ${state.designId === d.id ? "active" : ""}" data-pick="${esc(d.id)}">
        <strong>${esc(d.id)}</strong><span>${esc(d.project)}</span><small>${esc(d.moNo || "ยังไม่มีเลข M/O")}</small>
        ${tag(has_plan ? "วางแผนแล้ว" : "รอวางแผน", has_plan ? "" : "review")}
      </button>`;
    }).join("")}</div>`;
  }

  function presetOptionsHtml(zone, presets) {
    const structure = zone.weaveType === "loop" ? "loop" : "cut";
    const opts = presets.filter((p) => p.yarnCode === zone.yarnCode && p.structure === structure);
    return `<option value="">— กำหนดพารามิเตอร์เอง —</option>${opts.map((p) => `<option value="${p.id}" ${zone.presetId === p.id ? "selected" : ""}>${esc(p.label)}${p.verified ? " ✓" : ""}</option>`).join("")}`;
  }

  // สรุปพารามิเตอร์ทอแบบอ่านอย่างเดียว — แสดงแทนช่องกรอกเมื่อเลือกคุณภาพ (preset) แล้ว เพื่อไม่ให้ต้องเห็น/กรอกตัวเลขทางเทคนิคทุกแถว
  function zoneParamsSummary(zone) {
    const isLoop = zone.weaveType === "loop";
    return isLoop
      ? `S${esc(zone.S)} · R${esc(zone.R)} · PH${esc(zone.FPH)}มม. · Tex${esc(zone.Tex)} · N${esc(zone.N)}`
      : `S${esc(zone.S)} · R${esc(zone.R)} · FPH${esc(zone.FPH)}/TPH${esc(zone.TPH)}มม. · Tex${esc(zone.Tex)} · N${esc(zone.N)}`;
  }

  function zoneRowHtml(zone, idx, presets, computed) {
    const isLoop = zone.weaveType === "loop";
    const custom = !zone.presetId;
    const w = computed ? computed.weightPerSqmKg : 0, a = computed ? computed.areaSqm : 0, kg = computed ? computed.baseKg : 0;
    return `<tr data-zone="${zone.id}">
      <td>${idx + 1}</td>
      <td><input name="colorCode" value="${esc(zone.colorCode)}" placeholder="เช่น 34B" class="pw-colorcode"></td>
      <td><select name="weaveType">${Object.entries(WEAVE_TYPE_LABEL).map(([k, v]) => `<option value="${k}" ${zone.weaveType === k ? "selected" : ""}>${v}</option>`).join("")}</select></td>
      <td class="pw-pctarea">
        <label class="pw-toggle"><input type="checkbox" name="byArea" ${zone.byArea ? "checked" : ""}> ตร.ม.</label>
        ${zone.byArea ? `<input name="area" value="${esc(zone.area)}" inputmode="decimal" class="pw-num">` : `<input name="pct" value="${esc(zone.pct)}" inputmode="decimal" class="pw-num">%`}
      </td>
      <td class="pw-quality">
        <select name="presetId" class="pw-preset">${presetOptionsHtml(zone, presets)}</select>
        ${custom ? `<div class="pw-params">
          <select name="yarnCode" title="ชนิดไหม">${YARN_TYPES_DEFAULT.map((y) => `<option value="${y.code}" ${zone.yarnCode === y.code ? "selected" : ""}>${y.code}</option>`).join("")}</select>
          <input name="S" value="${esc(zone.S)}" title="Stitch/10ซม." placeholder="S" class="pw-num tiny">
          <input name="R" value="${esc(zone.R)}" title="Row/5ซม." placeholder="R" class="pw-num tiny">
          <input name="FPH" value="${esc(zone.FPH)}" title="${isLoop ? "Pile Height (มม.)" : "Fin Pile Height หลังเจียร์ (มม.)"}" placeholder="${isLoop ? "PH" : "FPH"}" class="pw-num tiny">
          ${isLoop ? "" : `<input name="TPH" value="${esc(zone.TPH)}" title="Tuft Pile Height ก่อนเจียร์ (มม.)" placeholder="TPH" class="pw-num tiny">`}
          <input name="Tex" value="${esc(zone.Tex)}" title="Tex" placeholder="Tex" class="pw-num tiny">
          <input name="N" value="${esc(zone.N)}" title="จำนวนเส้นไหม" placeholder="N" class="pw-num tiny">
        </div>` : `<small class="pw-params-readout">${zoneParamsSummary(zone)}</small>`}
      </td>
      <td class="num">${w ? fmt(w, 3) : "-"}</td>
      <td class="num">${a ? fmt(a, 3) : "-"}</td>
      <td class="num"><strong>${kg ? fmt(kg, 3) : "-"}</strong></td>
      <td><button type="button" class="square-btn" data-del-zone="${zone.id}" title="ลบแถว">×</button></td>
    </tr>`;
  }

  function gradeTagHtml(label, grade, extra = "") {
    if (!grade) return `<div class="pr"><small>${label}</small><strong>-</strong></div>`;
    return `<div class="pr"><small>${label}</small><strong>เกรด ${grade.grade}</strong><span>${extra}</span></div>`;
  }

  // ผูก "ใบสั่งย้อม" แต่ละหม้อกับหม้อย้อมที่คำนวณสด ๆ ทุกครั้ง — สร้างค่าเริ่มต้นถ้ายังไม่มี และซิงก์วันที่กับ Master Plan ถ้ายังไม่ถูก override เอง
  function syncDyeOrders(p, pots, dyeSeg) {
    const seen = new Set();
    pots.forEach((pot) => {
      seen.add(pot.key);
      if (!p.dyeOrders[pot.key]) p.dyeOrders[pot.key] = blankDyeOrder(dyeSeg);
      const o = p.dyeOrders[pot.key];
      if (o.issueDateAuto !== false) o.issueDate = isoDate(offsetToDate(dyeSeg.start));
      if (o.needDateAuto !== false) o.needDate = isoDate(offsetToDate(dyeSeg.end));
    });
    return pots.map((pot) => ({ pot, order: p.dyeOrders[pot.key] }));
  }

  function dyeOrderCardHtml(pot, order, dyeSeg) {
    const cost = dyeOrderCost(order, pot.netKg);
    const isOut = order.source === "outsource";
    const issueMismatch = !order.issueDateAuto && order.issueDate !== isoDate(offsetToDate(dyeSeg.start));
    const needMismatch = !order.needDateAuto && order.needDate !== isoDate(offsetToDate(dyeSeg.end));
    const firstZone = pot.zones[0] || {};
    return `<div class="pw-dye-card" data-pot="${esc(pot.key)}">
      <div class="pw-dye-head">
        <strong>${esc(pot.label)}</strong>
        <span>${esc(firstZone.yarnCode || "-")} · Tex ${esc(firstZone.Tex || "-")} · ${fmt(pot.netKg, 3)} กก.</span>
      </div>
      <div class="pw-dye-grid">
        <label class="pf">แหล่งย้อม<select name="source">${[["inhouse", "ย้อมภายในบริษัท"], ["outsource", "จ้างย้อมบริษัทอื่น"]].map(([v, t]) => `<option value="${v}" ${order.source === v ? "selected" : ""}>${t}</option>`).join("")}</select></label>
        ${isOut ? field("ชื่อผู้รับจ้างย้อม", inp("vendor", order.vendor, 'inputmode="text"')) : ""}
        ${field("Yarn Lot", inp("lot", order.lot, 'inputmode="text"'))}
        <label class="pf">วิธีย้อม<select name="method">${DYE_METHODS.map((m) => `<option value="${m.value}" ${order.method === m.value ? "selected" : ""}>${m.label}</option>`).join("")}</select></label>
        ${order.method === "other" ? field("ระบุวิธีย้อม", inp("methodOther", order.methodOther, 'inputmode="text"')) : ""}
      </div>
      <div class="pw-dye-flags">
        <label><input type="checkbox" name="rewind" ${order.rewind ? "checked" : ""}> ต้องกรอไหม</label>
        <label><input type="checkbox" name="twist" ${order.twist ? "checked" : ""}> ต้องทวิสไหม</label>
        <label><input type="checkbox" name="ply" ${order.ply ? "checked" : ""}> ต้องควบไหม</label>
      </div>
      ${isOut ? `<details class="pw-dye-cost-detail"><summary>รายละเอียดต้นทุนจ้างย้อม (ราคาไหม/ค่าจ้าง/surcharge/EPZ)</summary><div class="pw-dye-grid">
        <label class="pf tiny">ค่าจ้างย้อม (บาท/กก.)${inp("serviceFeePerKg", order.serviceFeePerKg, 'class="pw-num"')}</label>
        <label class="pf"><input type="checkbox" name="buyYarn" ${order.buyYarn ? "checked" : ""}> บริษัทซื้อไหมเอง</label>
        ${order.buyYarn ? field("ราคาไหม (บาท/กก.)", inp("yarnPricePerKg", order.yarnPricePerKg, 'class="pw-num"')) : ""}
        <label class="pf"><input type="checkbox" name="special" ${order.special ? "checked" : ""}> ไหมชนิดพิเศษ (surcharge)</label>
        ${order.special ? field("Surcharge (%)", inp("surchargePct", order.surchargePct, 'class="pw-num"')) : ""}
        ${order.ply ? field("ค่าควบ (บาท/กก.)", inp("plyCostPerKg", order.plyCostPerKg, 'class="pw-num"')) : ""}
        ${order.rewind ? field("ค่ากรอ (บาท/กก.)", inp("windCostPerKg", order.windCostPerKg, 'class="pw-num"')) : ""}
        ${order.twist ? field("ค่าทวิส (บาท/กก.)", inp("twistCostPerKg", order.twistCostPerKg, 'class="pw-num"')) : ""}
        ${order.method === "hank" ? field("ค่า Hank (บาท/กก.)", inp("hankCostPerKg", order.hankCostPerKg, 'class="pw-num"')) : ""}
        ${field("ภาษี EPZ (%)", inp("epzPct", order.epzPct, 'class="pw-num"'))}
      </div></details>` : ""}
      <div class="pw-dye-grid">
        <label class="pf ${issueMismatch ? "warn-label" : ""}">วันที่เปิดใบสั่งย้อม<input type="date" name="issueDate" value="${esc(order.issueDate)}"></label>
        <label class="pf ${needMismatch ? "warn-label" : ""}">วันที่ต้องการไหม<input type="date" name="needDate" value="${esc(order.needDate)}"></label>
        ${issueMismatch || needMismatch ? `<span class="pw-dye-warn">⚠ ไม่ตรงกับ Master Plan (สั่งย้อม ${fmtThaiDate(offsetToDate(dyeSeg.start))} – ${fmtThaiDate(offsetToDate(dyeSeg.end))})</span>` : ""}
      </div>
      ${isOut ? `<div class="pw-dye-cost">รวมค่าใช้จ่าย: <strong>${fmt(cost.total, 0)} บาท</strong><small> (ไหม ${fmt(cost.yarnCost, 0)} + ค่าจ้างย้อม ${fmt(cost.serviceCost, 0)} + surcharge ${fmt(cost.surcharge, 0)} + กรอ/ทวิส/ควบ ${fmt(cost.windCost + cost.twistCost + cost.plyCost, 0)} + hank ${fmt(cost.hankCost, 0)} + EPZ ${fmt(cost.epzTax, 0)})</small></div>` : `<div class="pw-dye-cost muted">ย้อมภายในบริษัท — ไม่คิดค่าจ้างย้อม/surcharge ภายนอก</div>`}
    </div>`;
  }

  function buildForm() {
    const p = state.plan, presets = loadPresets(), workers = loadWorkers();
    const weaveGrade = p.weaveGradeOverride ? WEAVE_GRADES.find((g) => g.grade === p.weaveGradeOverride) : suggestGrade(WEAVE_GRADES, p.patternPct);
    const punchGrade = p.punchMethodOverride ? PUNCH_GRADES.find((g) => `${g.grade}|${g.method}` === p.punchMethodOverride) : suggestGrade(PUNCH_GRADES, p.patternPct);
    const finishGrade = p.finishGradeOverride ? FINISH_GRADES.find((g) => g.grade === p.finishGradeOverride) : suggestGrade(FINISH_GRADES, p.patternPct);

    const dye = computeDyePlan(p.zones, num(p.totalAreaSqm), p.bufferPct);
    const sched = computeSchedule({
      totalAreaSqm: num(p.totalAreaSqm), hoursPerDay: p.hoursPerDay,
      punchRate: punchGrade ? punchGrade.rateSqmPerHr : 0, punchWorkers: p.punchWorkers,
      dyeDays: p.dyeDays,
      weaveRate: weaveGrade ? weaveGrade.rateSqmPerHr : 0, loomCount: p.loomCount,
      finishRate: finishGrade ? finishGrade.rateSqmPerHr : 0, finishWorkers: p.finishWorkers
    });
    const cost = laborCost(num(p.totalAreaSqm), weaveGrade);
    const info = designs.find((d) => d.id === p.designId) || {};
    const pctSum = p.zones.reduce((t, z) => t + (z.byArea ? (num(p.totalAreaSqm) ? num(z.area) / num(p.totalAreaSqm) * 100 : 0) : num(z.pct)), 0);
    const dyeSeg = sched.segs[1];
    const dyeOrderRows = syncDyeOrders(p, dye.pots, dyeSeg);
    const dyeOrderGrandTotal = dyeOrderRows.reduce((t, r) => t + (r.order.source === "outsource" ? dyeOrderCost(r.order, r.pot.netKg).total : 0), 0);

    const showGradeEdit = Boolean(state.editGrades || p.weaveGradeOverride || p.punchMethodOverride || p.finishGradeOverride);

    return `
    <section class="department-panel pw-card">
      <div class="panel-heading"><div><strong>1) ข้อมูลงาน + สเปคการทอ</strong><small>ดึงจาก M/O ที่ฝ่ายขายเปิด · กรอก % ลาย แล้วระบบแนะนำเกรดทอ/ตอกลาย/ตกแต่งให้อัตโนมัติ (AI ช่วยเลือกให้ ปรับเองได้)</small></div></div>
      <div class="pw-body">
        <div class="pw-row">
          ${res("Design", esc(p.designId))}${res("M/O", esc(p.moNo || "-"))}${res("โปรเจกต์", esc(info.project || "-"))}${res("ลูกค้า", esc(info.customer || "-"))}
          ${field("พื้นที่รวม (ตร.ม.)", inp("totalAreaSqm", p.totalAreaSqm, 'class="pw-num"'))}
          ${field("% พื้นที่มีลวดลาย (% ลาย)", inp("patternPct", p.patternPct, 'class="pw-num"'))}
        </div>
        ${showGradeEdit ? `<div class="pw-row">
          ${field("เกรดทอ (เว้นว่าง = อัตโนมัติ)", `<select name="weaveGradeOverride"><option value="">อัตโนมัติ</option>${WEAVE_GRADES.map((g) => `<option value="${g.grade}" ${p.weaveGradeOverride === g.grade ? "selected" : ""}>${g.grade}</option>`).join("")}</select>`)}
          ${field("วิธีตอกลาย (เกรด E เลือกได้)", `<select name="punchMethodOverride"><option value="">อัตโนมัติ</option>${PUNCH_GRADES.map((g) => `<option value="${g.grade}|${g.method}" ${p.punchMethodOverride === `${g.grade}|${g.method}` ? "selected" : ""}>${g.grade} (${g.method})</option>`).join("")}</select>`)}
          ${field("เกรดตกแต่ง (เว้นว่าง = อัตโนมัติ)", `<select name="finishGradeOverride"><option value="">อัตโนมัติ</option>${FINISH_GRADES.map((g) => `<option value="${g.grade}" ${p.finishGradeOverride === g.grade ? "selected" : ""}>${g.grade}</option>`).join("")}</select>`)}
        </div>` : `<div class="pw-row"><button type="button" class="text-button" data-toggle-grade-edit>ปรับเกรดเอง</button></div>`}
        <div class="pw-res-row">
          ${gradeTagHtml("เกรดทอ", weaveGrade, weaveGrade ? `Max ${weaveGrade.maxColor} สี · ${weaveGrade.cutLoopSame ? "ทำ Cut+Loop ผืนเดียวกันได้" : "ห้าม Cut+Loop ผืนเดียวกัน"} · ก้าว ${weaveGrade.stitchDiff} · ${fmt(weaveGrade.rateSqmPerHr, 4)} ตร.ม./ชม./คน · ${weaveGrade.size}` : "")}
          ${gradeTagHtml("เกรดตอกลาย", punchGrade, punchGrade ? `${punchGrade.method} · ${fmt(punchGrade.rateSqmPerHr, 2)} ตร.ม./ชม./คน · ${punchGrade.note}` : "")}
          ${gradeTagHtml("เกรดตกแต่ง", finishGrade, finishGrade ? `${finishGrade.shearPct != null ? `เจียร์ ${finishGrade.shearPct * 100}%` : "ไม่เจียร์"} · ${fmt(finishGrade.rateSqmPerHr, 2)} ตร.ม./ชม./คน · ${finishGrade.note}` : "")}
        </div>
      </div>
    </section>

    <section class="department-panel pw-card wide">
      <div class="panel-heading"><div><strong>2) คำนวณน้ำหนักไหมสั่งย้อม</strong><small>ระบุสี/สัดส่วน แล้วเลือก "คุณภาพ" ให้ AI คำนวณน้ำหนักไหมให้ (สูตร Stitch/Row/Pile Height/Tex/จำนวนเส้นไหม อ้างอิงไฟล์ Tufting Spec. ของฝ่ายผลิต) — เลือก "กำหนดพารามิเตอร์เอง" เฉพาะกรณีสเปคพิเศษเท่านั้น</small></div>
        <button type="button" class="action-button" data-add-zone>+ เพิ่มโซนสี</button>
      </div>
      <div class="pw-body">
        <div class="pw-row">
          ${field("จำนวนสี", `<input id="pwAutoColorCount" type="number" min="1" max="20" value="${p.zones.length || 3}" class="pw-num tiny">`)}
          <button type="button" class="action-button" data-auto-zones>AI สร้างแถวสีให้ (แบ่ง % เท่ากัน)</button>
          <small class="muted">สร้างแถวใหม่ตามจำนวนสีที่ระบุ แบ่งเปอร์เซ็นต์เท่า ๆ กันให้อัตโนมัติ (แทนที่รายการเดิม) — ค่อยแก้รหัสสี/% เองภายหลัง</small>
        </div>
        <div class="pw-zone-scroll"><table class="calc-table pw-zone-table">
          <thead><tr><th>#</th><th>รหัสสี</th><th>เทคนิคทอ</th><th>สัดส่วน</th><th>คุณภาพ</th><th class="num">น้ำหนัก (กก./ตร.ม.)</th><th class="num">พื้นที่ (ตร.ม.)</th><th class="num">น้ำหนักไหม (กก.)</th><th></th></tr></thead>
          <tbody id="pwZoneBody">${dye.zones.map((z, i) => zoneRowHtml(z, i, presets, z)).join("")}</tbody>
        </table></div>
        <div class="pw-row">
          ${res("รวม % ที่กรอก", `${fmt(pctSum, 2)}%`, Math.abs(pctSum - 100) > 0.5 && p.zones.some((z) => !z.byArea) ? "warn" : "")}
          ${field("บวกเผื่อ (%)", inp("bufferPct", p.bufferPct, 'class="pw-num"'))}
          ${res("น้ำหนักไหมฐานรวม", `${fmt(dye.totalBaseKg, 3)} กก.`)}
          ${res("ยอดสั่งย้อมสุทธิ (รวมเผื่อ)", `${fmt(dye.totalNetKg, 3)} กก.`, "main")}
        </div>
        <div class="pw-pot-scroll"><table class="calc-table">
          <thead><tr><th>หม้อย้อม</th><th>จำนวนโซน</th><th class="num">น้ำหนักฐาน (กก.)</th><th class="num">สั่งย้อมสุทธิ +${fmt(num(p.bufferPct), 0)}% (กก.)</th></tr></thead>
          <tbody>${dye.pots.length ? dye.pots.map((pot) => `<tr><td>${esc(pot.label)}</td><td>${pot.zones.length}</td><td class="num">${fmt(pot.baseKg, 3)}</td><td class="num"><strong>${fmt(pot.netKg, 3)}</strong></td></tr>`).join("") : `<tr><td colspan="4" class="empty-gantt">ยังไม่มีโซน</td></tr>`}</tbody>
        </table></div>
      </div>
    </section>

    <section class="department-panel pw-card">
      <div class="panel-heading"><div><strong>3) กำลังคนและระยะเวลาผลิต</strong><small>ระบบตั้งค่าเริ่มต้นให้แล้ว ปรับได้ตามจริง — วัน = พื้นที่ ÷ (อัตรา ตร.ม./ชม./คน ตามเกรด × ชม./วัน × จำนวนคน) ต่อเนื่องจากแผนกก่อนหน้าเป็น Master Plan</small></div></div>
      <div class="pw-body">
        <div class="pw-row">
          ${field("ชม.ทำงาน/วัน", inp("hoursPerDay", p.hoursPerDay, 'class="pw-num tiny"'))}
          ${field("จำนวนหัวทอ (คน/loom)", inp("loomCount", p.loomCount, 'class="pw-num tiny"'))}
          ${field("คนตอกลาย/ขยายลาย", inp("punchWorkers", p.punchWorkers, 'class="pw-num tiny"'))}
          ${field("คนตกแต่ง", inp("finishWorkers", p.finishWorkers, 'class="pw-num tiny"'))}
          ${field("Lead time ย้อม (วัน)", inp("dyeDays", p.dyeDays, 'class="pw-num tiny"'))}
        </div>
        <div class="pw-sched-scroll"><table class="calc-table">
          <thead><tr><th>แผนก</th><th>งาน</th><th class="num">ระยะเวลา (วัน)</th><th>เริ่ม</th><th>เสร็จ</th></tr></thead>
          <tbody>${sched.segs.map((s) => `<tr><td><span class="legend ${s.color}"></span>${s.dept}</td><td>${esc(s.name)}</td><td class="num">${fmt(s.days, 1)}</td><td>${fmtThaiDate(offsetToDate(s.start))}</td><td>${fmtThaiDate(offsetToDate(s.end))}</td></tr>`).join("")}</tbody>
        </table></div>
        <div class="pw-row"><span class="tag-total">รวมระยะเวลาผลิตทั้งหมด ≈ ${fmt(sched.totalDays, 1)} วัน (${fmtThaiDate(sched.startDate)} – ${fmtThaiDate(sched.endDate)})</span></div>
      </div>
    </section>

    <section class="department-panel pw-card wide">
      <div class="panel-heading"><div><strong>4) ใบสั่งย้อม (Dye Order)</strong><small>ต่อยอดจากหม้อย้อมในข้อ 2 · วันที่เปิดใบสั่ง/ต้องการไหมผูกกับกำหนดการ "สั่งย้อมไหม" ใน Master Plan (ข้อ 3) อัตโนมัติ แก้เองได้แต่จะเตือนถ้าไม่ตรง</small></div></div>
      <div class="pw-body">
        ${dyeOrderRows.length ? `<div class="pw-dye-grid-outer">${dyeOrderRows.map((r) => dyeOrderCardHtml(r.pot, r.order, dyeSeg)).join("")}</div>` : `<p class="col-empty">ยังไม่มีหม้อย้อม — เพิ่มโซนในข้อ 2 ก่อน</p>`}
        ${dyeOrderRows.some((r) => r.order.source === "outsource") ? `<div class="pw-row"><span class="tag-total">รวมค่าใช้จ่ายจ้างย้อมภายนอกทั้งหมด ≈ ${fmt(dyeOrderGrandTotal, 0)} บาท</span></div>` : ""}
      </div>
    </section>

    <section class="department-panel pw-card">
      <div class="panel-heading"><div><strong>5) ต้นทุนแรงงานโดยประมาณ</strong><small>สมมติฐาน: อัตราค่าแรงตามเกรด (800–1200 บาท) และค่าแต่ง/ทากาว (400 บาท) เป็น "บาท/ตร.ม." — โปรดยืนยันหน่วยจริงกับฝ่ายบัญชีก่อนใช้งานจริง</small></div></div>
      <div class="pw-body">
        <div class="pw-row">
          ${res("ค่าแรงทอ (โดยประมาณ)", `${fmt(cost.weaveWage, 0)} บาท`)}
          ${res("ค่าแรงทากาว/แต่ง (โดยประมาณ)", `${fmt(cost.finishWage, 0)} บาท`)}
          ${res("รวมค่าแรงโดยประมาณ", `${fmt(cost.total, 0)} บาท`, "main")}
        </div>
        <p class="col-empty" style="text-align:left;padding:8px 2px 0">พนักงานทอ/ตกแต่ง ${workers.length} คน — จัดการรายชื่อและเงินเดือนได้ที่แท็บ "แผนกทอ (จอทอรายวัน)" (ใช้รายชื่อร่วมกันทุก M/O)</p>
      </div>
    </section>

    <div class="pw-save-bar"><button type="button" class="action-button primary" data-save-plan>บันทึกแผนและส่งเข้า Master Plan Gantt</button>${p.savedAt ? `<small>บันทึกล่าสุด ${new Date(p.savedAt).toLocaleString("th-TH")}</small>` : ""}</div>`;
  }

  function build() {
    const root = $("#planworkView");
    root.innerHTML = `
      <section class="page-heading">
        <div>
          <p class="eyebrow">PLANNING DEPARTMENT</p>
          <h1>ใบวางแผนงาน (Planning Worksheet)</h1>
          <p class="subtitle">รับใบงานจากฝ่ายขาย → ตรวจรายละเอียดงาน → กำหนด Spec การทอ → คำนวณน้ำหนักไหมสั่งย้อม → คำนวณระยะเวลาผลิตแต่ละแผนก</p>
        </div>
      </section>
      <section class="department-panel pw-card">
        <div class="panel-heading"><div><strong>เลือก Job ที่ฝ่ายขายส่งมา</strong><small>คลิกเพื่อเปิด/แก้ไขใบวางแผนงาน</small></div></div>
        <div class="pw-body" id="pwJobPicker"></div>
      </section>
      <div id="pwForm"></div>`;
  }

  function renderJobPicker() { $("#pwJobPicker").innerHTML = jobPickerHtml(); }
  function renderForm() { $("#pwForm").innerHTML = state.plan ? buildForm() : `<p class="col-empty">เลือก Job ด้านบนเพื่อเริ่มวางแผน</p>`; }
  function renderAll() { renderJobPicker(); renderForm(); }

  function pickJob(id) {
    state.designId = id;
    state.plan = ensurePlan(id);
    renderAll();
  }

  function zoneById(id) { return state.plan.zones.find((z) => z.id === id); }

  function applyPresetToZone(zone, preset) {
    zone.presetId = preset.id;
    zone.S = preset.S; zone.R = preset.R; zone.N = preset.N; zone.yarnCode = preset.yarnCode;
    const yt = YARN_TYPES_DEFAULT.find((y) => y.code === preset.yarnCode);
    zone.Tex = yt ? yt.tex : preset.Tex || zone.Tex;
    if (preset.structure === "loop") { zone.FPH = preset.PH; zone.TPH = ""; }
    else { zone.FPH = preset.FPH; zone.TPH = preset.TPH; }
  }
  function applyPreset(zone, presetId) {
    if (!presetId) { zone.presetId = ""; return; }
    const preset = loadPresets().find((p) => p.id === presetId);
    if (!preset) return;
    applyPresetToZone(zone, preset);
  }

  let built = false;
  function renderPlanWork() {
    if (!built) { build(); built = true; bind(); }
    renderAll();
  }

  function bind() {
    const root = $("#planworkView");
    root.addEventListener("click", (e) => {
      const pick = e.target.closest("[data-pick]");
      if (pick) { pickJob(pick.dataset.pick); return; }
      const addZone = e.target.closest("[data-add-zone]");
      if (addZone) {
        const prev = state.plan.zones[state.plan.zones.length - 1] || null;
        state.plan.zones.push(blankZone(prev, loadPresets()));
        renderForm();
        return;
      }
      const delZone = e.target.closest("[data-del-zone]");
      if (delZone) { state.plan.zones = state.plan.zones.filter((z) => z.id !== delZone.dataset.delZone); renderForm(); return; }
      const save = e.target.closest("[data-save-plan]");
      if (save) { commitPlan(); return; }
      const toggleGrade = e.target.closest("[data-toggle-grade-edit]");
      if (toggleGrade) { state.editGrades = true; renderForm(); return; }
      const autoZones = e.target.closest("[data-auto-zones]");
      if (autoZones) {
        const input = $("#pwAutoColorCount");
        let n = Math.round(Number(input ? input.value : 0));
        if (!n || n < 1) n = 1;
        if (n > 20) n = 20;
        if (state.plan.zones.length && !confirm(`สร้างแถวสีใหม่ ${n} แถว จะแทนที่รายการสีเดิมทั้งหมด ต้องการดำเนินการต่อหรือไม่?`)) return;
        const presets = loadPresets();
        const template = state.plan.zones[0] || null;
        const zones = [];
        const base = Math.floor(1000 / n);
        let used = 0;
        for (let i = 0; i < n; i++) {
          const z = blankZone(template, presets);
          const pctThousandths = i === n - 1 ? 1000 - used : base;
          used += pctThousandths;
          z.pct = Math.round(pctThousandths) / 10;
          zones.push(z);
        }
        state.plan.zones = zones;
        renderForm();
        return;
      }
    });
    root.addEventListener("input", (e) => {
      if (!state.plan) return;
      const zoneRow = e.target.closest("[data-zone]");
      if (zoneRow) {
        const zone = zoneById(zoneRow.dataset.zone);
        if (!zone) return;
        const name = e.target.name;
        if (name === "byArea") zone.byArea = e.target.checked;
        else if (["S", "R", "FPH", "TPH", "N", "Tex", "pct", "area"].includes(name)) { zone[name] = e.target.value; if (name !== "pct" && name !== "area") zone.presetId = ""; }
        else zone[name] = e.target.value;
        renderForm();
        return;
      }
      const dyeCard = e.target.closest("[data-pot]");
      if (dyeCard) {
        const order = state.plan.dyeOrders[dyeCard.dataset.pot];
        if (!order) return;
        const name = e.target.name;
        if (!name) return;
        if (name === "issueDate") { order.issueDate = e.target.value; order.issueDateAuto = false; }
        else if (name === "needDate") { order.needDate = e.target.value; order.needDateAuto = false; }
        else order[name] = e.target.value;
        renderForm();
        return;
      }
      const name = e.target.name;
      if (!name) return;
      if (["totalAreaSqm", "patternPct", "bufferPct", "hoursPerDay", "loomCount", "punchWorkers", "finishWorkers", "dyeDays"].includes(name)) {
        state.plan[name] = e.target.value;
        if (name === "totalAreaSqm") state.plan.areaSource = "manual";
        renderForm();
      }
    });
    root.addEventListener("change", (e) => {
      if (!state.plan) return;
      const zoneRow = e.target.closest("[data-zone]");
      if (zoneRow) {
        const zone = zoneById(zoneRow.dataset.zone);
        if (!zone) return;
        if (e.target.name === "weaveType") { zone.weaveType = e.target.value; zone.presetId = ""; }
        if (e.target.name === "yarnCode") { zone.yarnCode = e.target.value; zone.presetId = ""; const yt = YARN_TYPES_DEFAULT.find((y) => y.code === e.target.value); if (yt) zone.Tex = yt.tex; }
        if (e.target.name === "presetId") applyPreset(zone, e.target.value);
        renderForm();
        return;
      }
      const dyeCard = e.target.closest("[data-pot]");
      if (dyeCard) {
        const order = state.plan.dyeOrders[dyeCard.dataset.pot];
        if (!order) return;
        const name = e.target.name;
        if (!name) return;
        if (e.target.type === "checkbox") order[name] = e.target.checked;
        else order[name] = e.target.value;
        renderForm();
        return;
      }
      const name = e.target.name;
      if (!name) return;
      if (["weaveGradeOverride", "punchMethodOverride", "finishGradeOverride"].includes(name)) { state.plan[name] = e.target.value; renderForm(); }
    });
  }

  function commitPlan() {
    const p = state.plan;
    const weaveGrade = p.weaveGradeOverride ? WEAVE_GRADES.find((g) => g.grade === p.weaveGradeOverride) : suggestGrade(WEAVE_GRADES, p.patternPct);
    const punchGrade = p.punchMethodOverride ? PUNCH_GRADES.find((g) => `${g.grade}|${g.method}` === p.punchMethodOverride) : suggestGrade(PUNCH_GRADES, p.patternPct);
    const finishGrade = p.finishGradeOverride ? FINISH_GRADES.find((g) => g.grade === p.finishGradeOverride) : suggestGrade(FINISH_GRADES, p.patternPct);
    const sched = computeSchedule({
      totalAreaSqm: num(p.totalAreaSqm), hoursPerDay: p.hoursPerDay,
      punchRate: punchGrade ? punchGrade.rateSqmPerHr : 0, punchWorkers: p.punchWorkers,
      dyeDays: p.dyeDays,
      weaveRate: weaveGrade ? weaveGrade.rateSqmPerHr : 0, loomCount: p.loomCount,
      finishRate: finishGrade ? finishGrade.rateSqmPerHr : 0, finishWorkers: p.finishWorkers
    });
    const dye = computeDyePlan(p.zones, num(p.totalAreaSqm), p.bufferPct);
    for (let i = baseTasks.length - 1; i >= 0; i--) if (baseTasks[i].designId === p.designId) baseTasks.splice(i, 1);
    const info = designs.find((d) => d.id === p.designId) || {};
    sched.segs.forEach((s, i) => {
      baseTasks.push({ designId: p.designId, id: `JOB-${p.designId.slice(4)}`, name: `${s.name} · ${info.project || p.designId}`, dept: s.dept, start: s.start, end: s.end, color: s.color, status: i === 0 ? "active" : "pending" });
    });
    p.savedAt = new Date().toISOString();
    p.lastDyeNetKg = dye.totalNetKg;
    p.lastTotalDays = sched.totalDays;
    p.scheduleEndDate = isoDate(sched.endDate); // วันที่คาดว่าจะเสร็จตาม Master Plan — ใช้ตัดสิน KPI ส่งตรงตามกำหนด (เทียบกับวันส่งจริง+เลข INV จากฝ่ายขาย)
    savePlan(p.designId, p);
    toast(`${p.designId}: บันทึกแผนแล้ว · สั่งย้อม ${fmt(dye.totalNetKg, 2)} กก. · รวม ${fmt(sched.totalDays, 1)} วัน`);
    if (typeof renderPlanning === "function") renderPlanning();
    renderAll();
  }

  window.renderPlanWork = renderPlanWork;
})();
