/* ============================================================
   แท็บ "ใบสั่งย้อมรวม" (Combined Dye Order)
   - รวบรวม "หม้อย้อม" (จากใบวางแผนงานของทุก M/O ที่ยังไม่ถูกรวม) มาไว้ที่เดียว
   - จัดกลุ่มอัตโนมัติตาม รหัสสี + วิธีย้อม เดียวกัน — ให้เลือกรวมเป็นใบสั่งย้อมเดียวกันได้ (ดึงค่า/รวมน้ำหนักอัตโนมัติ)
   - ยังแก้ไขเพิ่มเติม/แยกออกทีหลังได้เสมอ (ไม่ใช่การผูกตายตัว) — ลบรายการออกจากใบสั่งย้อมรวม = กลับไปเป็นใบสั่งย้อมของ M/O เดิมทันที
   - S/O ไม่นำมาใช้ตอนนี้ (ใช้ OverviewEngine.jobs() ซึ่งกรอง S/O ออกให้แล้ว)
   - เกณฑ์ย้อมในบริษัท (ค่าเริ่มต้น 20 กก./หม้อ แก้ไขเพิ่มเติมได้ที่หน้าใบวางแผนงาน) ใช้ตัดสินแหล่งย้อมเริ่มต้นเหมือนกัน
   - พิมพ์ PDF ผ่าน overlay เดียวกับใบสั่งย้อมต่อ M/O (PlanningEngine.showPrintSheets)
   ต้องโหลดหลัง app.js, planning.js, overview.js
   (ใช้ designs, $, $$, toast, esc, fmt, PlanningEngine, OverviewEngine, CostEngine)
   ============================================================ */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const num = (v) => { const n = parseFloat(String(v == null ? "" : v).replace(/,/g, "")); return Number.isFinite(n) ? n : 0; };
  const has = (v) => String(v == null ? "" : v).trim() !== "";
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n, d = 2) => { const x = typeof n === "number" ? n : parseFloat(String(n == null ? "" : n).replace(/,/g, "")); return (Number.isFinite(x) ? x : 0).toLocaleString("th-TH", { minimumFractionDigits: d, maximumFractionDigits: d }); };
  const fmtInt = (n) => fmt(n, 0);
  const readJson = (k, fb) => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : fb; } catch (e) { return fb; } };
  const writeJson = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* บันทึกไม่ได้ก็ยังใช้ต่อได้ */ } };
  const uid = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const field = (label, inner) => `<label class="pf">${label}${inner}</label>`;
  const inp = (name, value, extra = "") => `<input name="${name}" value="${esc(value)}" ${extra}>`;
  const PE = () => window.PlanningEngine;
  const OE = () => window.OverviewEngine;
  const CE = () => window.CostEngine;

  // เก็บ/คืนโฟกัสรอบการ render (รื้อ innerHTML ใหม่ทั้งหมดทุกครั้งที่พิมพ์/ติ๊ก) กันโฟกัสหลุดกลางคัน — สูตรเดียวกับ planning.js
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
      try { el.setSelectionRange(info.selStart, info.selEnd); } catch (e) { /* บาง input type ไม่รองรับ setSelectionRange */ }
    }
    root.scrollTop = info.scrollTop;
  }

  const KEY_COMBINED = "siam-dye-combined-orders";

  function loadCombined() { const l = readJson(KEY_COMBINED, []); return Array.isArray(l) ? l : []; }
  function saveCombined(list) { writeJson(KEY_COMBINED, list); }

  function blankCombinedOrder(colorCode, method, methodOther) {
    return {
      id: uid("dc"), colorCode: colorCode || "", method: method || "CtoC", methodOther: methodOther || "",
      items: [], // [{designId, potKey}]
      source: "inhouse", vendor: "", lot: "",
      rewind: false, twist: false, ply: false,
      buyYarn: false, yarnPricePerKg: 0, serviceFeePerKg: 0,
      special: false, surchargePct: 0,
      plyCostPerKg: 0, windCostPerKg: 0, twistCostPerKg: 0, hankCostPerKg: 0, epzPct: 0,
      issueDate: "", needDate: "",
      createdAt: new Date().toISOString()
    };
  }

  /* ============================================================
     ดึง "หม้อย้อม" ของทุก M/O ที่เปิดงานอยู่ + มีแผนบันทึกแล้ว (S/O ถูกกรองออกโดย OverviewEngine.jobs() แล้ว)
     ============================================================ */
  function colorCodeOfPot(pot) {
    const c = (pot.contributions && pot.contributions[0] && pot.contributions[0].colorCode) || (pot.zones && pot.zones[0] && pot.zones[0].colorCode) || "";
    return String(c || "").trim().toUpperCase();
  }
  function methodKeyOf(method, methodOther) {
    return method === "other" ? `other:${String(methodOther || "").trim().toUpperCase()}` : (method || "CtoC");
  }
  function groupKeyOf(colorCode, method, methodOther) {
    return `${colorCode || "(ไม่ระบุสี)"}|${methodKeyOf(method, methodOther)}`;
  }

  // ปรับทุกใบสั่งย้อมรวมที่บันทึกไว้ ให้เอารายการที่ไม่มีอยู่จริงแล้ว (ลบ M/O ทิ้ง/ลบโซนออกจนไม่มีหม้อนี้แล้ว) ออกอัตโนมัติ
  // ("แยกออก" กลับไปเป็นรายการเดี่ยวโดยไม่ตั้งใจก็ได้ผลลัพธ์เดียวกัน ไม่ทำให้ข้อมูลค้าง/พังหน้าจอ)
  function pruneCombined() {
    const plans = PE().readJson(PE().KEY_PLANS, {});
    const list = loadCombined();
    let changed = false;
    const kept = list.map((c) => {
      const validItems = c.items.filter((it) => {
        const plan = plans[it.designId];
        if (!plan || !plan.savedAt) return false;
        const dye = PE().computeDyePlan(plan.zones, num(plan.totalAreaSqm), plan.bufferPct);
        return dye.pots.some((p) => p.key === it.potKey);
      });
      if (validItems.length !== c.items.length) changed = true;
      return { ...c, items: validItems };
    }).filter((c) => c.items.length > 0);
    if (kept.length !== list.length) changed = true;
    if (changed) saveCombined(kept);
    return kept;
  }

  function pendingDyeNeeds() {
    const pe = PE(), oe = OE();
    if (!pe || !oe) return [];
    const plans = pe.readJson(pe.KEY_PLANS, {});
    const combined = pruneCombined();
    const usedKeys = new Set();
    combined.forEach((c) => c.items.forEach((it) => usedKeys.add(`${it.designId}::${it.potKey}`)));
    const list = [];
    oe.jobs().forEach((d) => {
      const plan = plans[d.id];
      if (!plan || !plan.savedAt) return;
      const dye = pe.computeDyePlan(plan.zones, num(plan.totalAreaSqm), plan.bufferPct);
      const info = designs.find((x) => x.id === d.id) || {};
      dye.pots.forEach((pot) => {
        const uk = `${d.id}::${pot.key}`;
        if (usedKeys.has(uk)) return;
        const order = (plan.dyeOrders && plan.dyeOrders[pot.key]) || null;
        list.push({
          designId: d.id, potKey: pot.key, moNo: plan.moNo || d.id,
          customer: info.customer || "-", project: info.project || "-",
          pot, order, colorCode: colorCodeOfPot(pot),
          method: order ? order.method : "CtoC", methodOther: order ? order.methodOther : "",
          netKg: pot.netKg
        });
      });
    });
    return list;
  }

  function groupPending(list) {
    const map = new Map();
    list.forEach((it) => {
      const key = groupKeyOf(it.colorCode, it.method, it.methodOther);
      if (!map.has(key)) map.set(key, { key, colorCode: it.colorCode, method: it.method, methodOther: it.methodOther, items: [] });
      map.get(key).items.push(it);
    });
    return [...map.values()].sort((a, b) => b.items.length - a.items.length || a.colorCode.localeCompare(b.colorCode));
  }

  /* ============================================================
     ใบสั่งย้อมรวมที่บันทึกไว้แล้ว — คืนรายการ M/O ที่ยังผูกอยู่จริง พร้อมข้อมูลหม้อสด ๆ ล่าสุด
     ============================================================ */
  function itemsForCombined(c) {
    const pe = PE();
    const plans = pe.readJson(pe.KEY_PLANS, {});
    return c.items.map((it) => {
      const plan = plans[it.designId];
      if (!plan) return null;
      const dye = pe.computeDyePlan(plan.zones, num(plan.totalAreaSqm), plan.bufferPct);
      const pot = dye.pots.find((p) => p.key === it.potKey);
      if (!pot) return null;
      const info = designs.find((x) => x.id === it.designId) || {};
      return { designId: it.designId, potKey: it.potKey, moNo: plan.moNo || it.designId, customer: info.customer || "-", project: info.project || "-", pot };
    }).filter(Boolean);
  }
  function combinedNetKg(c) { return itemsForCombined(c).reduce((t, x) => t + x.pot.netKg, 0); }

  const state = { openGroups: new Set(), selected: new Map() /* groupKey -> Set of "designId::potKey" */ };

  function toggleSelect(groupKey, uk) {
    if (!state.selected.has(groupKey)) state.selected.set(groupKey, new Set());
    const set = state.selected.get(groupKey);
    if (set.has(uk)) set.delete(uk); else set.add(uk);
  }

  function combineSelected(groupKey, group) {
    const set = state.selected.get(groupKey);
    if (!set || set.size < 2) { toast("เลือกอย่างน้อย 2 รายการที่จะรวมเป็นใบสั่งย้อมเดียวกัน"); return; }
    const chosen = group.items.filter((it) => set.has(`${it.designId}::${it.potKey}`));
    const c = blankCombinedOrder(group.colorCode, group.method, group.methodOther);
    c.items = chosen.map((it) => ({ designId: it.designId, potKey: it.potKey }));
    const netKg = chosen.reduce((t, it) => t + it.netKg, 0);
    const cap = PE().dyeInhouseCapKg ? PE().dyeInhouseCapKg() : 20;
    c.source = netKg > cap ? "outsource" : "inhouse";
    // ดึงราคาไหมกลางอัตโนมัติจากหน้าต้นทุนถ้ามี (เหมือนใบสั่งย้อมเดี่ยว)
    const yarnCode = (chosen[0] && chosen[0].pot.zones[0] && chosen[0].pot.zones[0].yarnCode) || "";
    const price = CE() && CE().getMaterialPrice ? CE().getMaterialPrice(yarnCode) : null;
    if (price != null) c.yarnPricePerKg = price;
    const today = new Date();
    c.issueDate = today.toISOString().slice(0, 10);
    const list = loadCombined();
    list.push(c);
    saveCombined(list);
    state.selected.delete(groupKey);
    toast(`รวม ${chosen.length} รายการเป็นใบสั่งย้อมรวมแล้ว`);
    renderAll();
  }

  function splitOutItem(combinedId, designId, potKey) {
    const list = loadCombined();
    const c = list.find((x) => x.id === combinedId);
    if (!c) return;
    c.items = c.items.filter((it) => !(it.designId === designId && it.potKey === potKey));
    saveCombined(c.items.length ? list : list.filter((x) => x.id !== combinedId));
    toast("แยกออกแล้ว — กลับไปเป็นใบสั่งย้อมของ M/O นั้นตามปกติ");
    renderAll();
  }

  function deleteCombined(id) {
    if (!confirm("ยกเลิกใบสั่งย้อมรวมนี้ทั้งใบ? รายการที่รวมไว้จะแยกกลับไปเป็นใบสั่งย้อมของแต่ละ M/O ตามเดิม (ไม่ได้ลบข้อมูล M/O ใด ๆ)")) return;
    saveCombined(loadCombined().filter((c) => c.id !== id));
    toast("ยกเลิกใบสั่งย้อมรวมแล้ว");
    renderAll();
  }

  function updateCombinedField(id, name, value) {
    const list = loadCombined();
    const c = list.find((x) => x.id === id);
    if (!c) return;
    c[name] = value;
    saveCombined(list);
  }

  /* ============================================================
     HTML
     ============================================================ */
  function pendingRowHtml(it, groupKey) {
    const uk = `${it.designId}::${it.potKey}`;
    const checked = state.selected.has(groupKey) && state.selected.get(groupKey).has(uk);
    return `<tr>
      <td><input type="checkbox" data-dc-pick="${esc(groupKey)}" data-dc-uk="${esc(uk)}" ${checked ? "checked" : ""}></td>
      <td><strong>${esc(it.moNo)}</strong><small>${esc(it.designId)}</small></td>
      <td>${esc(it.customer)}<small>${esc(it.project)}</small></td>
      <td>${esc(it.pot.label)}</td>
      <td class="num">${fmt(it.netKg, 3)} กก.</td>
    </tr>`;
  }

  function groupHtml(group) {
    const open = state.openGroups.has(group.key);
    const methodLabel = group.method === "other" ? (group.methodOther || "อื่น ๆ") : (((PE().DYE_METHODS || []).find((m) => m.value === group.method) || {}).label || group.method);
    const totalKg = group.items.reduce((t, it) => t + it.netKg, 0);
    const selCount = state.selected.has(group.key) ? state.selected.get(group.key).size : 0;
    return `<details class="pw-dye-cost-detail dc-group" data-dc-group="${esc(group.key)}" ${open ? "open" : ""}>
      <summary><strong>สี ${esc(group.colorCode || "(ไม่ระบุ)")}</strong> · ${esc(methodLabel)} — ${group.items.length} หม้อ (${group.items.map((it) => esc(it.moNo)).join(", ")}) รวม ${fmt(totalKg, 3)} กก.</summary>
      <div class="pw-body">
        <table class="calc-table"><thead><tr><th></th><th>M/O</th><th>ลูกค้า/Project</th><th>หม้อย้อม</th><th class="num">น้ำหนักไหม</th></tr></thead>
        <tbody>${group.items.map((it) => pendingRowHtml(it, group.key)).join("")}</tbody></table>
        <div class="pw-row" style="margin-top:8px;align-items:center">
          ${selCount ? `<span class="tag-total">เลือกแล้ว ${selCount} รายการ</span>` : `<small class="muted">ติ๊กเลือกอย่างน้อย 2 รายการที่ต้องการย้อมรวมกัน (รหัสสี+วิธีย้อมเดียวกัน)</small>`}
          <button type="button" class="action-button primary" data-dc-combine="${esc(group.key)}" ${selCount < 2 ? "disabled" : ""}>รวมเป็นใบสั่งย้อมเดียว (${selCount || 0})</button>
        </div>
      </div>
    </details>`;
  }

  function combinedCardHtml(c) {
    const items = itemsForCombined(c);
    const netKg = items.reduce((t, x) => t + x.pot.netKg, 0);
    const isOut = c.source === "outsource";
    const cap = PE().dyeInhouseCapKg ? PE().dyeInhouseCapKg() : 20;
    const overCap = !isOut && netKg > cap;
    const cost = PE().dyeOrderCost(c, netKg);
    const methodLabel = c.method === "other" ? (c.methodOther || "อื่น ๆ") : (((PE().DYE_METHODS || []).find((m) => m.value === c.method) || {}).label || c.method);
    const firstZone = (items[0] && items[0].pot.zones[0]) || {};
    return `<div class="pw-dye-card dc-card" data-dc-card="${esc(c.id)}">
      <div class="pw-dye-head">
        <strong>สี ${esc(c.colorCode || "(ไม่ระบุ)")} · ${esc(methodLabel)}</strong>
        <span>${items.length} M/O รวม · ${fmt(netKg, 3)} กก.</span>
      </div>
      <table class="calc-table" style="margin-bottom:8px"><thead><tr><th>M/O</th><th>ลูกค้า/Project</th><th>หม้อย้อม</th><th class="num">น้ำหนักไหม</th><th></th></tr></thead>
      <tbody>${items.map((it) => `<tr>
        <td><strong>${esc(it.moNo)}</strong><small>${esc(it.designId)}</small></td>
        <td>${esc(it.customer)}<small>${esc(it.project)}</small></td>
        <td>${esc(it.pot.label)}</td>
        <td class="num">${fmt(it.pot.netKg, 3)} กก.</td>
        <td><button type="button" class="text-button" data-dc-split="${esc(c.id)}" data-dc-split-design="${esc(it.designId)}" data-dc-split-pot="${esc(it.potKey)}" title="แยกออกจากใบสั่งย้อมรวมนี้ (กลับไปเป็นใบสั่งย้อมของ M/O เดิม)">แยกออก</button></td>
      </tr>`).join("")}</tbody></table>
      <div class="pw-dye-grid">
        <label class="pf">แหล่งย้อม<select name="source">${[["inhouse", "ย้อมภายในบริษัท"], ["outsource", "จ้างย้อมบริษัทอื่น"]].map(([v, t]) => `<option value="${v}" ${c.source === v ? "selected" : ""}>${t}</option>`).join("")}</select></label>
        ${overCap ? `<span class="pw-dye-warn">⚠ รวม ${fmt(netKg, 3)} กก. เกินเกณฑ์ย้อมในบริษัท (${fmt(cap, 1)} กก.) — ควรสลับเป็น "จ้างย้อมบริษัทอื่น"</span>` : ""}
        ${isOut ? field("ชื่อผู้รับจ้างย้อม", inp("vendor", c.vendor, 'inputmode="text"')) : ""}
        ${field("Yarn Lot", inp("lot", c.lot, 'inputmode="text"'))}
        <label class="pf">วิธีย้อม<select name="method">${(PE().DYE_METHODS || []).map((m) => `<option value="${m.value}" ${c.method === m.value ? "selected" : ""}>${m.label}</option>`).join("")}</select></label>
        ${c.method === "other" ? field("ระบุวิธีย้อม", inp("methodOther", c.methodOther, 'inputmode="text"')) : ""}
      </div>
      <div class="pw-dye-flags">
        <label><input type="checkbox" name="rewind" ${c.rewind ? "checked" : ""}> ต้องกรอไหม</label>
        <label><input type="checkbox" name="twist" ${c.twist ? "checked" : ""}> ต้องทวิสไหม</label>
        <label><input type="checkbox" name="ply" ${c.ply ? "checked" : ""}> ต้องควบไหม</label>
      </div>
      ${isOut ? `<details class="pw-dye-cost-detail" ${state.openGroups.has(`cost:${c.id}`) ? "open" : ""} data-dc-costdetail="${esc(c.id)}"><summary>รายละเอียดต้นทุนจ้างย้อม (ราคาไหม/ค่าจ้าง/surcharge/EPZ)</summary><div class="pw-dye-grid">
        <label class="pf tiny">ค่าจ้างย้อม (บาท/กก.)${inp("serviceFeePerKg", c.serviceFeePerKg, 'class="pw-num"')}</label>
        <label class="pf"><input type="checkbox" name="buyYarn" ${c.buyYarn ? "checked" : ""}> บริษัทซื้อไหมเอง</label>
        ${c.buyYarn ? (() => {
          const masterPrice = CE() && CE().getMaterialPrice ? CE().getMaterialPrice(firstZone.yarnCode) : null;
          return `<span class="pw-colorcode-row">${field("ราคาไหม (บาท/กก.)", inp("yarnPricePerKg", c.yarnPricePerKg, 'class="pw-num"'))}${masterPrice != null ? `<button type="button" class="text-button" data-dc-use-material-price="${esc(c.id)}" data-material-price-value="${masterPrice}" title="ราคากลางของ ${esc(firstZone.yarnCode || "-")} จากหน้าต้นทุน">ใช้ราคากลาง (${fmt(masterPrice, 0)})</button>` : ""}</span>`;
        })() : ""}
        <label class="pf"><input type="checkbox" name="special" ${c.special ? "checked" : ""}> ไหมชนิดพิเศษ (surcharge)</label>
        ${c.special ? field("Surcharge (%)", inp("surchargePct", c.surchargePct, 'class="pw-num"')) : ""}
        ${c.ply ? field("ค่าควบ (บาท/กก.)", inp("plyCostPerKg", c.plyCostPerKg, 'class="pw-num"')) : ""}
        ${c.rewind ? field("ค่ากรอ (บาท/กก.)", inp("windCostPerKg", c.windCostPerKg, 'class="pw-num"')) : ""}
        ${c.twist ? field("ค่าทวิส (บาท/กก.)", inp("twistCostPerKg", c.twistCostPerKg, 'class="pw-num"')) : ""}
        ${c.method === "hank" ? field("ค่า Hank (บาท/กก.)", inp("hankCostPerKg", c.hankCostPerKg, 'class="pw-num"')) : ""}
        ${field("ภาษี EPZ (%)", inp("epzPct", c.epzPct, 'class="pw-num"'))}
      </div></details>` : ""}
      <div class="pw-dye-grid">
        <label class="pf">วันที่เปิดใบสั่งย้อมรวม<input type="date" name="issueDate" value="${esc(c.issueDate)}"></label>
        <label class="pf">วันที่ต้องการไหม<input type="date" name="needDate" value="${esc(c.needDate)}"></label>
      </div>
      ${isOut ? `<div class="pw-dye-cost">รวมค่าใช้จ่าย: <strong>${fmt(cost.total, 0)} บาท</strong><small> (ไหม ${fmtInt(cost.yarnCost)} + ค่าจ้างย้อม ${fmtInt(cost.serviceCost)} + surcharge ${fmtInt(cost.surcharge)} + กรอ/ทวิส/ควบ ${fmtInt(cost.windCost + cost.twistCost + cost.plyCost)} + hank ${fmtInt(cost.hankCost)} + EPZ ${fmtInt(cost.epzTax)})</small></div>` : `<div class="pw-dye-cost muted">ย้อมภายในบริษัท — ไม่คิดค่าจ้างย้อม/surcharge ภายนอก</div>`}
      <div class="pw-row">
        <button type="button" class="text-button" data-dc-print="${esc(c.id)}">🖨 พิมพ์ใบสั่งย้อมรวม (PDF)</button>
        <button type="button" class="text-button" data-dc-delete="${esc(c.id)}" style="color:var(--red)">ยกเลิกใบสั่งย้อมรวมนี้</button>
      </div>
    </div>`;
  }

  function buildPrintSheetHtml(c) {
    const items = itemsForCombined(c);
    const netKg = items.reduce((t, x) => t + x.pot.netKg, 0);
    const isOut = c.source === "outsource";
    const cost = PE().dyeOrderCost(c, netKg);
    const methodLabel = c.method === "other" ? (c.methodOther || "อื่น ๆ") : (((PE().DYE_METHODS || []).find((m) => m.value === c.method) || {}).label || c.method);
    return `<div class="pw-print-sheet">
      <div class="pw-print-title">ใบสั่งย้อมรวม (Combined Dye Order)</div>
      <div class="pw-print-meta">
        <div><b>รหัสสี:</b> ${esc(c.colorCode || "-")}</div>
        <div><b>วันที่พิมพ์:</b> ${new Date().toLocaleDateString("th-TH")}</div>
        <div><b>วิธีย้อม:</b> ${esc(methodLabel)}</div>
        <div><b>น้ำหนักไหมรวม:</b> ${fmt(netKg, 3)} กก.</div>
        <div><b>แหล่งย้อม:</b> ${isOut ? "จ้างย้อมบริษัทอื่น" : "ย้อมภายในบริษัท"}${isOut && c.vendor ? " — " + esc(c.vendor) : ""}</div>
        <div><b>Yarn Lot:</b> ${esc(c.lot || "-")}</div>
        <div><b>วันที่เปิดใบสั่ง:</b> ${esc(c.issueDate || "-")}</div>
        <div><b>วันที่ต้องการไหม:</b> ${esc(c.needDate || "-")}</div>
      </div>
      <table class="pw-print-table">
        <thead><tr><th>M/O</th><th>ลูกค้า/Project</th><th>หม้อย้อม</th><th>น้ำหนักไหม (กก.)</th></tr></thead>
        <tbody>${items.map((it) => `<tr><td>${esc(it.moNo)}</td><td>${esc(it.customer)} / ${esc(it.project)}</td><td>${esc(it.pot.label)}</td><td>${fmt(it.pot.netKg, 3)}</td></tr>`).join("")}</tbody>
      </table>
      ${isOut ? `<table class="pw-print-table">
        <thead><tr><th>รายการ</th><th>จำนวนเงิน (บาท)</th></tr></thead>
        <tbody>
          ${c.buyYarn ? `<tr><td>ค่าไหม (${fmt(netKg, 3)} กก. × ${fmt(c.yarnPricePerKg, 2)} บาท/กก.)</td><td>${fmtInt(cost.yarnCost)}</td></tr>` : ""}
          <tr><td>ค่าจ้างย้อม</td><td>${fmtInt(cost.serviceCost)}</td></tr>
          ${c.special ? `<tr><td>Surcharge (${fmt(c.surchargePct, 1)}%)</td><td>${fmtInt(cost.surcharge)}</td></tr>` : ""}
          <tr><td>ภาษี EPZ (${fmt(c.epzPct, 1)}%)</td><td>${fmtInt(cost.epzTax)}</td></tr>
          <tr><td><b>รวมทั้งหมด</b></td><td><b>${fmtInt(cost.total)}</b></td></tr>
        </tbody>
      </table>` : ""}
      <div class="pw-print-sign"><div>ผู้สั่งย้อม / วันที่</div><div>ผู้รับย้อม / วันที่</div></div>
    </div>`;
  }

  /* ============================================================
     Render / Bind
     ============================================================ */
  function build() {
    const root = $("#dyecombinedView");
    root.innerHTML = `
      <section class="page-heading">
        <div>
          <p class="eyebrow">DYE ORDER</p>
          <h1>ใบสั่งย้อมรวม (Combined Dye Order)</h1>
          <p class="subtitle">รวมใบสั่งย้อมของหลาย M/O เข้าด้วยกันเมื่อรหัสสี+วิธีย้อมเดียวกัน — ดึงค่า/รวมน้ำหนักให้อัตโนมัติ ยังแก้ไข/แยกออกทีหลังได้เสมอ (S/O ยังไม่นำมาใช้ตอนนี้)</p>
        </div>
      </section>
      <div id="dcSummary" class="summary-cards"></div>
      <section class="department-panel pw-card wide">
        <div class="panel-heading"><div><strong>รอย้อม — จัดกลุ่มตามรหัสสี + วิธีย้อม</strong><small>เปิดกลุ่มที่มีมากกว่า 1 M/O เพื่อเลือกรวมเป็นใบสั่งย้อมเดียว</small></div></div>
        <div class="pw-body" id="dcGroups"></div>
      </section>
      <section class="department-panel pw-card wide">
        <div class="panel-heading"><div><strong>ใบสั่งย้อมรวมที่สร้างไว้แล้ว</strong><small>แก้ไข/แยกออก/พิมพ์ PDF ได้จากที่นี่</small></div></div>
        <div class="pw-body" id="dcCombinedList"></div>
      </section>`;
  }

  // กันเรียกซ้อน (reentrant): เวลาพิมพ์ในช่องข้อความแล้ว renderAll() รื้อ innerHTML ของ container ที่ช่องนั้นอยู่ —
  // การลบช่องที่กำลังโฟกัสอยู่ทำให้เบราว์เซอร์ยิง blur/change ของมันเองทันที (ก่อนแทนที่ด้วย HTML ใหม่เสร็จ) ซึ่งไปเข้า
  // listener "change" ของเราอีกที เรียก renderAll() ซ้อนขึ้นมาระหว่างที่ innerHTML เดิมกำลังลบโหนดอยู่ (reentrant call)
  // ทำให้เบราว์เซอร์ throw "node to be removed is no longer a child" — ใส่ flag กันไม่ให้เรียกซ้อนแบบนี้
  let rendering = false;
  function renderAll() {
    if (rendering) return;
    rendering = true;
    try {
      const root = $("#dyecombinedView");
      const focusInfo = captureFocus(root);
      const pending = pendingDyeNeeds();
      const groups = groupPending(pending);
      const combinedList = loadCombined();
      $("#dcSummary").innerHTML = [
        ["หม้อย้อมที่ยังไม่รวม", pending.length, "รอจัดกลุ่ม/สั่งย้อม"],
        ["กลุ่มสี+วิธีย้อมที่ซ้ำกัน (≥2 M/O)", groups.filter((g) => g.items.length >= 2).length, "รวมเป็นใบเดียวได้"],
        ["ใบสั่งย้อมรวมที่สร้างแล้ว", combinedList.length, "แก้ไข/พิมพ์ได้ด้านล่าง"]
      ].map(([label, value, note]) => `<article class="summary-card"><small>${label}</small><strong>${value}</strong><span>${note}</span></article>`).join("");
      $("#dcGroups").innerHTML = groups.length ? groups.map(groupHtml).join("") : `<p class="col-empty">ยังไม่มีหม้อย้อมที่รอ — ทุก M/O อาจยังไม่ได้บันทึกใบวางแผนงาน หรือถูกรวมไปหมดแล้ว</p>`;
      $("#dcCombinedList").innerHTML = combinedList.length ? combinedList.map(combinedCardHtml).join("") : `<p class="col-empty">ยังไม่มีใบสั่งย้อมรวม — เลือกรายการจากกลุ่มด้านบนแล้วกด "รวมเป็นใบสั่งย้อมเดียว"</p>`;
      restoreFocus(root, focusInfo);
    } finally {
      rendering = false;
    }
  }

  function bind() {
    const root = $("#dyecombinedView");
    root.addEventListener("toggle", (e) => {
      const g = e.target.closest("[data-dc-group]");
      if (g) { const key = g.dataset.dcGroup; if (g.open) state.openGroups.add(key); else state.openGroups.delete(key); }
      const cd = e.target.closest("[data-dc-costdetail]");
      if (cd) { const key = `cost:${cd.dataset.dcCostdetail}`; if (cd.open) state.openGroups.add(key); else state.openGroups.delete(key); }
    }, true);
    root.addEventListener("change", (e) => {
      const pick = e.target.closest("[data-dc-pick]");
      if (pick) { toggleSelect(pick.dataset.dcPick, pick.dataset.dcUk); renderAll(); return; }
      const card = e.target.closest("[data-dc-card]");
      if (card) {
        const id = card.dataset.dcCard;
        const name = e.target.name;
        if (!name) return;
        if (e.target.type === "checkbox") updateCombinedField(id, name, e.target.checked);
        else updateCombinedField(id, name, e.target.value);
        renderAll();
        return;
      }
    });
    root.addEventListener("input", (e) => {
      const card = e.target.closest("[data-dc-card]");
      if (card && e.target.type !== "checkbox") {
        const name = e.target.name;
        if (!name) return;
        updateCombinedField(card.dataset.dcCard, name, e.target.value);
        renderAll();
      }
    });
    root.addEventListener("click", (e) => {
      const combineBtn = e.target.closest("[data-dc-combine]");
      if (combineBtn) {
        const key = combineBtn.dataset.dcCombine;
        const group = groupPending(pendingDyeNeeds()).find((g) => g.key === key);
        if (group) combineSelected(key, group);
        return;
      }
      const splitBtn = e.target.closest("[data-dc-split]");
      if (splitBtn) { splitOutItem(splitBtn.dataset.dcSplit, splitBtn.dataset.dcSplitDesign, splitBtn.dataset.dcSplitPot); return; }
      const delBtn = e.target.closest("[data-dc-delete]");
      if (delBtn) { deleteCombined(delBtn.dataset.dcDelete); return; }
      const useMatPrice = e.target.closest("[data-dc-use-material-price]");
      if (useMatPrice) { updateCombinedField(useMatPrice.dataset.dcUseMaterialPrice, "yarnPricePerKg", Number(useMatPrice.dataset.materialPriceValue) || 0); renderAll(); return; }
      const printBtn = e.target.closest("[data-dc-print]");
      if (printBtn) {
        const c = loadCombined().find((x) => x.id === printBtn.dataset.dcPrint);
        if (c && PE() && PE().showPrintSheets) PE().showPrintSheets(buildPrintSheetHtml(c));
        return;
      }
    });
  }

  let built = false;
  function renderDyeCombined() {
    if (!built) { build(); built = true; bind(); }
    renderAll();
  }

  window.renderDyeCombined = renderDyeCombined;
})();
