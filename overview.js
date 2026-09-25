/* ============================================================
   ภาพรวมการผลิต (Production Overview) — หน้าแรกของแอป
   แสดงว่าแต่ละ M/O·SO อยู่แผนกไหน กำลังทำ/รอทำ โดยอ้างอิง:
   1) ข้อมูลจริงที่บันทึกในระบบนี้ (ใบวางแผนงาน → เจาะลาย/ปั๊มผ้า → สั่งย้อมไหม → ส่งแผนกทอ
      → แผนกทอ (จอทอ) → ทากาวตกแต่ง/QC → สินค้าสำเร็จรูป แผนก Store)
      ถ้ามีการบันทึกแผนแล้ว ("plans[id].savedAt") ถือเป็นข้อมูลล่าสุด/แม่นที่สุด — แสดงรายละเอียดจริง
      ต่อแผนก เช่น จำนวนสีย้อมแล้ว/เหลือ (นับจากหม้อย้อมจริงของแผน x เช็กบ็อกซ์ "รับไหมย้อมแล้ว"),
      เบอร์จอที่กำลังทอจริง, สถานะ QC ต่อชิ้นหลังตกแต่ง, และวันที่ยืนยันส่งจริงจากฝ่ายขาย
   2) ถ้ายังไม่มีการบันทึกแผนในระบบนี้ ใช้ "importStage"/"progress" ที่นำเข้าจาก
      Google Sheet "QC Check Sheet" ของบริษัท (22 ก.ย. 2026) แทน — ข้อมูลนำเข้ารู้แค่ว่าอยู่แผนกไหน
      ไม่รู้รายละเอียดระดับกำลังทำจริงหรือไม่ จึงแสดงเป็น "รอ" ของแผนกนั้นเสมอ (ไม่เดาว่ากำลังทำ)
      จนกว่าฝ่ายต่าง ๆ จะเริ่มกรอกงานจริงในระบบนี้แล้วจะสลับไปใช้ข้อมูลสดตามข้อ 1 ทันที
   ============================================================ */
