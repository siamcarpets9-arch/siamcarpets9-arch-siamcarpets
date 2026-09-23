/* ============================================================
   ภาพรวมการผลิต (Production Overview) — หน้าแรกของแอป
   แสดงว่าแต่ละ M/O·SO อยู่แผนกไหน กำลังทำ/รอทำ โดยอ้างอิง:
   1) ข้อมูลจริงที่บันทึกในระบบนี้ (ใบวางแผนงาน → เจาะลาย → ส่งแผนกทอ → แผนกทอ → ทากาวตกแต่ง)
      ถ้ามีการบันทึกแผนแล้ว ("plans[id].savedAt") ถือเป็นข้อมูลล่าสุด/แม่นที่สุด
   2) ถ้ายังไม่มีการบันทึกแผนในระบบนี้ ใช้ "importStage"/"progress" ที่นำเข้าจาก
      Google Sheet "QC Check Sheet" ของบริษัท (22 ก.ย. 2026) แทน — เป็นสถานะจริง ณ วันนำเข้า
      ไม่ใช่ข้อมูลสด จนกว่าฝ่ายต่าง ๆ จะเริ่มกรอกงานจริงในระบบนี้
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
    dyeing: { label: "สั่งย้อมไหม", short: "ย้อมไหม", view: "planwork", color: "#9876b4" },
    pattern: { label: "เจาะลาย/ขยายลาย", short: "เจาะลาย", view: "pattern", color: "#4e7fa4" },
    weaveissue: { label: "ส่งแผนกทอ", short: "ส่งแผนกทอ", view: "weaveissue", color: "#6f9bb0" },
    weaving: { label: "แผนกทอ (จอทอรายวัน)", short: "แผนกทอ", view: "weavefloor", color: "#13848a" },
    weavefloor: { label: "แผนกทอ (จอทอรายวัน)", short: "แผนกทอ", view: "weavefloor", color: "#13848a" },
    finishing: { label: "ทากาวตกแต่ง", short: "ตกแต่ง", view: "finishing", color: "#d39a2f" },
    done: { label: "เสร็จสิ้น/จัดส่งแล้ว", short: "เสร็จสิ้น", view: "qcdash", color: "#438b79" }
  };
  const DEPT_ORDER = ["planning", "dyeing", "pattern", "weaveissue", "weaving", "finishing", "done"];

  function jobs() {
    return (typeof designs !== "undefined" ? designs : []).filter((d) => d.job === "OPENED");
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

  /* ---------- 1) สถานะสดจากข้อมูลที่กรอกจริงในระบบนี้ ---------- */
  function liveStatus(id) {
    const PE = window.PlanningEngine;
    const plans = PE ? PE.readJson(PE.KEY_PLANS, {}) : readJson("siam-planning-worksheets", {});
    const plan = plans[id];
    if (!plan || !plan.savedAt) return null; // ยังไม่เคยบันทึกแผนในระบบนี้ → ให้ไปใช้ข้อมูลนำเข้าแทน

    const patternRec = readJson(KEY_PATTERN, {})[id];
    if (!patternRec || !patternRec.requisitionIssued) {
      return { dept: "pattern", state: patternRec ? "active" : "waiting", stateLabel: patternRec ? "กำลังทำ" : "รอคิว", updatedAt: plan.savedAt, source: "live" };
    }

    const issueRec = readJson(KEY_ISSUES, {})[id];
    if (!issueRec || !issueRec.issuedAt) {
      return { dept: "weaveissue", state: issueRec ? "active" : "waiting", stateLabel: issueRec ? "กำลังทำ" : "รอคิว", updatedAt: patternRec.requisitionAt, source: "live" };
    }

    const floorRec = readJson(KEY_FLOOR, {})[id];
    const expected = Object.keys(issueRec.lines || {}).length || (floorRec ? Object.keys(floorRec.pieces || {}).length : 0) || 1;
    const pieces = floorRec && floorRec.pieces ? Object.values(floorRec.pieces) : [];
    const transferred = pieces.filter((p) => p.transferredToGlueAt).length;
    const anyStarted = pieces.some((p) => p.days && Object.keys(p.days).length);
    if (!pieces.length || transferred < expected) {
      return { dept: "weaving", state: anyStarted || transferred ? "active" : "waiting", stateLabel: anyStarted || transferred ? "กำลังทำ" : "รอคิว", updatedAt: issueRec.issuedAt, source: "live" };
    }

    const finRec = readJson(KEY_FINISH, {})[id];
    const finPieces = finRec && finRec.pieces ? Object.values(finRec.pieces) : [];
    const received = finPieces.filter((p) => p.receivedDate).length;
    const done = finPieces.filter((p) => p.receivedDate && p.finish && p.finish.startDate && p.dry && p.dry.widthAfterDryM && p.dry.lengthAfterDryM).length;
    if (!finPieces.length || done < expected) {
      const firstTransfer = pieces.map((p) => p.transferredToGlueAt).filter(Boolean).sort()[0];
      return { dept: "finishing", state: received ? "active" : "waiting", stateLabel: received ? "กำลังทำ" : "รอคิว", updatedAt: firstTransfer, source: "live" };
    }
    return { dept: "done", state: "done", stateLabel: "เสร็จสิ้น", updatedAt: null, source: "live" };
  }

  /* ---------- 2) สถานะจากข้อมูลนำเข้า (QC Check Sheet, 22 ก.ย. 2026) ---------- */
  function importStatus(d) {
    if (d.importSource === "QC Check Sheet") {
      if (Number(d.progress) >= 100) return { dept: "done", state: "done", stateLabel: "เสร็จสิ้น/จัดส่งแล้ว", updatedAt: null, source: "import" };
      if (d.importStage) return { dept: d.importStage, state: "active", stateLabel: "กำลังดำเนินการ", updatedAt: null, source: "import" };
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
    let activeCount = 0, waitingCount = 0, liveCount = 0, moCount = 0, soCount = 0;
    rows.forEach(({ st, type }) => {
      counts[st.dept] = (counts[st.dept] || 0) + 1;
      if (st.state === "active") activeCount++;
      else if (st.state === "waiting") waitingCount++;
      if (st.source === "live") liveCount++;
      if (type === "SO") soCount++; else moCount++;
    });
    const total = rows.length;
    const doneCount = counts.done || 0;

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
          <td>${esc(d.due || "-")}</td>
          <td>${badge(st.dept, st.state)}<br><small class="ovw-dept-label">${esc(meta.label)}</small></td>
          <td>${stateTag(st.state, st.stateLabel)}${st.source === "import" ? '<small class="ovw-src">ตามข้อมูลนำเข้า 22 ก.ย.</small>' : st.source === "live" ? '<small class="ovw-src ovw-src-live">อัปเดตจากระบบนี้</small>' : ""}</td>
          <td><button type="button" class="action-button ovw-goto" data-view="${meta.view}">ไปที่หน้า${esc(meta.short)}</button></td>
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
          <div><strong>${doneCount}</strong><span>เสร็จสิ้น/จัดส่งแล้ว</span></div>
        </div>
      </section>

      <section class="ovw-note">
        <strong>ที่มาของสถานะ:</strong> งานที่ <u>ยังไม่เคย</u>บันทึกใบวางแผนงานในระบบนี้ จะแสดงสถานะตามข้อมูลนำเข้าล่าสุดจาก Google Sheet “QC Check Sheet” ของบริษัท (22 ก.ย. 2026)
        — เมื่อฝ่ายวางแผน/เจาะลาย/ทอ/ตกแต่งเริ่มกรอกงานจริงในระบบนี้ สถานะของงานนั้นจะเปลี่ยนมาอัปเดตสดตามข้อมูลที่กรอกทันที (ปัจจุบันมี ${liveCount} รายการที่อัปเดตสดแล้ว)
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
            <thead><tr><th>ประเภท</th><th>เลขที่</th><th>ลูกค้า</th><th>Project / PO</th><th>กำหนดส่ง</th><th>แผนกปัจจุบัน</th><th>สถานะ</th><th></th></tr></thead>
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
