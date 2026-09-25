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
  // แก้ปัญหาช่องกรอกข้อมูล "เด้งออก" (เสียโฟกัส) ทุกครั้งที่พิมพ์ — เพราะ render() เดิมเขียนทับ innerHTML ทั้งก้อน
  // ทำให้ input ที่กำลังโฟกัสอยู่ถูกทำลายทิ้งแล้วสร้างใหม่ เบราว์เซอร์เลยหลุดโฟกัส ต้องจับตำแหน่ง element ที่โฟกัสอยู่
  // (ชื่อ field + data-* ของ ancestor ที่ใกล้ที่สุด เพื่อแยกกรณีมีหลายแถวใช้ name ซ้ำกัน เช่นตารางโซนสี) ไว้ก่อน
  // render ใหม่ แล้วค่อยคืนโฟกัส + ตำแหน่ง cursor กลับไปที่ element ตัวใหม่ที่ตรงกันหลัง render เสร็จ
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
      try { el.setSelectionRange(info.selStart, info.selEnd); } catch (e) { /* บาง input type (เช่น number) ไม่รองรับ setSelectionRange */ }
    }
    root.scrollTop = info.scrollTop;
  }

  const KEY_PRESETS = "siam-quality-presets";
  const KEY_WORKERS = "siam-workforce";
  const KEY_PLANS = "siam-planning-worksheets";
  const ANCHOR_DATE = new Date(2026, 8, 21); // จ. 21 ก.ย. 2026 — วันแรกของสัปดาห์ในตาราง Gantt (ต้องตรงกับ GANTT_ANCHOR ใน app.js)

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

  // ============================================================
  // สีผสม (Stipple) — บางโซนไม่ได้ทอด้วยแม่สีเดียว แต่ควบเส้นไหมหลายแม่สีเข้าด้วยกัน (เช่น สี A4 5 เส้น + สี C4 1 เส้น
  // ต่อ 1 จุด = อัตราส่วน 5:1) ให้กรอกเป็น "จำนวนเส้นไหม" ต่อแม่สี แล้วระบบคำนวณ % ของแต่ละแม่สีจากสัดส่วนเส้นให้เอง
  // (ตรงกับสูตร "ตารางที่ 2 คำนวณสำหรับสีผสม" ในไฟล์ฟอร์มคำนวณไหม.xlsx — ผู้ใช้ยืนยันแล้ว)
  // ถ้าไม่ได้เปิดโหมดผสมสี ให้ถือว่าโซนนั้นเป็นแม่สีเดียว (colorCode) 100% เหมือนเดิมทุกประการ (ย้อนหลังใช้ได้กับข้อมูลเก่า)
  // ============================================================
  function zoneMixComponents(zone) {
    if (zone.mixEnabled && Array.isArray(zone.mix)) {
      const rows = zone.mix.filter((m) => has(m.colorCode) && num(m.strands) > 0);
      const totalStrands = rows.reduce((t, m) => t + num(m.strands), 0);
      if (rows.length && totalStrands > 0) {
        return rows.map((m) => ({ colorCode: m.colorCode.trim(), strands: num(m.strands), totalStrands, pct: (num(m.strands) / totalStrands) * 100 }));
      }
    }
    return [{ colorCode: zone.colorCode, strands: 1, totalStrands: 1, pct: 100 }];
  }

  function computeZone(zone, totalAreaSqm) {
    const areaSqm = zone.byArea ? num(zone.area) : totalAreaSqm * (num(zone.pct) / 100);
    const structure = (zone.weaveType === "loop") ? "loop" : "cut"; // tipshear ใช้สูตร cut (ก่อนเจียร์) ตามกฎที่ยืนยัน
    const spec = { structure, S: zone.S, R: zone.R, FPH: zone.FPH, TPH: zone.TPH, PH: zone.FPH, Tex: zone.Tex, N: zone.N };
    const weightPerSqmKg = (has(zone.S) && has(zone.Tex) && has(zone.N) && (structure === "loop" ? has(zone.FPH) : (has(zone.FPH) && has(zone.TPH)))) ? dyeWeightPerSqmKg(spec) : 0;
    const baseKg = areaSqm * weightPerSqmKg;
    const mixComponents = zoneMixComponents(zone).map((c) => ({ ...c, areaSqm: areaSqm * (c.pct / 100), baseKg: baseKg * (c.pct / 100) }));
    return { ...zone, areaSqm, weightPerSqmKg, baseKg, mixComponents };
  }

  function computeDyePlan(zones, totalAreaSqm, bufferPct) {
    const computedZones = zones.map((z) => computeZone(z, totalAreaSqm));
    const potMap = new Map();
    computedZones.forEach((z, zi) => {
      // แต่ละองค์ประกอบสีผสม (แม่สี) ในโซนนี้ ให้แยกไปสมทบหม้อย้อมของแม่สีนั้นตามสัดส่วนเส้นไหม —
      // ถ้าโซนนี้ไม่ได้ผสมสี mixComponents จะมีแค่ 1 รายการ (แม่สีเดียว 100%) เหมือนพฤติกรรมเดิมทุกประการ
      z.mixComponents.forEach((comp) => {
        const compZone = { ...z, colorCode: comp.colorCode };
        const key = potKeyOf(compZone);
        if (!potMap.has(key)) potMap.set(key, { key, label: potLabelOf(compZone), zones: [], baseKg: 0, contributions: [] });
        const pot = potMap.get(key);
        pot.zones.push(z);
        pot.baseKg += comp.baseKg;
        pot.contributions.push({ zoneIdx: zi, colorCode: comp.colorCode, strands: comp.strands, totalStrands: comp.totalStrands, pct: comp.pct, baseKg: comp.baseKg, mixed: z.mixComponents.length > 1 });
      });
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
     6.5) ส่งจ้างทอภายนอก (Outsource Weaving) — ทางเลือกแทนการทอในบริษัท
     หมายเหตุ: อัตราค่าจ้างทอ/ค่ากรอ/ค่าควบ/ค่าขนส่ง ไม่มีข้อมูลต้นทางยืนยัน
     ค่าเริ่มต้น = 0 ทุกช่อง ต้องกรอกอัตราจริงเองต่อผู้รับจ้าง (ระบบจะจำอัตราค่าจ้างทอล่าสุดต่อเกรดไว้แนะนำครั้งถัดไป)
     ============================================================ */
  function blankWeaveOutsource(weaveSeg) {
    return {
      enabled: false, vendor: "", ratePerSqm: 0,
      hasWind: false, windCostPerKg: 0,
      hasPly: false, plyCostPerKg: 0,
      transportCost: 0,
      sentDate: isoDate(offsetToDate(weaveSeg.start)), neededDate: isoDate(offsetToDate(weaveSeg.end)),
      sentDateAuto: true, neededDateAuto: true,
      receivedDate: ""
    };
  }
  function weaveOutsourceCost(rec, totalAreaSqm, netKg) {
    totalAreaSqm = num(totalAreaSqm); netKg = num(netKg);
    const weaveCost = num(rec.ratePerSqm) * totalAreaSqm;
    const windCost = rec.hasWind ? num(rec.windCostPerKg) * netKg : 0;
    const plyCost = rec.hasPly ? num(rec.plyCostPerKg) * netKg : 0;
    const transportCost = num(rec.transportCost);
    return { weaveCost, windCost, plyCost, transportCost, total: weaveCost + windCost + plyCost + transportCost };
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
    potKeyOf, potLabelOf, computeZone, computeDyePlan, zoneMixComponents, blankMixRow,
    deptDays, dateToOffset, offsetToDate, fmtThaiDate, computeSchedule, laborCost,
    DYE_METHODS, isoDate, isoToDate, blankDyeOrder, dyeOrderCost,
    blankWeaveOutsource, weaveOutsourceCost,
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

  // จำอัตราค่าจ้างทอภายนอกล่าสุดต่อเกรด ไว้แนะนำอัตโนมัติให้ M/O ถัดไปที่เกรดเดียวกัน (ไม่บังคับ แก้ไขเองได้เสมอ)
  const KEY_WEAVE_OUT_RATEBOOK = "siam-weave-outsource-ratebook";
  function loadWeaveOutRateBook() { return readJson(KEY_WEAVE_OUT_RATEBOOK, {}); }
  function saveWeaveOutRate(grade, ratePerSqm) {
    if (!grade) return;
    const book = loadWeaveOutRateBook();
    book[grade] = num(ratePerSqm);
    writeJson(KEY_WEAVE_OUT_RATEBOOK, book);
  }
  // สร้าง/อัปเดตข้อมูลจ้างทอภายนอกของแผน — วันที่ส่ง/วันที่ต้องการผูกกับกำหนดการ "ทอพรม" ใน Master Plan อัตโนมัติ (ถ้ายังไม่ถูกแก้เอง)
  function syncWeaveOutsource(p, weaveSeg, grade) {
    if (!p.weaveOutsource) p.weaveOutsource = blankWeaveOutsource(weaveSeg);
    const rec = p.weaveOutsource;
    if (rec.sentDateAuto !== false) rec.sentDate = isoDate(offsetToDate(weaveSeg.start));
    if (rec.neededDateAuto !== false) rec.neededDate = isoDate(offsetToDate(weaveSeg.end));
    if (rec.enabled && !num(rec.ratePerSqm) && grade) {
      const suggested = loadWeaveOutRateBook()[grade];
      if (suggested) rec.ratePerSqm = suggested;
    }
    return rec;
  }

  // สร้างโซนใหม่ 1 แถว — ให้ "AI" (ระบบ) เลือกคุณภาพ (preset) ที่ใกล้เคียงที่สุดให้อัตโนมัติ แทนที่จะบังคับกรอกพารามิเตอร์ทอเองทุกครั้ง
  // like: โซนก่อนหน้า (ใช้เทคนิคทอ/ชนิดไหมเดียวกันต่อ) — ไม่ระบุ = เริ่มจากค่าเริ่มต้นมาตรฐาน (HWO 45, Cut to Side)
  function blankMixRow(colorCode) { return { id: uid("mx"), colorCode: colorCode || "", strands: 1 }; }
  function blankZone(like, presets, refColor) {
    const yarnCode = (like && like.yarnCode) || "HWO";
    const weaveType = (like && like.weaveType) || "cutside";
    const structure = weaveType === "loop" ? "loop" : "cut";
    const yt = YARN_TYPES_DEFAULT.find((y) => y.code === yarnCode) || YARN_TYPES_DEFAULT[0];
    // refColor = สีตัวอย่างที่ตรวจพบจากรูปแบบ (ถ้ามาจากปุ่ม "ประเมินจากรูปแบบ") ใช้แค่โชว์เป็นสวอตช์อ้างอิงให้ผู้วางแผน
    // เทียบหารหัสไหมจริงเอง ไม่ได้ใช้คำนวณอะไร (colorCode ยังว่างต้องกรอกรหัสไหมจริงเองเสมอ)
    const zone = { id: uid("z"), name: "", colorCode: "", refColor: refColor || "", weaveType, byArea: false, pct: 0, area: 0, presetId: "", yarnCode: yt.code, S: 28, R: 12, FPH: 9, TPH: 11, N: 4, Tex: yt.tex, mixEnabled: false, mix: [] };
    const list = presets || [];
    const preset = list.find((p) => p.yarnCode === yt.code && p.structure === structure && p.quality === "45") || list.find((p) => p.yarnCode === yt.code && p.structure === structure);
    if (preset) applyPresetToZone(zone, preset);
    return zone;
  }
  function blankPlan(designId, moNo, totalAreaSqm) {
    return {
      designId, moNo: moNo || "", totalAreaSqm: totalAreaSqm || 0, areaSource: totalAreaSqm ? "auto" : "manual",
      patternPct: 50, weaveGradeOverride: "", punchMethodOverride: "", finishGradeOverride: "",
      bufferPct: 5, zones: [blankZone(null, loadPresets())],
      hoursPerDay: 8, loomCount: 2, punchWorkers: 1, finishWorkers: 2, dyeDays: 3,
      weaveWorkers: [], punchWorkerNames: [], finishWorkerNames: [], dyeOrders: {}, weaveOutsource: null, savedAt: null
    };
  }

  /* ============================================================
     "ประเมินจากรูปแบบ" (เบื้องต้น) — ผู้ใช้ยืนยันให้คำนวณด้วยสูตร/เกณฑ์ของเราเอง ไม่เรียก AI ภายนอก
     วิเคราะห์รูปดีไซน์ที่อัปโหลดไว้แล้ว (หน้า Design) ด้วย Canvas ของเบราว์เซอร์เอง:
     1) ลดขนาดภาพแล้วอ่านค่าสีทีละพิกเซล จัดกลุ่ม (quantize) สีที่ใกล้เคียงกันมาก ๆ ให้รวมเป็นสีเดียว
        (กันสี noise จากการบีบอัด JPEG/รอยหยักขอบลาย)
     2) "จำนวนสี" = จำนวนกลุ่มสีที่กินพื้นที่อย่างน้อย 1.5% ของภาพขึ้นไป (ตัด noise เล็ก ๆ ทิ้ง)
     3) "% พื้นที่มีลวดลาย" = 100% ลบด้วยสัดส่วนพื้นที่ของสีที่กินพื้นที่มากที่สุด (ถือเป็นสีพื้นหลัก/พื้นเรียบของลาย)
     ผลลัพธ์เป็นการ "ประเมินเบื้องต้น" เท่านั้น ไม่ใช่ค่าที่แม่นยำ 100% — ผู้วางแผนควรตรวจสอบก่อนใช้งานจริงเสมอ
     (ควรใช้รูปที่ครอปเฉพาะลายพรม ไม่มีขอบ/พื้นหลังอื่นปน ไม่งั้นพื้นหลังจะถูกนับเป็น "สีพื้น" ของลายไปด้วย)
     ============================================================ */
  function analyzeDesignPhoto(dataUrl) {
    return new Promise((resolve, reject) => {
      if (!dataUrl) { reject(new Error("ไม่มีรูปแบบ")); return; }
      const img = new Image();
      img.onload = () => {
        try {
          const maxDim = 140; // ลดขนาดเพื่อความเร็ว + ลด noise จากรายละเอียดปลีกย่อยเกินไป
          const scale = Math.min(1, maxDim / Math.max(img.naturalWidth || maxDim, img.naturalHeight || maxDim));
          const w = Math.max(1, Math.round((img.naturalWidth || maxDim) * scale));
          const h = Math.max(1, Math.round((img.naturalHeight || maxDim) * scale));
          const canvas = document.createElement("canvas");
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, w, h);
          const data = ctx.getImageData(0, 0, w, h).data;
          const STEP = 32; // ขนาดช่องสี quantize ต่อช่อง (0-255) — ยิ่งเล็กยิ่งแยกสีถี่ แต่จะไวต่อ noise มากขึ้น
          const buckets = new Map();
          let total = 0;
          for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] < 16) continue; // พิกเซลโปร่งใส ไม่นับ
            const r = data[i], g = data[i + 1], b = data[i + 2];
            const key = `${Math.round(r / STEP)},${Math.round(g / STEP)},${Math.round(b / STEP)}`;
            let bucket = buckets.get(key);
            if (!bucket) { bucket = { count: 0, rSum: 0, gSum: 0, bSum: 0 }; buckets.set(key, bucket); }
            bucket.count++; bucket.rSum += r; bucket.gSum += g; bucket.bSum += b;
            total++;
          }
          if (!total) { reject(new Error("อ่านข้อมูลภาพไม่ได้")); return; }
          const sorted = [...buckets.values()].sort((a, b) => b.count - a.count);
          const MIN_SHARE = 0.015;
          const significant = sorted.filter((b) => b.count / total >= MIN_SHARE);
          const ranked = significant.length ? significant : sorted.slice(0, 1);
          const colorCount = Math.max(1, Math.min(20, ranked.length));
          const dominantShare = sorted[0].count / total;
          const patternPct = Math.max(0, Math.min(100, Math.round((1 - dominantShare) * 100)));
          const toHex = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
          const palette = ranked.slice(0, 20).map((b) => ({
            hex: `#${toHex(b.rSum / b.count)}${toHex(b.gSum / b.count)}${toHex(b.bSum / b.count)}`,
            pct: (b.count / total) * 100
          }));
          resolve({ colorCount, patternPct, palette });
        } catch (e) { reject(e); }
      };
      img.onerror = () => reject(new Error("โหลดรูปแบบไม่สำเร็จ"));
      img.src = dataUrl;
    });
  }

  // สร้างแถวสีชุดใหม่ตามจำนวนที่กำหนด แบ่ง % เท่ากัน — ใช้ร่วมกันทั้งปุ่ม "AI สร้างแถวสีให้" (palette ว่าง) และ
  // ปุ่ม "สร้างแถวสีตามที่พบ" หลังวิเคราะห์รูปแบบ (palette = สีเด่นที่ตรวจพบ ใส่เป็นสวอตช์อ้างอิงต่อแถว)
  function generateAutoZones(n, palette) {
    const presets = loadPresets();
    const template = state.plan.zones[0] || null;
    const zones = [];
    const base = Math.floor(1000 / n);
    let used = 0;
    for (let i = 0; i < n; i++) {
      const refColor = palette && palette[i] ? palette[i].hex : "";
      const z = blankZone(template, presets, refColor);
      const pctThousandths = i === n - 1 ? 1000 - used : base;
      used += pctThousandths;
      z.pct = Math.round(pctThousandths) / 10;
      zones.push(z);
    }
    state.plan.zones = zones;
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

  const state = { designId: null, plan: null, editGrades: false, photoAnalysis: null, photoAnalyzing: false };

  function ensurePlan(designId) {
    const all = loadPlans();
    if (all[designId]) { if (!all[designId].dyeOrders) all[designId].dyeOrders = {}; if (all[designId].weaveOutsource === undefined) all[designId].weaveOutsource = null; return all[designId]; }
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

  // แถวย่อยของ "แม่สี" หนึ่งตัวในสีผสม (Stipple) — กรอกรหัสสี + จำนวนเส้นไหม แล้วระบบคำนวณ % ให้เอง
  function mixRowHtml(zone, m) {
    const filtered = (zone.mix || []).filter((x) => has(x.colorCode) && num(x.strands) > 0);
    const compIdx = filtered.findIndex((x) => x.id === m.id);
    const comps = zone.mixComponents || [];
    const pct = compIdx >= 0 && comps[compIdx] ? comps[compIdx].pct : null;
    return `<div class="pw-mix-row" data-mixrow="${zone.id}:${m.id}">
      <input name="mixColor" value="${esc(m.colorCode)}" placeholder="รหัสสี" class="pw-mix-color" title="รหัสแม่สี">
      <input name="mixStrands" value="${esc(m.strands)}" inputmode="decimal" placeholder="เส้น" class="pw-mix-strands" title="จำนวนเส้นไหมของแม่สีนี้">
      <small class="pw-mix-pct">${pct != null ? fmt(pct, 1) + "%" : "-"}</small>
      <button type="button" class="pw-mix-del" data-del-mix="${zone.id}:${m.id}" title="ลบแม่สีนี้">×</button>
    </div>`;
  }
  // เซลล์ "รหัสสี" ของแต่ละโซน — โหมดปกติ (แม่สีเดียว) หรือโหมดผสมสี (Stipple, หลายแม่สีต่อโซน ตามจำนวนเส้นไหม)
  function zoneColorCellHtml(zone) {
    const totalStrands = zone.mixEnabled ? (zone.mixComponents || []).reduce((t, c) => t + c.strands, 0) : 0;
    return `<label class="pw-toggle pw-mix-toggle"><input type="checkbox" name="mixEnabled" ${zone.mixEnabled ? "checked" : ""}> ผสมสี (Stipple)</label>
      ${zone.mixEnabled
        ? `<div class="pw-mix-rows">${(zone.mix && zone.mix.length ? zone.mix : []).map((m) => mixRowHtml(zone, m)).join("")}</div>
           <button type="button" class="pw-mix-add" data-add-mix="${zone.id}">+ แม่สี</button>
           ${totalStrands ? `<small class="muted">รวม ${totalStrands} เส้น</small>` : ""}`
        : `<span class="pw-colorcode-row">${zone.refColor ? `<i class="pw-refswatch" style="background:${esc(zone.refColor)}" title="สีจากรูปแบบ ${esc(zone.refColor)} — ใช้เทียบหารหัสไหมจริงเท่านั้น"></i>` : ""}<input name="colorCode" value="${esc(zone.colorCode)}" placeholder="เช่น 34B" class="pw-colorcode"></span>`}`;
  }

  function zoneRowHtml(zone, idx, presets, computed) {
    const isLoop = zone.weaveType === "loop";
    const custom = !zone.presetId;
    const w = computed ? computed.weightPerSqmKg : 0, a = computed ? computed.areaSqm : 0, kg = computed ? computed.baseKg : 0;
    return `<tr data-zone="${zone.id}">
      <td>${idx + 1}</td>
      <td class="pw-color-cell">${zoneColorCellHtml(zone)}</td>
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

  // แสดงที่มาของน้ำหนักไหมในหม้อย้อม เฉพาะเมื่อมีโซนสีผสม (Stipple) สมทบเข้ามา — ให้เห็นว่าแม่สีนี้มาจากโซนไหน
  // กี่เส้นจากกี่เส้น (สัดส่วน) คิดเป็นกี่กิโลกรัม เพื่อตรวจสอบย้อนกลับได้ก่อนสั่งย้อมจริง
  function potContributionHtml(pot) {
    const mixed = (pot.contributions || []).filter((c) => c.mixed);
    if (!mixed.length) return "";
    return `<details class="pw-mix-detail"><summary>ที่มา (สีผสม)</summary><ul>${mixed.map((c) => `<li>โซน #${c.zoneIdx + 1}: ${c.strands}/${c.totalStrands} เส้น (${fmt(c.pct, 1)}%) = ${fmt(c.baseKg, 3)} กก.</li>`).join("")}</ul></details>`;
  }

  function gradeTagHtml(label, grade, extra = "") {
    if (!grade) return `<div class="pr"><small>${label}</small><strong>-</strong></div>`;
    return `<div class="pr"><small>${label}</small><strong>เกรด ${grade.grade}</strong><span>${extra}</span></div>`;
  }

  // "วันที่ส่งงานให้แผนก" ต่อแผนก (ตอกลาย/ขยายลาย, ทอในบริษัท, ตกแต่ง, สโตร์) — ผูกกับ Master Plan อัตโนมัติ
  // เหมือนวันที่ใบสั่งย้อม/จ้างทอนอกด้านบน แต่แก้เองได้ทุกแผนก ถ้าแก้เองแล้วจะไม่ถูกคำนวณทับอีก (Auto=false)
  const DEPT_SENT_LABELS = { punch: "ตอกลาย/ขยายลาย", weave: "ทอ (ในบริษัท)", finish: "ตกแต่ง", store: "สโตร์" };
  function blankDeptSentDate(seg) { return { date: isoDate(offsetToDate(seg.start)), auto: true }; }
  function syncDeptSentDates(p, sched) {
    if (!p.deptSentDates) p.deptSentDates = {};
    const segByKey = { punch: sched.segs[0], weave: sched.segs[2], finish: sched.segs[3], store: sched.segs[4] };
    Object.keys(DEPT_SENT_LABELS).forEach((key) => {
      const seg = segByKey[key];
      if (!p.deptSentDates[key]) p.deptSentDates[key] = blankDeptSentDate(seg);
      const rec = p.deptSentDates[key];
      if (rec.auto !== false) rec.date = isoDate(offsetToDate(seg.start));
    });
    return p.deptSentDates;
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

  // แผง "ประเมินจากรูปแบบ" (เบื้องต้น) — ดูรูปดีไซน์ที่อัปโหลดไว้แล้ว วิเคราะห์สีเด่น/สัดส่วนพื้นที่ลาย ด้วยสูตรของเราเอง
  function photoAnalysisPanelHtml(p) {
    const photo = window.DesignPhotoStore && typeof window.DesignPhotoStore.getDesignPhoto === "function" ? window.DesignPhotoStore.getDesignPhoto(p.designId) : "";
    const analysis = state.photoAnalysis && state.photoAnalysis.designId === p.designId ? state.photoAnalysis : null;
    return `<div class="pw-photo-ai">
      ${photo ? `<img class="pw-photo-ai-thumb" src="${photo}" alt="">` : `<span class="pw-photo-ai-thumb pw-photo-ai-empty">ไม่มีรูปแบบ</span>`}
      <div class="pw-photo-ai-body">
        <div class="pw-photo-ai-head">
          <strong>ประเมินจากรูปแบบ (เบื้องต้น)</strong>
          <button type="button" class="action-button" data-analyze-photo ${!photo || state.photoAnalyzing ? "disabled" : ""}>${state.photoAnalyzing ? "กำลังวิเคราะห์…" : "วิเคราะห์จากรูปแบบ"}</button>
        </div>
        ${!photo ? `<small class="muted">ยังไม่มีรูปแบบของ Design นี้ — ไปอัปโหลดที่หน้า Design ก่อน แล้วกลับมาวิเคราะห์ได้</small>` : ""}
        ${analysis ? `
          <div class="pw-photo-ai-result">
            <span class="pw-photo-ai-swatches" title="สีเด่นที่พบในรูป">${analysis.palette.slice(0, analysis.colorCount).map((c) => `<i style="background:${c.hex}" title="${c.hex} · ${fmt(c.pct, 1)}%"></i>`).join("")}</span>
            <span>พบสีเด่น <strong>${analysis.colorCount}</strong> สี</span>
            <span>ประเมิน % ลาย ~<strong>${analysis.patternPct}%</strong></span>
            <button type="button" class="text-button" data-apply-pattern-pct="${analysis.patternPct}">ใช้ % ลายนี้</button>
            <button type="button" class="text-button" data-apply-color-zones="${analysis.colorCount}">สร้างแถวสี ${analysis.colorCount} สีตามที่พบ</button>
          </div>
          <small class="muted">⚠ ประเมินจากสีเด่นในภาพด้วยสูตรของเราเอง (ไม่ใช่ AI วิเคราะห์ภาพจริง) — ควรใช้รูปที่ครอปเฉพาะลายพรม ไม่มีขอบ/พื้นหลังปน และตรวจสอบผลก่อนใช้งานจริงเสมอ</small>
        ` : ""}
      </div>
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
    const weaveSeg = sched.segs[2];
    const dyeOrderRows = syncDyeOrders(p, dye.pots, dyeSeg);
    const dyeOrderGrandTotal = dyeOrderRows.reduce((t, r) => t + (r.order.source === "outsource" ? dyeOrderCost(r.order, r.pot.netKg).total : 0), 0);
    const weaveOut = syncWeaveOutsource(p, weaveSeg, weaveGrade ? weaveGrade.grade : "");
    const weaveOutCost = weaveOutsourceCost(weaveOut, p.totalAreaSqm, dye.totalNetKg);
    const deptSentDates = syncDeptSentDates(p, sched);

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
        ${photoAnalysisPanelHtml(p)}
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
          <tbody>${dye.pots.length ? dye.pots.map((pot) => `<tr><td>${esc(pot.label)}${potContributionHtml(pot)}</td><td>${pot.zones.length}</td><td class="num">${fmt(pot.baseKg, 3)}</td><td class="num"><strong>${fmt(pot.netKg, 3)}</strong></td></tr>`).join("") : `<tr><td colspan="4" class="empty-gantt">ยังไม่มีโซน</td></tr>`}</tbody>
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
        <div class="pw-dept-dates">
          <small class="muted">วันที่ส่งงานให้แผนก — คำนวณจากตารางเวลาข้างบนอัตโนมัติ แก้เองได้ทุกแผนกถ้าวันจริงไม่ตรง</small>
          <div class="pw-row">${Object.entries(DEPT_SENT_LABELS).map(([key, label]) => {
            const rec = deptSentDates[key];
            const seg = { punch: sched.segs[0], weave: sched.segs[2], finish: sched.segs[3], store: sched.segs[4] }[key];
            const mismatch = rec.auto === false && rec.date !== isoDate(offsetToDate(seg.start));
            return `<label class="pf ${mismatch ? "warn-label" : ""}" data-dept-date="${key}">${esc(label)}<input type="date" name="deptDate" value="${esc(rec.date)}"></label>`;
          }).join("")}</div>
        </div>
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
        ${weaveOut.enabled ? `<p class="col-empty" style="text-align:left;padding:4px 2px 0">* งานนี้ส่งจ้างทอภายนอก ไม่ได้ใช้ค่าแรงทอในบริษัทข้างบน — ดูค่าใช้จ่ายจริงในข้อ 6</p>` : ""}
      </div>
    </section>

    <section class="department-panel pw-card wide">
      <div class="panel-heading"><div><strong>6) ส่งจ้างทอภายนอก (ถ้ามี)</strong><small>เปิดใช้เมื่อไม่ได้ทอในบริษัท · วันที่ส่ง/วันที่ต้องการผูกกับกำหนดการ "ทอพรม" ในข้อ 3 อัตโนมัติ · ระบบจำอัตราค่าจ้างทอล่าสุดของแต่ละเกรดไว้แนะนำครั้งถัดไป</small></div></div>
      <div class="pw-body" data-weave-out>
        <div class="pw-row"><label class="pf"><input type="checkbox" name="woEnabled" ${weaveOut.enabled ? "checked" : ""}> ส่งจ้างทอภายนอก (ไม่ทอในบริษัท)</label></div>
        ${weaveOut.enabled ? `
        <div class="pw-dye-card">
          <div class="pw-dye-grid">
            ${field("บริษัทที่จ้างทอ", inp("vendor", weaveOut.vendor, 'inputmode="text"'))}
            ${field(`ค่าจ้างทอ (บาท/ตร.ม.) — เกรด ${esc(weaveGrade ? weaveGrade.grade : "-")}`, inp("ratePerSqm", weaveOut.ratePerSqm, 'class="pw-num"'))}
          </div>
          <div class="pw-dye-flags">
            <label><input type="checkbox" name="hasWind" ${weaveOut.hasWind ? "checked" : ""}> มีค่ากรอ</label>
            <label><input type="checkbox" name="hasPly" ${weaveOut.hasPly ? "checked" : ""}> มีค่าควบ</label>
          </div>
          <div class="pw-dye-grid">
            ${weaveOut.hasWind ? field("ค่ากรอ (บาท/กก.)", inp("windCostPerKg", weaveOut.windCostPerKg, 'class="pw-num"')) : ""}
            ${weaveOut.hasPly ? field("ค่าควบ (บาท/กก.)", inp("plyCostPerKg", weaveOut.plyCostPerKg, 'class="pw-num"')) : ""}
            ${field("ค่าขนส่ง (บาท)", inp("transportCost", weaveOut.transportCost, 'class="pw-num"'))}
          </div>
          <div class="pw-dye-grid">
            <label class="pf">วันที่ส่งไปทอ<input type="date" name="sentDate" value="${esc(weaveOut.sentDate)}"></label>
            <label class="pf">วันที่ต้องการ<input type="date" name="neededDate" value="${esc(weaveOut.neededDate)}"></label>
            <label class="pf">วันที่รับจริง<input type="date" name="receivedDate" value="${esc(weaveOut.receivedDate)}"></label>
          </div>
          <div class="pw-dye-cost">รวมค่าใช้จ่ายจ้างทอภายนอก: <strong>${fmt(weaveOutCost.total, 0)} บาท</strong><small> (ค่าจ้างทอ ${fmt(weaveOutCost.weaveCost, 0)} + ค่ากรอ ${fmt(weaveOutCost.windCost, 0)} + ค่าควบ ${fmt(weaveOutCost.plyCost, 0)} + ค่าขนส่ง ${fmt(weaveOutCost.transportCost, 0)})</small></div>
        </div>` : ""}
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
  function renderForm() {
    const container = $("#pwForm");
    const focusInfo = captureFocus(container);
    container.innerHTML = state.plan ? buildForm() : `<p class="col-empty">เลือก Job ด้านบนเพื่อเริ่มวางแผน</p>`;
    restoreFocus(container, focusInfo);
  }
  function renderAll() { renderJobPicker(); renderForm(); }

  function pickJob(id) {
    state.designId = id;
    state.plan = ensurePlan(id);
    state.photoAnalysis = null;
    state.photoAnalyzing = false;
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
      const addMix = e.target.closest("[data-add-mix]");
      if (addMix) {
        const zone = zoneById(addMix.dataset.addMix);
        if (zone) { if (!Array.isArray(zone.mix)) zone.mix = []; zone.mix.push(blankMixRow()); renderForm(); }
        return;
      }
      const delMix = e.target.closest("[data-del-mix]");
      if (delMix) {
        const [zoneId, mixId] = delMix.dataset.delMix.split(":");
        const zone = zoneById(zoneId);
        if (zone && Array.isArray(zone.mix)) zone.mix = zone.mix.filter((m) => m.id !== mixId);
        renderForm();
        return;
      }
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
        generateAutoZones(n, null);
        renderForm();
        return;
      }
      const analyzePhoto = e.target.closest("[data-analyze-photo]");
      if (analyzePhoto) {
        const photo = window.DesignPhotoStore && typeof window.DesignPhotoStore.getDesignPhoto === "function" ? window.DesignPhotoStore.getDesignPhoto(state.designId) : "";
        if (!photo) { toast("ยังไม่มีรูปแบบของ Design นี้ — ไปอัปโหลดที่หน้า Design ก่อน"); return; }
        state.photoAnalyzing = true;
        state.photoAnalysis = null;
        renderForm();
        const designIdAtStart = state.designId;
        analyzeDesignPhoto(photo).then((result) => {
          if (state.designId !== designIdAtStart) return; // ผู้ใช้สลับ Job ระหว่างวิเคราะห์ ทิ้งผลลัพธ์นี้
          state.photoAnalyzing = false;
          state.photoAnalysis = { designId: designIdAtStart, ...result };
          renderForm();
        }).catch((err) => {
          if (state.designId !== designIdAtStart) return;
          state.photoAnalyzing = false;
          renderForm();
          toast(`วิเคราะห์รูปแบบไม่สำเร็จ: ${err.message || err}`);
        });
        return;
      }
      const applyPatternPct = e.target.closest("[data-apply-pattern-pct]");
      if (applyPatternPct) {
        state.plan.patternPct = Number(applyPatternPct.dataset.applyPatternPct) || 0;
        toast(`ใช้ % ลายที่ประเมินได้ (${state.plan.patternPct}%) แล้ว`);
        renderForm();
        return;
      }
      const applyColorZones = e.target.closest("[data-apply-color-zones]");
      if (applyColorZones) {
        const n = Math.max(1, Math.min(20, Number(applyColorZones.dataset.applyColorZones) || 1));
        if (state.plan.zones.length && !confirm(`สร้างแถวสีใหม่ ${n} แถว ตามที่ประเมินจากรูปแบบ จะแทนที่รายการสีเดิมทั้งหมด ต้องการดำเนินการต่อหรือไม่?`)) return;
        const palette = state.photoAnalysis && state.photoAnalysis.designId === state.designId ? state.photoAnalysis.palette : null;
        generateAutoZones(n, palette);
        toast(`สร้างแถวสีตามที่ประเมินได้ ${n} แถวแล้ว — ตรวจสอบและกรอกรหัสไหมจริงของแต่ละสีต่อ`);
        renderForm();
        return;
      }
    });
    root.addEventListener("input", (e) => {
      if (!state.plan) return;
      const mixRow = e.target.closest("[data-mixrow]");
      if (mixRow) {
        const [zoneId, mixId] = mixRow.dataset.mixrow.split(":");
        const zone = zoneById(zoneId);
        const m = zone && Array.isArray(zone.mix) && zone.mix.find((x) => x.id === mixId);
        if (m) {
          if (e.target.name === "mixColor") m.colorCode = e.target.value;
          else if (e.target.name === "mixStrands") m.strands = e.target.value;
          renderForm();
        }
        return;
      }
      const zoneRow = e.target.closest("[data-zone]");
      if (zoneRow) {
        const zone = zoneById(zoneRow.dataset.zone);
        if (!zone) return;
        const name = e.target.name;
        if (name === "byArea") zone.byArea = e.target.checked;
        else if (name === "mixEnabled") { zone.mixEnabled = e.target.checked; if (zone.mixEnabled && (!Array.isArray(zone.mix) || !zone.mix.length)) zone.mix = [blankMixRow(), blankMixRow()]; }
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
      const deptDate = e.target.closest("[data-dept-date]");
      if (deptDate) {
        if (!state.plan.deptSentDates) state.plan.deptSentDates = {};
        const key = deptDate.dataset.deptDate;
        if (!state.plan.deptSentDates[key]) state.plan.deptSentDates[key] = { date: "", auto: true };
        state.plan.deptSentDates[key].date = e.target.value;
        state.plan.deptSentDates[key].auto = false;
        renderForm();
        return;
      }
      const woBlock = e.target.closest("[data-weave-out]");
      if (woBlock) {
        const rec = state.plan.weaveOutsource;
        if (!rec) return;
        const name = e.target.name;
        if (!name) return;
        if (e.target.type === "checkbox") {
          if (name === "woEnabled") rec.enabled = e.target.checked;
          else rec[name] = e.target.checked;
        } else if (name === "sentDate") { rec.sentDate = e.target.value; rec.sentDateAuto = false; }
        else if (name === "neededDate") { rec.neededDate = e.target.value; rec.neededDateAuto = false; }
        else rec[name] = e.target.value;
        if (name === "ratePerSqm") {
          const grade = state.plan.weaveGradeOverride || (suggestGrade(WEAVE_GRADES, state.plan.patternPct) || {}).grade;
          if (grade) saveWeaveOutRate(grade, e.target.value);
        }
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
      // หมายเหตุ: ช่องกรอกในบล็อก "จ้างทอภายนอก" (data-weave-out) ถูกจัดการทั้งหมดที่ event "input" ด้านบนแล้ว
      // (รวม checkbox ด้วย อ่านค่าโดยตรงจาก e.target.checked เหมือนช่อง "byArea" ของโซนสี) เพื่อเลี่ยงปัญหา
      // DOM ถูก re-render (renderForm) ก่อนที่ event "change" จะ bubble ขึ้นมาถึง root ได้ครบ
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