(function () {
  "use strict";
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const readJson = (k, fb) => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : fb; } catch (e) { return fb; } };
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const fmt = (n, d) => Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: d, maximumFractionDigits: d });

  const KEY_PATTERN = "siam-pattern-orders";
  const KEY_ISSUES = "siam-weaving-issues";
  const KEY_FLOOR = "siam-weave-floor";
  const KEY_FINISH = "siam-finishing";
  const KEY_SKIP = "siam-mo-skipped"; // { [designId]: { at: iso, moNo } } — M/O,S/O ที่ส่งไปนานแล้ว ไม่อยู่ในกระบวนการผลิต กดผ่านครั้งเดียวหายจากคิวงานทุกแผนกทันที

  /* ============================================================
     M/O,S/O ที่กด "ผ่าน" (ส่งไปนานแล้ว ไม่อยู่ในกระบวนการผลิต) — global flag เดียว ผูกกับ designId
     ทุกหน้า (ภาพรวม/วางแผน/ย้อม/ทอ/ปั๊ม/ตกแต่ง) เช็คค่านี้เพื่อซ่อนออกจากคิวงานค้างพร้อมกันทันที
     ============================================================ */
  function loadSkipped() { const v = readJson(KEY_SKIP, {}); return v && typeof v === "object" ? v : {}; }
  function saveSkipped(v) { try { localStorage.setItem(KEY_SKIP, JSON.stringify(v)); } catch (e) { /* ยังใช้ต่อได้ */ } }
  function isSkipped(designId) { return Boolean(loadSkipped()[designId]); }
  function setSkipped(designId, moNo) {
    const all = loadSkipped();
    all[designId] = { at: new Date().toISOString(), moNo: moNo || "" };
    saveSkipped(all);
  }
  function unsetSkipped(designId) {
    const all = loadSkipped();
    delete all[designId];
    saveSkipped(all);
  }
  function skippedList() {
    const all = loadSkipped();
    const byId = new Map((typeof designs !== "undefined" ? designs : []).map((d) => [d.id, d]));
    return Object.keys(all).map((id) => ({ designId: id, at: all[id].at, moNo: all[id].moNo, design: byId.get(id) || null }))
      .sort((a, b) => (b.at || "").localeCompare(a.at || ""));
  }
  // ปุ่ม "ผ่าน" ใช้ปุ่มเดียวกันได้ทั้งจากหน้าภาพรวมและจากคิวงานของทุกแผนก
  function skipButtonHtml(designId, moNo) {
    return `<button type="button" class="ovw-skip-btn" data-mo-skip="${esc(designId)}" data-mo-skip-mono="${esc(moNo || "")}" title="M/O,S/O นี้ส่งไปนานแล้ว ไม่อยู่ในกระบวนการผลิต — กดผ่านโดยไม่ต้องกรอกรายละเอียด">ผ่าน</button>`;
  }

  const DEPTS = {
    planning: { label: "วางแผนการผลิต", short: "วางแผน", view: "planwork", color: "#c79735" },
    pattern: { label: "เจาะลาย/ขยายลาย/ปั๊มผ้า", short: "เจาะลาย/ปั๊มผ้า", view: "pattern", color: "#4e7fa4" },
    dyeing: { label: "สั่งย้อมไหม", short: "ย้อมไหม", view: "planwork", color: "#9876b4" },
    weaveissue: { label: "ส่งแผนกทอ", short: "ส่งแผนกทอ", view: "weaveissue", color: "#6f9bb0" },
    weaving: { label: "แผนกทอ (จอทอรายวัน)", short: "แผนกทอ", view: "weavefloor", color: "#13848a" },
    weavefloor: { label: "แผนกทอ (จอทอรายวัน)", short: "แผนกทอ", view: "weavefloor", color: "#13848a" },
    finishing: { label: "ทากาวตกแต่ง/QC", short: "ตกแต่ง/QC", view: "finishing", color: "#d39a2f" },
    done: { label: "สินค้าสำเร็จรูป (แผนก Store)", short: "Store", view: "qcdash", color: "#438b79" }
  };
  const DEPT_ORDER = ["planning", "pattern", "dyeing", "weaveissue", "weaving", "finishing", "done"];

  function jobs() {
    // sample:true = ข้อมูลตัวอย่างของระบบ (ไม่ใช่งานจริงของบริษัท) ไม่ควรปนกับภาพรวมการผลิตจริง
    // กดผ่านแล้ว = ส่งไปนานแล้ว ไม่อยู่ในกระบวนการผลิต ไม่ต้องแสดงในภาพรวม/คิวงานอีก
    // S/O ยังไม่นำมาใช้ในกระบวนการผลิตตอนนี้ (ซ่อนทั้งระบบ) — เอาออกจากทุกที่ที่เรียก jobs()
    return (typeof designs !== "undefined" ? designs : []).filter((d) => d.job === "OPENED" && !d.sample && !isSkipped(d.id) && typeOf(d) !== "SO");
  }

  // เลข M/O,S/O มาจากหลายแหล่ง พิมพ์ตัวคั่นปีไม่เหมือนกัน ("148/26","TH123.26","TH 123-26") และบางรายการเก่ามีคำว่า
  // "MO "/"M/O "/"SO "/"S/O " (ป้ายประเภทเอกสาร) ติดอยู่หน้าตัวเลขด้วย (เช่น "MO 0109/26" จากข้อมูลเก่าก่อนแก้ไข
  // ให้แยกช่องประเภทออกต่างหาก) — ต้องตัดคำนำหน้านี้ทิ้งก่อนเทียบ ไม่งั้นจะไม่ตรงกับเลขสะอาดในข้อมูลปัจจุบัน (เช่น "0109/26")
  function normMoNo(raw) {
    // ต้องตามด้วยช่องว่างจริง ๆ เท่านั้นถึงตัดออก (กัน "MO0109/26" แบบไม่มีช่องว่างที่อาจไม่ใช่คำนำหน้าประเภทเอกสาร)
    // ไม่บังคับว่าตัวถัดไปต้องเป็นตัวเลข เพราะบางเลขมีคำนำหน้าซ้อนสองชั้น เช่น "MO TH 124/26" (ประเภท + คำนำหน้าจริง)
    let s = String(raw || "").trim().toUpperCase().replace(/^(M\/O|MO|S\/O|SO)\s+/, "");
    const m = s.match(/^([A-Z]*)\s*0*(\d+)\s*[/.-]\s*0*(\d+)/);
    if (!m) return s.replace(/\s+/g, "");
    const [, prefix, num2, yy] = m;
    return `${prefix}|${num2}|${yy}`;
  }

  /* หา doc ฝ่ายขายที่ตรงกับ design record — เทียบ designId ก่อน (แม่นสุด) ถ้าไม่เจอ (เช่น ข้อมูลเก่าที่ยังค้างอยู่ใน
     localStorage ของเบราว์เซอร์ตั้งแต่ก่อนมีช่อง designId หรือ designId ไม่ตรงกันด้วยเหตุผลอื่น) ให้ fallback ไปเทียบ
     เลข M/O,S/O แทน กันไม่ให้ "ยืนยันส่งจริง"/ใบส่งของ ดูเหมือนไม่มีผลอะไรเลยสำหรับข้อมูลเก่าที่ยังไม่ได้อัปเดต designId */
  function docForDesign(id) {
    const SE = window.SalesEngine;
    if (!SE || typeof SE.getDocs !== "function") return null;
    const docs = SE.getDocs();
    const byId = docs.find((x) => x.designId === id);
    if (byId) return byId;
    const design = (typeof designs !== "undefined" ? designs : []).find((x) => x.id === id);
    if (!design || !design.moNo) return null;
    const key = normMoNo(design.moNo);
    return docs.find((x) => normMoNo(x.no) === key) || null;
  }

  /* ---------- M/O vs S/O: ใช้ type จากเอกสารฝ่ายขายเป็นหลัก (แม่นสุด), ถ้าไม่เจอ fallback ดูจาก id ---------- */
  function typeOf(d) {
    const doc = docForDesign(d.id);
    if (doc && doc.type) return doc.type === "SO" ? "SO" : "MO";
    return /^SO/i.test(d.id) ? "SO" : "MO";
  }

  /* วันที่ยืนยันส่งจริง (ฝ่ายขาย, ปุ่ม "ยืนยันส่ง" ในหน้ารายงานขาย, หรือเพิ่มรายการเข้าใบส่งของในหน้า Shipping)
     ใช้ตัดสินว่า "จัดส่งแล้ว" หรือยัง "รอนำส่ง" — ใช้ได้ทั้งงานที่มีข้อมูลสดในระบบนี้ และงานที่นำเข้ามา
     (บางรายการมีวันที่ส่งจริงติดมากับข้อมูลนำเข้าด้วย) */
  function shipDateOf(id) {
    const doc = docForDesign(id);
    if (!doc || !doc.actualShip) return null;
    const raw = String(doc.actualShip).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10); // ISO อยู่แล้ว
    // ข้อมูลนำเข้าบางรายการเก่าเก็บเป็นผลลัพธ์ของ Date.toString() ตรง ๆ (เช่น "Mon Sep 07 2026 00:00:00 GMT+0700") — แปลงกลับเป็น ISO
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString().slice(0, 10);
  }

  // รูปดีไซน์ต่อ M/O,S/O — ใช้รูปที่อัปโหลดไว้ที่หน้าขาย (แก้ไข M/O) เป็นหลัก ถ้าไม่มีค่อย fallback ไปรูปแบบพรมแผนกทอ
  function designPhoto(id) {
    const DP = window.DesignPhotoStore;
    const fromSales = DP && typeof DP.getDesignPhoto === "function" ? DP.getDesignPhoto(id) : "";
    if (fromSales) return fromSales;
    const WF = window.WeaveFloorEngine;
    return WF && typeof WF.getDesignImage === "function" ? WF.getDesignImage(id) : "";
  }

  /* ---------- พื้นที่ (ตร.ม.) รวมของงาน — ใช้เอกสารฝ่ายขาย (บรรทัดสินค้าจริง) เป็นหลัก ---------- */
  function sqmOfDesign(id) {
    const doc = docForDesign(id);
    if (!doc || !Array.isArray(doc.lines)) return 0;
    return doc.lines.reduce((t, l) => t + num(l.sqm), 0);
  }

  // "กำหนดส่ง" (d.due) เก็บเป็นข้อความไทยที่แสดงผลแล้ว (เช่น "11 ก.ย. 2026") ไม่ใช่ ISO — ต้องแปลงกลับเป็น Date
  // เพื่อใช้จัดกลุ่มตามเดือน/สัปดาห์ในมุมมองรายเดือน (งานส่วนใหญ่นำเข้าจาก Excel ไม่มีช่อง dueDate แบบ ISO ติดมาด้วย)
  const THAI_MONTH_ABBR_LOCAL = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  function parseThaiDueDate(raw) {
    const s = String(raw || "").trim();
    if (!s || s === "-") return null;
    const m = s.match(/^(\d{1,2})\s+(\S+)\s+(\d{4})/);
    if (!m) return null;
    const mi = THAI_MONTH_ABBR_LOCAL.indexOf(m[2]);
    if (mi < 0) return null;
    const d = new Date(Number(m[3]), mi, Number(m[1]));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  /* ---------- สรุปการผลิตประจำวัน สำหรับหัวหน้าภาพรวม ----------
     ตร.ม.กำลังทอ/รอทอ: คำนวณสดจากสถานะปัจจุบันของทุกงาน (statusOf)
     สี ย้อม/ทอ/ตกแต่ง/ขยายลาย ต่อวัน: อ้างอิงเวลาบันทึกจริงของแต่ละแผนก (readyAt, WeaveFloorEngine.daySummary, QC log, requisitionAt) */
  function productionDayStats(rows, iso) {
    let sqmWeaving = 0, sqmWaiting = 0;
    const BEFORE_WEAVE = new Set(["planning", "pattern", "dyeing", "weaveissue"]);
    rows.forEach(({ d, st }) => {
      const sqm = sqmOfDesign(d.id);
      if (st.dept === "weaving") sqmWeaving += sqm;
      else if (BEFORE_WEAVE.has(st.dept)) sqmWaiting += sqm;
    });

    // ย้อมได้กี่สีต่อวัน: นับหม้อย้อม (pot) ที่ติ๊ก "รับไหมย้อมแล้ว" (yarnReady) สำเร็จในวันนั้น (readyAt)
    const issues = readJson(KEY_ISSUES, {});
    let colorsToday = 0;
    Object.values(issues).forEach((rec) => {
      Object.values((rec && rec.pots) || {}).forEach((pot) => {
        if (pot && pot.readyAt && String(pot.readyAt).slice(0, 10) === iso) colorsToday++;
      });
    });

    // ทอได้กี่ตร.ม./เกรด/%ประสิทธิภาพต่อวัน: จากบันทึกจอทอรายวันจริง
    const WF = window.WeaveFloorEngine;
    const PE = window.PlanningEngine;
    let wovenToday = 0, mainGrade = "", effPct = null, effRate = 0;
    if (WF && typeof WF.daySummary === "function") {
      const sum = WF.daySummary(iso);
      wovenToday = sum.totalSqm || 0;
      effRate = sum.eff || 0;
      let bestSqm = 0;
      Object.keys(sum.gradeTotals || {}).forEach((g) => {
        if (sum.gradeTotals[g].sqm > bestSqm) { bestSqm = sum.gradeTotals[g].sqm; mainGrade = g; }
      });
      if (mainGrade && PE && Array.isArray(PE.WEAVE_GRADES)) {
        const gi = PE.WEAVE_GRADES.find((g) => g.grade === mainGrade);
        if (gi && gi.rateSqmPerHr > 0) effPct = (effRate / gi.rateSqmPerHr) * 100;
      }
    }

    // ตกแต่งได้กี่ M/O ต่อวัน: นับจากใบ QC ของแผนกตกแต่ง ที่ผลตรวจ "ผ่าน" ในวันนั้น (นับ M/O ไม่ซ้ำ)
    let finishToday = 0;
    if (WF && typeof WF.loadQc === "function") {
      const finished = new Set();
      WF.loadQc().forEach((q) => { if (q.dept === "finishing" && q.result === "ผ่าน" && q.date === iso) finished.add(q.designId); });
      finishToday = finished.size;
    }

    // ขยายลาย/ปั๊มผ้าได้กี่ M/O ต่อวัน: นับจากเวลาที่เบิกผ้าใบจริง (requisitionAt) ของแผนกเจาะลาย/ปั๊มผ้า
    const patternOrders = readJson(KEY_PATTERN, {});
    let canvasToday = 0;
    Object.values(patternOrders).forEach((rec) => {
      if (rec && rec.requisitionIssued && rec.requisitionAt && String(rec.requisitionAt).slice(0, 10) === iso) canvasToday++;
    });

    return { sqmWeaving, sqmWaiting, colorsToday, wovenToday, mainGrade, effRate, effPct, finishToday, canvasToday };
  }

  /* ---------- 1) สถานะสดจากข้อมูลที่กรอกจริงในระบบนี้ ----------
     ลำดับแผนก: วางแผน → เจาะลาย/ปั๊มผ้า (คู่ขนานกับย้อมไหม) → ส่งแผนกทอ → แผนกทอ (จอทอ) → ตกแต่ง/QC → Store (รอนำส่ง)
     ทุกจุดที่ "ยังไม่มีหลักฐานว่ากำลังลงมือทำจริง" จะขึ้นเป็น "รอ..." เสมอ (ไม่เดาว่ากำลังทำถ้าไม่มีข้อมูลยืนยัน) */
  function liveStatus(id) {
    const PE = window.PlanningEngine;
    const plans = PE ? PE.readJson(PE.KEY_PLANS, {}) : readJson("siam-planning-worksheets", {});
    const plan = plans[id];
    if (!plan || !plan.savedAt) return null; // ยังไม่เคยบันทึกแผนในระบบนี้ → ให้ไปใช้ข้อมูลนำเข้าแทน

    const patternRec = readJson(KEY_PATTERN, {})[id];
    const issueRec = readJson(KEY_ISSUES, {})[id];

    /* --- เจาะลาย/ขยายลาย → ปั๊มผ้า: requisitionIssued = เบิกผ้าใบเริ่มงานแล้ว, canvasReady (ที่หน้าส่งแผนกทอ) = ปั๊มผ้าเสร็จพร้อมส่งทอ --- */
    if (!patternRec || !patternRec.requisitionIssued) {
      return { dept: "pattern", state: "waiting", stateLabel: "รอปั๊ม (คิวเบิกผ้าใบ)", updatedAt: plan.savedAt, source: "live" };
    }
    if (!issueRec || !issueRec.canvasReady) {
      return { dept: "pattern", state: "active", stateLabel: "กำลังปั๊มผ้า", updatedAt: patternRec.requisitionAt, source: "live" };
    }

    /* --- แผนกทอ (จอทอรายวัน): หน้าจอทอจริงเปิดให้ขึ้นทอได้ทันทีที่ canvasReady (ดู weave-floor.js jobPickerHtml)
       ไม่ได้รอปุ่ม "ส่งแผนกทอ" (issuedAt) หรือไหมครบทุกสีก่อน — ถ้ามีหลักฐานว่าเริ่มขึ้นทอ/บันทึกจอแล้วจริง
       ให้ถือเป็นหลักฐานที่แน่นอนที่สุดและแสดงแผนกทอทันที ไม่ว่าเอกสาร "ส่งแผนกทอ" จะกดครบหรือยัง --- */
    const floorRec = readJson(KEY_FLOOR, {})[id];
    const expected = Object.keys(issueRec.lines || {}).length || (floorRec ? Object.keys(floorRec.pieces || {}).length : 0) || 1;
    const pieces = floorRec && floorRec.pieces ? Object.values(floorRec.pieces) : [];
    const anyFloorActivity = pieces.some((p) => (p.days && Object.keys(p.days).length) || (p.loomNo != null && String(p.loomNo).trim() !== ""));

    if (!anyFloorActivity) {
      /* --- ยังไม่เริ่มขึ้นทอ: เช็คว่าไหมครบทุกสีหรือยัง (นับจากหม้อย้อมจริงของแผน) --- */
      let dyePots = [];
      try {
        if (PE && Array.isArray(plan.zones)) {
          dyePots = PE.computeDyePlan(plan.zones, Number(plan.totalAreaSqm) || 0, plan.bufferPct).pots || [];
        }
      } catch (e) { dyePots = []; }
      const totalColors = dyePots.length;
      const readyColors = dyePots.filter((pot) => issueRec.pots && issueRec.pots[pot.key] && issueRec.pots[pot.key].yarnReady).length;
      if (totalColors && readyColors < totalColors) {
        return {
          dept: "dyeing",
          state: readyColors ? "active" : "waiting",
          stateLabel: `ทั้งหมด ${totalColors} สี / ย้อมแล้ว ${readyColors} สี / เหลือ ${totalColors - readyColors} สี`,
          updatedAt: patternRec.requisitionAt, source: "live"
        };
      }
      return { dept: "weaveissue", state: "waiting", stateLabel: "พร้อมส่ง รอขึ้นทอ", updatedAt: patternRec.requisitionAt, source: "live" };
    }

    /* --- เริ่มขึ้นทอแล้ว: บอกเบอร์จอที่กำลังทออยู่จริง --- */
    const transferred = pieces.filter((p) => p.transferredToGlueAt).length;
    if (!pieces.length || transferred < expected) {
      const loomsWorking = [...new Set(pieces
        .filter((p) => p.days && Object.keys(p.days).length && !p.transferredToGlueAt)
        .map((p) => p.loomNo).filter((n) => n != null && String(n).trim() !== ""))];
      const active = loomsWorking.length > 0;
      return {
        dept: "weaving", state: active ? "active" : "waiting",
        stateLabel: active ? `กำลังทอจอ ${loomsWorking.join(", ")}` : "รอทอ",
        updatedAt: issueRec.issuedAt, source: "live"
      };
    }

    /* --- ทากาวตกแต่ง --- */
    const finRec = readJson(KEY_FINISH, {})[id];
    const finPieces = finRec && finRec.pieces ? Object.values(finRec.pieces) : [];
    const received = finPieces.filter((p) => p.receivedDate).length;
    const doneFin = finPieces.filter((p) => p.receivedDate && p.finish && p.finish.startDate && p.dry && p.dry.widthAfterDryM && p.dry.lengthAfterDryM).length;
    if (!finPieces.length || doneFin < expected) {
      const firstTransfer = pieces.map((p) => p.transferredToGlueAt).filter(Boolean).sort()[0];
      return { dept: "finishing", state: received ? "active" : "waiting", stateLabel: received ? "กำลังแต่ง" : "รอแต่ง", updatedAt: firstTransfer, source: "live" };
    }

    /* --- ตกแต่งเสร็จทุกชิ้นแล้ว: รอ QC ตรวจก่อนเข้าคลังสินค้าสำเร็จรูป --- */
    const WF = window.WeaveFloorEngine;
    const qcList = WF && typeof WF.loadQc === "function" ? WF.loadQc() : [];
    const qcByLine = {};
    qcList.filter((q) => q.designId === id && q.dept === "finishing").forEach((q) => {
      const key = String(q.lineIdx);
      (qcByLine[key] = qcByLine[key] || []).push(q);
    });
    const lineIdxs = Object.keys(finRec.pieces || {});
    const allQcChecked = lineIdxs.length > 0 && lineIdxs.every((li) => (qcByLine[li] || []).length > 0);
    if (!allQcChecked) {
      return { dept: "finishing", state: "active", stateLabel: "รอ QC ตรวจ", updatedAt: null, source: "live" };
    }
    const anyQcFail = lineIdxs.some((li) => (qcByLine[li] || []).some((q) => q.result !== "ผ่าน"));
    if (anyQcFail) {
      return { dept: "finishing", state: "active", stateLabel: "QC พบปัญหา — รอแก้ไข", updatedAt: null, source: "live" };
    }

    /* --- ผ่าน QC ครบแล้ว: เข้าสินค้าสำเร็จรูป แผนก Store — เช็คว่าฝ่ายขายยืนยันส่งจริงแล้วหรือยัง --- */
    const shipDate = shipDateOf(id);
    if (shipDate) return { dept: "done", state: "done", stateLabel: `จัดส่งแล้ว (${shipDate})`, updatedAt: shipDate, source: "live" };
    return { dept: "done", state: "waiting", stateLabel: "รอนำส่ง", updatedAt: null, source: "live" };
  }

  /* ---------- 2) สถานะจากข้อมูลนำเข้า (QC Check Sheet, 22 ก.ย. 2026) ----------
     ข้อมูลนำเข้ามีแค่ "อยู่แผนกไหน" (CurrentStage) ไม่มีรายละเอียดว่ากำลังลงมือทำอยู่จริงหรือยัง
     จึงไม่เดาว่า "กำลังดำเนินการ" — ให้ขึ้นเป็น "รอ" ของแผนกนั้นเสมอ จนกว่าจะมีการกรอกงานจริงในระบบนี้ (ดู liveStatus) */
  const IMPORT_WAIT_LABEL = { planning: "รอวางแผน", pattern: "รอปั๊ม", dyeing: "รอย้อมไหม", weaveissue: "รอส่งแผนกทอ", weaving: "รอทอ", finishing: "รอตกแต่ง/QC" };
  const IMPORT_SOURCES = new Set(["QC Check Sheet", "MASTER PLAN 17-9-26"]);
  function importStatus(d) {
    if (IMPORT_SOURCES.has(d.importSource)) {
      if (Number(d.progress) >= 100) {
        const shipDate = shipDateOf(d.id);
        if (shipDate) return { dept: "done", state: "done", stateLabel: `จัดส่งแล้ว (${shipDate})`, updatedAt: shipDate, source: "import" };
        return { dept: "done", state: "waiting", stateLabel: "รอนำส่ง (ตามข้อมูลนำเข้า)", updatedAt: null, source: "import" };
      }
      if (d.importStage) return { dept: d.importStage, state: "waiting", stateLabel: IMPORT_WAIT_LABEL[d.importStage] || "รอดำเนินการ", updatedAt: null, source: "import" };
    }
    return { dept: "planning", state: "waiting", stateLabel: "รอวางแผน", updatedAt: null, source: "none" };
  }

  function statusOf(d) {
    /* หลักฐานว่า "เสร็จ/จัดส่งแล้ว" จริง (ฝ่ายขายกดยืนยันส่งจริง หรือข้อมูลนำเข้าระบุผลิตครบ 100% แล้ว)
       ต้องชนะทุกกรณีเสมอ ห้ามให้สถานะสดที่ยังกรอกไม่ครบในระบบนี้ (เช่น มีแค่ข้อมูลทอที่นำเข้าจาก Excel
       รายวัน แต่ยังไม่มีข้อมูลเจาะลาย/ตกแต่งของ M/O นั้นในระบบ) ดึงงานที่จบและจัดส่งไปแล้วจริงย้อนกลับไป
       เป็นแผนกก่อนหน้าโดยไม่ตั้งใจ — เช่นตอนนำเข้า Excel แผนกทอของเดือนที่มี M/O เก่าที่ปิดงานไปแล้วปนอยู่ */
    const shipDate = shipDateOf(d.id);
    if (shipDate) return { dept: "done", state: "done", stateLabel: `จัดส่งแล้ว (${shipDate})`, updatedAt: shipDate, source: "live" };
    const imp = importStatus(d);
    if (imp.dept === "done") return imp;
    return liveStatus(d.id) || imp;
  }

  /* ---------- helpers ---------- */
  function badge(dept, state) {
    const meta = DEPTS[dept] || DEPTS.planning;
    const dim = state === "waiting";
    const style = `background:${meta.color}22;color:${meta.color};border:1px solid ${meta.color}66${dim ? ";opacity:.75" : ""}`;
    return `<span class="ovw-badge" style="${style}">${esc(meta.short)}</span>`;
  }
  function stateTag(state, label) {
    const cls = state === "done" ? "done" : state === "active" ? "active" : "waiting";
    return `<span class="ovw-state ovw-state-${cls}">${esc(label)}</span>`;
  }

  function rowHtml({ d, st, type }) {
    const meta = DEPTS[st.dept] || DEPTS.planning;
    const photo = designPhoto(d.id);
    return `<tr style="border-left:3px solid ${meta.color}">
      <td>${photo ? `<img class="ovw-thumb" src="${photo}" alt="">` : `<span class="ovw-thumb ovw-thumb-empty">-</span>`}</td>
      <td><span class="ovw-type ovw-type-${type}">${type}</span></td>
      <td><strong>${esc(d.id)}</strong><small>${esc(d.market === "DOMESTIC" ? "ในประเทศ" : d.market === "FOREIGN" ? "ต่างประเทศ" : "")}</small></td>
      <td>${esc(d.customer || "-")}</td>
      <td>${esc(d.project || "-")}</td>
      <td>${esc(d.due || "-")}${d.planNote ? `<br><small class="ovw-plannote">⚠ ${esc(d.planNote)}</small>` : ""}</td>
      <td>${badge(st.dept, st.state)}<br><small class="ovw-dept-label">${esc(meta.label)}</small></td>
      <td>${d.weaveLocation ? `<span class="ovw-weaveloc ${d.weaveLocation === "SIAM" ? "ovw-weaveloc-in" : "ovw-weaveloc-out"}">${esc(d.weaveLocation === "SIAM" ? "ทอเอง" : d.weaveLocation)}</span>` : "-"}</td>
      <td>${stateTag(st.state, st.stateLabel)}${st.source === "import" ? `<small class="ovw-src">${d.importSource === "MASTER PLAN 17-9-26" ? "ตาม MASTER PLAN 17 ก.ย." : "ตามข้อมูลนำเข้า 22 ก.ย."}</small>` : st.source === "live" ? '<small class="ovw-src ovw-src-live">อัปเดตจากระบบนี้</small>' : ""}</td>
      <td><button type="button" class="action-button ovw-goto" data-view="${meta.view}">ไปที่หน้า ${esc(meta.short)}</button>${skipButtonHtml(d.id, d.id)}</td>
    </tr>`;
  }

  // จัดกลุ่มสัปดาห์ปฏิทิน (จันทร์–อาทิตย์) ที่คาบเกี่ยวกับเดือนที่เลือก ไว้ใช้กับมุมมองรายเดือน
  function monthWeeks(year, month) {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const start = new Date(firstDay);
    const dow = (start.getDay() + 6) % 7; // 0 = จันทร์
    start.setDate(start.getDate() - dow);
    const weeks = [];
    let cur = new Date(start);
    while (cur <= lastDay) {
      const weekStart = new Date(cur);
      const weekEnd = new Date(cur);
      weekEnd.setDate(weekEnd.getDate() + 6);
      weeks.push({ start: weekStart, end: weekEnd });
      cur.setDate(cur.getDate() + 7);
    }
    return weeks;
  }
  function shortDate(dt) { return `${dt.getDate()} ${THAI_MONTH_ABBR_LOCAL[dt.getMonth()]}`; }

  function monthRowHtml({ d, st, type }, dueDate) {
    const meta = DEPTS[st.dept] || DEPTS.planning;
    return `<tr style="border-left:3px solid ${meta.color}">
      <td><strong>${dueDate.getDate()}</strong><small>${["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."][dueDate.getDay()]}</small></td>
      <td><span class="ovw-type ovw-type-${type}">${type}</span></td>
      <td><strong>${esc(d.id)}</strong></td>
      <td>${esc(d.customer || "-")}</td>
      <td>${esc(d.project || "-")}</td>
      <td>${badge(st.dept, st.state)}</td>
      <td>${stateTag(st.state, st.stateLabel)}</td>
      <td class="num">${fmt(sqmOfDesign(d.id), 2)}</td>
      <td>${skipButtonHtml(d.id, d.id)}</td>
    </tr>`;
  }

  function renderOverview() {
    const host = document.getElementById("overviewView");
    if (!host) return;
    const all = jobs();
    const rows = all.map((d) => ({ d, st: statusOf(d), type: typeOf(d) }));

    const counts = {};
    DEPT_ORDER.forEach((k) => (counts[k] = 0));
    let activeCount = 0, waitingCount = 0, storeCount = 0, shippedCount = 0, liveCount = 0;
    let totalSqm = 0, shippedSqm = 0;
    rows.forEach(({ d, st, type }) => {
      counts[st.dept] = (counts[st.dept] || 0) + 1;
      const sqm = sqmOfDesign(d.id);
      totalSqm += sqm;
      if (st.dept === "done") {
        if (st.state === "done") { shippedCount++; shippedSqm += sqm; } else storeCount++;
      } else if (st.state === "active") activeCount++;
      else if (st.state === "waiting") waitingCount++;
      if (st.source === "live") liveCount++;
    });
    const total = rows.length;
    const waitingSqm = Math.max(0, totalSqm - shippedSqm);
    // นับเฉพาะงานที่ยังไม่เสร็จ (ไม่รวม dept "done") ไว้ใช้กับตัวกรอง M/O·S/O ของตารางด้านล่าง
    // เพราะตารางนั้นตัดงานที่เสร็จ/จัดส่งแล้วออกไปให้ดูที่หน้า Store แทน
    const activeTotal = total - storeCount - shippedCount;
    let activeMoCount = 0, activeSoCount = 0;
    rows.forEach(({ st, type }) => { if (st.dept !== "done") { if (type === "SO") activeSoCount++; else activeMoCount++; } });

    const todayIso = new Date().toISOString().slice(0, 10);
    const dayStats = productionDayStats(rows, todayIso);
    const todayThai = new Date().toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });

    const query = (document.getElementById("ovwSearch") ? document.getElementById("ovwSearch").value : "").trim().toLowerCase();
    const typeFilter = host.dataset.typeFilter || "all";
    const pageMode = host.dataset.pageMode || "dept";
    const monthOffset = Number(host.dataset.monthOffset || 0);
    const matches = (d, type) => {
      if (typeFilter !== "all" && type !== typeFilter) return false;
      if (!query) return true;
      return `${d.id} ${d.moNo || ""} ${d.customer || ""} ${d.project || ""}`.toLowerCase().includes(query);
    };

    /* งานที่เสร็จ/จัดส่งแล้ว (dept "done") ตัดออกจากมุมมองตามแผนกเสมอ — ให้ไปโชว์ที่หน้า
       QC Dashboard → Store เท่านั้น หน้าภาพรวมการผลิตนี้จึงเหลือแต่งานที่ยังต้องติดตาม/ทำต่อจริง ๆ */
    const deptFiltered = rows.filter(({ d, st, type }) => st.dept !== "done" && matches(d, type));

    const stageCards = DEPT_ORDER.map((key) => {
      const meta = DEPTS[key];
      const n = counts[key] || 0;
      const pct = total ? Math.round((n / total) * 100) : 0;
      const isDone = key === "done";
      // งาน "Store" (เสร็จ/จัดส่งแล้ว) ไม่มีอยู่ในกลุ่มแผนกของหน้านี้แล้ว — คลิกแล้วพาไปหน้า QC Dashboard → Store แทน
      // แผนกอื่น ๆ คลิกแล้วแค่เลื่อนไปที่กลุ่มแผนกนั้น (ไม่ต้องกดกรองถึงจะเห็นรายละเอียด — ทุกแผนกแสดงพร้อมกันอยู่แล้ว)
      return `<button type="button" class="ovw-stage" style="--c:${meta.color}" data-dept="${key}" ${isDone ? 'data-goto-store="1"' : `data-scroll-dept="${key}"`}>
        <span class="ovw-stage-dot"></span>
        <strong>${n}</strong>
        <small>${esc(meta.short)}${isDone ? " ↗" : ""}</small>
        <i style="width:${pct}%"></i>
      </button>`;
    }).join("");

    // --- มุมมองตามแผนก: แสดงทุกแผนกพร้อมกันเป็นกลุ่ม ไม่ต้องกดกรองก่อนถึงจะเห็นรายละเอียดของแผนกนั้น ---
    const deptGroupsHtml = DEPT_ORDER.filter((k) => k !== "done").map((key) => {
      const meta = DEPTS[key];
      const groupRows = deptFiltered.filter((r) => r.st.dept === key)
        .sort((a, b) => (a.st.state === "active" ? -1 : 1) - (b.st.state === "active" ? -1 : 1));
      if (!groupRows.length) return "";
      const groupSqm = groupRows.reduce((t, r) => t + sqmOfDesign(r.d.id), 0);
      return `<details class="ovw-deptgroup" open data-dept-group="${key}" style="--c:${meta.color}">
        <summary><strong>${esc(meta.label)}</strong><span class="ovw-deptgroup-count">${groupRows.length} รายการ · ${fmt(groupSqm, 2)} ตร.ม.</span></summary>
        <div class="table-wrap">
          <table>
            <thead><tr><th>รูป</th><th>ประเภท</th><th>เลขที่</th><th>ลูกค้า</th><th>Project / PO</th><th>กำหนดส่ง</th><th>แผนกปัจจุบัน</th><th>ที่ทอ</th><th>สถานะ</th><th></th></tr></thead>
            <tbody>${groupRows.map(rowHtml).join("")}</tbody>
          </table>
        </div>
      </details>`;
    }).join("");

    // --- มุมมองรายเดือน: แสดงงานทั้งเดือนตามวันกำหนดส่ง (ใช้ข้อมูลสถานะจริงชุดเดียวกับมุมมองตามแผนก ไม่ใช่ Gantt เดิมที่พังอยู่) ---
    const baseToday = new Date();
    const targetMonthDate = new Date(baseToday.getFullYear(), baseToday.getMonth() + monthOffset, 1);
    const targetYear = targetMonthDate.getFullYear();
    const targetMonth = targetMonthDate.getMonth();
    const monthRowsAll = rows
      .filter(({ d, type }) => matches(d, type))
      .map((r) => ({ ...r, dueDate: parseThaiDueDate(r.d.due) }))
      .filter((r) => r.dueDate && r.dueDate.getFullYear() === targetYear && r.dueDate.getMonth() === targetMonth);
    const monthSqm = monthRowsAll.reduce((t, r) => t + sqmOfDesign(r.d.id), 0);
    const monthShippedCount = monthRowsAll.filter((r) => r.st.dept === "done" && r.st.state === "done").length;
    const weeks = monthWeeks(targetYear, targetMonth);
    const weeksHtml = weeks.map((wk, i) => {
      const weekRows = monthRowsAll.filter((r) => r.dueDate >= wk.start && r.dueDate <= wk.end).sort((a, b) => a.dueDate - b.dueDate);
      const weekSqm = weekRows.reduce((t, r) => t + sqmOfDesign(r.d.id), 0);
      return `<div class="ovw-month-week">
        <div class="ovw-month-week-head"><strong>สัปดาห์ที่ ${i + 1}</strong><span>${shortDate(wk.start)} – ${shortDate(wk.end)}</span><span>${weekRows.length} รายการ · ${fmt(weekSqm, 2)} ตร.ม.</span></div>
        ${weekRows.length ? `<div class="table-wrap"><table>
          <thead><tr><th>กำหนดส่ง</th><th>ประเภท</th><th>เลขที่</th><th>ลูกค้า</th><th>Project / PO</th><th>แผนกปัจจุบัน</th><th>สถานะ</th><th class="num">ตร.ม.</th><th></th></tr></thead>
          <tbody>${weekRows.map((r) => monthRowHtml(r, r.dueDate)).join("")}</tbody>
        </table></div>` : `<p class="col-empty">ไม่มีงานกำหนดส่งสัปดาห์นี้</p>`}
      </div>`;
    }).join("");
    const monthLabel = `${monthNames[targetMonth]} ${targetYear + 543}`;
    const skippedRows = skippedList();

    host.dataset.typeFilter = typeFilter;
    host.dataset.pageMode = pageMode;
    host.dataset.monthOffset = String(monthOffset);
    host.innerHTML = `
      <section class="ovw-hero">
        <div>
          <p class="eyebrow">PRODUCTION OVERVIEW</p>
          <h1>ภาพรวมการผลิต — แต่ละ M/O อยู่แผนกไหน</h1>
          <p class="subtitle">สรุปสถานะจริงของทุกงานที่ฝ่ายขายเปิดแล้ว (${total} รายการ) ว่ากำลังอยู่แผนกใด และกำลังทำหรือรอคิวอยู่</p>
        </div>
        <div class="ovw-hero-kpi">
          <div><strong>${total}</strong><span>งานทั้งหมด</span></div>
          <div><strong>${activeCount}</strong><span>กำลังดำเนินการ</span></div>
          <div><strong>${waitingCount}</strong><span>รอคิว/รอวางแผน</span></div>
          <div><strong>${storeCount}</strong><span>สินค้าสำเร็จรูป รอนำส่ง</span></div>
          <div><strong>${shippedCount}</strong><span>จัดส่งแล้ว</span></div>
        </div>
      </section>

      <section class="department-panel ovw-sqm-panel">
        <div class="panel-heading">
          <div><strong>สรุปตร.ม. การผลิต (ทุกงาน)</strong><small>รับเข้ารวม หักด้วยที่ส่งไปแล้ว เท่ากับยอดที่ยังรอนำส่ง (อยู่ระหว่างผลิต หรือรออยู่ในสโตร์)</small></div>
        </div>
        <div class="ovw-daykpi-grid" style="grid-template-columns:repeat(3,1fr)">
          <div class="ovw-daykpi-item"><strong>${fmt(totalSqm, 2)}</strong><span>ตร.ม. รับเข้ารวม</span></div>
          <div class="ovw-daykpi-item"><strong>${fmt(waitingSqm, 2)}</strong><span>ตร.ม. รอนำส่ง (ยังไม่ส่ง)</span></div>
          <div class="ovw-daykpi-item"><strong>${fmt(shippedSqm, 2)}</strong><span>ตร.ม. ส่งไปแล้ว</span></div>
        </div>
      </section>

      <section class="department-panel ovw-daykpi-panel">
        <div class="panel-heading">
          <div><strong>สรุปการผลิตวันนี้</strong><small>${esc(todayThai)} — อัปเดตสดตามข้อมูลที่แต่ละแผนกบันทึกจริงในระบบ</small></div>
        </div>
        <div class="ovw-daykpi-grid">
          <div class="ovw-daykpi-item"><strong>${fmt(dayStats.sqmWeaving, 2)}</strong><span>ตร.ม. กำลังทอ</span></div>
          <div class="ovw-daykpi-item"><strong>${fmt(dayStats.sqmWaiting, 2)}</strong><span>ตร.ม. รอทอ</span></div>
          <div class="ovw-daykpi-item"><strong>${dayStats.colorsToday}</strong><span>สี ย้อมเสร็จวันนี้</span></div>
          <div class="ovw-daykpi-item"><strong>${fmt(dayStats.wovenToday, 2)}</strong><span>ตร.ม. ทอได้วันนี้</span></div>
          <div class="ovw-daykpi-item"><strong>${esc(dayStats.mainGrade || "-")}</strong><span>เกรดทอหลักวันนี้</span></div>
          <div class="ovw-daykpi-item"><strong>${dayStats.effPct != null ? fmt(dayStats.effPct, 1) + "%" : "-"}</strong><span>%ประสิทธิภาพการทอวันนี้</span></div>
          <div class="ovw-daykpi-item"><strong>${dayStats.finishToday}</strong><span>M/O ตกแต่งเสร็จวันนี้</span></div>
          <div class="ovw-daykpi-item"><strong>${dayStats.canvasToday}</strong><span>M/O ขยายลาย/ปั๊มผ้าเสร็จวันนี้</span></div>
        </div>
      </section>

      <section class="ovw-note">
        <strong>ที่มาของสถานะ:</strong> งานที่ <u>ยังไม่เคย</u>บันทึกใบวางแผนงานในระบบนี้ จะแสดงสถานะตามข้อมูลนำเข้าล่าสุดจาก Google Sheet “QC Check Sheet” ของบริษัท (22 ก.ย. 2026) — ข้อมูลนำเข้ารู้แค่ว่าอยู่แผนกไหน ไม่รู้ว่ากำลังลงมือทำอยู่จริงหรือยัง จึงขึ้นเป็น “รอ” ของแผนกนั้นเสมอ
        — เมื่อฝ่ายวางแผน/เจาะลาย/ทอ/ตกแต่งเริ่มกรอกงานจริงในระบบนี้ สถานะจะเปลี่ยนมาอัปเดตสดทันที พร้อมรายละเอียดต่อแผนก เช่น จำนวนสีที่ย้อมแล้ว/เหลือ, เบอร์จอที่กำลังทอ, รอ QC ตรวจ ฯลฯ (ปัจจุบันมี ${liveCount} รายการที่อัปเดตสดแล้ว)
        — วันกำหนดส่ง, ความคืบหน้า และคอลัมน์ “ที่ทอ” (ทอเองที่โรงงาน SIAM หรือจ้างทอนอก) ของงานที่มาจากข้อมูลนำเข้า อัปเดตล่าสุดตาม MASTER PLAN PRODUCTION 17 ก.ย. 2026
      </section>

      <section class="ovw-stagebar">${stageCards}</section>

      <section class="department-panel ovw-table-panel">
        <div class="panel-heading">
          <div><strong>รายละเอียดงานที่ยังไม่เสร็จ</strong><small>แสดงทุกแผนกพร้อมกัน — กดที่แผนกด้านบนเพื่อเลื่อนไปดู หรือค้นหาด้วยเลข M/O · SO, ลูกค้า, Project — งานที่เสร็จ/จัดส่งแล้วย้ายไปอยู่หน้า <u>QC Dashboard → Store</u> เท่านั้น</small></div>
          <div class="segmented ovw-pagemode">
            <button type="button" class="view-btn ${pageMode === "dept" ? "active" : ""}" data-page-mode="dept">ตามแผนก</button>
            <button type="button" class="view-btn ${pageMode === "month" ? "active" : ""}" data-page-mode="month">มุมมองรายเดือน</button>
          </div>
          <div class="segmented ovw-typefilter">
            <button type="button" class="view-btn ${typeFilter === "all" ? "active" : ""}" data-type="all">ทั้งหมด (${activeTotal})</button>
            <button type="button" class="view-btn ${typeFilter === "MO" ? "active" : ""}" data-type="MO">M/O (${activeMoCount})</button>
            <button type="button" class="view-btn ${typeFilter === "SO" ? "active" : ""}" data-type="SO">S/O (${activeSoCount})</button>
          </div>
          <label>ค้นหา<input id="ovwSearch" type="text" placeholder="เช่น MO-0109-26, ART RUGS" value="${esc(query)}"></label>
        </div>
        ${pageMode === "month" ? `
          <div class="ovw-month-nav">
            <button type="button" class="square-btn" data-month-nav="-1">‹</button>
            <strong>${esc(monthLabel)}</strong>
            <button type="button" class="square-btn" data-month-nav="1">›</button>
            ${monthOffset !== 0 ? `<button type="button" class="text-button" data-month-nav="0">กลับเดือนนี้</button>` : ""}
            <span class="ovw-month-summary">${monthRowsAll.length} รายการกำหนดส่งเดือนนี้ · ${fmt(monthSqm, 2)} ตร.ม. · ส่งแล้ว ${monthShippedCount} รายการ</span>
          </div>
          <div class="ovw-month-weeks">${weeksHtml}</div>
        ` : `
          <div class="ovw-deptgroups">${deptGroupsHtml || `<p class="col-empty">ไม่พบรายการที่ตรงกับตัวกรอง</p>`}</div>
        `}
      </section>

      <section class="department-panel pw-card" style="margin-top:10px">
        <div class="panel-heading"><div><strong>คำขอไหมเพิ่มจากแผนกทอ (รอออกใบสั่งย้อม)</strong><small>เกิดจากแผนกทอแจ้งว่าไหมสีใดไม่พอ — ยืนยันผู้อนุมัติและออกใบสั่งย้อมเพิ่มได้ที่หน้า "แผนกทอ" แท็บ "สรุป/ส่งออก/แจ้งเตือน"</small></div></div>
        <div class="pw-body" id="planningYarnRequests"></div>
      </section>

      <details class="ovw-skipped-panel">
        <summary><strong>M/O,S/O ที่กดผ่านแล้ว</strong><span>${skippedRows.length} รายการ — ส่งไปนานแล้ว ไม่อยู่ในกระบวนการผลิต จึงไม่แสดงในคิวงานของทุกแผนก</span></summary>
        <div class="table-wrap">
          <table>
            <thead><tr><th>เลขที่</th><th>ลูกค้า</th><th>Project / PO</th><th>กดผ่านเมื่อ</th><th></th></tr></thead>
            <tbody>${skippedRows.length ? skippedRows.map((r) => `<tr>
              <td><strong>${esc(r.moNo || r.designId)}</strong></td>
              <td>${esc(r.design ? r.design.customer || "-" : "-")}</td>
              <td>${esc(r.design ? r.design.project || "-" : "-")}</td>
              <td>${r.at ? new Date(r.at).toLocaleString("th-TH") : "-"}</td>
              <td><button type="button" class="text-button" data-mo-unskip="${esc(r.designId)}">ยกเลิกผ่าน</button></td>
            </tr>`).join("") : `<tr><td colspan="5" class="col-empty">ยังไม่มีรายการที่กดผ่าน</td></tr>`}</tbody>
          </table>
        </div>
      </details>
    `;

    const searchEl = document.getElementById("ovwSearch");
    if (searchEl) {
      searchEl.addEventListener("input", () => renderOverview());
      searchEl.focus();
      searchEl.selectionStart = searchEl.selectionEnd = searchEl.value.length;
    }
    host.querySelectorAll(".ovw-stage").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.dataset.gotoStore) { if (typeof setView === "function") setView("qcdash"); return; }
        if (pageMode !== "dept") { host.dataset.pageMode = "dept"; renderOverview(); return; }
        const target = host.querySelector(`[data-dept-group="${btn.dataset.scrollDept}"]`);
        if (target) { target.open = true; target.scrollIntoView({ behavior: "smooth", block: "start" }); }
      });
    });
    host.querySelectorAll(".ovw-pagemode [data-page-mode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        host.dataset.pageMode = btn.dataset.pageMode;
        renderOverview();
      });
    });
    host.querySelectorAll("[data-month-nav]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const nav = btn.dataset.monthNav;
        host.dataset.monthOffset = nav === "0" ? "0" : String(monthOffset + Number(nav));
        renderOverview();
      });
    });
    host.querySelectorAll(".ovw-typefilter [data-type]").forEach((btn) => {
      btn.addEventListener("click", () => {
        host.dataset.typeFilter = btn.dataset.type;
        renderOverview();
      });
    });
    host.querySelectorAll(".ovw-goto").forEach((btn) => {
      btn.addEventListener("click", () => { if (typeof setView === "function") setView(btn.dataset.view); });
    });
    host.querySelectorAll("[data-mo-skip]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const designId = btn.dataset.moSkip;
        if (!confirm(`ยืนยันกดผ่าน M/O,S/O "${btn.dataset.moSkipMono || designId}" — จะหายจากคิวงานของทุกแผนกทันที (ใช้เมื่องานนี้ส่งไปนานแล้ว ไม่อยู่ในกระบวนการผลิตแล้วเท่านั้น)`)) return;
        setSkipped(designId, btn.dataset.moSkipMono);
        toast("กดผ่านแล้ว — ยกเลิกได้ที่ท้ายหน้านี้ในส่วน \"M/O,S/O ที่กดผ่านแล้ว\"");
        renderOverview();
      });
    });
    host.querySelectorAll("[data-mo-unskip]").forEach((btn) => {
      btn.addEventListener("click", () => {
        unsetSkipped(btn.dataset.moUnskip);
        toast("ยกเลิกผ่านแล้ว — กลับเข้าคิวงานตามปกติ");
        renderOverview();
      });
    });

    if (typeof renderPlanningYarnRequests === "function") renderPlanningYarnRequests();
  }

  window.renderOverview = renderOverview;
  // ให้หน้าอื่น (เช่น Store ในหน้า QC Dashboard) เรียกใช้ตรรกะ "งานไหนเสร็จแล้ว/อยู่แผนกไหน" ชุดเดียวกัน
  // แทนที่จะเขียนซ้ำ กันข้อมูลเพี้ยนถ้าตรรกะสองที่ไม่ตรงกัน
  window.OverviewEngine = {
    jobs, statusOf, typeOf, shipDateOf, docForDesign, DEPTS,
    // M/O,S/O ที่กด "ผ่าน" (ส่งไปนานแล้ว ไม่อยู่ในกระบวนการผลิต) — ใช้ร่วมกันได้ทุกแผนกเพื่อซ่อนจากคิวงานพร้อมกันทันที
    isSkipped, setSkipped, unsetSkipped, skippedList, skipButtonHtml
  };
})();
