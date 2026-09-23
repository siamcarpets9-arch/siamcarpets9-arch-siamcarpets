/* ============================================================
   โค้ดสี (POM) — ทะเบียนโค้ดสี + ตรวจโค้ดสีของแบบ
   - ชุดที่มีกฎอ่านได้จากรูปกล่อง: SIAM 5001–8908 (แถว 0–9 × คอลัมน์ 1–8), CC001–CC360 (คอลัมน์ 1–36 × แถว A–J)
   - ชุดอื่น ๆ (ARS 600/320, INNO, LOOP HOUSE ฯลฯ) ใช้ทะเบียนที่ผู้ใช้เพิ่ม/นำเข้า
   - ตรวจโค้ด: พบในชุดหรือไม่ → กล่อง/ตำแหน่ง/ชื่อสี · ถ้าใส่สีของแบบ (hex) เทียบ ΔE2000 กับสีในทะเบียน
   ต้องโหลดหลัง app.js (ใช้ toast)
   ============================================================ */
(function () {
  "use strict";
  const KEY = "enterprise-color-registry";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (v) => String(v === undefined || v === null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const txt = (v) => String(v === undefined || v === null ? "" : v).trim();

  /* ---------- ชุดสี POM (ตามชีตและรูปในไฟล์ “0000 รูป POM กระเป๋าต่างๆ”) ---------- */
  const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  const SERIES = [
    { id: "SIAM58", name: "POM SIAM 5–8", rule: true, photos: range(6, 13), desc: "โค้ด 4 หลัก 5001–8908 · หลักแรก = กล่องชุด 5/6/7/8 · หลักที่ 2 = แถว 0–9 · หลักสุดท้าย = คอลัมน์ 1–8 (ช่องละ 1 สี)" },
    { id: "CC", name: "POM CC NEW & OLD", rule: true, photos: range(18, 23), desc: "โค้ด CC001–CC360 · ป้ายบนกล่องเป็น คอลัมน์ 1–36 + แถว A–J (เช่น CC012 = 2B) · ตามรูปที่ให้มาเห็นถึง CC359" },
    { id: "INNO", name: "POM INNO & POM SIAM", rule: false, photos: range(14, 17), desc: "กล่องมีพิกัดคอลัมน์ A–J × แถวตัวเลข — ยังไม่มีตารางโค้ดในไฟล์ (เพิ่มโค้ดเองในทะเบียน)" },
    { id: "LOOP", name: "POM LOOP HOUSE", rule: false, photos: range(24, 29), desc: "ถาดเส้นด้ายแบบมีหลุมเรียงลำดับ — ยังไม่มีตารางโค้ดในไฟล์ (เพิ่มโค้ดเองในทะเบียน)" },
    { id: "ARS600", name: "POM ARS 600", rule: false, photos: [3, 2, 1], desc: "การ์ด ART No. ARS 600 พร้อมกล่องเส้นด้าย — ตรงกับระบบ “ARS 600 Wool” ของบริษัท ARS Colors (อินเดีย ก่อตั้ง พ.ศ. 2544/2001) ไหมขนสัตว์ 600 สี รุ่นแรกของบริษัท — เลขรุ่น/ปีในตารางอาจต่างจากการ์ดจริงของโรงงาน โปรดยืนยันปีของการ์ดที่ใช้จริงตอนเพิ่มโค้ด (ช่อง “ปี”)" },
    { id: "ARS320", name: "POM ARS 320", rule: false, photos: [5, 4], desc: "การ์ด ART No. ARS 320 พร้อมกล่องเส้นด้าย — ตรงกับระบบ “ARS 320 Viscose” ของ ARS Colors: ไหมเรยอน 320 สี จัดเป็น 16 กลุ่มสี (ตัวอักษร A–P) × 20 โทนต่อกลุ่ม (เลข 01–20) เช่น 20P, 01A — ระบบพอช่วยเดาโทน/กลุ่มสีได้ (ดูคำใบ้ตอนตรวจโค้ด) แต่ยังต้องยืนยันโค้ด/ปีของการ์ดจริงกับทะเบียนก่อนใช้งาน" },
    { id: "SIAM14", name: "POM SIAM 1–4", rule: false, photos: [], desc: "ชีตในไฟล์ต้นฉบับว่าง (ไม่มีรูป/ตาราง)" },
    { id: "ARS1", name: "POM ARS1", rule: false, photos: [], desc: "ชีตในไฟล์ต้นฉบับว่าง (ไม่มีรูป/ตาราง)" },
    { id: "THAIPING", name: "POM THAIPING", rule: false, photos: [], desc: "ชีตในไฟล์ต้นฉบับว่าง (ไม่มีรูป/ตาราง)" },
    { id: "STOFF", name: "POM STOFF", rule: false, photos: [], desc: "ชีตในไฟล์ต้นฉบับว่าง (ไม่มีรูป/ตาราง)" }
  ];
  const CC_MAX = 360;
  const TONES = ["แดง", "ส้ม", "เหลือง", "เขียว", "ฟ้า", "น้ำเงิน", "ม่วง", "ชมพู", "น้ำตาล", "เบจ/ครีม", "เทา", "ดำ", "ขาว", "ทอง", "เงิน", "หลากสี/อื่นๆ"];

  /* ---------- ทะเบียนที่ผู้ใช้เพิ่ม ---------- */
  function load() { try { const r = JSON.parse(localStorage.getItem(KEY) || "null"); return Array.isArray(r && r.codes) ? r.codes : []; } catch (e) { return []; } }
  let codes = load();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ codes })); } catch (e) { /* ใช้ต่อได้แม้บันทึกไม่ได้ */ } };

  /* ---------- โค้ด: ทำให้เป็นรูปแบบเดียวกัน ---------- */
  const SIAM_RE = /^(?:SIAM)?([5-8])(\d)0([1-8])$/;
  const CC_RE = /^CC0*(\d{1,3})(?:\d{1,2}[A-J])?$/;
  const ARS320_RE = /^(?:ARS\s?)?(\d{1,2})\s?([A-P])$/; // เดาโทน/กลุ่มสีของระบบ ARS 320 Viscose (arscolors.com) — ใบ้เท่านั้น ไม่ตัดสินว่าถูก/ผิด
  function normKey(raw) {
    const s = txt(raw).toUpperCase().replace(/[\s_-]+/g, " ");
    if (!s) return "";
    let m = s.match(/^CC\s?0*(\d{1,3})(?:\s+\d{1,2}[A-J])?$/);
    if (m && +m[1] > 0) return "CC" + String(+m[1]).padStart(3, "0");
    m = s.replace(/ /g, "").match(SIAM_RE);
    if (m) return m[1] + m[2] + "0" + m[3];
    return s;
  }
  const cmp = (v) => normKey(v).replace(/ /g, "");

  /* ---------- สี: hex → Lab, ΔE2000 ---------- */
  function parseHex(h) {
    let s = txt(h).replace(/^#/, "");
    if (/^[0-9a-f]{3}$/i.test(s)) s = s.split("").map((c) => c + c).join("");
    return /^[0-9a-f]{6}$/i.test(s) ? "#" + s.toLowerCase() : "";
  }
  function hexToLab(hex) {
    const h = parseHex(hex); if (!h) return null;
    const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    const X = (c[0] * 0.4124564 + c[1] * 0.3575761 + c[2] * 0.1804375) / 0.95047, Y = c[0] * 0.2126729 + c[1] * 0.7151522 + c[2] * 0.072175, Z = (c[0] * 0.0193339 + c[1] * 0.119192 + c[2] * 0.9503041) / 1.08883;
    const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
    return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
  }
  function deltaE(l1, l2) { // CIEDE2000
    const [L1, a1, b1] = l1, [L2, a2, b2] = l2, rad = (x) => (x * Math.PI) / 180, deg = (x) => { const d = (x * 180) / Math.PI; return d < 0 ? d + 360 : d; };
    const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cb = (C1 + C2) / 2, G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
    const a1p = (1 + G) * a1, a2p = (1 + G) * a2, C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
    const h1p = C1p === 0 ? 0 : deg(Math.atan2(b1, a1p)), h2p = C2p === 0 ? 0 : deg(Math.atan2(b2, a2p));
    const dLp = L2 - L1, dCp = C2p - C1p;
    let dhp = 0; if (C1p * C2p !== 0) { dhp = h2p - h1p; if (dhp > 180) dhp -= 360; else if (dhp < -180) dhp += 360; }
    const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dhp / 2)), Lbp = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2;
    let hbp; if (C1p * C2p === 0) hbp = h1p + h2p; else { hbp = (h1p + h2p) / 2; if (Math.abs(h1p - h2p) > 180) hbp += h1p + h2p < 360 ? 180 : -180; }
    const T = 1 - 0.17 * Math.cos(rad(hbp - 30)) + 0.24 * Math.cos(rad(2 * hbp)) + 0.32 * Math.cos(rad(3 * hbp + 6)) - 0.2 * Math.cos(rad(4 * hbp - 63));
    const dTheta = 30 * Math.exp(-(((hbp - 275) / 25) ** 2)), Rc = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
    const Sl = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2), Sc = 1 + 0.045 * Cbp, Sh = 1 + 0.015 * Cbp * T, Rt = -Math.sin(rad(2 * dTheta)) * Rc;
    return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh));
  }
  const DE_OK = 3, DE_NEAR = 6; // ≤3 ตรง · ≤6 ใกล้เคียง · >6 ต่าง

  /* ---------- ตรวจโค้ด ---------- */
  function lookup(raw) {
    const s = txt(raw).toUpperCase().replace(/[\s_-]+/g, " ");
    if (!s) return { status: "empty", key: "" };
    const key = normKey(raw), reg = codes.find((c) => cmp(c.code) === cmp(raw));
    let rule = null, invalid = "";
    let m = s.match(/^CC\s?0*(\d{1,3})(?:\s+\d{1,2}[A-J])?$/);
    if (m) {
      const n = +m[1];
      if (n >= 1 && n <= CC_MAX) rule = { series: "POM CC NEW & OLD", box: "กล่อง CC", location: `ช่อง ${Math.floor((n - 1) / 10) + 1}${"ABCDEFGHIJ"[(n - 1) % 10]} (คอลัมน์ ${Math.floor((n - 1) / 10) + 1} · แถว ${"ABCDEFGHIJ"[(n - 1) % 10]})` };
      else invalid = `CC ต้องอยู่ในช่วง CC001–CC${CC_MAX}`;
    } else if (/^\d{4}$/.test(s.replace(/ /g, "")) && /^[5-8]/.test(s)) {
      m = s.replace(/ /g, "").match(SIAM_RE);
      if (m) rule = { series: "POM SIAM 5–8", box: `กล่อง SIAM ${m[1]}xxx`, location: `แถวที่ ${+m[2] + 1} (เลข ${m[1]}${m[2]}xx) · คอลัมน์ที่ ${m[3]}` };
      else invalid = "โค้ด SIAM 5–8 ต้องเป็น [5-8][แถว 0-9]0[คอลัมน์ 1-8] เช่น 6001, 7208";
    }
    const out = { key, rule: !!rule, inRegistry: !!reg, series: (reg && reg.series) || (rule && rule.series) || "", box: (rule && rule.box) || "", location: (rule && rule.location) || "", name: (reg && reg.name) || "", regHex: (reg && parseHex(reg.hex)) || "", note: (reg && reg.note) || "", year: (reg && reg.year) || "", tone: (reg && reg.tone) || "" };
    if (rule || reg) out.status = "found";
    else if (invalid) { out.status = "invalid"; out.msg = invalid; }
    else {
      out.status = "unknown"; out.msg = "ไม่พบในทะเบียน และไม่ตรงกับกฎของชุด SIAM 5–8 / CC";
      const am = s.replace(/ /g, "").match(ARS320_RE);
      if (am) out.msg += ` · รูปแบบคล้ายระบบ ARS 320 Viscose: กลุ่มสี ${am[2]} · โทนที่ ${am[1]} (16 กลุ่ม × 20 โทน — ใบ้เฉยๆ ยังไม่ยืนยัน โปรดเทียบกับกล่องจริงแล้วบันทึกทะเบียน)`;
    }
    return out;
  }
  // ตรวจโค้ด + เทียบสีของแบบ (designHex ไม่บังคับ)
  function check(raw, designHex) {
    const r = lookup(raw);
    if (r.status !== "found") return r;
    const dh = parseHex(designHex);
    r.designHex = dh;
    if (dh && r.regHex) {
      r.dE = deltaE(hexToLab(dh), hexToLab(r.regHex));
      r.verdict = r.dE <= DE_OK ? "ok" : r.dE <= DE_NEAR ? "near" : "diff";
    } else r.verdict = r.regHex ? "nodesign" : "noref";
    return r;
  }
  const VERDICT = {
    ok: ["ตรงกับโค้ด", ""], near: ["ใกล้เคียง (ควรเทียบด้วยตา)", "review"], diff: ["สีต่างจากโค้ด", "blocked"],
    nodesign: ["พบโค้ด", ""], noref: ["พบโค้ด · ยังไม่มีค่าสีอ้างอิง", "info"]
  };
  function badge(r) {
    if (r.status === "empty") return "";
    const t = (label, kind = "") => `<span class="status-tag ${kind}">${label}</span>`;
    if (r.status === "invalid") return t("โค้ดไม่ถูกต้อง", "blocked");
    if (r.status === "unknown") return t("ไม่พบในทะเบียน", "review");
    const [label, kind] = VERDICT[r.verdict] || ["พบโค้ด", ""];
    return t(label + (r.dE !== undefined ? ` · ΔE ${r.dE.toFixed(1)}` : ""), kind);
  }
  function addCode(entry) {
    const key = normKey(entry.code); if (!key) return false;
    const rec = { code: key, series: txt(entry.series), name: txt(entry.name), hex: parseHex(entry.hex), note: txt(entry.note), year: txt(entry.year), tone: txt(entry.tone) };
    const i = codes.findIndex((c) => cmp(c.code) === cmp(key));
    if (i >= 0) codes[i] = { ...codes[i], ...Object.fromEntries(Object.entries(rec).filter(([k, v]) => v || k === "code")) }; else codes.push(rec);
    save(); return true;
  }

  /* ---------- หน้าจอ ---------- */
  const ui = { built: false, q: "", lb: null };
  const photoUrl = (n) => `pom/pom${String(n).padStart(2, "0")}.jpg`;

  function build() {
    $("#colorsView").innerHTML = `
      <section class="page-heading">
        <div>
          <p class="eyebrow">COLOR CODE</p>
          <h1>โค้ดสี POM · ตรวจสีของแบบกับโค้ดสี</h1>
          <p class="subtitle">พิมพ์โค้ดสีของแบบ (เช่น CC012, 6001) เพื่อดูว่าอยู่กล่องไหน ช่องไหน และเทียบสีของแบบกับสีอ้างอิงในทะเบียน — ใช้ตรวจอัตโนมัติในแถวสีของฟอร์ม M/O ด้วย</p>
        </div>
        <div class="heading-actions"><button data-col="export">ดาวน์โหลดทะเบียน (CSV)</button><label class="file-picker">นำเข้าโค้ดสี (Excel/CSV)<input id="colFile" type="file" accept=".xlsx,.xls,.csv"></label></div>
      </section>

      <section class="department-panel col-panel">
        <div class="panel-heading"><div><strong>ตรวจโค้ดสีของแบบ</strong><small>บรรทัดละ 1 สี · รูปแบบ “โค้ด” หรือ “โค้ด #สีของแบบ” (เช่น CC012 #b5651d) · ค่า hex ของสีแบบใส่จากภาพแบบหรือสแกนสี · ΔE ≤ ${DE_OK} ตรง, ≤ ${DE_NEAR} ใกล้เคียง, มากกว่านั้นต่าง</small></div><button class="action-button" data-col="sample">ใส่ตัวอย่าง</button></div>
        <div class="col-check">
          <textarea id="colInput" rows="6" placeholder="CC012&#10;6001 #efe4c8&#10;7208 #2a3f7a&#10;CC400"></textarea>
          <div class="table-wrap"><table class="col-table"><thead><tr><th>โค้ด</th><th>ผลตรวจ</th><th>ชุด / กล่อง</th><th>ตำแหน่งในกล่อง</th><th>ชื่อสี</th><th>สีอ้างอิง</th><th>สีของแบบ</th><th></th></tr></thead><tbody id="colResult"></tbody></table></div>
        </div>
      </section>

      <section class="department-panel col-panel">
        <div class="panel-heading"><div><strong>ชุดสี POM ที่มีในโรงงาน</strong><small>รูปกล่องอ้างอิงจากไฟล์ที่ให้มา · คลิกรูปเพื่อขยาย · “กฎโค้ด” = ระบบตรวจโค้ดและบอกตำแหน่งให้เอง</small></div></div>
        <div id="colSeries" class="col-series"></div>
      </section>

      <section class="department-panel col-panel">
        <div class="panel-heading"><div><strong>ทะเบียนโค้ดสีที่บันทึกไว้</strong><small id="colCount"></small></div><label>ค้นหา<input id="colSearch" placeholder="โค้ด, ชุด, ชื่อสี, โทน หรือปี"></label></div>
        <form id="colAdd" class="col-add">
          <label>โค้ด<input name="code" placeholder="เช่น ARS BN09" required></label>
          <label>ชุด<input name="series" list="colSeriesList" placeholder="POM ARS 600"></label>
          <label>ชื่อสี<input name="name"></label>
          <label>สีอ้างอิง (hex)<span class="col-hex"><input name="hex" placeholder="#RRGGBB"><input type="color" name="pick" value="#cccccc" title="เลือกสี"></span></label>
          <label>โทนสี<input name="tone" list="colToneList" placeholder="เช่น น้ำตาล, เบจ"></label>
          <label>ปีของการ์ดสี<input name="year" inputmode="numeric" placeholder="เช่น 2014" maxlength="4" size="4"></label>
          <label>หมายเหตุ / ตำแหน่ง<input name="note" placeholder="เช่น ถาด 2 ช่อง B4"></label>
          <button class="action-button primary">เพิ่ม / แก้ไขโค้ด</button>
        </form>
        <datalist id="colSeriesList">${SERIES.map((s) => `<option value="${esc(s.name)}">`).join("")}</datalist>
        <datalist id="colToneList">${TONES.map((t) => `<option value="${esc(t)}">`).join("")}</datalist>
        <div class="table-wrap"><table class="col-table"><thead><tr><th>โค้ด</th><th>ชุด</th><th>ชื่อสี</th><th>สีอ้างอิง</th><th>โทนสี</th><th>ปี</th><th>หมายเหตุ</th><th></th></tr></thead><tbody id="colRegBody"></tbody></table></div>
      </section>

      <div id="colLightbox" class="col-lb" hidden><button class="col-lb-x" data-col="lb-close">×</button><button class="col-lb-nav prev" data-col="lb-prev">‹</button><img id="colLbImg" alt=""><button class="col-lb-nav next" data-col="lb-next">›</button><div id="colLbCap"></div></div>`;
  }
  const swatch = (hex) => (hex ? `<span class="col-sw" style="background:${esc(hex)}"></span>${esc(hex)}` : "-");

  function renderCheck() {
    const lines = $("#colInput").value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    $("#colResult").innerHTML = lines.length ? lines.map((line, i) => {
      const m = line.match(/^(.*?)(?:\s+(#?[0-9a-fA-F]{3}|#?[0-9a-fA-F]{6}))?$/), hexLike = /^#/.test(line.split(/\s+/).pop()) || (line.split(/\s+/).length > 1 && /^[0-9a-f]{6}$/i.test(line.split(/\s+/).pop()));
      const parts = line.split(/\s+/), last = parts[parts.length - 1];
      const dh = parts.length > 1 && (/^#[0-9a-f]{3,6}$/i.test(last) || /^[0-9a-f]{6}$/i.test(last)) ? last : "";
      const code = dh ? parts.slice(0, -1).join(" ") : line;
      const r = check(code, dh);
      const add = r.status === "unknown" || (r.status === "found" && !r.inRegistry && dh) ? `<button class="action-button" data-col="quick-add" data-code="${esc(code)}" data-hex="${esc(dh)}">เพิ่มเข้าทะเบียน</button>` : "";
      return `<tr><td><strong>${esc(r.key || code)}</strong></td><td>${badge(r)}${r.msg ? `<small>${esc(r.msg)}</small>` : ""}</td><td>${esc(r.series) || "-"}${r.box ? `<small>${esc(r.box)}</small>` : ""}</td><td>${esc(r.location) || esc(r.note) || "-"}</td><td>${esc(r.name) || "-"}${r.tone ? `<small>โทน ${esc(r.tone)}${r.year ? " · ปี " + esc(r.year) : ""}</small>` : ""}</td><td>${swatch(r.regHex)}</td><td>${swatch(r.designHex)}</td><td>${add}</td></tr>`;
    }).join("") : `<tr><td colspan="8"><div class="col-empty">พิมพ์โค้ดสีในช่องด้านบน ระบบตรวจให้ทันที</div></td></tr>`;
  }
  function renderSeries() {
    $("#colSeries").innerHTML = SERIES.map((s) => {
      const n = codes.filter((c) => c.series === s.name).length;
      return `<article class="col-card"><header><strong>${esc(s.name)}</strong><span class="status-tag ${s.rule ? "" : "info"}">${s.rule ? "กฎโค้ด" : "ทะเบียนเอง"}</span></header><p>${esc(s.desc)}</p><small>${n ? `${n} โค้ดในทะเบียน · ` : ""}${s.photos.length ? `${s.photos.length} รูปอ้างอิง` : "ไม่มีรูป"}</small>${s.photos.length ? `<div class="col-thumbs">${s.photos.map((p, i) => `<img loading="lazy" src="${photoUrl(p)}" alt="${esc(s.name)} ${i + 1}" data-col="lb-open" data-series="${s.id}" data-i="${i}">`).join("")}</div>` : ""}</article>`;
    }).join("");
  }
  function renderRegistry() {
    const q = ui.q.trim().toLowerCase();
    const list = codes.filter((c) => !q || `${c.code} ${c.series} ${c.name} ${c.tone} ${c.year} ${c.note}`.toLowerCase().includes(q)).sort((a, b) => a.code.localeCompare(b.code));
    $("#colCount").textContent = `${codes.length} โค้ดที่บันทึกไว้ · ชุดที่มีกฎ (SIAM 5–8, CC) ตรวจได้แม้ยังไม่ได้บันทึกโค้ด`;
    $("#colRegBody").innerHTML = list.length ? list.map((c) => `<tr><td><strong>${esc(c.code)}</strong></td><td>${esc(c.series) || "-"}</td><td>${esc(c.name) || "-"}</td><td>${swatch(parseHex(c.hex))}</td><td>${esc(c.tone) || "-"}</td><td>${esc(c.year) || "-"}</td><td>${esc(c.note) || "-"}</td><td><button class="action-button ghost" data-col="edit" data-code="${esc(c.code)}">แก้</button> <button class="action-button ghost" data-col="del" data-code="${esc(c.code)}">ลบ</button></td></tr>`).join("") : `<tr><td colspan="8"><div class="col-empty">${codes.length ? "ไม่พบโค้ดที่ค้นหา" : "ยังไม่มีโค้ดที่บันทึก — เพิ่มด้านบน หรือนำเข้าจาก Excel/CSV (คอลัมน์: code, series, name, hex, tone, year, note)"}</div></td></tr>`;
  }
  function renderColors() {
    if (!ui.built) { build(); ui.built = true; bind(); }
    renderCheck(); renderSeries(); renderRegistry();
  }

  function lbShow() {
    const s = SERIES.find((x) => x.id === ui.lb.series); if (!s) return;
    const n = s.photos.length; ui.lb.i = (ui.lb.i + n) % n;
    $("#colLbImg").src = photoUrl(s.photos[ui.lb.i]); $("#colLbCap").textContent = `${s.name} · รูปที่ ${ui.lb.i + 1}/${n}`;
    $("#colLightbox").hidden = false;
  }
  function toCsv() {
    const q = (v) => `"${String(v || "").replace(/"/g, '""')}"`;
    return "﻿" + ["code,series,name,hex,tone,year,note", ...codes.map((c) => [c.code, c.series, c.name, c.hex, c.tone, c.year, c.note].map(q).join(","))].join("\r\n");
  }
  async function importFile(f) {
    if (typeof XLSX === "undefined") { toast("โหลดตัวอ่าน Excel ไม่ได้ — ต้องเชื่อมต่ออินเทอร์เน็ต"); return; }
    const wb = XLSX.read(await f.arrayBuffer(), { type: "array" }), aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
    let h = aoa.findIndex((r) => r.some((c) => /^(code|โค้ด|รหัส)/i.test(txt(c))));
    if (h < 0) { toast("ไม่พบหัวคอลัมน์ code/โค้ด ในแถวแรก ๆ ของไฟล์"); return; }
    const head = aoa[h].map((c) => txt(c).toLowerCase()), idx = (re) => head.findIndex((t) => re.test(t));
    const ci = { code: idx(/^(code|โค้ด|รหัส)/), series: idx(/^(series|ชุด|กล่อง)/), name: idx(/^(name|ชื่อ)/), hex: idx(/^(hex|สี|color|colour)/), tone: idx(/^(tone|โทน)/), year: idx(/^(year|ปี)/), note: idx(/^(note|หมายเหตุ|ตำแหน่ง)/) };
    let n = 0;
    aoa.slice(h + 1).forEach((r) => { if (txt(r[ci.code]) && addCode({ code: r[ci.code], series: ci.series >= 0 ? r[ci.series] : "", name: ci.name >= 0 ? r[ci.name] : "", hex: ci.hex >= 0 ? r[ci.hex] : "", tone: ci.tone >= 0 ? r[ci.tone] : "", year: ci.year >= 0 ? r[ci.year] : "", note: ci.note >= 0 ? r[ci.note] : "" })) n++; });
    renderColors(); toast(`นำเข้าโค้ดสี ${n} รายการ`);
  }
  function bind() {
    const root = $("#colorsView");
    root.addEventListener("input", (e) => {
      if (e.target.id === "colInput") renderCheck();
      else if (e.target.id === "colSearch") { ui.q = e.target.value; renderRegistry(); }
      else if (e.target.name === "pick") e.target.form.elements.hex.value = e.target.value;
      else if (e.target.name === "hex" && parseHex(e.target.value)) e.target.form.elements.pick.value = parseHex(e.target.value);
    });
    root.addEventListener("change", (e) => { if (e.target.id === "colFile" && e.target.files[0]) { importFile(e.target.files[0]); e.target.value = ""; } });
    root.addEventListener("submit", (e) => {
      e.preventDefault();
      const f = e.target.elements;
      if (f.hex.value && !parseHex(f.hex.value)) { toast("ค่าสี hex ไม่ถูกต้อง (เช่น #b5651d)"); return; }
      if (addCode({ code: f.code.value, series: f.series.value, name: f.name.value, hex: f.hex.value, tone: f.tone.value, year: f.year.value, note: f.note.value })) { e.target.reset(); toast("บันทึกโค้ดสีแล้ว"); renderCheck(); renderSeries(); renderRegistry(); }
    });
    root.addEventListener("click", (e) => {
      const b = e.target.closest("[data-col]"); if (!b) return;
      const a = b.dataset.col;
      if (a === "sample") { $("#colInput").value = "CC012\n6001 #efe4c8\n7208 #2a3f7a\n8004\nCC400\n6009\nARS BN09"; renderCheck(); }
      else if (a === "export") { const url = URL.createObjectURL(new Blob([toCsv()], { type: "text/csv;charset=utf-8" })), l = document.createElement("a"); l.href = url; l.download = "color-registry.csv"; l.click(); setTimeout(() => URL.revokeObjectURL(url), 500); }
      else if (a === "quick-add") { const f = $("#colAdd").elements; f.code.value = b.dataset.code; f.hex.value = b.dataset.hex ? "#" + b.dataset.hex.replace(/^#/, "") : ""; if (parseHex(f.hex.value)) f.pick.value = parseHex(f.hex.value); f.code.focus(); $("#colAdd").scrollIntoView({ block: "center" }); }
      else if (a === "edit") { const c = codes.find((x) => x.code === b.dataset.code), f = $("#colAdd").elements; if (c) { f.code.value = c.code; f.series.value = c.series; f.name.value = c.name; f.hex.value = c.hex; f.tone.value = c.tone || ""; f.year.value = c.year || ""; f.note.value = c.note; if (c.hex) f.pick.value = c.hex; f.name.focus(); $("#colAdd").scrollIntoView({ block: "center" }); } }
      else if (a === "del") { codes = codes.filter((c) => c.code !== b.dataset.code); save(); renderCheck(); renderSeries(); renderRegistry(); }
      else if (a === "lb-open") { ui.lb = { series: b.dataset.series, i: +b.dataset.i }; lbShow(); }
      else if (a === "lb-prev") { ui.lb.i--; lbShow(); } else if (a === "lb-next") { ui.lb.i++; lbShow(); } else if (a === "lb-close") $("#colLightbox").hidden = true;
    });
    document.addEventListener("keydown", (e) => { if ($("#colLightbox") && !$("#colLightbox").hidden) { if (e.key === "Escape") $("#colLightbox").hidden = true; if (e.key === "ArrowLeft") { ui.lb.i--; lbShow(); } if (e.key === "ArrowRight") { ui.lb.i++; lbShow(); } } });
  }

  window.renderColors = renderColors;
  window.ColorEngine = { check, lookup, badge, normKey, parseHex, hexToLab, deltaE, addCode, getCodes: () => codes, setCodes: (c) => { codes = c; save(); }, SERIES, DE_OK, DE_NEAR };
})();
