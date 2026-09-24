/* ============================================================
   แผนกทากาวตกแต่ง (Gluing & Finishing Department) + รายงานต้นทุนต่อ M/O
   - รับพรมจากแผนกทอ (ต้องกดโอนจากหน้า "แผนกทอ → หน้าจอทอ (ภาพรวม)" ก่อน เมื่อทอครบ 100% แล้วเท่านั้น)
   - ทากาว: ปูพลาสติก/ไม่ปู, เบิกผ้าตาข่ายกับ Store, ขนาดพรมก่อนทากาว, เบิกกาว, ทา 1-2 รอบ, สูตร KPI กาว = พื้นที่×2
   - แห้งแล้ว: ขนาดหลังแห้ง + ได้มุมฉากไหม
   - ตกแต่ง: วันที่/เวลาเริ่ม, เกรด (ใช้ตาราง FINISH_GRADES เดียวกับ Planning), วิธี (เรียบ/แกะลาย), รายชื่อพนักงาน
   - QC ต่อชิ้น (ใช้ log เดียวกับแผนกทอ ผ่าน WeaveFloorEngine เพื่อให้ QC Dashboard รวมทุกแผนกได้)
   - รายงานต้นทุนต่อ M/O: รวมค่าไหม/ย้อม (จาก Planning) + ค่าแรงทอ+แต่ง (สูตรเดิมของ Planning) + ค่าผ้าตาข่าย/กาว (กรอกราคาเองถ้ามี) + ค่าขนส่ง/พนักงานเพิ่ม (เฉพาะขายในประเทศ) + รายการต้นทุนอื่น ๆ ที่เพิ่มเองได้
   ต้องโหลดหลัง app.js, sales.js, planning.js, weaving.js, weave-floor.js (ใช้ PlanningEngine, WeaveFloorEngine, SalesEngine, designs, $, $$, toast)
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
  const thaiDate = (iso) => { try { return new Date(iso + "T00:00:00").toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "numeric" }); } catch (e) { return iso || "-"; } };

  const PE = () => window.PlanningEngine;
  const WF = () => window.WeaveFloorEngine;

  const KEY_FINISH = "siam-finishing"; // { [designId]: { pieces:{[lineIdx]:FinishRec} } }

  function blankFinishRec() {
    return {
      receivedDate: "", receivedTime: "",
      glue: {
        plasticSheet: false,
        meshWidthM: "", meshLengthM: "", meshPricePerM: "", meshRequisitionIssued: false, meshRequisitionAt: null,
        widthBeforeGlueM: "", lengthBeforeGlueM: "",
        glueItems: [],
        coat1Kg: "", coat1GlueType: "",
        coat2Applied: false, coat2Kg: "", coat2GlueType: "",
        startTime: "", endTime: "",
        note: ""
      },
      dry: { widthAfterDryM: "", lengthAfterDryM: "", isSquare: null },
      finish: { startDate: "", startTime: "", gradeOverride: "", method: "เรียบ", workers: [] },
      transport: { cost: "", extraStaffCost: "" },
      extraCosts: []
    };
  }

  function loadFinishAll() { return readJson(KEY_FINISH, {}); }
  function saveFinishAll(all) { writeJson(KEY_FINISH, all); }

  const KEY_WORKERS_SHARED = "siam-workforce"; // ทะเบียนพนักงานทอ/ตกแต่ง (ใช้ร่วมกับแผนกทอ)
  function loadFinWorkers() { const w = readJson(KEY_WORKERS_SHARED, null); return Array.isArray(w) ? w : []; }
  function saveFinWorkers(list) { writeJson(KEY_WORKERS_SHARED, list); }
  function addFinWorker(name) {
    name = String(name || "").trim();
    if (!name) return;
    const list = loadFinWorkers();
    if (list.some((w) => w.toLowerCase() === name.toLowerCase())) { toast(`มีชื่อ "${name}" อยู่แล้ว`); return; }
    list.push(name);
    saveFinWorkers(list);
  }
  function removeFinWorker(idx) {
    const list = loadFinWorkers();
    list.splice(idx, 1);
    saveFinWorkers(list);
  }
  function exportFinWorkersExcel() {
    if (typeof XLSX === "undefined") { toast("ไม่พบไลบรารี XLSX"); return; }
    const rows = [["แผนก", "ชื่อ-นามสกุล"], ...loadFinWorkers().map((w) => ["ทอ/ตกแต่ง", w])];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "พนักงานทอ-ตกแต่ง");
    XLSX.writeFile(wb, "รายชื่อพนักงาน-ทอ-ตกแต่ง.xlsx");
  }
  const KEY_PATTERN_WORKERS_EXT = "siam-workforce-pattern"; // ทะเบียนเจาะลาย/ปั๊มผ้า — ไฟล์นำเข้าเดียวแยกลงได้ทั้ง 2 ทะเบียนไม่ว่าจะอัปโหลดจากหน้าไหน
  async function importFinWorkersExcel(file) {
    if (typeof XLSX === "undefined") { toast("ไม่พบไลบรารี XLSX"); return; }
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const sharedList = loadFinWorkers();
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
    saveFinWorkers(sharedList);
    writeJson(KEY_PATTERN_WORKERS_EXT, patternList);
    toast(`นำเข้ารายชื่อพนักงานแล้ว — ทอ/ตกแต่ง ${sharedAdded} คน, เจาะลาย/ปั๊มผ้า ${patternAdded} คน`);
  }
  function finRosterHtml() {
    const workers = loadFinWorkers();
    return `<section class="department-panel pw-card">
      <div class="panel-heading"><div><strong>รายชื่อพนักงานทอ/ตกแต่ง</strong><small>เพิ่ม/ลบรายชื่อได้ที่นี่ — ใช้ร่วมกันทั้งแผนกทอและแผนกตกแต่ง</small></div></div>
      <div class="pw-body">
        <div class="pw-row">
          ${field("ชื่อพนักงาน", `<input id="finNewWorkerName" placeholder="พิมพ์ชื่อแล้วกดเพิ่มรายชื่อ">`)}
          <button type="button" class="action-button primary" data-add-finworker>+ เพิ่มรายชื่อ</button>
          <button type="button" class="action-button" data-export-finworkers>ส่งออก Excel</button>
          <label class="file-picker">นำเข้าจาก Excel<input type="file" id="finWorkersImportFile" accept=".xlsx,.xls" data-import-finworkers></label>
        </div>
        ${workers.length
          ? `<div class="pw-worker-tags">${workers.map((w, i) => `<span>${esc(w)}<button type="button" class="pw-worker-x" data-remove-finworker="${i}" title="ลบรายชื่อนี้">×</button></span>`).join("")}</div>`
          : `<p class="col-empty">ยังไม่มีรายชื่อพนักงาน — เพิ่มด้านบน</p>`}
      </div>
    </section>`;
  }
  function ensureDesignFinish(designId) {
    const all = loadFinishAll();
    if (!all[designId]) all[designId] = { pieces: {} };
    if (!all[designId].pieces) all[designId].pieces = {};
    return all[designId];
  }
  function saveDesignFinish(designId, rec) { const all = loadFinishAll(); all[designId] = rec; saveFinishAll(all); }
  function ensurePieceFinish(dfin, lineIdx) {
    if (!dfin.pieces[lineIdx]) dfin.pieces[lineIdx] = blankFinishRec();
    const rec = dfin.pieces[lineIdx];
    if (!rec.glue) rec.glue = blankFinishRec().glue;
    if (!rec.dry) rec.dry = blankFinishRec().dry;
    if (!rec.finish) rec.finish = blankFinishRec().finish;
    if (!rec.transport) rec.transport = blankFinishRec().transport;
    if (!rec.extraCosts) rec.extraCosts = [];
    return rec;
  }

  function areaBeforeGlue(rec) { return num(rec.glue.widthBeforeGlueM) * num(rec.glue.lengthBeforeGlueM); }
  function standardGlueKg(rec) { return areaBeforeGlue(rec) * 2; }
  function actualGlueKg(rec) { return num(rec.glue.coat1Kg) + (rec.glue.coat2Applied ? num(rec.glue.coat2Kg) : 0); }
  function glueVariancePct(rec) { const std = standardGlueKg(rec); return std > 0 ? (actualGlueKg(rec) - std) / std * 100 : null; }

  /* ============================================================
     M/O ที่พร้อมตกแต่ง — ต้องมี piece ที่โอนจากแผนกทอแล้ว (transferredToGlueAt)
     ============================================================ */
  function readyFinishPieces() {
    const floor = WF().loadFloorAll();
    const refs = [];
    Object.keys(floor).forEach((designId) => {
      const plan = WF().planFor(designId);
      if (!plan) return;
      const lines = WF().linesOf(designId, plan);
      const pieces = floor[designId].pieces || {};
      Object.keys(pieces).forEach((lineIdx) => {
        const piece = pieces[lineIdx];
        if (!piece.transferredToGlueAt) return;
        const line = lines[lineIdx] || { location: `ชิ้นที่ ${Number(lineIdx) + 1}` };
        refs.push({ designId, lineIdx, plan, line, weavePiece: piece, totalArea: num(line.sqm) || num(plan.totalAreaSqm) });
      });
    });
    return refs;
  }
  function readyDesignIds() { return [...new Set(readyFinishPieces().map((r) => r.designId))]; }

  const state = { tab: "glue", designId: null, lineIdx: null };

  function field(label, inner) { return `<label class="pf">${label}${inner}</label>`; }
  function res(label, value, cls = "") { return `<div class="pr ${cls}"><small>${label}</small><strong>${value}</strong></div>`; }
  function checkGrid(name, options, selected) {
    return `<div class="pw-worker-check-grid">${options.map((w) => `<label class="pw-worker-check"><input type="checkbox" data-fcheck="${esc(name)}" value="${esc(w)}" ${(selected || []).includes(w) ? "checked" : ""}> ${esc(w)}</label>`).join("")}</div>`;
  }

  function tabBar() {
    const tabs = [["glue", "รับพรม + ทากาว"], ["finish", "แห้ง + ตกแต่ง + QC"], ["cost", "ต้นทุนต่อ M/O"]];
    return `<div class="control-strip"><div class="segmented">${tabs.map(([k, l]) => `<button type="button" class="view-btn ${state.tab === k ? "active" : ""}" data-fntab="${k}">${l}</button>`).join("")}</div></div>`;
  }

  function pieceJobPickerHtml() {
    const refs = readyFinishPieces();
    if (!refs.length) return `<p class="col-empty">ยังไม่มีชิ้นที่โอนจากแผนกทอ — ต้องทอครบ 100% แล้วกด “โอนให้แผนกทากาวตกแต่ง” ที่หน้า “แผนกทอ → หน้าจอทอ (ภาพรวม)” ก่อน</p>`;
    return `<div class="pw-job-grid">${refs.map((r) => `<button type="button" class="pw-job-card dept-finishing ${state.designId === r.designId && state.lineIdx == r.lineIdx ? "active" : ""}" data-fnpick-design="${esc(r.designId)}" data-fnpick-line="${esc(r.lineIdx)}">
      <strong>${esc(r.plan.moNo || r.designId)}</strong><span>${esc(r.line.location || `ชิ้นที่ ${Number(r.lineIdx) + 1}`)}</span><small>จอ ${esc(r.weavePiece.loomNo || "-")} · โอนแล้ว ${new Date(r.weavePiece.transferredToGlueAt).toLocaleDateString("th-TH")}</small>
    </button>`).join("")}</div>`;
  }

  function currentRef() {
    if (!state.designId || state.lineIdx == null) return null;
    return readyFinishPieces().find((r) => r.designId === state.designId && String(r.lineIdx) === String(state.lineIdx)) || null;
  }

  /* ---------------- Tab 1: รับพรม + ทากาว ---------------- */
  function glueTabHtml() {
    const ref = currentRef();
    if (!ref) return `<p class="col-empty">เลือกชิ้นด้านบนก่อน</p>`;
    const dfin = ensureDesignFinish(state.designId);
    const rec = ensurePieceFinish(dfin, state.lineIdx);
    const area = areaBeforeGlue(rec), std = standardGlueKg(rec), actual = actualGlueKg(rec), variance = glueVariancePct(rec);
    return `
    <section class="department-panel pw-card">
      <div class="panel-heading"><div><strong>รับพรมจากแผนกทอ</strong><small>M/O ${esc(ref.plan.moNo || ref.designId)} · ${esc(ref.line.location || "-")}</small></div></div>
      <div class="pw-body">
        <div class="pw-row">
          ${field("วันที่รับพรม", `<input type="date" data-ff="receivedDate" value="${esc(rec.receivedDate)}">`)}
          ${field("เวลาที่รับ", `<input type="time" data-ff="receivedTime" value="${esc(rec.receivedTime)}">`)}
          ${res("โอนจากแผนกทอเมื่อ", new Date(ref.weavePiece.transferredToGlueAt).toLocaleString("th-TH"))}
        </div>
      </div>
    </section>

    <section class="department-panel pw-card wide">
      <div class="panel-heading"><div><strong>ทากาว</strong><small>ปูพลาสติกป้องกันพื้น → วัดขนาดพรมก่อนทากาว → เบิกผ้าตาข่าย/กาวกับ Store → ทา 1-2 รอบ</small></div></div>
      <div class="pw-body">
        <div class="pw-row">
          <label class="pf"><input type="checkbox" data-fg="plasticSheet" ${rec.glue.plasticSheet ? "checked" : ""}> ปูพลาสติกก่อนทากาว</label>
          ${field("เริ่มทากาว", `<input type="time" data-fg="startTime" value="${esc(rec.glue.startTime)}">`)}
          ${field("ทากาวเสร็จ", `<input type="time" data-fg="endTime" value="${esc(rec.glue.endTime)}">`)}
        </div>

        <label class="pf" style="margin-top:8px;display:block">ขนาดพรมก่อนทากาว</label>
        <div class="pw-row">
          ${field("กว้าง (ม.)", `<input data-fg="widthBeforeGlueM" value="${esc(rec.glue.widthBeforeGlueM)}" inputmode="decimal" class="pw-num tiny">`)}
          ${field("ยาว (ม.)", `<input data-fg="lengthBeforeGlueM" value="${esc(rec.glue.lengthBeforeGlueM)}" inputmode="decimal" class="pw-num tiny">`)}
          ${res("พื้นที่", `${fmt(area, 2)} ตร.ม.`, "main")}
        </div>

        <label class="pf" style="margin-top:8px;display:block">เบิกผ้าตาข่ายสำหรับปะหลังทากาว (กับแผนก Store)</label>
        <div class="pw-row">
          ${field("หน้ากว้าง (ม.)", `<input data-fg="meshWidthM" value="${esc(rec.glue.meshWidthM)}" inputmode="decimal" class="pw-num tiny">`)}
          ${field("ความยาวที่เบิก (ม.)", `<input data-fg="meshLengthM" value="${esc(rec.glue.meshLengthM)}" inputmode="decimal" class="pw-num tiny">`)}
          ${field("ราคา/เมตร (ถ้ามี)", `<input data-fg="meshPricePerM" value="${esc(rec.glue.meshPricePerM)}" inputmode="decimal" class="pw-num tiny">`)}
          <button type="button" class="action-button ${rec.glue.meshRequisitionIssued ? "" : "primary"}" data-issue-mesh>${rec.glue.meshRequisitionIssued ? "เบิกแล้ว" : "ออกใบเบิกกับ Store"}</button>
        </div>
        ${rec.glue.meshRequisitionIssued ? `<small style="color:var(--muted)">เบิกเมื่อ ${new Date(rec.glue.meshRequisitionAt).toLocaleString("th-TH")}</small>` : ""}

        <label class="pf" style="margin-top:8px;display:block">เบิกกาวจากแผนก Store (เบิกได้หลายชนิด)</label>
        <table class="calc-table"><thead><tr><th>ชนิดกาว</th><th class="num">กก. ที่เบิก</th><th class="num">ราคา/กก. (ถ้ามี)</th><th></th></tr></thead>
        <tbody>${rec.glue.glueItems.map((it, i) => `<tr data-glueitem="${i}">
          <td><input name="glueType" value="${esc(it.glueType)}" placeholder="เช่น กาวลาเท็กซ์"></td>
          <td><input name="kg" value="${esc(it.kg)}" inputmode="decimal" class="pw-num tiny"></td>
          <td><input name="pricePerKg" value="${esc(it.pricePerKg)}" inputmode="decimal" class="pw-num tiny"></td>
          <td><button type="button" class="pw-worker-x" data-remove-glueitem="${i}">×</button></td>
        </tr>`).join("") || `<tr><td colspan="4" class="col-empty">ยังไม่มีรายการเบิกกาว</td></tr>`}</tbody></table>
        <div class="pw-save-bar"><button type="button" class="action-button" data-add-glueitem>+ เพิ่มรายการเบิกกาว</button></div>

        <div class="pw-row" style="margin-top:8px">
          ${field("ทารอบแรก (กก.)", `<input data-fg="coat1Kg" value="${esc(rec.glue.coat1Kg)}" inputmode="decimal" class="pw-num tiny">`)}
          ${field("ใช้กาวชนิดใด (รอบแรก)", `<input data-fg="coat1GlueType" value="${esc(rec.glue.coat1GlueType)}" placeholder="ชนิดกาว">`)}
        </div>
        <div class="pw-row">
          <label class="pf"><input type="checkbox" data-fg="coat2Applied" ${rec.glue.coat2Applied ? "checked" : ""}> ทารอบสอง</label>
          ${rec.glue.coat2Applied ? field("ทารอบสอง (กก.)", `<input data-fg="coat2Kg" value="${esc(rec.glue.coat2Kg)}" inputmode="decimal" class="pw-num tiny">`) : ""}
          ${rec.glue.coat2Applied ? field("ใช้กาวชนิดใด (รอบสอง)", `<input data-fg="coat2GlueType" value="${esc(rec.glue.coat2GlueType)}" placeholder="ชนิดกาว">`) : ""}
        </div>

        <div class="pw-res-row" style="margin-top:8px">
          ${res("ปริมาณกาวมาตรฐาน (พื้นที่ × 2)", `${fmt(std, 2)} กก.`)}
          ${res("ปริมาณกาวที่ใช้จริง", `${fmt(actual, 2)} กก.`, "main")}
          ${variance == null ? res("ผลต่างจากมาตรฐาน", "กรอกขนาดพรมก่อน") : res("ผลต่างจากมาตรฐาน", `${variance >= 0 ? "+" : ""}${fmt(variance, 1)}%`, Math.abs(variance) < 0.5 ? "main" : "")}
        </div>

        <label class="pf" style="margin-top:8px">หมายเหตุ (เพิ่มเติมภายหลังได้)</label>
        <textarea data-fg="note" rows="2" style="width:100%;font:inherit;padding:6px;border:1px solid var(--line)">${esc(rec.glue.note)}</textarea>
      </div>
    </section>`;
  }

  /* ---------------- Tab 2: แห้ง + ตกแต่ง + QC ---------------- */
  function qcRowsHtml(designId, lineIdx) {
    const list = WF().loadQc().filter((q) => q.designId === designId && String(q.lineIdx) === String(lineIdx) && q.dept === "finishing").sort((a, b) => b.date.localeCompare(a.date));
    if (!list.length) return `<p class="col-empty">ยังไม่มีประวัติ QC ของชิ้นนี้</p>`;
    return `<table class="calc-table"><thead><tr><th>วันที่ตรวจ</th><th>ผู้ตรวจ</th><th>ผล</th><th>รายละเอียด</th></tr></thead><tbody>${list.map((q) => `<tr><td>${thaiDate(q.date)}</td><td>${esc(q.inspector)}</td><td><span class="status-tag ${q.result === "ไม่ผ่าน" ? "blocked" : q.result === "มีข้อสังเกต" ? "review" : ""}">${esc(q.result)}</span></td><td>${esc(q.detail)}</td></tr>`).join("")}</tbody></table>`;
  }

  function finishTabHtml() {
    const ref = currentRef();
    if (!ref) return `<p class="col-empty">เลือกชิ้นด้านบนก่อน</p>`;
    const dfin = ensureDesignFinish(state.designId);
    const rec = ensurePieceFinish(dfin, state.lineIdx);
    const workers = loadFinWorkers();
    const finishGrades = PE().FINISH_GRADES || [];
    const suggested = (PE().suggestGrade(finishGrades, ref.plan.patternPct) || {}).grade || "";
    const isSquareVal = rec.dry.isSquare;
    return `
    <section class="department-panel pw-card">
      <div class="panel-heading"><div><strong>พรมแห้งแล้ว</strong><small>วัดขนาดหลังแห้ง — เทียบกับก่อนทากาวเพื่อดูการหดตัว</small></div></div>
      <div class="pw-body">
        <div class="pw-row">
          ${field("กว้างหลังแห้ง (ม.)", `<input data-fd="widthAfterDryM" value="${esc(rec.dry.widthAfterDryM)}" inputmode="decimal" class="pw-num tiny">`)}
          ${field("ยาวหลังแห้ง (ม.)", `<input data-fd="lengthAfterDryM" value="${esc(rec.dry.lengthAfterDryM)}" inputmode="decimal" class="pw-num tiny">`)}
          ${res("พื้นที่หลังแห้ง", `${fmt(num(rec.dry.widthAfterDryM) * num(rec.dry.lengthAfterDryM), 2)} ตร.ม.`)}
        </div>
        <div class="pw-row">
          <label class="pf">ได้มุมฉากไหม</label>
          <label class="pw-worker-check"><input type="radio" name="isSquareRadio" data-fd-square="true" ${isSquareVal === true ? "checked" : ""}> ได้ฉาก</label>
          <label class="pw-worker-check"><input type="radio" name="isSquareRadio" data-fd-square="false" ${isSquareVal === false ? "checked" : ""}> ไม่ได้ฉาก</label>
        </div>
      </div>
    </section>

    <section class="department-panel pw-card wide">
      <div class="panel-heading"><div><strong>ตกแต่งพรม</strong><small>เกรดใช้ตารางเดียวกับ Planning (${finishGrades.map((g) => g.grade).join("/")}) — ว่าง = อัตโนมัติจาก % ลายของแบบ</small></div></div>
      <div class="pw-body">
        <div class="pw-row">
          ${field("เริ่มตกแต่งวันที่", `<input type="date" data-ff2="startDate" value="${esc(rec.finish.startDate)}">`)}
          ${field("เวลาเริ่ม", `<input type="time" data-ff2="startTime" value="${esc(rec.finish.startTime)}">`)}
          ${field("เกรด", `<select data-ff2="gradeOverride"><option value="">อัตโนมัติ (${esc(suggested)})</option>${finishGrades.map((g) => `<option value="${esc(g.grade)}" ${rec.finish.gradeOverride === g.grade ? "selected" : ""}>${esc(g.grade)}</option>`).join("")}</select>`)}
          ${field("วิธีตกแต่ง", `<select data-ff2="method"><option value="เรียบ" ${rec.finish.method === "เรียบ" ? "selected" : ""}>แต่งเรียบ</option><option value="แกะลาย" ${rec.finish.method === "แกะลาย" ? "selected" : ""}>แกะลาย</option></select>`)}
        </div>
        <label class="pf" style="margin-top:6px">รายชื่อพนักงานที่แต่งพรม</label>
        ${workers.length ? checkGrid("workers", workers, rec.finish.workers) : `<p class="col-empty">ยังไม่มีทะเบียนพนักงาน (เปิดหน้า “ใบวางแผนงาน” ครั้งหนึ่งเพื่อสร้างทะเบียน)</p>`}
        ${rec.finish.workers.length ? `<small style="color:var(--muted);font-size:9px">มอบหมายแล้ว ${rec.finish.workers.length} คน: ${rec.finish.workers.map(esc).join(", ")}</small>` : ""}
      </div>
    </section>

    <section class="department-panel pw-card wide">
      <div class="panel-heading"><div><strong>QC ตรวจชิ้นงานหลังตกแต่ง</strong><small>บันทึกวันที่ตรวจ/ผู้ตรวจ/ผล/รายละเอียด — แสดงรวมในหน้า QC Dashboard</small></div></div>
      <div class="pw-body">
        <div class="pw-row">
          ${field("วันที่ตรวจ", `<input type="date" id="fqcDate" value="${esc(new Date().toISOString().slice(0, 10))}">`)}
          ${field("ผู้ตรวจ", `<input id="fqcInspector" placeholder="ชื่อผู้ตรวจ QC">`)}
          ${field("ผล", `<select id="fqcResult">${(WF().QC_RESULTS || []).map((r) => `<option value="${esc(r)}">${esc(r)}</option>`).join("")}</select>`)}
        </div>
        <div class="pw-row">${field("รายละเอียด", `<input id="fqcDetail" placeholder="รายละเอียดที่ตรวจพบ" style="min-width:320px">`)}</div>
        <div class="pw-save-bar"><button type="button" class="action-button primary" data-add-fqc>บันทึก QC</button></div>
        ${qcRowsHtml(state.designId, state.lineIdx)}
      </div>
    </section>`;
  }

  /* ---------------- Tab 3: ต้นทุนต่อ M/O ---------------- */
  function costRollupFor(designId) {
    const plan = WF().planFor(designId);
    if (!plan) return null;
    const doc = WF().moDocOf(designId);
    const dye = WF().dyePlanOf(plan);
    let dyeCost = 0, dyeMissing = 0;
    dye.pots.forEach((pot) => {
      const order = plan.dyeOrders && plan.dyeOrders[pot.key];
      if (order) dyeCost += PE().dyeOrderCost(order, pot.netKg).total;
      else dyeMissing++;
    });
    const gradeStr = WF().suggestedGradeFor(plan);
    const gradeObj = (PE().WEAVE_GRADES || []).find((g) => g.grade === (plan.weaveGradeOverride || gradeStr));
    const labor = PE().laborCost(num(plan.totalAreaSqm), gradeObj);

    const dfin = loadFinishAll()[designId] || { pieces: {} };
    let meshCost = 0, glueCost = 0, transportCost = 0, extraStaffCost = 0, extraCostTotal = 0;
    const extraLines = [];
    Object.values(dfin.pieces || {}).forEach((rec) => {
      meshCost += num(rec.glue.meshLengthM) * num(rec.glue.meshPricePerM);
      (rec.glue.glueItems || []).forEach((it) => { glueCost += num(it.kg) * num(it.pricePerKg); });
      transportCost += num(rec.transport.cost);
      extraStaffCost += num(rec.transport.extraStaffCost);
      (rec.extraCosts || []).forEach((ec) => { extraCostTotal += num(ec.amount); extraLines.push(ec); });
    });
    const isDomestic = doc && doc.market === "DOMESTIC";
    const total = dyeCost + labor.total + meshCost + glueCost + (isDomestic ? transportCost + extraStaffCost : 0) + extraCostTotal;
    const sqm = num(plan.totalAreaSqm);
    return {
      designId, plan, doc, dyeCost, dyeMissing, labor, meshCost, glueCost,
      transportCost: isDomestic ? transportCost : 0, extraStaffCost: isDomestic ? extraStaffCost : 0,
      extraCostTotal, extraLines, total, sqm, costPerSqm: sqm > 0 ? total / sqm : 0,
      isDomestic, market: doc ? doc.market : null,
      saleAmount: doc ? SalesEngine.docAmount(doc) : null, currency: doc ? doc.currency : null
    };
  }

  function costRollupRowHtml(c) {
    return `<tr>
      <td>${esc(c.plan.moNo || c.designId)}</td>
      <td>${c.market ? esc(c.market === "DOMESTIC" ? "ในประเทศ" : "ต่างประเทศ") : "-"}</td>
      <td class="num">${fmt(c.dyeCost, 2)}${c.dyeMissing ? `<br><small class="pw-dye-warn">${c.dyeMissing} หม้อยังไม่มีใบสั่งย้อม</small>` : ""}</td>
      <td class="num">${fmt(c.labor.total, 2)}</td>
      <td class="num">${fmt(c.meshCost + c.glueCost, 2)}</td>
      <td class="num">${fmt(c.transportCost + c.extraStaffCost, 2)}</td>
      <td class="num">${fmt(c.extraCostTotal, 2)}</td>
      <td class="num"><strong>${fmt(c.total, 2)}</strong></td>
      <td class="num">${fmt(c.costPerSqm, 2)}</td>
      <td class="num">${c.saleAmount != null ? `${fmt(c.saleAmount, 2)} ${esc(c.currency || "")}` : "-"}</td>
    </tr>`;
  }

  function costTabHtml() {
    const ids = [...new Set([...readyDesignIds(), ...Object.keys(loadFinishAll())])];
    const plans = PE().readJson(PE().KEY_PLANS, {});
    const allSaved = Object.keys(plans).filter((id) => plans[id].savedAt);
    const list = [...new Set([...ids, ...allSaved])].map((id) => costRollupFor(id)).filter(Boolean);
    return `
    <section class="department-panel pw-card wide">
      <div class="panel-heading"><div><strong>สรุปต้นทุนต่อ M/O</strong><small>รวมค่าไหม/ย้อม (จากใบสั่งย้อมในใบวางแผนงาน) + ค่าแรงทอ+แต่ง (สูตรประมาณของ Planning) + ค่าผ้าตาข่าย/กาว + ค่าขนส่ง/พนักงานเพิ่ม (เฉพาะขายในประเทศ) + รายการอื่น ๆ — ตัวเลขราคาที่ยังไม่มีข้อมูลจริงเริ่มต้นที่ 0 ทั้งหมด กรอกเพิ่มได้ตามจริง</small></div></div>
      <div class="pw-body">
        ${list.length ? `<table class="calc-table"><thead><tr><th>M/O</th><th>ตลาด</th><th class="num">ค่าไหม/ย้อม</th><th class="num">ค่าแรงทอ+แต่ง</th><th class="num">ค่าผ้าตาข่าย+กาว</th><th class="num">ขนส่ง+พนักงานเพิ่ม</th><th class="num">อื่น ๆ</th><th class="num">รวมต้นทุน</th><th class="num">ต้นทุน/ตร.ม.</th><th class="num">ยอดขาย</th></tr></thead><tbody>${list.map(costRollupRowHtml).join("")}</tbody></table>
        <p style="color:var(--muted);font-size:10px;margin:6px 2px 0">หมายเหตุ: ค่าแรงทอ+แต่งใช้สูตรเดียวกับหน้าใบวางแผนงาน (พื้นที่ × ค่าแรงเกรด + พื้นที่ × 400 บาท/ตร.ม. สำหรับแต่ง/ทากาว — สมมติฐานหน่วย ยังไม่ยืนยันกับฝ่ายบัญชี) · ค่าแรงแผนกเจาะลาย/ขยายลาย ยังไม่มีอัตราค่าจ้างยืนยัน จึงไม่รวมในยอดนี้ · ยอดขายเทียบสกุลเงินตามที่บันทึกในหน้ารายงานขาย (ต่างประเทศเป็น USD ในประเทศเป็น THB — ไม่ได้แปลงอัตราแลกเปลี่ยนให้)</p>` : `<p class="col-empty">ยังไม่มี M/O ที่บันทึกใบวางแผนงาน</p>`}
      </div>
    </section>

    ${currentRef() ? costDetailHtml() : `<p class="col-empty">เลือกชิ้นในแท็บ “รับพรม + ทากาว” เพื่อกรอกค่าขนส่ง/ค่าใช้จ่ายเพิ่มเติมของ M/O นั้น</p>`}`;
  }

  function costDetailHtml() {
    const ref = currentRef();
    const dfin = ensureDesignFinish(state.designId);
    const rec = ensurePieceFinish(dfin, state.lineIdx);
    const doc = WF().moDocOf(state.designId);
    const isDomestic = doc && doc.market === "DOMESTIC";
    return `<section class="department-panel pw-card wide">
      <div class="panel-heading"><div><strong>ค่าใช้จ่ายเพิ่มเติม — M/O ${esc(ref.plan.moNo || ref.designId)} · ${esc(ref.line.location || "-")}</strong><small>${isDomestic ? "ขายในประเทศ — มีค่าขนส่ง/ค่าพนักงานเพิ่มเติมได้" : "ขายต่างประเทศ — ปกติไม่มีค่าขนส่งในประเทศ (ซ่อนช่องนี้)"}</small></div></div>
      <div class="pw-body">
        ${isDomestic ? `<div class="pw-row">
          ${field("ค่าขนส่ง (บาท)", `<input data-ftr="cost" value="${esc(rec.transport.cost)}" inputmode="decimal" class="pw-num tiny">`)}
          ${field("ค่าพนักงานเพิ่มเติม (บาท)", `<input data-ftr="extraStaffCost" value="${esc(rec.transport.extraStaffCost)}" inputmode="decimal" class="pw-num tiny">`)}
        </div>` : ""}
        <label class="pf" style="margin-top:8px;display:block">รายการต้นทุนอื่น ๆ (เพิ่มเองได้ — เผื่อรายการที่ยังไม่ได้กำหนดไว้ล่วงหน้า)</label>
        <table class="calc-table"><thead><tr><th>รายการ</th><th class="num">จำนวนเงิน (บาท)</th><th></th></tr></thead>
        <tbody>${rec.extraCosts.map((ec, i) => `<tr data-extracost="${i}"><td><input name="label" value="${esc(ec.label)}" placeholder="เช่น ค่าซ่อมพรม"></td><td><input name="amount" value="${esc(ec.amount)}" inputmode="decimal" class="pw-num tiny"></td><td><button type="button" class="pw-worker-x" data-remove-extracost="${i}">×</button></td></tr>`).join("") || `<tr><td colspan="3" class="col-empty">ยังไม่มีรายการ</td></tr>`}</tbody></table>
        <div class="pw-save-bar"><button type="button" class="action-button" data-add-extracost>+ เพิ่มรายการต้นทุน</button></div>
      </div>
    </section>`;
  }

  /* ============================================================
     Render / Bind
     ============================================================ */
  function build() {
    const root = $("#finishingView");
    root.innerHTML = `
      <section class="page-heading">
        <div><p class="eyebrow">GLUING &amp; FINISHING</p><h1>แผนกทากาวตกแต่ง</h1><p class="subtitle">รับพรมจากแผนกทอ → ทากาว (KPI ปริมาณกาวมาตรฐาน = พื้นที่ × 2) → แห้ง/ตกแต่ง/QC → สรุปต้นทุนรวมต่อ M/O</p></div>
      </section>
      ${tabBar()}
      <div id="fnRoster"></div>
      <section class="department-panel pw-card">
        <div class="panel-heading"><div><strong>เลือกชิ้นที่โอนจากแผนกทอ</strong></div></div>
        <div class="pw-body" id="fnJobPicker"></div>
      </section>
      <div id="fnTabBody"></div>`;
  }

  function renderAll() {
    $("#fnRoster").innerHTML = finRosterHtml();
    const pickerSection = $("#fnJobPicker") ? $("#fnJobPicker").closest("section") : null;
    if (pickerSection) pickerSection.style.display = state.tab === "cost" && !state.designId ? "" : (state.tab === "cost" ? "" : "");
    $("#fnJobPicker").innerHTML = pieceJobPickerHtml();
    let html = "";
    if (state.tab === "glue") html = glueTabHtml();
    else if (state.tab === "finish") html = finishTabHtml();
    else if (state.tab === "cost") html = costTabHtml();
    $("#fnTabBody").innerHTML = html;
    $$(".view-btn[data-fntab]").forEach((b) => b.classList.toggle("active", b.dataset.fntab === state.tab));
  }

  let built = false;
  function renderFinishing() {
    if (!built) { build(); built = true; bind(); }
    renderAll();
  }

  function bind() {
    const root = $("#finishingView");
    root.addEventListener("click", (e) => {
      const tabBtn = e.target.closest("[data-fntab]");
      if (tabBtn) { state.tab = tabBtn.dataset.fntab; renderAll(); return; }
      const addFw = e.target.closest("[data-add-finworker]");
      if (addFw) {
        const input = $("#finNewWorkerName");
        const name = input ? input.value : "";
        if (has(name)) { addFinWorker(name); renderAll(); const again = $("#finNewWorkerName"); if (again) again.focus(); }
        return;
      }
      const rmFw = e.target.closest("[data-remove-finworker]");
      if (rmFw) { removeFinWorker(Number(rmFw.dataset.removeFinworker)); renderAll(); return; }
      const expFw = e.target.closest("[data-export-finworkers]");
      if (expFw) { exportFinWorkersExcel(); return; }
      const pick = e.target.closest("[data-fnpick-design]");
      if (pick) { state.designId = pick.dataset.fnpickDesign; state.lineIdx = pick.dataset.fnpickLine; renderAll(); return; }

      const issueMesh = e.target.closest("[data-issue-mesh]");
      if (issueMesh) {
        const dfin = ensureDesignFinish(state.designId);
        const rec = ensurePieceFinish(dfin, state.lineIdx);
        rec.glue.meshRequisitionIssued = true; rec.glue.meshRequisitionAt = new Date().toISOString();
        saveDesignFinish(state.designId, dfin);
        toast("ออกใบเบิกผ้าตาข่ายกับ Store แล้ว");
        renderAll(); return;
      }
      const addGlueItem = e.target.closest("[data-add-glueitem]");
      if (addGlueItem) {
        const dfin = ensureDesignFinish(state.designId);
        const rec = ensurePieceFinish(dfin, state.lineIdx);
        rec.glue.glueItems.push({ glueType: "", kg: "", pricePerKg: "" });
        saveDesignFinish(state.designId, dfin);
        renderAll(); return;
      }
      const rmGlueItem = e.target.closest("[data-remove-glueitem]");
      if (rmGlueItem) {
        const dfin = ensureDesignFinish(state.designId);
        const rec = ensurePieceFinish(dfin, state.lineIdx);
        rec.glue.glueItems.splice(Number(rmGlueItem.dataset.removeGlueitem), 1);
        saveDesignFinish(state.designId, dfin);
        renderAll(); return;
      }
      const addExtra = e.target.closest("[data-add-extracost]");
      if (addExtra) {
        const dfin = ensureDesignFinish(state.designId);
        const rec = ensurePieceFinish(dfin, state.lineIdx);
        rec.extraCosts.push({ label: "", amount: "" });
        saveDesignFinish(state.designId, dfin);
        renderAll(); return;
      }
      const rmExtra = e.target.closest("[data-remove-extracost]");
      if (rmExtra) {
        const dfin = ensureDesignFinish(state.designId);
        const rec = ensurePieceFinish(dfin, state.lineIdx);
        rec.extraCosts.splice(Number(rmExtra.dataset.removeExtracost), 1);
        saveDesignFinish(state.designId, dfin);
        renderAll(); return;
      }
      const addFqc = e.target.closest("[data-add-fqc]");
      if (addFqc) {
        const dfin = ensureDesignFinish(state.designId);
        const rec = ensurePieceFinish(dfin, state.lineIdx);
        const inspector = $("#fqcInspector").value, result = $("#fqcResult").value, detail = $("#fqcDetail").value, date = $("#fqcDate").value;
        if (!has(inspector)) { toast("กรอกชื่อผู้ตรวจ QC ก่อน"); return; }
        WF().addQc({ designId: state.designId, lineIdx: state.lineIdx, loomNo: "", dept: "finishing", date, inspector, result, detail });
        toast("บันทึก QC แล้ว");
        renderAll(); return;
      }
    });

    root.addEventListener("change", (e) => {
      if (e.target && e.target.hasAttribute && e.target.hasAttribute("data-import-finworkers")) {
        const file = e.target.files && e.target.files[0];
        if (file) importFinWorkersExcel(file).then(() => { renderAll(); e.target.value = ""; });
        return;
      }
      const ff = e.target.closest("[data-ff]");
      if (ff) {
        const dfin = ensureDesignFinish(state.designId);
        const rec = ensurePieceFinish(dfin, state.lineIdx);
        rec[ff.dataset.ff] = ff.value;
        saveDesignFinish(state.designId, dfin);
        renderAll(); return;
      }
      const fg = e.target.closest("[data-fg]");
      if (fg) {
        const dfin = ensureDesignFinish(state.designId);
        const rec = ensurePieceFinish(dfin, state.lineIdx);
        rec.glue[fg.dataset.fg] = fg.type === "checkbox" ? fg.checked : fg.value;
        saveDesignFinish(state.designId, dfin);
        renderAll(); return;
      }
      const fd = e.target.closest("[data-fd]");
      if (fd) {
        const dfin = ensureDesignFinish(state.designId);
        const rec = ensurePieceFinish(dfin, state.lineIdx);
        rec.dry[fd.dataset.fd] = fd.value;
        saveDesignFinish(state.designId, dfin);
        renderAll(); return;
      }
      const fdSquare = e.target.closest("[data-fd-square]");
      if (fdSquare) {
        const dfin = ensureDesignFinish(state.designId);
        const rec = ensurePieceFinish(dfin, state.lineIdx);
        rec.dry.isSquare = fdSquare.dataset.fdSquare === "true";
        saveDesignFinish(state.designId, dfin);
        renderAll(); return;
      }
      const ff2 = e.target.closest("[data-ff2]");
      if (ff2) {
        const dfin = ensureDesignFinish(state.designId);
        const rec = ensurePieceFinish(dfin, state.lineIdx);
        rec.finish[ff2.dataset.ff2] = ff2.value;
        saveDesignFinish(state.designId, dfin);
        renderAll(); return;
      }
      const fcheck = e.target.closest("[data-fcheck]");
      if (fcheck) {
        const dfin = ensureDesignFinish(state.designId);
        const rec = ensurePieceFinish(dfin, state.lineIdx);
        const set = new Set(rec.finish.workers || []);
        if (fcheck.checked) set.add(fcheck.value); else set.delete(fcheck.value);
        rec.finish.workers = Array.from(set);
        saveDesignFinish(state.designId, dfin);
        renderAll(); return;
      }
      const ftr = e.target.closest("[data-ftr]");
      if (ftr) {
        const dfin = ensureDesignFinish(state.designId);
        const rec = ensurePieceFinish(dfin, state.lineIdx);
        rec.transport[ftr.dataset.ftr] = ftr.value;
        saveDesignFinish(state.designId, dfin);
        renderAll(); return;
      }
      const glueItemRow = e.target.closest("[data-glueitem]");
      if (glueItemRow) {
        const dfin = ensureDesignFinish(state.designId);
        const rec = ensurePieceFinish(dfin, state.lineIdx);
        rec.glue.glueItems[Number(glueItemRow.dataset.glueitem)][e.target.name] = e.target.value;
        saveDesignFinish(state.designId, dfin);
        return;
      }
      const extraRow = e.target.closest("[data-extracost]");
      if (extraRow) {
        const dfin = ensureDesignFinish(state.designId);
        const rec = ensurePieceFinish(dfin, state.lineIdx);
        rec.extraCosts[Number(extraRow.dataset.extracost)][e.target.name] = e.target.value;
        saveDesignFinish(state.designId, dfin);
        return;
      }
    });

    root.addEventListener("input", (e) => {
      const glueItemRow = e.target.closest("[data-glueitem]");
      if (glueItemRow) {
        const dfin = ensureDesignFinish(state.designId);
        const rec = ensurePieceFinish(dfin, state.lineIdx);
        rec.glue.glueItems[Number(glueItemRow.dataset.glueitem)][e.target.name] = e.target.value;
        saveDesignFinish(state.designId, dfin);
        return;
      }
      const extraRow = e.target.closest("[data-extracost]");
      if (extraRow) {
        const dfin = ensureDesignFinish(state.designId);
        const rec = ensurePieceFinish(dfin, state.lineIdx);
        rec.extraCosts[Number(extraRow.dataset.extracost)][e.target.name] = e.target.value;
        saveDesignFinish(state.designId, dfin);
        return;
      }
    });
    root.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.target && e.target.id === "finNewWorkerName") {
        e.preventDefault();
        addFinWorker(e.target.value);
        renderAll();
        const again = $("#finNewWorkerName");
        if (again) again.focus();
      }
    });
  }

  window.FinishingEngine = { KEY_FINISH, loadFinishAll, ensureDesignFinish, saveDesignFinish, ensurePieceFinish, areaBeforeGlue, standardGlueKg, actualGlueKg, glueVariancePct, costRollupFor, readyFinishPieces };
  window.renderFinishing = renderFinishing;
})();
