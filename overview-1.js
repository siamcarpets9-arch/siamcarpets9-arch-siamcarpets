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

  const KEY_PATTERN = "siam-pattern-orders";
  const KEY_ISSUES = "siam-weaving-issues";
  const KEY_FLOOR = "siam-weave-floor";
  const KEY_FINISH = "siam-finishing";

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
    return (typeof designs !== "undefined" ? designs : []).filter((d) => d.job === "OPENED" && !d.sample);
  }

  /* ---------- M/O vs S/O: ใช้ type จากเอกสารฝ่ายขายเป็นหลัก (แม่นสุด), ถ้าไม่เจอ fallback ดูจาก id ---------- */
  function typeOf(d) {
    const SE = window.SalesEngine;
    if (SE && typeof SE.getDocs === "function") {
      const doc = SE.getDocs().find((x) => x.designId === d.id);
      if (doc && doc.type) return doc.type === "SO" ? "SO" : "MO";
    }
    return /^SO/i.test(d.id) ? "SO" : "MO";
  }

  /* วันที่ยืนยันส่งจริง (ฝ่ายขาย, ปุ่ม "ยืนยันส่ง" ในหน้ารายงานขาย) — ใช้ตัดสินว่า "จัดส่งแล้ว" หรือยัง "รอนำส่ง"
     ใช้ได้ทั้งงานที่มีข้อมูลสดในระบบนี้ และงานที่นำเข้ามา (บางรายการมีวันที่ส่งจริงติดมากับข้อมูลนำเข้าด้วย) */
  function shipDateOf(id) {
    const SE = window.SalesEngine;
    const doc = SE && typeof SE.getDocs === "function" ? SE.getDocs().find((x) => x.designId === id) : null;
    return doc && doc.actualShip ? doc.actualShip : null;
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
      return { dept: "pattern", state: "waiting", stateLabel: "คิวทำแบบ/รอเบิกผ้าใบ", updatedAt: plan.savedAt, source: "live" };
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
        stateLabel: active ? `กำลังทอจอ ${loomsWorking.join(", ")}` : "รอคิวทอ",
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
  const IMPORT_WAIT_LABEL = { planning: "รอวางแผน", pattern: "รอเจาะลาย/ปั๊มผ้า", dyeing: "รอย้อมไหม", weaveissue: "รอส่งแผนกทอ", weaving: "รอทอ", finishing: "รอตกแต่ง/QC" };
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
    return liveStatus(d.id) || importStatus(d);
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

  function renderOverview() {
    const host = document.getElementById("overviewView");
    if (!host) return;
    const all = jobs();
    const rows = all.map((d) => ({ d, st: statusOf(d), type: typeOf(d) }));

    const counts = {};
    DEPT_ORDER.forEach((k) => (counts[k] = 0));
    let activeCount = 0, waitingCount = 0, storeCount = 0, shippedCount = 0, liveCount = 0, moCount = 0, soCount = 0;
    rows.forEach(({ st, type }) => {
      counts[st.dept] = (counts[st.dept] || 0) + 1;
      if (st.dept === "done") {
        if (st.state === "done") shippedCount++; else storeCount++;
      } else if (st.state === "active") activeCount++;
      else if (st.state === "waiting") waitingCount++;
      if (st.source === "live") liveCount++;
      if (type === "SO") soCount++; else moCount++;
    });
    const total = rows.length;

    const query = (document.getElementById("ovwSearch") ? document.getElementById("ovwSearch").value : "").trim().toLowerCase();
    const deptFilter = host.dataset.deptFilter || "all";
    const typeFilter = host.dataset.typeFilter || "all";
    const filtered = rows.filter(({ d, st, type }) => {
      if (deptFilter !== "all" && st.dept !== deptFilter) return false;
      if (typeFilter !== "all" && type !== typeFilter) return false;
      if (!query) return true;
      return `${d.id} ${d.moNo || ""} ${d.customer || ""} ${d.project || ""}`.toLowerCase().includes(query);
    });

    const stageCards = DEPT_ORDER.map((key) => {
      const meta = DEPTS[key];
      const n = counts[key] || 0;
      const pct = total ? Math.round((n / total) * 100) : 0;
      const activeClass = deptFilter === key ? "is-active" : "";
      return `<button type="button" class="ovw-stage ${activeClass}" style="--c:${meta.color}" data-dept="${key}">
        <span class="ovw-stage-dot"></span>
        <strong>${n}</strong>
        <small>${esc(meta.short)}</small>
        <i style="width:${pct}%"></i>
      </button>`;
    }).join("");

    const tableRows = filtered
      .sort((a, b) => (a.st.state === "active" ? -1 : 1) - (b.st.state === "active" ? -1 : 1))
      .map(({ d, st, type }) => {
        const meta = DEPTS[st.dept] || DEPTS.planning;
        return `<tr>
          <td><span class="ovw-type ovw-type-${type}">${type}</span></td>
          <td><strong>${esc(d.id)}</strong><small>${esc(d.market === "DOMESTIC" ? "ในประเทศ" : d.market === "FOREIGN" ? "ต่างประเทศ" : "")}</small></td>
          <td>${esc(d.customer || "-")}</td>
          <td>${esc(d.project || "-")}</td>
          <td>${esc(d.due || "-")}${d.planNote ? `<br><small class="ovw-plannote">⚠ ${esc(d.planNote)}</small>` : ""}</td>
          <td>${badge(st.dept, st.state)}<br><small class="ovw-dept-label">${esc(meta.label)}</small></td>
          <td>${d.weaveLocation ? `<span class="ovw-weaveloc ${d.weaveLocation === "SIAM" ? "ovw-weaveloc-in" : "ovw-weaveloc-out"}">${esc(d.weaveLocation === "SIAM" ? "ทอเอง" : d.weaveLocation)}</span>` : "-"}</td>
          <td>${stateTag(st.state, st.stateLabel)}${st.source === "import" ? `<small class="ovw-src">${d.importSource === "MASTER PLAN 17-9-26" ? "ตาม MASTER PLAN 17 ก.ย." : "ตามข้อมูลนำเข้า 22 ก.ย."}</small>` : st.source === "live" ? '<small class="ovw-src ovw-src-live">อัปเดตจากระบบนี้</small>' : ""}</td>
          <td><button type="button" class="action-button ovw-goto" data-view="${meta.view}">ไปที่หน้า ${esc(meta.short)}</button></td>
        </tr>`;
      })
      .join("");

    host.dataset.deptFilter = deptFilter;
    host.dataset.typeFilter = typeFilter;
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

      <section class="ovw-note">
        <strong>ที่มาของสถานะ:</strong> งานที่ <u>ยังไม่เคย</u>บันทึกใบวางแผนงานในระบบนี้ จะแสดงสถานะตามข้อมูลนำเข้าล่าสุดจาก Google Sheet “QC Check Sheet” ของบริษัท (22 ก.ย. 2026) — ข้อมูลนำเข้ารู้แค่ว่าอยู่แผนกไหน ไม่รู้ว่ากำลังลงมือทำอยู่จริงหรือยัง จึงขึ้นเป็น “รอ” ของแผนกนั้นเสมอ
        — เมื่อฝ่ายวางแผน/เจาะลาย/ทอ/ตกแต่งเริ่มกรอกงานจริงในระบบนี้ สถานะจะเปลี่ยนมาอัปเดตสดทันที พร้อมรายละเอียดต่อแผนก เช่น จำนวนสีที่ย้อมแล้ว/เหลือ, เบอร์จอที่กำลังทอ, รอ QC ตรวจ ฯลฯ (ปัจจุบันมี ${liveCount} รายการที่อัปเดตสดแล้ว)
        — วันกำหนดส่ง, ความคืบหน้า และคอลัมน์ “ที่ทอ” (ทอเองที่โรงงาน SIAM หรือจ้างทอนอก) ของงานที่มาจากข้อมูลนำเข้า อัปเดตล่าสุดตาม MASTER PLAN PRODUCTION 17 ก.ย. 2026
      </section>

      <section class="ovw-stagebar">${stageCards}</section>

      <section class="department-panel ovw-table-panel">
        <div class="panel-heading">
          <div><strong>รายการงานทั้งหมด</strong><small>คลิกแผนกด้านบนเพื่อกรอง หรือค้นหาด้วยเลข M/O · SO, ลูกค้า, Project</small></div>
          <div class="segmented ovw-typefilter">
            <button type="button" class="view-btn ${typeFilter === "all" ? "active" : ""}" data-type="all">ทั้งหมด (${total})</button>
            <button type="button" class="view-btn ${typeFilter === "MO" ? "active" : ""}" data-type="MO">M/O (${moCount})</button>
            <button type="button" class="view-btn ${typeFilter === "SO" ? "active" : ""}" data-type="SO">S/O (${soCount})</button>
          </div>
          <label>ค้นหา<input id="ovwSearch" type="text" placeholder="เช่น MO-0109-26, ART RUGS" value="${esc(query)}"></label>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>ประเภท</th><th>เลขที่</th><th>ลูกค้า</th><th>Project / PO</th><th>กำหนดส่ง</th><th>แผนกปัจจุบัน</th><th>ที่ทอ</th><th>สถานะ</th><th></th></tr></thead>
            <tbody>${tableRows || `<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:24px">ไม่พบรายการที่ตรงกับตัวกรอง</td></tr>`}</tbody>
          </table>
        </div>
      </section>
    `;

    const searchEl = document.getElementById("ovwSearch");
    if (searchEl) {
      searchEl.addEventListener("input", () => renderOverview());
      searchEl.focus();
      searchEl.selectionStart = searchEl.selectionEnd = searchEl.value.length;
    }
    host.querySelectorAll(".ovw-stage").forEach((btn) => {
      btn.addEventListener("click", () => {
        host.dataset.deptFilter = host.dataset.deptFilter === btn.dataset.dept ? "all" : btn.dataset.dept;
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
  }

  window.renderOverview = renderOverview;
})();
