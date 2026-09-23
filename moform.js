/* ============================================================
   ใบ M/O (Manufacturing Order) FM-QP-SL-001/05 Rev.00 — 2 หน้า A3 แนวนอน
   - ส่วนกรอก Specs / โค้ดสีในหน้าต่าง M/O (doc.form)  → MoForm.editorHtml / MoForm.read
   - หน้าตัวอย่าง + พิมพ์ (window.print) — พื้นหลังฟอร์มเป็นเวกเตอร์ moform-p1.svg / moform-p2.svg
     พิกัดทั้งหมดอ้างอิงหน่วย pt ของ PDF ต้นฉบับ (viewBox เดียวกัน)
   ต้องโหลดหลัง sales.js และ colors.js
   ============================================================ */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (v) => String(v === undefined || v === null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const txt = (v) => String(v === undefined || v === null ? "" : v).trim();
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const fmt = (n, d = 2) => Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmtKg = (n) => Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
  const fmtDate = (iso) => (/^\d{4}-\d{2}-\d{2}/.test(iso || "") ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso ? String(iso) : "");
  const CE = () => window.ColorEngine;
  const MAX_COLORS = 26, P1_ROWS = 20;

  /* ---------- Specs: ตำแหน่งช่องติ๊กบนหน้า 1 (x, y, w, h เป็น pt) ---------- */
  const SPEC = {
    type: { label: "TYPE", opts: [["HAND", "Handtufted (ทอมือ)", [429.4, 88.1, 14.7, 10.2]], ["PASS", "Passtufted (ทอจักร)", [551.2, 87.6, 14.5, 10.2]]] },
    yarn: { label: "Yarn Spec", multi: true, opts: [["WO", "WO", [429.4, 101.7, 14.7, 10.2]], ["WN", "WN", [484.8, 101.2, 14.6, 10.2]], ["AB", "AB", [540.5, 101.7, 14.6, 10.2]], ["NYLON", "NYLON", [585.1, 101.2, 14.7, 10.2]], ["OTHER", "อื่น ๆ / Other", [657.4, 101.7, 14.6, 10.2]]] },
    pile: { label: "Pile Texture", opts: [["CUT", "ขนตัด / CUT", [429.4, 114.9, 14.7, 10.2]], ["LOOP", "ขนห่วง / LOOP", [516.3, 114.9, 13.7, 10.2]], ["CL", "CUT & LOOP", [615.0, 115.9, 9.3, 10.2]]] },
    surface: { label: "Surface", opts: [["CARVED", "แกะลาย / Carved", [428.9, 129.6, 14.7, 10.2]], ["UNCARVED", "เต่งเรียบ / Uncarved", [429.4, 143.7, 14.7, 10.2]]] },
    sub: { label: "Surface A–F", opts: [["A", "A) Hairline", [516.3, 131.1, 13.7, 10.2]], ["B", "B) Carving", [579.4, 129.6, 14.7, 10.2]], ["C", "C) Carving & Beveling", [657.8, 131.6, 14.6, 10.2]], ["D", "D) Embossing", [516.9, 144.7, 13.1, 10.2]], ["E", "E) Embossing & Beveling", [580.0, 142.7, 14.6, 10.2]], ["F", "F) Combination", [676.0, 144.2, 14.7, 10.2]]] },
    backing: { label: "Backing", multi: true, opts: [["SCRIM", "ปะตาข่าย / Scrim", [429.4, 157.9, 14.7, 10.2]], ["HESSIAN", "ปะกระสอบ / Hessian", [516.9, 158.9, 13.1, 10.2]], ["CANVAS", "ปะผ้าใบ / Canvas", [613.9, 160.4, 9.9, 10.1]], ["W2W", "ปล่อยขอบ / Wall to Wall", [429.4, 172.0, 14.7, 10.2]], ["BINDING", "พับขอบ / Binding", [516.9, 172.0, 13.1, 10.2]], ["WHIP", "เย็บขอบ / Whipping", [613.9, 173.0, 9.9, 10.2]], ["FRINGE", "ชายครุย / Fringe", [675.5, 168.1, 14.3, 11.9]]] },
    label: { label: "Label", opts: [["SIAM", "ของบริษัท (Siam Carpets)", [428.9, 187.3, 14.7, 10.2]], ["CUST", "ของลูกค้า (Customer's)", [517.4, 186.8, 12.6, 10.2]], ["STENCIL", "พ่น (Stencil)", [675.5, 187.0, 14.3, 10.2]]] },
    packing: { label: "Packing", opts: [["EXPORT", "ส่งต่างประเทศ / Export", [429.4, 202.1, 14.7, 10.2]], ["DOMESTIC", "ส่งในประเทศ / Domestic", [516.9, 202.1, 13.1, 10.2]]] }
  };
  const specText = (k, v) => { const o = SPEC[k].opts.find((x) => x[0] === v); return o ? o[1] : ""; };

  /* ค่าเริ่มต้นที่ระบบเลือกให้ (ตรวจก่อนพิมพ์) — เฉพาะที่มีคำบอกชัดเจน */
  function defaultSpec(doc) {
    const q = (doc.lines || []).map((l) => l.quality || "").join(" ").toUpperCase(), s = { type: "", yarn: [], yarnOther: "", pile: "", surface: "", sub: "", backing: [], label: "", packing: doc.market === "DOMESTIC" ? "DOMESTIC" : doc.market === "FOREIGN" ? "EXPORT" : "" };
    const cut = /\bCUT\b/.test(q.replace(/CUT\s*&\s*LOOP/g, "")), loop = /\bLOOP\b/.test(q.replace(/CUT\s*&\s*LOOP/g, ""));
    if (/CUT\s*&\s*LOOP|CUT\s*\+\s*LOOP/.test(q) || (cut && loop)) s.pile = "CL"; else if (cut) s.pile = "CUT"; else if (loop) s.pile = "LOOP";
    if (/แกะลาย|CARV/i.test((doc.lines || []).map((l) => l.quality || "").join(" "))) s.surface = "CARVED";
    return s;
  }
  const specOf = (doc) => { const f = doc.form || {}; return { ...defaultSpec(doc), ...(f.spec || {}), yarn: (f.spec && f.spec.yarn) || [], backing: (f.spec && f.spec.backing) || [] }; };

  /* ---------- ข้อมูลรวมของ M/O สำหรับพิมพ์ ---------- */
  const lineSqm = (l) => num(l.sqm);
  function docSqm(doc) { return (doc.lines || []).reduce((t, l) => t + lineSqm(l), 0); }
  const uniq = (a) => [...new Set(a.filter(Boolean))];
  function autoDelivery(doc) {
    const ds = (doc.lines || []).map((l) => l.post || l.ship || "").filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
    return ds.length ? fmtDate(ds[ds.length - 1]) : "";
  }
  // ย่อรายการแบบที่มีรหัสนำหน้าเหมือนกัน เช่น BRT-25-007_RUG1..RUG6 → BRT-25-007_RUG1–6
  function compactDesigns(list) {
    if (list.length < 3) return list.join(", ");
    let pre = list[0]; list.forEach((d) => { while (pre && !d.startsWith(pre)) pre = pre.slice(0, -1); });
    pre = pre.replace(/\d+$/, "");
    const suf = list.map((d) => d.slice(pre.length));
    if (pre.length < 3 || !suf.every((x) => /^\d{1,4}$/.test(x))) return list.join(", ");
    const ns = [...new Set(suf.map(Number))].sort((a, b) => a - b), out = [];
    for (let i = 0; i < ns.length;) { let j = i; while (ns[j + 1] === ns[j] + 1) j++; out.push(j > i + 1 ? `${ns[i]}–${ns[j]}` : ns.slice(i, j + 1).join(", ")); i = j + 1; }
    return pre + out.join(", ");
  }
  const soToken = (refs) => (refs.join(" ").match(/S\/O\s*[A-Z]?\s*\d{2,5}\/\d{2}/i) || [])[0] || "";
  const autoQuality = (doc) => uniq((doc.lines || []).map((l) => txt(l.quality))).join(" ; ");
  function colorRows(doc) { return ((doc.form && doc.form.colors) || []).filter((c) => txt(c.code) || txt(c.name) || num(c.kg) || txt(c.hex)); }
  function model(doc) {
    const f = (doc && doc.form) || {}, lines = (doc && doc.lines) || [], cols = colorRows(doc || {}), sp = specOf(doc || {});
    const sqm = docSqm(doc || {}), kgHire = cols.filter((c) => c.dye === "HIRE").reduce((t, c) => t + num(c.kg), 0), kgOwn = cols.filter((c) => c.dye === "OWN").reduce((t, c) => t + num(c.kg), 0), kgAll = cols.reduce((t, c) => t + num(c.kg), 0);
    const designs = uniq(lines.map((l) => txt(l.design))), sizes = uniq(lines.map((l) => txt(l.size)));
    const refs = uniq(lines.map((l) => txt(l.ref)));
    const detail = lines.map((l, i) => `${i + 1}) ${txt(l.design) || "-"}${txt(l.location) ? " · " + txt(l.location) : ""}`);
    const areaAuto = lines.map((l) => { const u = l.unit === "F2" ? "ft²" : "m²", q = l.qty != null && l.qty !== "" ? fmt(num(l.qty)) : ""; return `${txt(l.size) || txt(l.design) || "-"}${q ? ` = ${q} ${u}` : ""}${l.unit === "F2" ? ` → ${fmt(lineSqm(l))} ตร.ม.` : ""}`; });
    return {
      no: doc ? txt(doc.no) : "", refSo: txt(f.refSo) || soToken(refs) || refs[0] || "", customer: txt(doc && doc.customer), productCode: txt(f.productCode), project: txt(doc && doc.project),
      sqm, pcs: lines.reduce((t, l) => t + num(l.pcs), 0), detail, areaAuto, quality: txt(f.quality) || autoQuality(doc || {}), designs: txt(f.designNo) || compactDesigns(designs),
      delivery: txt(f.delivery) || autoDelivery(doc || {}), nColors: cols.length, cols, spec: sp, kgHire, kgOwn, kgAll, sizes,
      wPerSqm: sqm > 0 && kgAll > 0 ? kgAll / sqm : 0, specSqm: f.specSqm === "" || f.specSqm == null ? "" : num(f.specSqm), areaNote: txt(f.areaNote),
      remark: f.remark != null && txt(f.remark) !== "" ? txt(f.remark) : [txt(doc && doc.remarks), ...refs].filter(Boolean).join("\n"),
      po: txt(f.po) || ((txt(doc && doc.project).match(/^[^\s,;]+/) || [""])[0]), preparedBy: txt(f.preparedBy), approvedBy: txt(f.approvedBy), formDate: txt(f.formDate) || (doc && doc.openDate) || ""
    };
  }

  /* ---------- วัดความกว้างข้อความ (ประมาณ) และจัดให้พอดีช่อง ---------- */
  const MARK = /[ัิ-ฺ็-๎]/;
  function cw(c) {
    if (MARK.test(c)) return 0;
    if (c === " ") return 0.3;
    const k = c.charCodeAt(0);
    if (k >= 0x0e00 && k <= 0x0e7f) return 0.56;
    if (/[MW@%]/.test(c)) return 0.86;
    if (/[A-Z]/.test(c)) return 0.68;
    if (/[il.,:;'|!()/\-·]/.test(c)) return 0.32;
    return 0.56;
  }
  const tw = (s, fs) => [...s].reduce((t, c) => t + cw(c), 0) * fs;
  function wrap(s, fs, w) {
    const out = [];
    String(s).split(/\r?\n/).forEach((para) => {
      let line = "", lw = 0, lastSp = -1;
      for (const c of [...para]) {
        const cwid = cw(c) * fs;
        if (lw + cwid > w && line) {
          if (lastSp > 0) { out.push(line.slice(0, lastSp).trimEnd()); line = line.slice(lastSp).trimStart() + c; }
          else { out.push(line); line = c; }
          lw = tw(line, fs); lastSp = -1; if (c === " ") lastSp = line.length - 1;
          continue;
        }
        if (c === " ") lastSp = line.length;
        line += c; lw += cwid;
      }
      out.push(line);
    });
    return out;
  }
  const FONT = `font-family="Sarabun,'Noto Sans Thai','Leelawadee UI',Tahoma,Loma,sans-serif"`;
  // box = [x0,x1,y0,y1]; o: maxFs,minFs,lh,anchor(start|middle|end),top,bold,pad
  function fit(str, box, o = {}) {
    str = txt(str); if (!str) return "";
    const [x0, x1, y0, y1] = box, pad = o.pad == null ? 1.4 : o.pad, w = x1 - x0 - pad * 2, h = y1 - y0, maxFs = o.maxFs || 7.6, minFs = o.minFs || 4.2, lh = o.lh || 1.16;
    let fs = maxFs, lines = wrap(str, fs, w);
    for (; fs >= minFs - 1e-6; fs -= 0.2) { lines = wrap(str, fs, w); if (lines.length * fs * lh <= h + 0.4) break; }
    if (fs < minFs) {
      fs = minFs; lines = wrap(str, fs, w);
      const max = Math.max(1, Math.floor(h / (fs * lh)));
      if (lines.length > max) { lines = lines.slice(0, max); let l = lines[max - 1]; while (l.length > 1 && tw(l + "…", fs) > w) l = l.slice(0, -1); lines[max - 1] = l + "…"; }
    }
    const anchor = o.anchor || "start", ax = anchor === "end" ? x1 - pad : anchor === "middle" ? (x0 + x1) / 2 : x0 + pad;
    const blockH = lines.length * fs * lh, top = o.top ? y0 + 0.6 : y0 + (h - blockH) / 2;
    return lines.map((l, i) => `<text x="${ax.toFixed(2)}" y="${(top + fs * lh * i + fs * lh * 0.5 + fs * 0.34).toFixed(2)}" font-size="${fs.toFixed(2)}" text-anchor="${anchor}"${o.bold ? ' font-weight="700"' : ""}>${esc(l)}</text>`).join("");
  }
  // ข้อความหลายบรรทัดลงตามเส้นแถวของฟอร์ม (rows = พิกัด y ของเส้นแถว)
  function rowText(str, x0, x1, rows, o = {}) {
    str = txt(str); if (!str) return "";
    const n = rows.length - 1, w = x1 - x0 - 2.8; let fs = o.maxFs || 7, lines = wrap(str, fs, w);
    for (; fs >= (o.minFs || 4.6); fs -= 0.2) { lines = wrap(str, fs, w); if (lines.length <= n) break; }
    if (lines.length > n) { lines = lines.slice(0, n); let l = lines[n - 1]; while (l.length > 1 && tw(l + "…", fs) > w) l = l.slice(0, -1); lines[n - 1] = l + "…"; }
    return lines.map((l, i) => fit(l, [x0, x1, rows[i], rows[i + 1]], { maxFs: fs, minFs: 3.6 })).join("");
  }
  const tick = ([x, y, w, h]) => { const cx = x + w / 2, cy = y + h / 2, s = Math.min(w, h) * 0.42; return `<path d="M${(cx - s * 0.75).toFixed(2)} ${(cy + s * 0.05).toFixed(2)} L${(cx - s * 0.2).toFixed(2)} ${(cy + s * 0.65).toFixed(2)} L${(cx + s * 0.85).toFixed(2)} ${(cy - s * 0.8).toFixed(2)}" fill="none" stroke="#0a2a6b" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>`; };

  /* ---------- พิกัดตารางของฟอร์ม ---------- */
  const P1 = {
    vb: [20, 10, 759, 540], bg: "moform-p1.svg",
    rows: [215.3, 230.1, 244.3, 258.4, 272.6, 286.7, 300.9, 315.1, 329.2, 343.4, 357.6, 371.7, 385.9, 400.6, 415.4, 429.6, 443.7, 457.9, 472.1, 486.2, 501.0],
    cols: [23.2, 44.1, 79.0, 96.5, 112.9, 133.2, 177.8, 191.9, 206.7, 245.1, 276.1, 331.4, 356.8]
  };
  const P2 = {
    vb: [10, 12, 822, 570], bg: "moform-p2.svg",
    y0: 80.4, step: 15.6, cols: [13.1, 33.4, 108.0, 182.7, 232.0, 281.5, 330.9, 383.0, 421.3, 459.8]
  };

  function page1(m) {
    let s = "";
    const T = (str, box, o) => { s += fit(str, box, o); };
    T(m.no, [40, 131, 72.2, 86.1], { maxFs: 8.6, bold: true });
    T(m.refSo, [177, 356, 72.2, 86.1], { maxFs: 7.6 });
    T(m.customer, [68, 245, 86.1, 100.2], { maxFs: 8 });
    T(m.productCode, [285, 356, 86.1, 100.2], { maxFs: 7.6 });
    T(m.project, [45, 356, 100.2, 114.4], { maxFs: 8 });
    T(m.sqm ? `${fmt(m.sqm)} ตร.ม. (sq.m.)` : "", [75, 177.6, 114.4, 128.5], { maxFs: 8.4, bold: true });
    T(m.pcs ? String(m.pcs) : "", [237, 291, 114.4, 128.5], { maxFs: 8.4, bold: true });
    // รายละเอียด (Details)
    const dl = m.detail.slice(0, 6), moreD = m.detail.length - dl.length;
    dl.forEach((t, i) => T(i === dl.length - 1 && moreD > 0 ? `${t}  … (+${moreD} รายการ)` : t, [179, 356, 129 + i * 9.3, 129 + (i + 1) * 9.3], { maxFs: 6.8, minFs: 4.2 }));
    T(m.quality, [68, 177.6, 128.5, 142.7], { maxFs: 7.6, minFs: 3.8 });
    T(m.designs, [61, 177.6, 142.7, 156.9], { maxFs: 7.6, minFs: 3.8 });
    T(m.delivery, [87, 177.6, 156.9, 171.0], { maxFs: 8.2, bold: true });
    T(m.nColors ? String(m.nColors) : "", [85, 177.6, 171.0, 185.8], { maxFs: 8.4, bold: true });
    // Specs
    const sp = m.spec, t = (k, v) => { const o = SPEC[k].opts.find((x) => x[0] === v); if (o) s += tick(o[2]); };
    t("type", sp.type); sp.yarn.forEach((v) => t("yarn", v)); t("pile", sp.pile);
    if (sp.surface) t("surface", sp.surface); if (sp.sub) { t("sub", sp.sub); if (!sp.surface) t("surface", "ABC".includes(sp.sub) ? "CARVED" : "UNCARVED"); }
    sp.backing.forEach((v) => t("backing", v)); t("label", sp.label); t("packing", sp.packing);
    if (sp.yarn.includes("OTHER") && sp.yarnOther) T(sp.yarnOther, [690, 772, 101.2, 112.6], { maxFs: 6.8, minFs: 4 });
    // ตารางสี (20 แถวแรก)
    const c = P1.cols;
    m.cols.slice(0, P1_ROWS).forEach((r, i) => {
      const ya = P1.rows[i], yb = P1.rows[i + 1], cell = (a, b) => [c[a], c[b], ya, yb];
      T(String(i + 1), cell(0, 1), { maxFs: 7.6, anchor: "middle" });
      if (num(r.kg)) T(fmtKg(num(r.kg)), cell(1, 2), { maxFs: 7.6, anchor: "end" });
      ["DL", "F", "I"].forEach((k, j) => { if (r.light && r.light[k]) s += tick([c[2 + j] + 0.5, ya + 1, c[3 + j] - c[2 + j] - 1, yb - ya - 2]); });
      T([txt(r.code), txt(r.name)].filter(Boolean).join(" "), cell(5, 6), { maxFs: 7, minFs: 3.6 });
      if (r.dye === "OWN") s += tick([c[6] + 0.5, ya + 1, c[7] - c[6] - 1, yb - ya - 2]);
      if (r.dye === "HIRE") s += tick([c[7] + 0.5, ya + 1, c[8] - c[7] - 1, yb - ya - 2]);
      if (txt(r.remark)) T(r.remark, cell(10, 11), { maxFs: 6.6, minFs: 3.6 });
    });
    if (m.cols.length > P1_ROWS) T(`* มี ${m.cols.length} สี — หน้า 1 แสดง ${P1_ROWS} สีแรก · สีที่ ${P1_ROWS + 1}–${m.cols.length} ดูหน้า 2`, [24, 356, 503, 513], { maxFs: 6.6 });
    // คำนวณพื้นที่ / Remark (ลงตามเส้นแถวของฟอร์ม)
    const AR = [315.1, 329.2, 343.4, 357.6, 371.7, 385.9, 400.6], RR = [415.4, 429.6, 443.7, 457.9, 472.1, 486.2, 501.0];
    if (m.areaNote) s += rowText(m.areaNote, 530.4, 773.7, AR, { maxFs: 7 });
    else {
      let al = [...m.areaAuto]; if (al.length > 5) al = [...al.slice(0, 4), `… (+${al.length - 4} รายการ)`];
      const tot = m.sqm ? `รวม ${fmt(m.sqm)} ตร.ม.` : "";
      al.forEach((t2, i) => T(t2, [530.4, 773.7, AR[i], AR[i + 1]], { maxFs: 7, minFs: 4 }));
      if (tot) T(tot, [530.4, 773.7, AR[al.length], AR[al.length + 1]], { maxFs: 7.6, bold: true });
    }
    s += rowText(m.remark, 357.4, 773.7, RR, { maxFs: 7 });
    // ท้ายฟอร์ม
    T(m.preparedBy, [59.8, 141, 535, 544], { maxFs: 8 });
    T(fmtDate(m.formDate), [160.5, 226, 535, 544], { maxFs: 8 });
    T(m.approvedBy, [259.8, 360, 535, 544], { maxFs: 8 });
    return s;
  }

  function page2(m) {
    let s = "";
    const T = (str, box, o) => { s += fit(str, box, o); };
    T(m.po, [790, 828.5, 32, 43], { maxFs: 7, minFs: 3.6 });
    T(m.no, [793, 828.5, 43.4, 55], { maxFs: 7.6, bold: true });
    T(m.customer, [690, 774, 42.5, 55], { maxFs: 7.6, minFs: 4 });
    const c = P2.cols;
    m.cols.slice(0, MAX_COLORS).forEach((r, i) => {
      const ya = P2.y0 + i * P2.step, yb = ya + P2.step;
      T([txt(r.code), txt(r.name)].filter(Boolean).join(" "), [c[1], c[2], ya, yb], { maxFs: 7.4, minFs: 3.8 });
      if (num(r.kg)) { if (r.dye === "HIRE") T(fmtKg(num(r.kg)), [c[2], c[3], ya, yb], { anchor: "end", maxFs: 7.6 }); else if (r.dye === "OWN") T(fmtKg(num(r.kg)), [c[3], c[4], ya, yb], { anchor: "end", maxFs: 7.6 }); else T(fmtKg(num(r.kg)), [c[6], c[7], ya, yb], { anchor: "end", maxFs: 7.6 }); }
    });
    const yt = P2.y0 + 26 * P2.step; // แถว TOTAL
    if (m.kgHire) T(fmtKg(m.kgHire), [c[2], c[3], yt, yt + P2.step], { anchor: "end", bold: true, maxFs: 7.8 });
    const kgNone = m.kgAll - m.kgHire - m.kgOwn;
    if (kgNone > 0.0001) T(fmtKg(kgNone), [c[6], c[7], yt, yt + P2.step], { anchor: "end", bold: true, maxFs: 7.8 });
    if (m.kgOwn) T(fmtKg(m.kgOwn), [c[3], c[4], yt, yt + P2.step], { anchor: "end", bold: true, maxFs: 7.8 });
    if (m.wPerSqm) T(`${fmt(m.wPerSqm)} กก./ตร.ม.`, [c[2], c[3], yt + P2.step, yt + 2 * P2.step], { anchor: "end", maxFs: 7.4 });
    if (m.specSqm !== "" && m.specSqm !== undefined) T(`${fmt(m.specSqm)} กก./ตร.ม.`, [c[2], c[3], yt + 2 * P2.step, yt + 3 * P2.step], { anchor: "end", maxFs: 7.4 });
    // Quality control (ค่าที่ระบุใน M/O)
    const sp = m.spec, one = (k, v) => (v ? specText(k, v) : "");
    const yarn = [...sp.yarn.filter((v) => v !== "OTHER").map((v) => specText("yarn", v)), ...(sp.yarn.includes("OTHER") ? [sp.yarnOther || "Other"] : [])].join(" / ");
    const surf = [one("surface", sp.surface), sp.sub ? specText("sub", sp.sub) : ""].filter(Boolean).join(" · ");
    const q = (str, x0, y1) => T(str, [x0, 774, y1 - 9.4, y1 + 0.4], { maxFs: 6.8, minFs: 3.8 });
    q(yarn, 683, 109.8); q(one("type", sp.type), 689, 172.2); q(surf, 677, 219.1); q(one("pile", sp.pile), 678, 250.3);
    T(m.designs, [677, 774, 131.4, 161], { maxFs: 6.8, minFs: 4, top: true });
    const codes = m.cols.map((r) => txt(r.code)).filter(Boolean).join(" · ");
    T(codes, [653, 774, 283.6, 300.8], { maxFs: 6.4, minFs: 3.6, top: true });
    T(m.sizes.join(" ; "), [664, 774, 365.6, 395.5], { maxFs: 6.6, minFs: 4, top: true }); q(one("label", sp.label), 668, 500);
    return s;
  }

  /* ---------- หน้าตัวอย่าง / พิมพ์ ---------- */
  const MM_PX = 96 / 25.4, SHEET = { w: 420, h: 297, pad: 5 };
  function sheetHtml(p, overlay) {
    const [, , vw, vh] = p.vb, k = Math.min((SHEET.w - SHEET.pad * 2) / vw, (SHEET.h - SHEET.pad * 2) / vh);
    return `<div class="mo-wrap"><div class="mo-sheet"><div class="mo-page" style="width:${(vw * k).toFixed(2)}mm;height:${(vh * k).toFixed(2)}mm"><img src="${p.bg}" alt="" draggable="false"><svg viewBox="${p.vb.join(" ")}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" ${FONT} fill="#0a2a6b">${overlay}</svg></div></div></div>`;
  }
  const pr = { doc: null, blank: false, built: false };
  function summarize(cols) {
    const r = { ok: 0, near: 0, diff: 0, unknown: 0, invalid: 0, nocode: 0, noref: 0 };
    cols.forEach((c) => {
      if (!txt(c.code)) { r.nocode++; return; }
      const x = CE().check(c.code, c.hex);
      if (x.status === "invalid") r.invalid++; else if (x.status === "unknown") r.unknown++;
      else if (x.verdict === "ok") r.ok++; else if (x.verdict === "near") r.near++; else if (x.verdict === "diff") r.diff++; else r.noref++;
    });
    return r;
  }
  function summaryText(m) {
    if (!m.cols.length) return "";
    const r = summarize(m.cols), p = [];
    if (r.ok) p.push(`ตรง ${r.ok}`); if (r.near) p.push(`ใกล้เคียง ${r.near}`); if (r.diff) p.push(`ต่างจากโค้ด ${r.diff}`); if (r.unknown) p.push(`ไม่พบโค้ด ${r.unknown}`); if (r.invalid) p.push(`โค้ดผิดรูปแบบ ${r.invalid}`); if (r.noref) p.push(`ยังไม่มีสีอ้างอิง ${r.noref}`); if (r.nocode) p.push(`ยังไม่ใส่โค้ด ${r.nocode}`);
    return `ตรวจโค้ดสี: ${p.join(" · ")}`;
  }
  function renderPrint() {
    const root = $("#moPrint"), m = pr.blank || !pr.doc ? null : model(pr.doc);
    $(".mo-title", root).textContent = m ? `ใบ M/O A3 · ${m.no || "(ไม่มีเลขที่)"} · ${m.customer}` : "ใบ M/O A3 · ฟอร์มเปล่า";
    const warn = m ? summaryText(m) : "", bad = m && summarize(m.cols).diff + summarize(m.cols).unknown + summarize(m.cols).invalid > 0;
    const wEl = $(".mo-warn", root); wEl.textContent = warn; wEl.className = "mo-warn" + (bad ? " bad" : "");
    $(".mo-scroll", root).innerHTML = sheetHtml(P1, m ? page1(m) : "") + sheetHtml(P2, m ? page2(m) : "");
    $('[data-mo="toggle-blank"]', root).textContent = pr.blank ? "แสดงข้อมูล M/O" : "ฟอร์มเปล่า";
    $('[data-mo="toggle-blank"]', root).hidden = !pr.doc;
    fitZoom();
  }
  function fitZoom() {
    const root = $("#moPrint"); if (!root || root.hidden) return;
    const sc = $(".mo-scroll", root), z = Math.min(1, (sc.clientWidth - 32) / (SHEET.w * MM_PX));
    $$(".mo-wrap", root).forEach((w) => { w.style.width = SHEET.w * MM_PX * z + "px"; w.style.height = SHEET.h * MM_PX * z + "px"; $(".mo-sheet", w).style.transform = `scale(${z})`; });
  }
  function openPrint(doc, opts = {}) {
    if (!$("#moPrint")) {
      const d = document.createElement("div"); d.id = "moPrint"; d.hidden = true;
      d.innerHTML = `<div class="mo-bar"><strong class="mo-title"></strong><span class="mo-warn"></span><span class="mo-spacer"></span><span class="mo-tip">เลือกกระดาษ A3 แนวนอน · ระยะขอบ “ไม่มี” · ปิด “ส่วนหัว/ท้ายกระดาษ” · เปิด “พิมพ์กราฟิกพื้นหลัง”</span><button data-mo="toggle-blank">ฟอร์มเปล่า</button><button class="primary" data-mo="do-print">พิมพ์ / บันทึกเป็น PDF</button><button data-mo="close-print">ปิด</button></div><div class="mo-scroll"></div>`;
      document.body.appendChild(d);
    }
    pr.doc = doc || null; pr.blank = !!opts.blank || !doc;
    const root = $("#moPrint"); root.hidden = false; document.body.classList.add("mo-printing");
    renderPrint(); $(".mo-scroll", root).scrollTop = 0;
  }
  function closePrint() { const r = $("#moPrint"); if (r) r.hidden = true; document.body.classList.remove("mo-printing"); }
  window.addEventListener("resize", fitZoom);
  window.addEventListener("beforeprint", () => { const r = $("#moPrint"); if (r && !r.hidden) $$(".mo-sheet", r).forEach((e) => (e.style.transform = "none")); });
  window.addEventListener("afterprint", fitZoom);

  /* ---------- ส่วนกรอกในหน้าต่าง M/O ---------- */
  const chip = (group, val, label, checked, type = "radio") => `<label class="mo-chip"><input type="${type}" name="mo_${group}" data-spec="${group}" value="${val}" ${checked ? "checked" : ""}><span>${esc(label)}</span></label>`;
  const group = (k, spec) => `<div class="mo-grp"><b>${esc(SPEC[k].label)}</b><div>${SPEC[k].opts.map((o) => chip(k, o[0], o[1].replace(/^([A-F])\) /, "$1) "), SPEC[k].multi ? spec[k].includes(o[0]) : spec[k] === o[0], SPEC[k].multi ? "checkbox" : "radio")).join("")}</div></div>`;
  function colRowHtml(c, i) {
    const l = c.light || {}, hex = CE().parseHex(c.hex);
    return `<tr data-ci="${i}"><td class="idx">${i + 1}</td>
      <td><input data-c="code" list="moCodeList" value="${esc(c.code)}" placeholder="เช่น CC012"></td><td><input data-c="name" value="${esc(c.name)}"></td>
      <td class="hex"><input data-c="hex" value="${esc(c.hex)}" placeholder="#RRGGBB"><input type="color" data-c="pick" value="${hex || "#cccccc"}" title="เลือกสีของแบบ"></td>
      <td class="n"><input data-c="kg" type="number" step="any" min="0" value="${c.kg != null && c.kg !== "" ? esc(c.kg) : ""}"></td>
      <td class="ck"><input type="checkbox" data-c="DL" ${l.DL ? "checked" : ""}></td><td class="ck"><input type="checkbox" data-c="F" ${l.F ? "checked" : ""}></td><td class="ck"><input type="checkbox" data-c="I" ${l.I ? "checked" : ""}></td>
      <td><select data-c="dye"><option value="">-</option><option value="OWN" ${c.dye === "OWN" ? "selected" : ""}>ย้อม</option><option value="HIRE" ${c.dye === "HIRE" ? "selected" : ""}>จ้าง</option></select></td>
      <td><input data-c="remark" value="${esc(c.remark)}"></td><td class="chk" data-c="chk"></td>
      <td><button type="button" class="action-button ghost" data-mo="del-col" data-i="${i}" title="ลบสีนี้">×</button></td></tr>`;
  }
  function editorHtml(doc) {
    const f = doc.form || {}, sp = specOf(doc), guess = !f.spec;
    let cols = (f.colors || []).map((c) => ({ ...c }));
    if (!cols.length) { const n = Math.min(MAX_COLORS, Math.max(1, parseInt((doc.lines || [])[0] && doc.lines[0].colors, 10) || 1)); cols = Array.from({ length: n }, () => ({})); }
    const codes = CE() ? CE().getCodes() : [];
    const inp = (k, ph, type = "text") => `<label>${ph[0]}<input data-k="${k}" type="${type}" ${type === "number" ? 'step="any"' : ""} value="${esc(f[k] == null ? "" : f[k])}" placeholder="${esc(ph[1] || "")}"></label>`;
    return `<details class="mo-ed" id="moEd" ${f.spec || (f.colors && f.colors.length) ? "open" : ""}>
      <summary>ข้อมูลใบ M/O A3 สำหรับ Planning — Specs · โค้ดสี · ตรวจสี${f.colors && f.colors.length ? ` <em>(${f.colors.length} สี)</em>` : ""}</summary>
      <div class="mo-ed-body">
        <div class="mo-grid">
          ${inp("refSo", ["อ้างถึง / Ref. S/O", "ค่าเริ่มต้น: เลข S/O จากคอลัมน์อ้างอิงของรายการ"])}${inp("productCode", ["Product Code"])}${inp("delivery", ["กำหนดส่ง / Delivery", "ค่าเริ่มต้น: " + (autoDelivery(doc) || "วันที่ Dispatch/Postpone ล่าสุด")])}
          ${inp("po", ["PO# (หน้า 2)", "ค่าเริ่มต้น: รหัสแรกของ Project / PO"])}${inp("quality", ["คุณภาพ / Quality", "ค่าเริ่มต้น: จากรายการ"])}${inp("designNo", ["Design / PAT.", "ค่าเริ่มต้น: จากรายการ"])}
          ${inp("specSqm", ["Spec. (กก./ตร.ม.)"], "number")}${inp("preparedBy", ["จัดทำโดย"])}${inp("approvedBy", ["อนุมัติโดย (Sale Manager)"])}
        </div>
        <p class="mo-note">${guess ? "ระบบเลือกให้เฉพาะที่มีคำระบุในรายการ (เช่น CUT/LOOP, แกะลาย, ตลาดส่งออก/ในประเทศ) — ตรวจสอบก่อนพิมพ์" : "ติ๊กตามสเปกของงาน — คลิกซ้ำเพื่อยกเลิกตัวเลือก"}</p>
        <div class="mo-specs">${group("type", sp)}${group("yarn", sp)}<div class="mo-grp"><b>Yarn อื่น ๆ (ระบุ)</b><div><input data-spec="yarnOther" value="${esc(sp.yarnOther)}" placeholder="ระบุชนิดเส้นด้าย"></div></div>${group("pile", sp)}${group("surface", sp)}${group("sub", sp)}${group("backing", sp)}${group("label", sp)}${group("packing", sp)}</div>
        <div class="mo-colhead"><b>สี / โค้ดสี (Matching)</b> <span class="mo-note">พิมพ์โค้ด POM เช่น CC012 หรือ 6001 — ระบบตรวจกับทะเบียนโค้ดสีทันที · ใส่สีของแบบ (#hex) เพื่อเทียบ ΔE กับสีอ้างอิง · ส่งออกลงหน้า 1 (20 สีแรก) และหน้า 2</span></div>
        <datalist id="moCodeList">${codes.map((c) => `<option value="${esc(c.code)}">${esc(c.name || c.series)}</option>`).join("")}</datalist>
        <div class="tw"><table class="mo-col"><thead><tr><th>#</th><th>โค้ดสี (Matching)</th><th>ชื่อสี</th><th>สีของแบบ</th><th>ก.ก.</th><th title="Daylight">DL</th><th title="Fluorescent">F</th><th title="Incandescent">I</th><th>ย้อม/จ้าง</th><th>รายละเอียด (กรอ/ตีเกลียว)</th><th>ผลตรวจโค้ดสี</th><th></th></tr></thead><tbody id="moColBody">${cols.map(colRowHtml).join("")}</tbody></table></div>
        <div class="mo-actions"><button type="button" class="action-button add" data-mo="add-col">+ เพิ่มสี</button><span id="moColSum" class="mo-note"></span></div>
        <div class="mo-grid"><label class="span3">คำนวณพื้นที่ (ข้อความในกล่องหน้า 1 — เว้นว่างให้ระบบสร้างจากรายการ)<textarea data-k="areaNote" rows="2">${esc(f.areaNote || "")}</textarea></label><label class="span3">Remark / คำสั่งพิเศษ (เว้นว่าง = หมายเหตุของ M/O + อ้างอิงรายการ)<textarea data-k="remark" rows="2">${esc(f.remark == null ? "" : f.remark)}</textarea></label></div>
        <div class="mo-actions"><button type="button" class="action-button" data-mo="preview">ดูตัวอย่าง / พิมพ์ใบ M/O A3</button><span class="mo-note">ตัวอย่างใช้ข้อมูลที่กรอกอยู่ในหน้าต่างนี้ (ยังไม่ต้องกดบันทึก)</span></div>
      </div></details>`;
  }
  function readColRow(tr) {
    const g = (k) => tr.querySelector(`[data-c="${k}"]`), v = (k) => (g(k) ? g(k).value.trim() : "");
    const hex = CE().parseHex(v("hex"));
    return { code: v("code"), name: v("name"), hex: hex || v("hex"), kg: v("kg") === "" ? "" : Number(v("kg")), light: { DL: g("DL").checked, F: g("F").checked, I: g("I").checked }, dye: v("dye"), remark: v("remark") };
  }
  function read(root) {
    root = root || document;
    const ed = $("#moEd", root); if (!ed) return null;
    const f = {}, spec = { type: "", yarn: [], yarnOther: "", pile: "", surface: "", sub: "", backing: [], label: "", packing: "" };
    $$("[data-k]", ed).forEach((el) => { f[el.dataset.k] = el.value.trim(); });
    $$("[data-spec]", ed).forEach((el) => {
      const k = el.dataset.spec;
      if (k === "yarnOther") spec.yarnOther = el.value.trim();
      else if (el.checked) { if (Array.isArray(spec[k])) spec[k].push(el.value); else spec[k] = el.value; }
    });
    f.spec = spec;
    f.colors = $$("#moColBody tr", ed).map(readColRow).filter((c) => c.code || c.name || c.hex || c.kg !== "" || c.remark);
    return f;
  }
  function updateChk(tr) {
    const c = readColRow(tr), cell = tr.querySelector('[data-c="chk"]'), r = CE().check(c.code, c.hex);
    cell.innerHTML = CE().badge(r) + (r.status === "found" ? `<small>${esc(r.location || r.note || "")}${r.name ? " · " + esc(r.name) : ""}</small>` : r.msg ? `<small>${esc(r.msg)}</small>` : "");
  }
  function updateSum(root) {
    const ed = root.id === "moEd" ? root : $("#moEd", root); if (!ed) return;
    const rows = $$("#moColBody tr", ed).map(readColRow).filter((c) => c.code || c.hex), el = $("#moColSum", ed);
    el.textContent = rows.length ? summaryText({ cols: rows }) : "";
  }
  function refreshAll(root) { $$("#moColBody tr", root).forEach(updateChk); updateSum(root); }
  function reindex(root) { $$("#moColBody tr", root).forEach((tr, i) => { tr.dataset.ci = i; $(".idx", tr).textContent = i + 1; const b = $('[data-mo="del-col"]', tr); if (b) b.dataset.i = i; }); }

  /* ---------- events ---------- */
  document.addEventListener("input", (e) => {
    const t = e.target, ed = t.closest && t.closest("#moEd"); if (!ed) return;
    const tr = t.closest("#moColBody tr");
    if (tr && t.dataset.c) {
      if (t.dataset.c === "pick") tr.querySelector('[data-c="hex"]').value = t.value;
      else if (t.dataset.c === "hex" && CE().parseHex(t.value)) tr.querySelector('[data-c="pick"]').value = CE().parseHex(t.value);
      if (["code", "hex", "pick"].includes(t.dataset.c)) { updateChk(tr); updateSum(ed); }
    }
  });
  document.addEventListener("change", (e) => {
    const t = e.target, ed = t.closest && t.closest("#moEd"); if (!ed) return;
    if (t.dataset.spec === "sub" && t.checked) { const m = $('[data-spec="surface"]:checked', ed); const want = "ABC".includes(t.value) ? "CARVED" : "UNCARVED"; if (!m || m.value !== want) { const r = $(`[data-spec="surface"][value="${want}"]`, ed); if (r) r.checked = true; } }
    if (t.dataset.spec === "surface" && t.checked) { const s = $('[data-spec="sub"]:checked', ed); if (s && ("ABC".includes(s.value) ? "CARVED" : "UNCARVED") !== t.value) s.checked = false; }
  });
  // คลิกซ้ำที่ radio เพื่อยกเลิกตัวเลือก
  document.addEventListener("mousedown", (e) => { const t = e.target.closest && e.target.closest("#moEd input[type=radio]"); if (t) t.dataset.was = t.checked ? "1" : ""; });
  document.addEventListener("click", (e) => {
    const rad = e.target.closest && e.target.closest("#moEd input[type=radio]");
    if (rad && rad.dataset.was === "1") { rad.checked = false; rad.dataset.was = ""; }
    const b = e.target.closest("[data-mo]"); if (!b) return;
    const a = b.dataset.mo, ed = $("#moEd");
    if (a === "add-col") {
      const body = $("#moColBody"); if (body.children.length >= MAX_COLORS) { toast(`ใส่ได้สูงสุด ${MAX_COLORS} สี (ตามช่องในฟอร์ม)`); return; }
      body.insertAdjacentHTML("beforeend", colRowHtml({}, body.children.length)); reindex(ed); $$("[data-c=code]", body).pop().focus();
    } else if (a === "del-col") { const tr = b.closest("tr"); if ($$("#moColBody tr", ed).length > 1) tr.remove(); else $$("input", tr).forEach((i) => { if (i.type === "checkbox") i.checked = false; else i.value = i.type === "color" ? "#cccccc" : ""; }); reindex(ed); refreshAll(ed); }
    else if (a === "preview") { const d = window.SalesEngine && window.SalesEngine.collectDraft && window.SalesEngine.collectDraft(); if (d) openPrint(d); }
    else if (a === "blank") openPrint(null, { blank: true });
    else if (a === "print-doc") { const d = window.SalesEngine.getDocs().find((x) => x.id === b.dataset.id); if (d) openPrint(d); }
    else if (a === "toggle-blank") { pr.blank = !pr.blank; renderPrint(); }
    else if (a === "do-print") window.print();
    else if (a === "close-print") closePrint();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && $("#moPrint") && !$("#moPrint").hidden) closePrint(); });
  // เติมผลตรวจเมื่อเปิดหน้าต่าง
  new MutationObserver(() => { const ed = $("#moEd"); if (ed && !ed.dataset.init) { ed.dataset.init = "1"; refreshAll(ed); } }).observe(document.body, { childList: true, subtree: true });

  window.MoForm = { editorHtml, read, open: openPrint, close: closePrint, model, defaultSpec, summarize, fit, wrap, textWidth: tw, SPEC, P1, P2, page1, page2, sheetHtml };
})();
