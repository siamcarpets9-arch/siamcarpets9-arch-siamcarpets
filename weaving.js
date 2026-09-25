/* ============================================================
   ส่งแผนกทอ (Issue to Weaving) + Surplus ไหม + KPI แผนกวางแผน
   - แผนกทอจะขึ้นทอได้ต้องมีครบ 3 อย่าง: ไหมจากแผนกย้อม + ไหม Surplus (ถ้าใช้) + ผ้าใบสำหรับทอ (จากแผนกดีไซน์/ขยายลาย)
   - หลังทอเสร็จ แผนกทอรายงานไหมที่ใช้จริงต่อสี → ส่วนต่างเข้า/ออกจากคลัง Surplus ไหม (เหลือ = เข้าคลัง, ขาด = บันทึกขอย้อมเพิ่ม)
   - KPI แผนกวางแผน: M/O รับเข้า vs ส่งตรงตามกำหนด — วันส่งจริงอ้างอิงจากแผนกขาย (ต้องมีทั้งเลข INV และวันที่ยืนยันส่งจริง)
   ต้องโหลดหลัง app.js, sales.js, planning.js (ใช้ PlanningEngine, SalesEngine, designs, $, $$, toast)
   ============================================================ */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const num = (v) => { const n = parseFloat(String(v == null ? "" : v).replace(/,/g, "")); return Number.isFinite(n) ? n : 0; };
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n, d = 2) => { const x = typeof n === "number" ? n : parseFloat(String(n == null ? "" : n).replace(/,/g, "")); return (Number.isFinite(x) ? x : 0).toLocaleString("th-TH", { minimumFractionDigits: d, maximumFractionDigits: d }); };
  const uid = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  // แก้ปัญหาช่องกรอกข้อมูล "เด้งออก" (เสียโฟกัส) ทุกครั้งที่พิมพ์ — เพราะ render ทับ innerHTML ทั้งก้อนทุกครั้ง
  // ทำให้ input ที่กำลังโฟกัสอยู่ถูกทำลายทิ้งแล้วสร้างใหม่ ต้องจับตำแหน่งไว้ก่อน render แล้วคืนโฟกัส+ตำแหน่ง cursor กลับ
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

  const KEY_SURPLUS = "siam-yarn-surplus";       // ledger: [{id,bucket,yarnCode,colorCode,tex,qty,kind,designId,note,date}]
  const KEY_ISSUES = "siam-weaving-issues";      // { [designId]: {pots:{[potKey]:{surplusDrawn,yarnReady,canvasReady}}, lines:{[i]:{weavers,grade}}, canvasReady, issuedAt, usage:[{potKey,label,orderedKg,actualKg,variance,date}] } }

  const PE = () => window.PlanningEngine;
  const readJson = (k, fb) => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : fb; } catch (e) { return fb; } };
  const writeJson = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ยังใช้ต่อได้ */ } };

  /* ---------- Surplus ledger ---------- */
  const bucketKey = (yarnCode, colorCode, tex) => `${yarnCode || "-"}|${String(colorCode || "").trim().toUpperCase() || "NOCODE"}|${tex || "-"}`;
  function surplusEntries() { return readJson(KEY_SURPLUS, []); }
  function surplusBalance(bucket) { return surplusEntries().filter((e) => e.bucket === bucket).reduce((t, e) => t + num(e.qty), 0); }
  function surplusBalances() {
    const map = new Map();
    surplusEntries().forEach((e) => { if (!map.has(e.bucket)) map.set(e.bucket, { bucket: e.bucket, yarnCode: e.yarnCode, colorCode: e.colorCode, tex: e.tex, qty: 0 }); map.get(e.bucket).qty += num(e.qty); });
    return [...map.values()].filter((b) => Math.abs(b.qty) > 0.0005).sort((a, b) => b.qty - a.qty);
  }
  function addSurplusEntry(entry) { const all = surplusEntries(); all.push({ id: uid("sp"), date: new Date().toISOString(), ...entry }); writeJson(KEY_SURPLUS, all); }

  /* ---------- Issue-to-weaving records ---------- */
  function loadIssues() { return readJson(KEY_ISSUES, {}); }
  function saveIssue(designId, rec) { const all = loadIssues(); all[designId] = rec; writeJson(KEY_ISSUES, all); }
  function ensureIssue(designId, plan) {
    const all = loadIssues();
    if (all[designId]) return all[designId];
    return { pots: {}, lines: {}, canvasReady: false, issuedAt: null, usage: [] };
  }
  function ensurePotState(rec, potKey) {
    if (!rec.pots[potKey]) rec.pots[potKey] = { surplusDrawn: 0, yarnReady: false };
    return rec.pots[potKey];
  }
  function ensureLineState(rec, idx, def) {
    if (!rec.lines[idx]) rec.lines[idx] = { weavers: def.weavers, grade: def.grade };
    return rec.lines[idx];
  }

  function planFor(designId) { const plans = PE().readJson(PE().KEY_PLANS, {}); return plans[designId] || null; }
  function dyePlanOf(plan) { return PE().computeDyePlan(plan.zones, num(plan.totalAreaSqm), plan.bufferPct); }
  function moDocOf(designId) {
    try { if (typeof SalesEngine !== "undefined" && SalesEngine.getDocs) return SalesEngine.getDocs().find((d) => d.designId === designId && d.type === "MO"); } catch (e) { /* ไม่มี SalesEngine */ }
    return null;
  }

  /* ============================================================
     KPI แผนกวางแผน — ใช้จาก app.js renderPlanning()
     ============================================================ */
  function planningKpi() {
    if (!PE()) return { intake: 0, onTime: 0, late: 0, pending: 0, passRate: null, rows: [] };
    const plans = PE().readJson(PE().KEY_PLANS, {});
    const rows = Object.keys(plans).filter((id) => plans[id].savedAt).map((id) => {
      const plan = plans[id];
      const design = designs.find((d) => d.id === id);
      const doc = moDocOf(id);
      const committed = plan.scheduleEndDate || null;
      const shipped = doc && doc.inv && doc.actualShip ? doc.actualShip : "";
      let status = "pending";
      if (shipped && committed) status = shipped <= committed ? "onTime" : "late";
      return { designId: id, project: design ? design.project : id, moNo: plan.moNo || (doc && doc.no) || "-", committed, shipped, inv: doc ? doc.inv : "", status };
    });
    const intake = rows.length;
    const onTime = rows.filter((r) => r.status === "onTime").length;
    const late = rows.filter((r) => r.status === "late").length;
    const pending = rows.filter((r) => r.status === "pending").length;
    const passRate = (onTime + late) ? (onTime / (onTime + late)) * 100 : null;
    return { intake, onTime, late, pending, passRate, rows };
  }

  /* ============================================================
     UI
     ============================================================ */
  function field(label, inner) { return `<label class="pf">${label}${inner}</label>`; }
  function res(label, value, cls = "") { return `<div class="pr ${cls}"><small>${label}</small><strong>${value}</strong></div>`; }

  function jobPickerHtml(state) {
    const plans = PE() ? PE().readJson(PE().KEY_PLANS, {}) : {};
    const isSkipped = (id) => typeof OverviewEngine !== "undefined" && OverviewEngine.isSkipped ? OverviewEngine.isSkipped(id) : false;
    const typeOf = (d) => typeof OverviewEngine !== "undefined" && OverviewEngine.typeOf ? OverviewEngine.typeOf(d) : "MO";
    const ready = designs.filter((d) => d.job === "OPENED" && plans[d.id] && plans[d.id].savedAt && !isSkipped(d.id) && typeOf(d) !== "SO");
    if (!ready.length) return `<p class="col-empty">ยังไม่มี Job ที่ Planning บันทึกแผน (ทำใบวางแผนงานให้เสร็จก่อน)</p>`;
    return `<div class="pw-job-grid">${ready.map((d) => `<div class="pw-job-card-wrap">
      <button type="button" class="pw-job-card dept-weaveissue ${state.designId === d.id ? "active" : ""}" data-wpick="${esc(d.id)}">
        <strong>${esc(d.id)}</strong><span>${esc(d.project)}</span><small>${esc(plans[d.id].moNo || "ยังไม่มีเลข M/O")}</small>
      </button>${typeof OverviewEngine !== "undefined" && OverviewEngine.skipButtonHtml ? OverviewEngine.skipButtonHtml(d.id, d.id) : ""}
    </div>`).join("")}</div>`;
  }

  function readinessTag(ok) { return ok ? `<span class="status-tag">พร้อม</span>` : `<span class="status-tag blocked">ยังไม่พร้อม</span>`; }

  function potIssueRowHtml(pot, potState) {
    const bucket = bucketKey(pot.zones[0] && pot.zones[0].yarnCode, pot.zones[0] && pot.zones[0].colorCode, pot.zones[0] && pot.zones[0].Tex);
    const balance = surplusBalance(bucket);
    const drawn = num(potState.surplusDrawn);
    const total = pot.netKg + drawn;
    const surplusOk = drawn <= balance + 0.0005;
    return `<tr data-pot="${esc(pot.key)}" data-bucket="${esc(bucket)}">
      <td>${esc(pot.label)}</td>
      <td class="num">${fmt(pot.netKg, 3)}</td>
      <td class="num">${fmt(balance, 3)} กก.</td>
      <td><input name="surplusDrawn" value="${esc(potState.surplusDrawn)}" inputmode="decimal" class="pw-num tiny"> กก.</td>
      <td class="num"><strong>${fmt(total, 3)}</strong></td>
      <td><label class="pw-toggle"><input type="checkbox" name="yarnReady" ${potState.yarnReady ? "checked" : ""}> รับไหมย้อมแล้ว</label></td>
      <td>${readinessTag(surplusOk)}${!surplusOk ? `<small class="pw-dye-warn">ดึงเกินยอดคงเหลือ</small>` : ""}</td>
    </tr>`;
  }

  function lineRowHtml(idx, line, ls) {
    return `<tr data-line="${idx}">
      <td>${esc(line.location || line.design || `ชิ้นที่ ${idx + 1}`)}</td>
      <td class="num">${fmt(num(line.sqm), 2)}</td>
      <td><input name="weavers" value="${esc(ls.weavers)}" inputmode="decimal" class="pw-num tiny"> คน</td>
      <td><input name="grade" value="${esc(ls.grade)}" class="pw-num tiny" style="width:56px"></td>
    </tr>`;
  }

  function usageRowHtml(u) {
    const sign = u.variance > 0 ? "เหลือ (+เข้าคลัง Surplus)" : u.variance < 0 ? "ขาด (ขอย้อมเพิ่ม)" : "พอดี";
    return `<tr><td>${esc(u.label)}</td><td class="num">${fmt(u.orderedKg, 3)}</td><td class="num">${fmt(u.actualKg, 3)}</td><td class="num">${u.variance >= 0 ? "+" : ""}${fmt(u.variance, 3)}</td><td>${sign}</td><td>${new Date(u.date).toLocaleDateString("th-TH")}</td></tr>`;
  }

  const state = { designId: null };

  function buildJobPanel() {
    const plan = planFor(state.designId);
    if (!plan) return `<p class="col-empty">ไม่พบใบวางแผนงานของ Job นี้</p>`;
    const dye = dyePlanOf(plan);
    const rec = ensureIssue(state.designId, plan);
    dye.pots.forEach((pot) => ensurePotState(rec, pot.key));
    const doc = moDocOf(state.designId);
    const lines = (doc && doc.lines && doc.lines.length) ? doc.lines : [{ location: designs.find((d) => d.id === state.designId)?.project || state.designId, sqm: plan.totalAreaSqm }];
    lines.forEach((l, i) => ensureLineState(rec, i, { weavers: plan.loomCount || 2, grade: plan.weaveGradeOverride || (PE().suggestGrade(PE().WEAVE_GRADES, plan.patternPct) || {}).grade || "" }));
    saveIssue(state.designId, rec);

    const allYarnReady = dye.pots.every((pot) => rec.pots[pot.key] && rec.pots[pot.key].yarnReady);
    const allSurplusOk = dye.pots.every((pot) => {
      const ps = rec.pots[pot.key], bucket = bucketKey(pot.zones[0] && pot.zones[0].yarnCode, pot.zones[0] && pot.zones[0].colorCode, pot.zones[0] && pot.zones[0].Tex);
      return num(ps.surplusDrawn) <= surplusBalance(bucket) + 0.0005;
    });
    const canRelease = allYarnReady && allSurplusOk && rec.canvasReady;

    return `
    <section class="department-panel pw-card wide">
      <div class="panel-heading"><div><strong>วัตถุดิบก่อนขึ้นทอ</strong><small>ต้องครบทั้ง 3 อย่างจึงขึ้นทอได้: ไหมจากแผนกย้อม + ไหม Surplus (ถ้าดึงมาใช้) + ผ้าใบสำหรับทอ</small></div></div>
      <div class="pw-body">
        <table class="calc-table">
          <thead><tr><th>หม้อย้อม/สี</th><th class="num">ไหมจากแผนกย้อม (กก.)</th><th class="num">Surplus คงเหลือในคลัง</th><th>ดึง Surplus มาใช้</th><th class="num">รวมส่งมอบ (กก.)</th><th>สถานะไหมย้อม</th><th>สถานะ Surplus</th></tr></thead>
          <tbody id="wiPotBody">${dye.pots.map((pot) => potIssueRowHtml(pot, rec.pots[pot.key])).join("")}</tbody>
        </table>
        <div class="pw-row">
          <label class="pw-toggle-lg"><input type="checkbox" id="wiCanvasReady" ${rec.canvasReady ? "checked" : ""}> ผ้าใบสำหรับทอพร้อมแล้ว (จากแผนกดีไซน์/ขยายลาย)</label>
        </div>
        <div class="pw-row"><span class="tag-total ${canRelease ? "" : "muted"}">${canRelease ? "✓ ครบทั้ง 3 อย่าง — ขึ้นทอได้" : "ยังไม่ครบ — รอวัตถุดิบให้ครบก่อนขึ้นทอ"}</span></div>

        <div class="panel-heading" style="padding-left:0;border-top:1px solid var(--line);margin-top:10px;padding-top:10px"><div><strong>กำหนดจำนวนคนทอ + เกรด ต่อชิ้น</strong><small>ค่าเริ่มต้นดึงจากใบวางแผนงาน แก้ต่อชิ้นได้</small></div></div>
        <table class="calc-table">
          <thead><tr><th>ชิ้น/Location</th><th class="num">ตร.ม.</th><th>จำนวนคนทอ</th><th>เกรด</th></tr></thead>
          <tbody id="wiLineBody">${lines.map((l, i) => lineRowHtml(i, l, rec.lines[i])).join("")}</tbody>
        </table>

        <div class="pw-save-bar">
          <button type="button" class="action-button primary" data-wi-issue ${canRelease ? "" : "disabled"}>ออกใบส่งแผนกทอ</button>
          ${rec.issuedAt ? `<small>ออกใบล่าสุด ${new Date(rec.issuedAt).toLocaleString("th-TH")}</small>` : `<small>ยังไม่เคยออกใบ</small>`}
        </div>
      </div>
    </section>

    <section class="department-panel pw-card wide">
      <div class="panel-heading"><div><strong>รายงานไหมเหลือ / ขอไหมเพิ่มหลังทอ</strong><small>กรอกน้ำหนักไหมที่ทอใช้จริงต่อสี ระบบคำนวณส่วนต่างให้ — เหลือเข้าคลัง Surplus อัตโนมัติ, ขาดบันทึกเป็นคำขอย้อมเพิ่ม</small></div></div>
      <div class="pw-body">
        <table class="calc-table">
          <thead><tr><th>หม้อย้อม/สี</th><th class="num">สั่ง/ส่งมอบ (กก.)</th><th>ใช้จริง (กก.)</th><th></th></tr></thead>
          <tbody>${dye.pots.map((pot) => { const ps = rec.pots[pot.key], total = pot.netKg + num(ps.surplusDrawn); return `<tr data-usage-pot="${esc(pot.key)}" data-usage-label="${esc(pot.label)}" data-usage-ordered="${total}"><td>${esc(pot.label)}</td><td class="num">${fmt(total, 3)}</td><td><input name="actualKg" class="pw-num" inputmode="decimal" placeholder="กรอกน้ำหนักจริง"></td><td><button type="button" class="action-button" data-wi-usage>บันทึกผล</button></td></tr>`; }).join("")}</tbody>
        </table>
        ${rec.usage.length ? `<table class="calc-table" style="margin-top:8px"><thead><tr><th>หม้อย้อม/สี</th><th class="num">สั่ง/ส่งมอบ</th><th class="num">ใช้จริง</th><th class="num">ส่วนต่าง</th><th>ผล</th><th>วันที่</th></tr></thead><tbody>${rec.usage.slice().reverse().map(usageRowHtml).join("")}</tbody></table>` : ""}
      </div>
    </section>

    ${typeof CostEngine !== "undefined" && CostEngine.extraCostWidgetHtml ? CostEngine.extraCostWidgetHtml(state.designId, "weaveissue") : ""}`;
  }

  function surplusPanelHtml() {
    const balances = surplusBalances();
    return `<section class="department-panel pw-card wide">
      <div class="panel-heading"><div><strong>คลังไหม Surplus คงเหลือ (รวมทุก M/O)</strong><small>สะสมจากไหมเหลือหลังทอทุกใบงาน — ดึงมาใช้ซ้ำในใบส่งแผนกทอของ M/O อื่นที่ใช้สี/ชนิดไหมเดียวกันได้</small></div></div>
      <div class="pw-body">
        ${balances.length ? `<table class="calc-table"><thead><tr><th>ชนิดไหม</th><th>รหัสสี</th><th>Tex</th><th class="num">คงเหลือ (กก.)</th></tr></thead><tbody>${balances.map((b) => `<tr><td>${esc(b.yarnCode)}</td><td>${esc(b.colorCode)}</td><td>${esc(b.tex)}</td><td class="num"><strong>${fmt(b.qty, 3)}</strong></td></tr>`).join("")}</tbody></table>` : `<p class="col-empty">ยังไม่มี Surplus ไหมในคลัง</p>`}
      </div>
    </section>`;
  }

  function build() {
    const root = $("#weaveissueView");
    root.innerHTML = `
      <section class="page-heading">
        <div>
          <p class="eyebrow">WEAVING HANDOVER</p>
          <h1>ส่งแผนกทอ (Issue to Weaving)</h1>
          <p class="subtitle">รวมไหมจากแผนกย้อม + ไหม Surplus + ผ้าใบสำหรับทอให้ครบก่อนขึ้นทอ · กำหนดคนทอ/เกรดต่อชิ้น · รายงานไหมเหลือ-ขาดหลังทอเข้าคลัง Surplus</p>
        </div>
      </section>
      <section class="department-panel pw-card">
        <div class="panel-heading"><div><strong>เลือก Job ที่บันทึกแผนแล้ว</strong><small>ต้องทำ "ใบวางแผนงาน" และกดบันทึกแผนก่อน จึงจะออกใบส่งแผนกทอได้</small></div></div>
        <div class="pw-body" id="wiJobPicker"></div>
      </section>
      <div id="wiForm"></div>
      <div id="wiSurplus"></div>`;
  }

  function renderAll() {
    $("#wiJobPicker").innerHTML = jobPickerHtml(state);
    const formEl = $("#wiForm");
    const focusInfo = captureFocus(formEl);
    formEl.innerHTML = state.designId ? buildJobPanel() : `<p class="col-empty">เลือก Job ด้านบนเพื่อออกใบส่งแผนกทอ</p>`;
    restoreFocus(formEl, focusInfo);
    $("#wiSurplus").innerHTML = surplusPanelHtml();
  }

  let built = false;
  function renderWeaveIssue() {
    if (!built) { build(); built = true; bind(); }
    renderAll();
  }

  function bind() {
    const root = $("#weaveissueView");
    root.addEventListener("click", (e) => {
      const pick = e.target.closest("[data-wpick]");
      if (pick) { state.designId = pick.dataset.wpick; renderAll(); return; }
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
      const issueBtn = e.target.closest("[data-wi-issue]");
      if (issueBtn && !issueBtn.disabled) {
        const rec = loadIssues()[state.designId];
        rec.issuedAt = new Date().toISOString();
        saveIssue(state.designId, rec);
        toast(`${state.designId}: ออกใบส่งแผนกทอแล้ว`);
        renderAll();
        return;
      }
      const usageBtn = e.target.closest("[data-wi-usage]");
      if (usageBtn) {
        const row = usageBtn.closest("[data-usage-pot]");
        const potKey = row.dataset.usagePot, label = row.dataset.usageLabel, ordered = num(row.dataset.usageOrdered);
        const actualKg = num(row.querySelector('input[name="actualKg"]').value);
        if (!actualKg && actualKg !== 0) { toast("กรอกน้ำหนักไหมที่ใช้จริงก่อน"); return; }
        const variance = ordered - actualKg;
        const rec = loadIssues()[state.designId];
        const dye = dyePlanOf(planFor(state.designId));
        const pot = dye.pots.find((p) => p.key === potKey);
        const bucket = pot ? bucketKey(pot.zones[0] && pot.zones[0].yarnCode, pot.zones[0] && pot.zones[0].colorCode, pot.zones[0] && pot.zones[0].Tex) : "-";
        rec.usage.push({ potKey, label, orderedKg: ordered, actualKg, variance, date: new Date().toISOString() });
        if (Math.abs(variance) > 0.0005) {
          addSurplusEntry({ bucket, yarnCode: pot && pot.zones[0] && pot.zones[0].yarnCode, colorCode: pot && pot.zones[0] && pot.zones[0].colorCode, tex: pot && pot.zones[0] && pot.zones[0].Tex, qty: variance, kind: variance > 0 ? "leftover" : "shortage", designId: state.designId, note: `${label} · ${state.designId}` });
        }
        saveIssue(state.designId, rec);
        toast(variance > 0 ? `บันทึกแล้ว: ไหมเหลือ ${fmt(variance, 3)} กก. เข้าคลัง Surplus` : variance < 0 ? `บันทึกแล้ว: ไหมขาด ${fmt(Math.abs(variance), 3)} กก. (บันทึกขอย้อมเพิ่ม)` : "บันทึกแล้ว: ใช้พอดี ไม่มีส่วนต่าง");
        renderAll();
        return;
      }
    });
    root.addEventListener("input", (e) => {
      if (!state.designId) return;
      if (typeof CostEngine !== "undefined" && CostEngine.handleExtraCostFieldChange && CostEngine.handleExtraCostFieldChange(e)) return;
      const potRow = e.target.closest("[data-pot]");
      if (potRow && e.target.name === "surplusDrawn") {
        const rec = loadIssues()[state.designId];
        rec.pots[potRow.dataset.pot].surplusDrawn = e.target.value;
        saveIssue(state.designId, rec);
        renderAll();
        return;
      }
      const lineRow = e.target.closest("[data-line]");
      if (lineRow) {
        const rec = loadIssues()[state.designId];
        rec.lines[lineRow.dataset.line][e.target.name] = e.target.value;
        saveIssue(state.designId, rec);
        return;
      }
    });
    root.addEventListener("change", (e) => {
      if (!state.designId) return;
      const potRow = e.target.closest("[data-pot]");
      if (potRow && e.target.name === "yarnReady") {
        const rec = loadIssues()[state.designId];
        rec.pots[potRow.dataset.pot].yarnReady = e.target.checked;
        // บันทึกเวลาที่ย้อมเสร็จ/รับไหมย้อมแล้วจริง ๆ ไว้ด้วย ใช้คำนวณ KPI "ย้อมได้กี่สีต่อวัน" ในหน้าภาพรวมการผลิต
        if (e.target.checked) rec.pots[potRow.dataset.pot].readyAt = new Date().toISOString();
        saveIssue(state.designId, rec);
        renderAll();
        return;
      }
      if (e.target.id === "wiCanvasReady") {
        const rec = loadIssues()[state.designId];
        rec.canvasReady = e.target.checked;
        saveIssue(state.designId, rec);
        renderAll();
        return;
      }
    });
  }

  window.WeavingEngine = { bucketKey, surplusBalance, surplusBalances, addSurplusEntry, planningKpi, KEY_SURPLUS, KEY_ISSUES };
  window.renderWeaveIssue = renderWeaveIssue;
})();
