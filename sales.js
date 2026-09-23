/* ============================================================
   รายงานฝ่ายขาย — M/O และ SO ตัวอย่าง (ต่างประเทศ / ในประเทศ)
   - เลข run 4 ชุด (แก้ไขได้): MO 0001/26 · SO SC 0001/26 · MO TH 001/26 · SO D001/26
   - นำเข้ารายงาน Excel (Reports M/O): แถวย่อยที่ไม่มีเลข M/O รวมเข้า M/O เดิม, แปลง F2 → ตร.ม.,
     ซ่อมวันที่ที่ Excel สลับวัน/เดือน
   - KPI: ตร.ม. รับเข้า (วันเปิด M/O) · ส่งออก (วันส่งจริง หรือ Dispatch) · ยอดขาย — กรองรายเดือน/รายวัน
   ต้องโหลดหลัง app.js (ใช้ designs, REPORT_DATE, toast, monthNames, finishOpenJob)
   ============================================================ */
(function () {
  "use strict";

  const KEY_DOCS = "enterprise-sales-orders";
  const KEY_CFG = "enterprise-sales-settings";
  const F2_TO_M2 = 0.09290304;
  const MARKETS = { FOREIGN: { label: "ต่างประเทศ", currency: "USD" }, DOMESTIC: { label: "ในประเทศ", currency: "THB" } };
  const SERIES_DEF = {
    "FOREIGN-MO": { market: "FOREIGN", type: "MO", prefix: "MO ", digits: 4, label: "M/O ต่างประเทศ" },
    "FOREIGN-SO": { market: "FOREIGN", type: "SO", prefix: "SO SC ", digits: 4, label: "SO ตัวอย่าง ต่างประเทศ" },
    "DOMESTIC-MO": { market: "DOMESTIC", type: "MO", prefix: "MO TH ", digits: 3, label: "M/O ในประเทศ" },
    "DOMESTIC-SO": { market: "DOMESTIC", type: "SO", prefix: "SO D", digits: 3, label: "SO ตัวอย่าง ในประเทศ" }
  };
  const SO_STATUS = { DRAFT: "ร่าง", SENT: "ส่งลูกค้าแล้ว", APPROVED: "Approved", REJECTED: "ไม่อนุมัติ" };
  const SO_KIND = { DRAFT: "info", SENT: "review", APPROVED: "", REJECTED: "blocked" };

  /* ---------- helpers ---------- */
  const readJson = (k, fb) => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : fb; } catch (e) { return fb; } };
  const writeJson = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ใช้ต่อได้แม้บันทึกไม่ได้ */ } };
  const esc = (v) => String(v === undefined || v === null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  const txt = (v) => String(v === undefined || v === null ? "" : v).trim();
  const uid = () => "S" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const round = (n, p = 4) => Math.round(n * 10 ** p) / 10 ** p;
  const fmtSqm = (n) => (n || 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtInt = (n) => Math.round(n || 0).toLocaleString("th-TH");
  const asDate = (p) => new Date(p.y, p.m - 1, p.d, 12);
  const toISO = (p) => `${p.y}-${pad(p.m)}-${pad(p.d)}`;
  const monthISO = (p) => `${p.y}-${pad(p.m)}`;
  const todayISO = () => `${REPORT_DATE.getFullYear()}-${pad(REPORT_DATE.getMonth() + 1)}-${pad(REPORT_DATE.getDate())}`;
  const SHORT_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const fmtDay = (s) => {
    if (!s) return "-";
    const y = +s.slice(0, 4), m = +s.slice(5, 7);
    return s.length >= 10 ? `${+s.slice(8, 10)} ${SHORT_MONTHS[m - 1]} ${y}` : `${SHORT_MONTHS[m - 1]} ${y} (ไม่ระบุวัน)`;
  };

  /* ---------- ตั้งค่าเลข run ---------- */
  function loadCfg() {
    const s = readJson(KEY_CFG, {}) || {};
    const series = {};
    Object.keys(SERIES_DEF).forEach((k) => {
      const o = (s.series || {})[k] || {};
      series[k] = { ...SERIES_DEF[k], prefix: o.prefix !== undefined ? String(o.prefix) : SERIES_DEF[k].prefix, digits: Math.max(1, Math.min(8, num(o.digits) || SERIES_DEF[k].digits)), next: num(o.next) || 0 };
    });
    const custSale = {};
    Object.entries(s.custSale || {}).forEach(([k, v]) => { if (txt(v)) custSale[k] = txt(v); });
    return { series, fx: num(s.fx), custSale };
  }
  let cfg = loadCfg();
  const saveCfg = () => writeJson(KEY_CFG, { series: Object.fromEntries(Object.entries(cfg.series).map(([k, v]) => [k, { prefix: v.prefix, digits: v.digits, next: v.next }])), fx: cfg.fx, custSale: cfg.custSale });
  const seriesKey = (market, type) => `${market}-${type}`;
  const normNo = (s) => String(s || "").replace(/\s+/g, "").toUpperCase();
  const formatNo = (key, seq, yy) => `${cfg.series[key].prefix}${pad(seq, cfg.series[key].digits)}/${pad(yy)}`;
  function parseNo(key, no) {
    const prefix = normNo(cfg.series[key].prefix), n = normNo(no);
    if (!n.startsWith(prefix)) return null;
    const m = n.slice(prefix.length).match(/^(\d+)\/(\d{2})$/);
    return m ? { seq: Number(m[1]), yy: Number(m[2]) } : null;
  }

  /* ---------- เอกสาร ---------- */
  // ข้อมูลจริง นำเข้าจาก Google Sheet "QC Check Sheet" ของบริษัท เมื่อ 22 ก.ย. 2026 (source:"import" เหมือนการนำเข้า Excel ปกติ — นำเข้ารายงาน Excel ซ้ำภายหลังจะแทนที่ชุดนี้ได้ตามกติกาเดิม)
  // ราคา/ยอดขาย (price, amount) ไม่มีในชีตต้นทาง จึงเป็น 0/null ทั้งหมด — ต้องกรอกเพิ่มเองถ้าต้องใช้ยอดขายจริง
  const seedSalesDocs = [
  {id:"doc-MO-0109-26",market:"FOREIGN",type:"MO",no:"0109/26",designId:"MO-0109-26",customer:"ART RUGS / ANNET NIX",project:"PO:CC2475 ENTRY ROOM FOYER",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"",status:"OPEN",openDate:"2026-09-08",actualShip:"2026-09-18",extra:0,lines:[{design:"",location:"PO:CC2475 ENTRY ROOM FOYER",quality:"",colors:"",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:3.63,amount:0,ship:"2026-09-18",post:"",ref:""}],source:"import",salesName:"Prapol"},
  {id:"doc-MO-0110-26",market:"FOREIGN",type:"MO",no:"0110/26",designId:"MO-0110-26",customer:"ART RUGS LTD. / ANNET NIX",project:"PO.CC2475 JR'S OFFICE",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"",status:"OPEN",openDate:"2026-09-04",actualShip:"2026-09-18",extra:0,lines:[{design:"",location:"PO.CC2475 JR'S OFFICE",quality:"",colors:"",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:16.19,amount:0,ship:"2026-09-18",post:"",ref:""}],source:"import",salesName:"Prapol"},
  {id:"doc-MO-0111-26",market:"FOREIGN",type:"MO",no:"0111/26",designId:"MO-0111-26",customer:"ART RUGS LTD. / ANNET NIX",project:"PO.CC2475 DINING ROOM",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"",status:"OPEN",openDate:"2026-09-04",actualShip:"2026-09-18",extra:0,lines:[{design:"",location:"PO.CC2475 DINING ROOM",quality:"",colors:"",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:37.7,amount:0,ship:"2026-09-18",post:"",ref:""}],source:"import",salesName:"Prapol"},
  {id:"doc-MO-0112-26",market:"FOREIGN",type:"MO",no:"0112/26",designId:"MO-0112-26",customer:"ART RUGS / ANNET NIX",project:"PO:CC2475 GLAM ROOM",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"",status:"OPEN",openDate:"2026-09-08",actualShip:"2026-09-18",extra:0,lines:[{design:"",location:"PO:CC2475 GLAM ROOM",quality:"",colors:"",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:7.8,amount:0,ship:"2026-09-18",post:"",ref:""}],source:"import",salesName:"Prapol"},
  {id:"doc-MO-0113-26",market:"FOREIGN",type:"MO",no:"0113/26",designId:"MO-0113-26",customer:"ART RUGS LTD. / ANNET NIX",project:"PO.CC2475 BALLROOM",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"",status:"OPEN",openDate:"2026-09-04",actualShip:"2026-09-18",extra:0,lines:[{design:"",location:"PO.CC2475 BALLROOM",quality:"",colors:"",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:48.0,amount:0,ship:"2026-09-18",post:"",ref:""}],source:"import",salesName:"Prapol"},
  {id:"doc-MO-0115-26",market:"FOREIGN",type:"MO",no:"0115/26",designId:"MO-0115-26",customer:"ART RUGS LTD. / ANNET NIX",project:"PO.CC 2475 TV ROOM",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"",status:"OPEN",openDate:"2026-09-07",actualShip:"2026-09-21",extra:0,lines:[{design:"",location:"PO.CC 2475 TV ROOM",quality:"",colors:"",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:24.05,amount:0,ship:"2026-09-21",post:"",ref:""}],source:"import",salesName:"Prapol"},
  {id:"doc-MO-0119-26",market:"FOREIGN",type:"MO",no:"0119/26",designId:"MO-0119-26",customer:"GALLERY FRANCAIS",project:"UMM FAHAD",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"",status:"OPEN",openDate:"2026-09-05",actualShip:"",extra:0,lines:[{design:"",location:"UMM FAHAD",quality:"",colors:"",pack:"",pcs:4,size:"",unit:"M2",qty:4,price:null,sqm:109.93,amount:0,ship:"",post:"",ref:""}],source:"import",salesName:"Prapol"},
  {id:"doc-MO-0147-26",market:"FOREIGN",type:"MO",no:"0147/26",designId:"MO-0147-26",customer:"ROLLS SUPPLY W.L.L.",project:"VILLA 1063",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"",status:"OPEN",openDate:"2026-09-04",actualShip:"",extra:0,lines:[{design:"",location:"VILLA 1063",quality:"",colors:"",pack:"",pcs:6,size:"",unit:"M2",qty:6,price:null,sqm:51.94,amount:0,ship:"",post:"2026-09-25",ref:""}],source:"import",salesName:"Prapol"},
  {id:"doc-MO-0148-26",market:"FOREIGN",type:"MO",no:"0148/26",designId:"MO-0148-26",customer:"INTERSPAZIO S.R.L.",project:"NIGERIA",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"",status:"OPEN",openDate:"2026-09-04",actualShip:"",extra:0,lines:[{design:"",location:"NIGERIA",quality:"",colors:"",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:12.57,amount:0,ship:"",post:"",ref:""}],source:"import",salesName:"Natpalat"},
  {id:"doc-MO-0149-26",market:"FOREIGN",type:"MO",no:"0149/26",designId:"MO-0149-26",customer:"INTERSPAZIO S.R.L.",project:"NIGERIA",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"",status:"OPEN",openDate:"2026-09-08",actualShip:"",extra:0,lines:[{design:"",location:"NIGERIA",quality:"",colors:"",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:6.0,amount:0,ship:"",post:"",ref:""}],source:"import",salesName:"Natpalat"},
  {id:"doc-MO-0150-26",market:"FOREIGN",type:"MO",no:"0150/26",designId:"MO-0150-26",customer:"ROLLS SUPPLY W.L.L.",project:"RLS/285/26 MAYSA STAIRS (RAWDA)",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"",status:"OPEN",openDate:"2026-09-08",actualShip:"2026-09-15",extra:0,lines:[{design:"",location:"RLS/285/26 MAYSA STAIRS (RAWDA)",quality:"",colors:"",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:10.39,amount:0,ship:"2026-09-15",post:"",ref:""}],source:"import",salesName:"Prapol"},
  {id:"doc-MO-0151-26",market:"FOREIGN",type:"MO",no:"0151/26",designId:"MO-0151-26",customer:"BRINTONS - USA.",project:"PO.BRI500037 WESTIN HILTON HEAD",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"Confirm ส่งลูกค้าวันที่ 25/9/2026 ห้ามเลื่อน!",status:"OPEN",openDate:"2026-09-08",actualShip:"",extra:0,lines:[{design:"",location:"PO.BRI500037 WESTIN HILTON HEAD",quality:"",colors:"",pack:"",pcs:5,size:"",unit:"M2",qty:5,price:null,sqm:83.68,amount:0,ship:"",post:"",ref:""}],source:"import",salesName:"Natpalat"},
  {id:"doc-MO-0152-26",market:"FOREIGN",type:"MO",no:"0152/26",designId:"MO-0152-26",customer:"INNOVATIVE CARPETS",project:"SC#2551(A)",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"Booking 21-09-2026",status:"OPEN",openDate:"2026-09-05",actualShip:"2026-09-18",extra:0,lines:[{design:"",location:"SC#2551(A)",quality:"",colors:"",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:18.42,amount:0,ship:"2026-09-18",post:"",ref:""}],source:"import",salesName:"Natpalat"},
  {id:"doc-MO-0153-26",market:"FOREIGN",type:"MO",no:"0153/26",designId:"MO-0153-26",customer:"INNOVATIVE CARPETS",project:"SC#2551(B)",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"Booking 21-09-2026",status:"OPEN",openDate:"2026-09-08",actualShip:"",extra:0,lines:[{design:"",location:"SC#2551(B)",quality:"",colors:"",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:8.05,amount:0,ship:"",post:"",ref:""}],source:"import",salesName:"Natpalat"},
  {id:"doc-MO-0154-26",market:"FOREIGN",type:"MO",no:"0154/26",designId:"MO-0154-26",customer:"INNOVATIVE CARPETS",project:"SC#2551(C)",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"Booking 21-09-2026",status:"OPEN",openDate:"2026-09-08",actualShip:"",extra:0,lines:[{design:"",location:"SC#2551(C)",quality:"",colors:"",pack:"",pcs:2,size:"",unit:"M2",qty:2,price:null,sqm:0.74,amount:0,ship:"",post:"",ref:""}],source:"import",salesName:"Natpalat"},
  {id:"doc-MO-0155-26",market:"FOREIGN",type:"MO",no:"0155/26",designId:"MO-0155-26",customer:"GALLERY FRANCAIS",project:"SHEIKHA DEEMA AL MANA",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"",status:"OPEN",openDate:"2026-09-07",actualShip:"",extra:0,lines:[{design:"",location:"SHEIKHA DEEMA AL MANA",quality:"",colors:"",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:26.79,amount:0,ship:"",post:"",ref:""}],source:"import",salesName:"Prapol"},
  {id:"doc-MO-0156-26",market:"FOREIGN",type:"MO",no:"0156/26",designId:"MO-0156-26",customer:"INNOVATIVE CARPETS",project:"SC#2553",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"",status:"OPEN",openDate:"2026-09-07",actualShip:"",extra:0,lines:[{design:"",location:"SC#2553",quality:"",colors:"",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:10.76,amount:0,ship:"",post:"",ref:""}],source:"import",salesName:"Natpalat"},
  {id:"doc-MO-0157-26",market:"FOREIGN",type:"MO",no:"0157/26",designId:"MO-0157-26",customer:"INNOVATIVE CARPETS",project:"SC#2554",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"",status:"OPEN",openDate:"2026-09-08",actualShip:"",extra:0,lines:[{design:"",location:"SC#2554",quality:"",colors:"",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:15.56,amount:0,ship:"",post:"",ref:""}],source:"import",salesName:"Natpalat"},
  {id:"doc-MO-0158-26",market:"FOREIGN",type:"MO",no:"0158/26",designId:"MO-0158-26",customer:"INNOVATIVE",project:"SC#2555(A)",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"",status:"OPEN",openDate:"2026-09-04",actualShip:"",extra:0,lines:[{design:"",location:"SC#2555(A)",quality:"",colors:"",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:10.96,amount:0,ship:"",post:"",ref:""}],source:"import",salesName:"Natpalat"},
  {id:"doc-MO-0159-26",market:"FOREIGN",type:"MO",no:"0159/26",designId:"MO-0159-26",customer:"INNOVATIVE",project:"SC#2555(B)",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"",status:"OPEN",openDate:"2026-09-07",actualShip:"",extra:0,lines:[{design:"",location:"SC#2555(B)",quality:"",colors:"",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:21.69,amount:0,ship:"",post:"",ref:""}],source:"import",salesName:"Natpalat"},
  {id:"doc-MO-0160-26",market:"FOREIGN",type:"MO",no:"0160/26",designId:"MO-0160-26",customer:"INNOVATIVE CARPETS",project:"SC#2556(A)",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"",status:"OPEN",openDate:"2026-09-07",actualShip:"",extra:0,lines:[{design:"",location:"SC#2556(A)",quality:"",colors:"",pack:"",pcs:101,size:"",unit:"M2",qty:101,price:null,sqm:160.91,amount:0,ship:"",post:"",ref:""}],source:"import",salesName:"Natpalat"},
  {id:"doc-MO-0161-26",market:"FOREIGN",type:"MO",no:"0161/26",designId:"MO-0161-26",customer:"INNOVATIVE CARPETS",project:"SC#2556(B)",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"",status:"OPEN",openDate:"2026-09-04",actualShip:"",extra:0,lines:[{design:"",location:"SC#2556(B)",quality:"HWO-450 CUT & LOW TIGHT LOOP WITH 25% T/S, แต่งเรียบ/พับขอบ",colors:"",pack:"",pcs:168,size:"",unit:"M2",qty:168,price:null,sqm:197.21,amount:0,ship:"",post:"",ref:""}],source:"import",salesName:"Natpalat"},
  {id:"doc-MO-0162-26",market:"FOREIGN",type:"MO",no:"0162/26",designId:"MO-0162-26",customer:"INNOVATIVE CARPETS",project:"SC#2556(C)",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"",status:"OPEN",openDate:"2026-09-07",actualShip:"",extra:0,lines:[{design:"",location:"SC#2556(C)",quality:"",colors:"",pack:"",pcs:33,size:"",unit:"M2",qty:33,price:null,sqm:38.74,amount:0,ship:"",post:"",ref:""}],source:"import",salesName:"Natpalat"},
  {id:"doc-MO-0164-26",market:"FOREIGN",type:"MO",no:"0164/26",designId:"MO-0164-26",customer:"INNOVATIVE CARPETS",project:"SC#2556(E)",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"",status:"OPEN",openDate:"2026-09-04",actualShip:"",extra:0,lines:[{design:"",location:"SC#2556(E)",quality:"",colors:"",pack:"",pcs:33,size:"",unit:"M2",qty:33,price:null,sqm:129.2,amount:0,ship:"",post:"",ref:""}],source:"import",salesName:"Natpalat"},
  {id:"doc-MO-0165-26",market:"FOREIGN",type:"MO",no:"0165/26",designId:"MO-0165-26",customer:"INNOVATIVE CARPETS",project:"SC#2552(A)",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"",status:"OPEN",openDate:"2026-09-08",actualShip:"",extra:0,lines:[{design:"",location:"SC#2552(A)",quality:"",colors:"",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:44.59,amount:0,ship:"",post:"",ref:""}],source:"import",salesName:"Natpalat"},
  {id:"doc-MO-0166-26",market:"FOREIGN",type:"MO",no:"0166/26",designId:"MO-0166-26",customer:"INNOVATIVE CARPETS",project:"SC#2552(B)",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"",status:"OPEN",openDate:"2026-09-08",actualShip:"",extra:0,lines:[{design:"",location:"SC#2552(B)",quality:"",colors:"",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:7.3,amount:0,ship:"",post:"",ref:""}],source:"import",salesName:"Natpalat"},
  {id:"doc-MO-0167-26",market:"FOREIGN",type:"MO",no:"0167/26",designId:"MO-0167-26",customer:"INNOVATIVE CARPETS",project:"SC#2552(C)",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"",status:"OPEN",openDate:"2026-09-08",actualShip:"",extra:0,lines:[{design:"",location:"SC#2552(C)",quality:"",colors:"",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:21.8,amount:0,ship:"",post:"",ref:""}],source:"import",salesName:"Natpalat"},
  {id:"doc-MO-0168-26",market:"FOREIGN",type:"MO",no:"0168/26",designId:"MO-0168-26",customer:"INNOVATIVE CARPETS",project:"SC#2552(D)",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"",status:"OPEN",openDate:"2026-09-08",actualShip:"",extra:0,lines:[{design:"",location:"SC#2552(D)",quality:"",colors:"",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:13.47,amount:0,ship:"",post:"",ref:""}],source:"import",salesName:"Natpalat"},
  {id:"doc-MO-0169-26",market:"FOREIGN",type:"MO",no:"0169/26",designId:"MO-0169-26",customer:"SCM.98",project:"PO.3315/26 THE HOUR GLASS-SIAM ICON",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"",status:"OPEN",openDate:"2026-09-07",actualShip:"",extra:0,lines:[{design:"",location:"PO.3315/26 THE HOUR GLASS-SIAM ICON",quality:"",colors:"",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:34.34,amount:0,ship:"",post:"",ref:""}],source:"import",salesName:"Natpalat"},
  {id:"doc-MO-0170-26",market:"FOREIGN",type:"MO",no:"0170/26",designId:"MO-0170-26",customer:"SCM.98",project:"PO.3315/26 THE HOUR GLASS-SIAM ICON",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"",status:"OPEN",openDate:"2026-09-07",actualShip:"",extra:0,lines:[{design:"",location:"PO.3315/26 THE HOUR GLASS-SIAM ICON",quality:"",colors:"",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:29.47,amount:0,ship:"",post:"",ref:""}],source:"import",salesName:"Natpalat"},
  {id:"doc-MO-0171-26",market:"FOREIGN",type:"MO",no:"0171/26",designId:"MO-0171-26",customer:"AREEN DESIGN",project:"PO.101346 MAIN VILLA",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"M/O 123/18 / ตัดพรมเป็น 3 ชิ้นเหมือน M/O 123/18 ที่เคยทำ",status:"OPEN",openDate:"2026-09-09",actualShip:"",extra:0,lines:[{design:"ARE-18-023-00",location:"PO.101346 MAIN VILLA",quality:"HPA-450 CUT & LOOP WITH CARVING",colors:"3",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:40.89,amount:0,ship:"",post:"",ref:"M/O 123/18"}],source:"import",salesName:"Natpalat"},
  {id:"doc-MO-0172-26",market:"FOREIGN",type:"MO",no:"0172/26",designId:"MO-0172-26",customer:"ROLLS SUPPLY",project:"RLS/287/26 ITALY NEW RUGS AN013",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"S/O 0346/26 สีและคุณภาพ",status:"OPEN",openDate:"2026-09-10",actualShip:"",extra:0,lines:[{design:"RLS-26-057-03",location:"RLS/287/26 ITALY NEW RUGS AN013",quality:"HWO-450 CUT WITH CARVING",colors:"5",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:28.16,amount:0,ship:"",post:"",ref:"S/O 0346/26 สีและคุณภาพ"}],source:"import",salesName:"คุณประพล"},
  {id:"doc-MO-0173-26",market:"FOREIGN",type:"MO",no:"0173/26",designId:"MO-0173-26",customer:"ROLLS SUPPLY",project:"RLS/287/26 ITALY NEW RUGS AN013",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"S/O 0347/26 สีและคุณภาพ (POM ลูกค้า)",status:"OPEN",openDate:"2026-09-10",actualShip:"",extra:0,lines:[{design:"RLS-26-058-03",location:"RLS/287/26 ITALY NEW RUGS AN013",quality:"HWO-450 CUT WITH CARVING",colors:"4",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:6.4,amount:0,ship:"",post:"",ref:"S/O 0347/26 สีและคุณภาพ (POM ลูกค้า)"}],source:"import",salesName:"คุณประพล"},
  {id:"doc-MO-0174-26",market:"FOREIGN",type:"MO",no:"0174/26",designId:"MO-0174-26",customer:"ROLLS SUPPLY",project:"RLS/287/26 ITALY NEW RUGS AN013",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"S/O 0348/26 สีและคุณภาพ (POM ลูกค้า)",status:"OPEN",openDate:"2026-09-10",actualShip:"",extra:0,lines:[{design:"RLS-26-059-00",location:"RLS/287/26 ITALY NEW RUGS AN013",quality:"HWO-450 CUT WITH CARVING",colors:"6",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:10.89,amount:0,ship:"",post:"",ref:"S/O 0348/26 สีและคุณภาพ (POM ลูกค้า)"}],source:"import",salesName:"Prapol"},
  {id:"doc-MO-0175-26",market:"FOREIGN",type:"MO",no:"0175/26",designId:"MO-0175-26",customer:"ROLLS SUPPLY",project:"RLS/287/26 ITALY NEW RUGS AN013",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"S/O 0349/26 สีและคุณภาพ (POM ลูกค้า)",status:"OPEN",openDate:"2026-09-10",actualShip:"",extra:0,lines:[{design:"RLS-26-060-03",location:"RLS/287/26 ITALY NEW RUGS AN013",quality:"HWO-450 CUT WITH CARVING",colors:"6",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:5.6,amount:0,ship:"",post:"",ref:"S/O 0349/26 สีและคุณภาพ (POM ลูกค้า)"}],source:"import",salesName:"คุณประพล"},
  {id:"doc-MO-0176-26",market:"FOREIGN",type:"MO",no:"0176/26",designId:"MO-0176-26",customer:"ROLLS SUPPLY",project:"RLS/286/26 TANUJA",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"S/O 0333/26 สีและคุณภาพ",status:"OPEN",openDate:"2026-09-11",actualShip:"",extra:0,lines:[{design:"RLS-26-054-03",location:"RLS/286/26 TANUJA",quality:"HWO-450 CUT WITH CARVING",colors:"7",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:40.95,amount:0,ship:"",post:"",ref:"S/O 0333/26 สีและคุณภาพ"}],source:"import",salesName:"คุณประพล"},
  {id:"doc-MO-0177-26",market:"FOREIGN",type:"MO",no:"0177/26",designId:"MO-0177-26",customer:"GALLERY FRANCAIS",project:"CEO LIVING ROOM",pi:"",inv:"",incoterms:"F.O.B.",currency:"USD",remarks:"S/O 0247/26 สีและคุณภาพ",status:"OPEN",openDate:"2026-09-11",actualShip:"",extra:0,lines:[{design:"GFC-26-059-00",location:"CEO LIVING ROOM",quality:"HWO-450 CUT WIYH CARVING",colors:"8",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:31.17,amount:0,ship:"",post:"",ref:"S/O 0247/26 สีและคุณภาพ"}],source:"import",salesName:"Prapol"},
  {id:"doc-MO-0178-26",market:"FOREIGN",type:"MO",no:"0178/26",designId:"MO-0178-26",customer:"ROLLS SUPPLY",project:"RLS/288/26 GCC26",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"S/O 0368/26",status:"OPEN",openDate:"2026-09-14",actualShip:"",extra:0,lines:[{design:"RLS-26-069-03",location:"RLS/288/26 GCC26",quality:"HWO-450 CUT",colors:"2",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:3.46,amount:0,ship:"",post:"2026-09-25",ref:"S/O 0368/26"}],source:"import",salesName:"Prapol"},
  {id:"doc-MO-0179-26",market:"FOREIGN",type:"MO",no:"0179/26",designId:"MO-0179-26",customer:"ROLLS SUPPLY",project:"RLS/288/26 GCC26",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"",status:"OPEN",openDate:"2026-09-14",actualShip:"",extra:0,lines:[{design:"RLS-26-070-00",location:"RLS/288/26 GCC26",quality:"HWO-450 CUT",colors:"1",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:26.0,amount:0,ship:"",post:"2026-09-25",ref:""}],source:"import",salesName:"Prapol"},
  {id:"doc-MO-0180-26",market:"FOREIGN",type:"MO",no:"0180/26",designId:"MO-0180-26",customer:"GALLERY FRANCAIS",project:"MADAM NOOR AL MAADEED",pi:"",inv:"",incoterms:"F.O.B.",currency:"USD",remarks:"S/O 0359/26 อ้างคุณภาพและสีที่เหมือนกัน",status:"OPEN",openDate:"2026-09-15",actualShip:"",extra:0,lines:[{design:"GFC-26-081-01",location:"MADAM NOOR AL MAADEED",quality:"HWO-450 CUT WITH CARVING",colors:"6",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:17.11,amount:0,ship:"",post:"",ref:"S/O 0359/26 อ้างคุณภาพและสีที่เหมือนกัน"}],source:"import",salesName:"Prapol"},
  {id:"doc-MO-0181-26",market:"FOREIGN",type:"MO",no:"0181/26",designId:"MO-0181-26",customer:"ROLLS SUPPLY",project:"RLS/289/26 CPCMW6",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"S/O 0378/26",status:"OPEN",openDate:"2026-09-22",actualShip:"",extra:0,lines:[{design:"RLS-26-067-04",location:"RLS/289/26 CPCMW6",quality:"HWO-450 CUT WITH CARVING",colors:"2",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:37.6,amount:0,ship:"",post:"",ref:"S/O 0378/26"}],source:"import",salesName:"คุณประพล"},
  {id:"doc-MO-0182-26",market:"FOREIGN",type:"MO",no:"0182/26",designId:"MO-0182-26",customer:"ROLLS SUPPLY",project:"RLS/289/26 CPCMW6",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"S/O 0369/26",status:"OPEN",openDate:"2026-09-22",actualShip:"",extra:0,lines:[{design:"RLS-26-068-04",location:"RLS/289/26 CPCMW6",quality:"HWO-450 CUT WITH CARVING",colors:"5",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:18.23,amount:0,ship:"",post:"",ref:"S/O 0369/26"}],source:"import",salesName:"คุณประพล"},
  {id:"doc-MO-TH 123-26",market:"DOMESTIC",type:"MO",no:"TH 123-26",designId:"MO-TH 123-26",customer:"คุณ กชวรรณ สัจจา",project:"S 047/2569",pi:"",inv:"",incoterms:"",currency:"THB",remarks:"",status:"OPEN",openDate:"2026-09-04",actualShip:"2026-09-20",extra:0,lines:[{design:"",location:"S 047/2569",quality:"",colors:"",pack:"",pcs:2,size:"",unit:"M2",qty:2,price:null,sqm:61.67,amount:0,ship:"2026-09-20",post:"",ref:""}],source:"import",salesName:""},
  {id:"doc-MO-TH 126-26",market:"DOMESTIC",type:"MO",no:"TH 126/26",designId:"MO-TH 126-26",customer:"บริษัท เอส.พี.คาร์เปท แอนด์ คลีน จำกัด",project:"S 014/2569 Rev.6 “ วังบางขุนพรหม_ ห้องโถงจุไรรัตน์”",pi:"",inv:"",incoterms:"",currency:"THB",remarks:"",status:"OPEN",openDate:"2026-09-04",actualShip:"2026-09-21",extra:0,lines:[{design:"",location:"S 014/2569 Rev.6 “ วังบางขุนพรหม_ ห้องโถงจุไรรัตน์”",quality:"",colors:"",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:10.8,amount:0,ship:"2026-09-21",post:"",ref:""}],source:"import",salesName:"สลิล ชวโรจน์"},
  {id:"doc-MO-TH 128-26 CC046-26",market:"DOMESTIC",type:"MO",no:"TH 128/26 CC046/26",designId:"MO-TH 128-26 CC046-26",customer:"COLIN CAMPBELL",project:"PO#000914 D000700 Innovation",pi:"",inv:"",incoterms:"",currency:"THB",remarks:"",status:"OPEN",openDate:"2026-09-05",actualShip:"",extra:0,lines:[{design:"",location:"PO#000914 D000700 Innovation",quality:"",colors:"",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:104.05,amount:0,ship:"",post:"",ref:""}],source:"import",salesName:"Prapol"},
  {id:"doc-MO-TH 131-26",market:"DOMESTIC",type:"MO",no:"TH 131/26",designId:"MO-TH 131-26",customer:"CYRILLE BUHRMAN",project:"S.052/2569 \"บ้านส่วนตัว\"",pi:"",inv:"",incoterms:"",currency:"THB",remarks:"",status:"OPEN",openDate:"2026-09-08",actualShip:"2026-09-20",extra:0,lines:[{design:"",location:"S.052/2569 \"บ้านส่วนตัว\"",quality:"",colors:"",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:15.1,amount:0,ship:"2026-09-20",post:"",ref:""}],source:"import",salesName:""},
  {id:"doc-MO-TH 140-26 CC048-26",market:"DOMESTIC",type:"MO",no:"TH 140/26 CC048/26",designId:"MO-TH 140-26 CC048-26",customer:"DILANA",project:"PO:0316  PROJECT:ZIG SKINK TUAPE",pi:"",inv:"",incoterms:"",currency:"THB",remarks:"",status:"OPEN",openDate:"2026-09-08",actualShip:"",extra:0,lines:[{design:"",location:"PO:0316  PROJECT:ZIG SKINK TUAPE",quality:"",colors:"",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:2.6,amount:0,ship:"",post:"",ref:""}],source:"import",salesName:"Prapol"},
  {id:"doc-MO-TH 141-26",market:"DOMESTIC",type:"MO",no:"TH 141/26",designId:"MO-TH 141-26",customer:"กองทุนสร้างพระมหาเจดีย์วัดพระธาตุดอยสะเก็ด",project:"S 053/2569",pi:"",inv:"",incoterms:"",currency:"THB",remarks:"",status:"OPEN",openDate:"2026-09-07",actualShip:"2026-09-21",extra:0,lines:[{design:"",location:"S 053/2569",quality:"",colors:"",pack:"",pcs:8,size:"",unit:"M2",qty:8,price:null,sqm:12.64,amount:0,ship:"2026-09-21",post:"",ref:""}],source:"import",salesName:""},
  {id:"doc-MO-TH 146-26 CC053-26",market:"DOMESTIC",type:"MO",no:"TH 146/26 CC053/26",designId:"MO-TH 146-26 CC053-26",customer:"COLIN CAMPBELL",project:"PO:#0011140-COLIN CAMPBELL PROJECT BLOOP MAROON",pi:"",inv:"",incoterms:"",currency:"THB",remarks:"",status:"OPEN",openDate:"2026-09-08",actualShip:"",extra:0,lines:[{design:"",location:"PO:#0011140-COLIN CAMPBELL PROJECT BLOOP MAROON",quality:"",colors:"",pack:"",pcs:27,size:"",unit:"M2",qty:27,price:null,sqm:5.38,amount:0,ship:"",post:"",ref:""}],source:"import",salesName:"Prapol"},
  {id:"doc-MO-TH 147-26 CC054-26",market:"DOMESTIC",type:"MO",no:"TH 147/26 CC054/26",designId:"MO-TH 147-26 CC054-26",customer:"COLIN CAMPBELL",project:"PO:#0011440-COLIN CAMPBELL PROJECT BLOOP OCHRE",pi:"",inv:"",incoterms:"",currency:"THB",remarks:"",status:"OPEN",openDate:"2026-09-08",actualShip:"",extra:0,lines:[{design:"",location:"PO:#0011440-COLIN CAMPBELL PROJECT BLOOP OCHRE",quality:"",colors:"",pack:"",pcs:27,size:"",unit:"M2",qty:27,price:null,sqm:5.39,amount:0,ship:"",post:"",ref:""}],source:"import",salesName:"Prapol"},
  {id:"doc-MO-TH 148-26 CC055-26",market:"DOMESTIC",type:"MO",no:"TH 148/26 CC055/26",designId:"MO-TH 148-26 CC055-26",customer:"COLIN CAMPBELL",project:"PO:#001140-COLIN CAMPBELL PROJECT BLOOP DENIM",pi:"",inv:"",incoterms:"",currency:"THB",remarks:"",status:"OPEN",openDate:"2026-09-08",actualShip:"",extra:0,lines:[{design:"",location:"PO:#001140-COLIN CAMPBELL PROJECT BLOOP DENIM",quality:"",colors:"",pack:"",pcs:27,size:"",unit:"M2",qty:27,price:null,sqm:5.39,amount:0,ship:"",post:"",ref:""}],source:"import",salesName:"Prapol"},
  {id:"doc-MO-TH 150-26",market:"DOMESTIC",type:"MO",no:"TH 150/26",designId:"MO-TH 150-26",customer:"บริษัท ทูล บ๊อกซ์ โซน จำกัด",project:"S 072/2569 \"PIANO CARPETS\"",pi:"",inv:"",incoterms:"",currency:"THB",remarks:"",status:"OPEN",openDate:"2026-09-08",actualShip:"2026-09-20",extra:0,lines:[{design:"",location:"S 072/2569 \"PIANO CARPETS\"",quality:"",colors:"",pack:"",pcs:2,size:"",unit:"M2",qty:2,price:null,sqm:10.42,amount:0,ship:"2026-09-20",post:"",ref:""}],source:"import",salesName:""},
  {id:"doc-MO-TH 151-26",market:"DOMESTIC",type:"MO",no:"TH 151/26",designId:"MO-TH 151-26",customer:"บริษัท ทูล บ๊อกซ์ โซน จำกัด",project:"S 072/2569 \"PIANO CARPETS\"",pi:"",inv:"",incoterms:"",currency:"THB",remarks:"",status:"OPEN",openDate:"2026-09-08",actualShip:"2026-09-20",extra:0,lines:[{design:"",location:"S 072/2569 \"PIANO CARPETS\"",quality:"",colors:"",pack:"",pcs:2,size:"",unit:"M2",qty:2,price:null,sqm:11.02,amount:0,ship:"2026-09-20",post:"",ref:""}],source:"import",salesName:""},
  {id:"doc-MO-TH 152-26",market:"DOMESTIC",type:"MO",no:"TH 152/26",designId:"MO-TH 152-26",customer:"บริษัท ทูล บ๊อกซ์ โซน จำกัด",project:"S 072/26 \"PIANO CARPETS\"",pi:"",inv:"",incoterms:"",currency:"THB",remarks:"",status:"OPEN",openDate:"2026-09-08",actualShip:"2026-09-20",extra:0,lines:[{design:"",location:"S 072/26 \"PIANO CARPETS\"",quality:"",colors:"",pack:"",pcs:2,size:"",unit:"M2",qty:2,price:null,sqm:9.65,amount:0,ship:"2026-09-20",post:"",ref:""}],source:"import",salesName:""},
  {id:"doc-MO-TH 155-26",market:"DOMESTIC",type:"MO",no:"TH 155/26",designId:"MO-TH 155-26",customer:"คุณนรเศรษฐ์ วรเศรษฐ์รักษา",project:"TH 155/26",pi:"",inv:"",incoterms:"",currency:"THB",remarks:"",status:"OPEN",openDate:"2026-09-08",actualShip:"",extra:0,lines:[{design:"",location:"",quality:"",colors:"",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:24.55,amount:0,ship:"",post:"",ref:""}],source:"import",salesName:""},
  {id:"doc-MO-TH 159-26",market:"DOMESTIC",type:"MO",no:"TH 159/26",designId:"MO-TH 159-26",customer:"บริษัท วีระศิลป์ดีไซน์ จำกัด",project:"S 074/2569",pi:"",inv:"",incoterms:"",currency:"THB",remarks:"TH-105/26 สำหรับสี BLUE เท่านั้น",status:"OPEN",openDate:"2026-09-01",actualShip:"",extra:0,lines:[{design:"THA-26-175-00",location:"S 074/2569",quality:"HPA-450CUT(PH=8MM.)",colors:"2",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:14.79,amount:0,ship:"",post:"",ref:"TH-105/26 สำหรับสี BLUE เท่านั้น"}],source:"import",salesName:"มัทนา อุระรื่น"},
  {id:"doc-MO-TH 161-26",market:"DOMESTIC",type:"MO",no:"TH 161/26",designId:"MO-TH 161-26",customer:"บริษัท คาร์มาร์ท จำกัด (มหาชน) สำนักงานใหญ่",project:"PO-D04-6909010 หน้าสาขา ร้าน Reunrom @ FL.G Siam Paragon",pi:"",inv:"",incoterms:"",currency:"THB",remarks:"",status:"OPEN",openDate:"2026-09-08",actualShip:"",extra:0,lines:[{design:"",location:"PO-D04-6909010 หน้าสาขา ร้าน Reunrom @ FL.G Siam Paragon",quality:"",colors:"",pack:"",pcs:2,size:"",unit:"M2",qty:2,price:null,sqm:6.47,amount:0,ship:"",post:"",ref:""}],source:"import",salesName:""},
  {id:"doc-MO-TH 162-26",market:"DOMESTIC",type:"MO",no:"TH 162/26",designId:"MO-TH 162-26",customer:"บริษัท ไอ คอนโด ภูเก็ต จำกัด",project:"S 051/2569 REV.3",pi:"",inv:"",incoterms:"",currency:"THB",remarks:"S/O:D-167/26",status:"OPEN",openDate:"2026-09-10",actualShip:"",extra:0,lines:[{design:"THA-26-177-00",location:"S 051/2569 REV.3",quality:"HPRSK-450CUT(PH=7MM.)",colors:"1",pack:"",pcs:15,size:"",unit:"M2",qty:15,price:null,sqm:38.4,amount:0,ship:"",post:"",ref:"S/O:D-167/26"}],source:"import",salesName:"สลิล ชวโรจน์"},
  {id:"doc-MO-TH 164-26",market:"DOMESTIC",type:"MO",no:"TH 164/26",designId:"MO-TH 164-26",customer:"คุณคิว",project:"S 089/2569",pi:"",inv:"",incoterms:"",currency:"THB",remarks:"",status:"OPEN",openDate:"2026-09-14",actualShip:"",extra:0,lines:[{design:"THA-26-171-04_CARVE",location:"S 089/2569",quality:"HPA-450CUT(PH=8MM.)",colors:"9",pack:"",pcs:null,size:"",unit:"M2",qty:null,price:null,sqm:0.0,amount:0,ship:"",post:"",ref:""}],source:"import",salesName:"สลิล ชวโรจน์"},
  {id:"doc-MO-TH 158-26",market:"DOMESTIC",type:"MO",no:"TH 158/26",designId:"MO-TH 158-26",customer:"บริษัท ลิตเติ้ลบันนี่ กรุ๊ป จำกัด",project:"S 056/2569 LITTLE BUNNY",pi:"",inv:"",incoterms:"",currency:"THB",remarks:"",status:"OPEN",openDate:"2026-08-28",actualShip:"",extra:0,lines:[{design:"THA-26-173-02_rug1, rug2",location:"S 056/2569 LITTLE BUNNY",quality:"",colors:"1",pack:"",pcs:3,size:"",unit:"M2",qty:3,price:null,sqm:17.63,amount:0,ship:"",post:"",ref:""}],source:"import",salesName:"ณัฐพิสิษฐ์ ชวโรจน์"},
  {id:"doc-MO-TH 157-26",market:"DOMESTIC",type:"MO",no:"TH 157/26",designId:"MO-TH 157-26",customer:"บริษัท แปซิฟิก รีเทล จำกัด",project:"S054/2569",pi:"",inv:"",incoterms:"",currency:"THB",remarks:"",status:"OPEN",openDate:"2026-08-28",actualShip:"",extra:0,lines:[{design:"",location:"S054/2569",quality:"HPA45 LOOP (PH:7MM.)",colors:"1",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:12.0,amount:0,ship:"",post:"",ref:""}],source:"import",salesName:""},
  {id:"doc-MO-TH 132-26 CC047-26",market:"DOMESTIC",type:"MO",no:"TH 132/26 CC047/26",designId:"MO-TH 132-26 CC047-26",customer:"COLIN CAMPBELL",project:"PO#001054 PROJECT HUGHES WOITAS",pi:"",inv:"",incoterms:"",currency:"THB",remarks:"",status:"OPEN",openDate:"2026-09-08",actualShip:"2026-09-18",extra:0,lines:[{design:"",location:"PO#001054 PROJECT HUGHES WOITAS",quality:"",colors:"",pack:"",pcs:3,size:"",unit:"M2",qty:3,price:null,sqm:30.39,amount:0,ship:"2026-09-18",post:"",ref:""}],source:"import",salesName:"Prapol"},
  {id:"doc-MO-TH 133-26",market:"DOMESTIC",type:"MO",no:"TH 133-26",designId:"MO-TH 133-26",customer:"บริษัท วงปี กรุ๊ป จำกัด",project:"S 066/2569",pi:"",inv:"",incoterms:"",currency:"THB",remarks:"",status:"OPEN",openDate:"2026-09-11",actualShip:"",extra:0,lines:[{design:"",location:"S 066/2569",quality:"",colors:"",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:3.64,amount:0,ship:"",post:"",ref:""}],source:"import",salesName:""},
  {id:"doc-MO-TH 160-26  CC057-26",market:"DOMESTIC",type:"MO",no:"TH 160/26  CC057/26",designId:"MO-TH 160-26  CC057-26",customer:"CACHET CARPETS / DILANA",project:"PO-0321",pi:"",inv:"",incoterms:"",currency:"THB",remarks:"",status:"OPEN",openDate:"2026-09-10",actualShip:"",extra:0,lines:[{design:"",location:"PO-0321",quality:"",colors:"",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:2.8,amount:0,ship:"",post:"",ref:""}],source:"import",salesName:"Prapol"},
  {id:"doc-SO-SC 0358-26",market:"FOREIGN",type:"SO",no:"SC 0358/26",designId:"SO-SC 0358-26",customer:"ART RUGS LTD. / LOOP HOUSE",project:"CS4951 [D2605_AE_R1S2_(CS4927)]",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"",status:"APPROVED",openDate:"2026-09-05",actualShip:"",extra:0,lines:[{design:"",location:"CS4951 [D2605_AE_R1S2_(CS4927)]",quality:"",colors:"",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:0.09,amount:0,ship:"",post:"",ref:""}],source:"import",salesName:""},
  {id:"doc-SO-SC 0359-26",market:"FOREIGN",type:"SO",no:"SC 0359/26",designId:"SO-SC 0359-26",customer:"GALLERY FRANCAIS",project:"MADAM NOOR AL MAADEED (LIVING AREA)",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"",status:"APPROVED",openDate:"2026-09-07",actualShip:"Mon Sep 07 2026 00:00:00 GMT+0700 (GMT+07:00)",extra:0,lines:[{design:"",location:"MADAM NOOR AL MAADEED (LIVING AREA)",quality:"",colors:"",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:0.25,amount:0,ship:"Mon Sep 07 2026 00:00:00 GMT+0700 (GMT+07:00)",post:"",ref:""}],source:"import",salesName:""},
  {id:"doc-SO-SC 0360-26",market:"FOREIGN",type:"SO",no:"SC 0360/26",designId:"SO-SC 0360-26",customer:"GALLERY FRANCAIS",project:"MADAM NOOR AL MAADEED",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"",status:"APPROVED",openDate:"2026-09-08",actualShip:"",extra:0,lines:[{design:"",location:"MADAM NOOR AL MAADEED",quality:"",colors:"",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:0.25,amount:0,ship:"",post:"",ref:""}],source:"import",salesName:""},
  {id:"doc-SO-SC 0361-26",market:"FOREIGN",type:"SO",no:"SC 0361/26",designId:"SO-SC 0361-26",customer:"GALLERY FRANCAIS",project:"NOOR AL BAKER - RUG 1 (OPTION 04)",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"",status:"APPROVED",openDate:"2026-09-07",actualShip:"",extra:0,lines:[{design:"",location:"NOOR AL BAKER - RUG 1 (OPTION 04)",quality:"",colors:"",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:1.0,amount:0,ship:"",post:"",ref:""}],source:"import",salesName:""},
  {id:"doc-SO-SC 0362-26",market:"FOREIGN",type:"SO",no:"SC 0362/26",designId:"SO-SC 0362-26",customer:"M.R. EVANS TRADING CO.,LTD. •",project:"PO VANCOUVER CLUB (OPTION 4)",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"",status:"APPROVED",openDate:"2026-09-08",actualShip:"",extra:0,lines:[{design:"",location:"PO VANCOUVER CLUB (OPTION 4)",quality:"HWO-550CUT(PH:10MM.)",colors:"",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:0.16,amount:0,ship:"",post:"",ref:""}],source:"import",salesName:""},
  {id:"doc-SO-SC 0363-26",market:"FOREIGN",type:"SO",no:"SC 0363/26",designId:"SO-SC 0363-26",customer:"M.R. EVANS TRADING CO.,LTD.",project:"VANCOUVER CLUB (OPTION 2)",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"",status:"APPROVED",openDate:"2026-09-08",actualShip:"",extra:0,lines:[{design:"",location:"VANCOUVER CLUB (OPTION 2)",quality:"",colors:"",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:0.2,amount:0,ship:"",post:"",ref:""}],source:"import",salesName:""},
  {id:"doc-SO-SC 0364-26",market:"FOREIGN",type:"SO",no:"SC 0364/26",designId:"SO-SC 0364-26",customer:"ART RUGS LTD. / NINA BURGESS",project:"CS4952 CONCENTRIC",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"",status:"APPROVED",openDate:"2026-09-07",actualShip:"",extra:0,lines:[{design:"",location:"CS4952 CONCENTRIC",quality:"",colors:"",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:0.09,amount:0,ship:"",post:"",ref:""}],source:"import",salesName:""},
  {id:"doc-SO-SC 0365-26",market:"FOREIGN",type:"SO",no:"SC 0365/26",designId:"SO-SC 0365-26",customer:"ART RUGS LTD. / NINA BURGESS",project:"CS 4953 CONCENTRIC",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"",status:"APPROVED",openDate:"2026-09-07",actualShip:"",extra:0,lines:[{design:"",location:"CS 4953 CONCENTRIC",quality:"",colors:"",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:0.09,amount:0,ship:"",post:"",ref:""}],source:"import",salesName:""},
  {id:"doc-SO-SC 0366-26",market:"FOREIGN",type:"SO",no:"SC 0366/26",designId:"SO-SC 0366-26",customer:"ROLLS SUPPLY W.L.L.",project:"HHSM OFFICE",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"แต่งเสร็จ / ไม่ได้ส่งออก",status:"APPROVED",openDate:"2026-09-08",actualShip:"",extra:0,lines:[{design:"",location:"HHSM OFFICE",quality:"",colors:"",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:0.09,amount:0,ship:"",post:"",ref:""}],source:"import",salesName:""},
  {id:"doc-SO-SC 0367-26",market:"FOREIGN",type:"SO",no:"SC 0367/26",designId:"SO-SC 0367-26",customer:"INNOVATIVE",project:"IC#3403(F)",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"",status:"APPROVED",openDate:"2026-09-09",actualShip:"",extra:0,lines:[{design:"NHT077-2(B)SO",location:"IC#3403(F)",quality:"HWO-450 CUT (PH=9 MM.)",colors:"6",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:0.21,amount:0,ship:"",post:"",ref:""}],source:"import",salesName:"K. NATPALAT"},
  {id:"doc-SO-SC 0368-26",market:"FOREIGN",type:"SO",no:"SC 0368/26",designId:"SO-SC 0368-26",customer:"ROLLS SUPPLY W.L.L.",project:"GCC26",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"ใช้ไหม Surplus ได้",status:"APPROVED",openDate:"2026-09-11",actualShip:"",extra:0,lines:[{design:"RLS-26-069-03_SO",location:"GCC26",quality:"HWO-450 CUT (PH=9 MM.)",colors:"2",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:0.27,amount:0,ship:"",post:"",ref:""}],source:"import",salesName:"K.PRAPOL"},
  {id:"doc-SO-SC 0371-26",market:"FOREIGN",type:"SO",no:"SC 0371/26",designId:"SO-SC 0371-26",customer:"ART RUGS LTD./LOOPHOUSE",project:"CS4956",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"",status:"APPROVED",openDate:"2026-09-25",actualShip:"",extra:0,lines:[{design:"L2606_R1S1_SO_PRO",location:"CS4956",quality:"HWO-550CUT(PH:9MM.)UNTWISTED YARN&(PH::8MM.) UNTWISTED YARN",colors:"3",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:0.09,amount:0,ship:"",post:"",ref:""}],source:"import",salesName:"Prapol"},
  {id:"doc-SO-SC 0369-26",market:"FOREIGN",type:"SO",no:"SC 0369/26",designId:"SO-SC 0369-26",customer:"ROLLS SUPPLY W.L.L.",project:"CPCMW6",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"S/O 0366/26 (COLOR #1)",status:"APPROVED",openDate:"2026-09-12",actualShip:"",extra:0,lines:[{design:"RLS-26-068-01_SO",location:"CPCMW6",quality:"HWO-450 CUT WITH CARVING (PH=9 MM.)",colors:"5",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:0.16,amount:0,ship:"",post:"",ref:"S/O 0366/26 (COLOR #1)"}],source:"import",salesName:"K.PRAPOL"},
  {id:"doc-SO-SC 0378-26",market:"FOREIGN",type:"SO",no:"SC 0378/26",designId:"SO-SC 0378-26",customer:"ROLLS SUPPLY W.L.L.",project:"CPCMW6",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"S/O 0366/26 (DESIGN, QUALITY, COLOR #2), POM ลูกค้า (COLOR #1)",status:"APPROVED",openDate:"2026-09-14",actualShip:"",extra:0,lines:[{design:"RLS-26-067-01_SO",location:"CPCMW6",quality:"HWO-450 CUT WITH CARVING (PH=9 MM.)",colors:"2",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:0.09,amount:0,ship:"",post:"",ref:"S/O 0366/26 (DESIGN, QUALITY, COLOR #2), POM ลูกค้า (COLOR #1)"}],source:"import",salesName:"K.PRAPOL"},
  {id:"doc-SO-SC 0370-26",market:"FOREIGN",type:"SO",no:"SC 0370/26",designId:"SO-SC 0370-26",customer:"SIAM CARPETS",project:"QUALITY SAMPLE",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"S/O 0400/25 (QUALITY, DESIGN, COLORS)",status:"APPROVED",openDate:"2026-09-14",actualShip:"",extra:0,lines:[{design:"ART-25-014-00_SO_50X50",location:"QUALITY SAMPLE",quality:"HWO-650 CUT (HIGHT PH:15MM., LOW PH:6MM.) WITH CARVING",colors:"3",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:0.25,amount:0,ship:"",post:"",ref:"S/O 0400/25 (QUALITY, DESIGN, COLORS)"}],source:"import",salesName:"K.PRAPOL"},
  {id:"doc-SO-SC 0372-26",market:"FOREIGN",type:"SO",no:"SC 0372/26",designId:"SO-SC 0372-26",customer:"SIAM CARPETS",project:"QUALITY SAMPLE",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"S/O CC 065/26 (QUALITY, COLORS)",status:"APPROVED",openDate:"2026-09-12",actualShip:"",extra:0,lines:[{design:"CTL-18-029-00_SO_CARVING_50X50",location:"QUALITY SAMPLE",quality:"HWO-650 CUT (PH=12 MM.) & HWO-450 CUT (PH=8 MM.)",colors:"11",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:0.25,amount:0,ship:"",post:"",ref:"S/O CC 065/26 (QUALITY, COLORS)"}],source:"import",salesName:"K.PRAPOL"},
  {id:"doc-SO-SC 0373-26",market:"FOREIGN",type:"SO",no:"SC 0373/26",designId:"SO-SC 0373-26",customer:"SIAM CARPETS",project:"QUALITY SAMPLE",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"S/O 0052/26 (QUALITY, COLORS)",status:"APPROVED",openDate:"2026-09-12",actualShip:"",extra:0,lines:[{design:"L2512_R10S3_SO_50X50",location:"QUALITY SAMPLE",quality:"HWO-750 CUT & HWO/PRSK-750 CUT & HWO/SPSK-750 CUT (PH=15 TO 6 MM.) WITH CARVING",colors:"12",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:0.25,amount:0,ship:"",post:"",ref:"S/O 0052/26 (QUALITY, COLORS)"}],source:"import",salesName:"K.PRAPOL"},
  {id:"doc-SO-SC 0374-26",market:"FOREIGN",type:"SO",no:"SC 0374/26",designId:"SO-SC 0374-26",customer:"SIAM CARPETS",project:"QUALITY SAMPLE",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"S/O 0150/26 (QUALITY, COLORS) / 25% TIP SHEAR",status:"APPROVED",openDate:"2026-09-12",actualShip:"",extra:0,lines:[{design:"L2606_R2S1_SO_50X50",location:"QUALITY SAMPLE",quality:"HWO-450 CUT (PH:7MM.) & LOOP (PH:6, 7 MM.) & SIGNATURE LOOP (PH:5MM.) & RANDOM LOOP (PH:5MM.) WITH T/S 25%",colors:"6",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:0.25,amount:0,ship:"",post:"",ref:"S/O 0150/26 (QUALITY, COLORS)"}],source:"import",salesName:"K.PRAPOL"},
  {id:"doc-SO-SC 0375-26",market:"FOREIGN",type:"SO",no:"SC 0375/26",designId:"SO-SC 0375-26",customer:"SIAM CARPETS",project:"QUALITY SAMPLES",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"S/O 0314/25 (QUALITY, COLORS)",status:"APPROVED",openDate:"2026-09-12",actualShip:"",extra:0,lines:[{design:"RLS-25-042-02_OP1_SO_50X50",location:"QUALITY SAMPLES",quality:"HWO-550 CUT WITH CARVING (PH=11 MM.)",colors:"4",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:0.25,amount:0,ship:"",post:"",ref:"S/O 0314/25 (QUALITY, COLORS)"}],source:"import",salesName:"K.PRAPOL"},
  {id:"doc-SO-SC 0376-26",market:"FOREIGN",type:"SO",no:"SC 0376/26",designId:"SO-SC 0376-26",customer:"SIAM CARPETS",project:"QUALITY SAMPLE",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"S/O 0108/26 (QUALITY, COLORS)",status:"APPROVED",openDate:"2026-09-12",actualShip:"",extra:0,lines:[{design:"RLS-26-020-04_SO_50X50",location:"QUALITY SAMPLE",quality:"HWO-450 HI/LOW CUT (PH=10, 8 MM.)",colors:"1",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:0.25,amount:0,ship:"",post:"",ref:"S/O 0108/26 (QUALITY, COLORS)"}],source:"import",salesName:"K.PRAPOL"},
  {id:"doc-SO-SC 0377-26",market:"FOREIGN",type:"SO",no:"SC 0377/26",designId:"SO-SC 0377-26",customer:"SIAM CARPETS",project:"QUALITY SAMPLE",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"S/O 0182/26 (QUALITY, COLORS)",status:"APPROVED",openDate:"2026-09-12",actualShip:"",extra:0,lines:[{design:"RLS-26-042-04_SO_50X50",location:"QUALITY SAMPLE",quality:"HWO/BBVC-450 CUT & LOOP WITH CARVING (PH=9 MM.)",colors:"10",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:0.25,amount:0,ship:"",post:"",ref:"S/O 0182/26 (QUALITY, COLORS)"}],source:"import",salesName:"K.PRAPOL"},
  {id:"doc-SO-SC 0381-26",market:"FOREIGN",type:"SO",no:"SC 0381/26",designId:"SO-SC 0381-26",customer:"GALLERY",project:"HAMAD VILLA",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"M/O 001/19 (COLOR #11) / พรมตัวอย่าง 1 ผืน มี 4 OPTION \nOPTION 1 อ้างสี #5003 ของ M/O 001/19 (COLOR #11)\nOPTION 2 #5003 + 10%\nOPTION 3 #5003 + 20%\nOPTION 4 #5003 + 30%",status:"APPROVED",openDate:"2026-09-17",actualShip:"",extra:0,lines:[{design:"GFC-26-090-00_SO1-4",location:"HAMAD VILLA",quality:"HWO-450 CUT (PH=9 MM.)",colors:"4",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:0.09,amount:0,ship:"",post:"",ref:"M/O 001/19 (COLOR #11)"}],source:"import",salesName:"K.PRAPOL"},
  {id:"doc-SO-SC 0384-26",market:"FOREIGN",type:"SO",no:"SC 0384/26",designId:"SO-SC 0384-26",customer:"GALLERY",project:"HAMAD VILLA",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"M/O 001/19 (COLOR #11) / พรม 1 ชิ้นมี 4 OPTION\n- OPTION 1 #5003 อ้างสี M/O 001/19 (COLOR #11)\n- OPTION 2 #5003 เข้มขึ้น +10%\n- OPTION 3 #5003 เข้มขึ้น +20%\n- OPTION 4 #5003 เข้มขึ้น +30%",status:"APPROVED",openDate:"2026-09-17",actualShip:"",extra:0,lines:[{design:"GFC-26-090-00_SO1-4",location:"HAMAD VILLA",quality:"HWO-450 CUT (PH=9 MM.)",colors:"4",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:0.09,amount:0,ship:"",post:"",ref:"M/O 001/19 (COLOR #11)"}],source:"import",salesName:"K.PRAPOL"},
  {id:"doc-SO-SC 0382-26",market:"FOREIGN",type:"SO",no:"SC 0382/26",designId:"SO-SC 0382-26",customer:"SIAM CARPETS",project:"ทดสอบไหม NYLON",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"",status:"APPROVED",openDate:"2026-09-17",actualShip:"",extra:0,lines:[{design:"PLAIN COLOR",location:"ทดสอบไหม NYLON",quality:"HPA-450 CUT & LOOP (PH=9 MM.)",colors:"1",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:0.09,amount:0,ship:"",post:"",ref:""}],source:"import",salesName:"แผนก QC"},
  {id:"doc-SO-SC 0383-26",market:"FOREIGN",type:"SO",no:"SC 0383/26",designId:"SO-SC 0383-26",customer:"SIAM CARPETS",project:"ทดสอบไหม NYLON",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"",status:"APPROVED",openDate:"2026-09-17",actualShip:"",extra:0,lines:[{design:"PLAIN COLOR",location:"ทดสอบไหม NYLON",quality:"HPA-450 CUT & LOOP (PH=9 MM.)",colors:"1",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:0.09,amount:0,ship:"",post:"",ref:""}],source:"import",salesName:"แผนก QC"},
  {id:"doc-SO-SC 0379-26",market:"FOREIGN",type:"SO",no:"SC 0379/26",designId:"SO-SC 0379-26",customer:"SIAM CARPETS",project:"ทดสอบไหม NYLON",pi:"",inv:"",incoterms:"",currency:"USD",remarks:"",status:"APPROVED",openDate:"2026-09-16",actualShip:"",extra:0,lines:[{design:"PLAIN COLOR",location:"ทดสอบไหม NYLON",quality:"HPA-450 CUT & LOOP (PH=9 MM.)",colors:"1",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:0.09,amount:0,ship:"",post:"",ref:""}],source:"import",salesName:"แผนก QC"},
  {id:"doc-SO-D 171-26",market:"DOMESTIC",type:"SO",no:"D 171/26",designId:"SO-D 171-26",customer:"บริษัท อาณาสรา ดีเวลลอปเมนท์ จำกัด",project:"HANN RESIDENCE",pi:"",inv:"",incoterms:"",currency:"THB",remarks:"",status:"APPROVED",openDate:"2026-09-07",actualShip:"",extra:0,lines:[{design:"",location:"HANN RESIDENCE",quality:"",colors:"",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:0.09,amount:0,ship:"",post:"",ref:""}],source:"import",salesName:""},
  {id:"doc-SO-D 176-26",market:"DOMESTIC",type:"SO",no:"D 176/26",designId:"SO-D 176-26",customer:"บริษัท อาณาสรา ดีเวลลอปเมนท์ จำกัด",project:"HANN RESIDENCE",pi:"",inv:"",incoterms:"",currency:"THB",remarks:"D-171/26 สำหรับลาย&คุณภาพ / งานนี้เน้นสีต้องเหมือน POM 2023 มากที่สุด",status:"APPROVED",openDate:"2026-09-11",actualShip:"",extra:0,lines:[{design:"THA-26-186-01_so",location:"HANN RESIDENCE",quality:"HBBVC-550 HI-CUT (PH= 10, 8 MM.)",colors:"4",pack:"",pcs:1,size:"",unit:"M2",qty:1,price:null,sqm:0.09,amount:0,ship:"",post:"",ref:"D-171/26 สำหรับลาย&คุณภาพ"}],source:"import",salesName:"มัทนา อุระรื่น"},
  {id:"doc-SO-D0177-26",market:"DOMESTIC",type:"SO",no:"D0177/26",designId:"SO-D0177-26",customer:"บริษัท อาสาเฟอร์นิเจอร์ จำกัด",project:"D0177/26",pi:"",inv:"",incoterms:"",currency:"THB",remarks:"",status:"APPROVED",openDate:"2026-09-14",actualShip:"",extra:0,lines:[{design:"",location:"",quality:"",colors:"",pack:"",pcs:null,size:"",unit:"M2",qty:null,price:null,sqm:0.0,amount:0,ship:"",post:"",ref:""}],source:"import",salesName:"มัทนา อุระรื่น"},
  {id:"doc-SO-D0178-26",market:"DOMESTIC",type:"SO",no:"D0178/26",designId:"SO-D0178-26",customer:"บริษัท ปิยะ สมบัตื ทองหล่อ จำกัด",project:"แพนแปซิฟิค ทองหล่อ",pi:"",inv:"",incoterms:"",currency:"THB",remarks:"LABEL พิมพ์แยกสีแต่ละช่องให้ด้วย",status:"APPROVED",openDate:"2026-09-14",actualShip:"",extra:0,lines:[{design:"THA-26-185-00_SO",location:"แพนแปซิฟิค ทองหล่อ",quality:"HWO/HBBVC-450CUT(PH=8MM.)",colors:"6",pack:"",pcs:null,size:"",unit:"M2",qty:null,price:null,sqm:0.0,amount:0,ship:"",post:"",ref:""}],source:"import",salesName:"ณัฐพิสิษฐ์ ชวโรจน์"},
  {id:"doc-SO-D0179-26",market:"DOMESTIC",type:"SO",no:"D0179/26",designId:"SO-D0179-26",customer:"บริษัท ปิยะ สมบัตื ทองหล่อ จำกัด",project:"แพนแปซิฟิค ทองหล่อ",pi:"",inv:"",incoterms:"",currency:"THB",remarks:"S/O:D-267/25 สำหรับเทคนิคการทอ เท่านั้น",status:"APPROVED",openDate:"2026-09-14",actualShip:"",extra:0,lines:[{design:"THA-25322-05_SO",location:"แพนแปซิฟิค ทองหล่อ",quality:"HWO-450CUT/LOOP_OVERTUFT",colors:"8",pack:"",pcs:null,size:"",unit:"M2",qty:null,price:null,sqm:0.0,amount:0,ship:"",post:"",ref:"S/O:D-267/25 สำหรับเทคนิคการทอ เท่านั้น"}],source:"import",salesName:"ณัฐพิสิษฐ์ ชวโรจน์"},
  {id:"doc-SO-D0180-26",market:"DOMESTIC",type:"SO",no:"D0180/26",designId:"SO-D0180-26",customer:"บริษัท ยัวร์ คอนเซ็ปต์ จำกัด",project:"SHOP GUCCI",pi:"",inv:"",incoterms:"",currency:"THB",remarks:"",status:"APPROVED",openDate:"2026-09-16",actualShip:"",extra:0,lines:[{design:"พรมสีเดียวไม่มีลาย",location:"SHOP GUCCI",quality:"HPA-450CUT(PH=8MM.)",colors:"",pack:"",pcs:null,size:"",unit:"M2",qty:null,price:null,sqm:0.0,amount:0,ship:"",post:"",ref:""}],source:"import",salesName:"มัทนา อุระรื่น"}
  ];
  let docs = readJson(KEY_DOCS, null);
  if (!Array.isArray(docs) || !docs.length) docs = seedSalesDocs.map((d) => ({ ...d, lines: d.lines.map((l) => ({ ...l })) }));
  const saveDocs = () => writeJson(KEY_DOCS, docs);
  const docSeries = (d) => seriesKey(d.market, d.type);
  function stamp(doc) { // คำนวณ seq / yy จากเลขที่ (ถ้ารูปแบบตรงกับชุดเลข)
    const p = parseNo(docSeries(doc), doc.no);
    doc.seq = p ? p.seq : null;
    doc.yy = p ? p.yy : null;
    return doc;
  }
  function nextSeq(key, yy) {
    let max = 0;
    docs.forEach((d) => { if (docSeries(d) === key && d.yy === yy && d.seq != null) max = Math.max(max, d.seq); });
    const forced = cfg.series[key].next; // เลขที่บังคับใช้เฉพาะปีปัจจุบัน
    return forced > 0 && yy === REPORT_DATE.getFullYear() % 100 ? forced : max + 1;
  }
  const suggestNo = (market, type, yy) => { const key = seriesKey(market, type); return formatNo(key, nextSeq(key, yy), yy); };
  const docSqm = (d) => d.lines.reduce((t, l) => t + num(l.sqm), 0);
  const docAmount = (d) => d.lines.reduce((t, l) => t + num(l.amount), 0) + num(d.extra);
  const lineShip = (d, l) => d.actualShip || l.post || l.ship || "";

  /* ---------- วันที่จาก Excel ---------- */
  function fixYear(y) { return y > 2400 ? y - 543 : y < 100 ? y + 2000 : y; }
  // คืน null | {kind:"month",y,m} | {kind:"day",certain,...}
  function parseCell(v) {
    if (v === null || v === undefined || v === "") return null;
    if (v instanceof Date && !Number.isNaN(v.getTime())) return { kind: "day", certain: true, y: v.getFullYear(), m: v.getMonth() + 1, d: v.getDate() };
    if (typeof v === "number") {
      if (v < 20000 || v > 80000) return null;
      const dt = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000);
      const a = { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
      // เซลล์วันที่ที่ Excel แปลงจาก dd/mm เป็น mm/dd จะได้วันที่ ≤ 12 เสมอ → วันที่กำกวมเมื่อ d ≤ 12
      if (a.d > 12 || a.d === a.m) return { kind: "day", certain: true, ...a };
      return { kind: "day", certain: false, asis: a, swapped: { y: a.y, m: a.d, d: a.m } };
    }
    const t = String(v).trim();
    let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return valid({ kind: "day", certain: true, y: +m[1], m: +m[2], d: +m[3] });
    m = t.match(/^(\d{1,2})\s*\/+\s*(\d{1,2})\s*\/\s*(\d{2,4})/);
    if (m) return valid({ kind: "day", certain: true, y: fixYear(+m[3]), m: +m[2], d: +m[1] });
    m = t.match(/^(?:x{1,2}|\d{0,2})\s*\/+\s*(\d{1,2})\s*\/\s*(\d{4})/i);
    if (m) return valid({ kind: "month", y: fixYear(+m[2]), m: +m[1] });
    return null;
  }
  function valid(p) {
    if (p.y < 2000 || p.y > 2100 || p.m < 1 || p.m > 12) return null;
    if (p.kind === "day") { const c = new Date(p.y, p.m - 1, p.d, 12); if (c.getMonth() !== p.m - 1 || c.getDate() !== p.d) return null; }
    return p;
  }
  // ตัดสินใจวันเปิด M/O ตามลำดับเลข M/O: เลือกตัวเลือกที่ไม่ผิดลำดับและไม่ใช่วันในอนาคต
  function resolveOpen(parsed, mode) {
    const n = parsed.length, out = new Array(n).fill("");
    const certain = parsed.map((p) => (p && p.kind === "day" && p.certain ? asDate(p) : null));
    const nextCertain = (k) => { for (let j = k + 1; j < n; j++) if (certain[j]) return certain[j]; return null; };
    let prev = null, fixed = 0;
    for (let k = 0; k < n; k++) {
      const p = parsed[k];
      if (!p || p.kind !== "day") continue;
      let pick;
      if (p.certain) pick = p;
      else if (mode === "asis") pick = p.asis;
      else if (mode === "swap") pick = p.swapped;
      else {
        const hi = nextCertain(k), lo = prev;
        const score = (c) => {
          const d = asDate(c);
          if (d > REPORT_DATE) return 1e6;
          let s = 0;
          if (lo && d < new Date(lo.getTime() - 5 * 86400000)) s += (lo - d) / 86400000;
          if (hi && d > new Date(hi.getTime() + 5 * 86400000)) s += (d - hi) / 86400000;
          return s;
        };
        pick = score(p.swapped) <= score(p.asis) ? p.swapped : p.asis;
      }
      if (!p.certain && pick === p.swapped) fixed++;
      out[k] = toISO(pick);
      const d = asDate(pick);
      prev = !prev || d > prev ? d : prev;
    }
    return { out, fixed };
  }
  // วันส่งออก: ยึดวัน Postpone ที่เป็นข้อความก่อน แล้วเลือกตัวเลือกที่ห่างวันเปิด 0–240 วัน
  function resolveShip(p, openISO, postISO, mode) {
    if (!p) return { value: "", fixed: false };
    if (p.kind === "month") return { value: monthISO(p), fixed: false };
    if (p.certain) return { value: toISO(p), fixed: false };
    if (mode === "asis") return { value: toISO(p.asis), fixed: false };
    if (mode === "swap") return { value: toISO(p.swapped), fixed: true };
    const cands = [p.swapped, p.asis];
    let pick = null;
    if (postISO && postISO.length === 10) pick = cands.find((c) => toISO(c) === postISO) || null;
    if (!pick && openISO) {
      const o = new Date(+openISO.slice(0, 4), +openISO.slice(5, 7) - 1, +openISO.slice(8, 10), 12);
      pick = cands.find((c) => { const lag = (asDate(c) - o) / 86400000; return lag >= 0 && lag <= 240; }) || null;
    }
    if (!pick) pick = cands[0];
    return { value: toISO(pick), fixed: pick === p.swapped };
  }

  /* ---------- นำเข้ารายงาน Excel ---------- */
  const numv = (v) => {
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    const t = txt(v).replace(/,/g, "");
    return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null;
  };
  function parseAoa(aoa, opts) {
    const market = opts.market, mode = opts.dateMode || "auto";
    let h = -1;
    for (let i = 0; i < Math.min(aoa.length, 20); i++) if ((aoa[i] || []).some((c) => /^m\/o/i.test(txt(c)))) { h = i; break; }
    if (h < 0) throw new Error("ไม่พบหัวตาราง M/O No. ในชีตนี้");
    const head = aoa[h].map(txt);
    const find = (re) => head.findIndex((t) => re.test(t));
    const col = {
      open: find(/^open date/i), cust: find(/^customer/i), po: find(/^po\.?\s*number/i), loc: find(/^location/i), mo: find(/^m\/o/i),
      quality: find(/^quality/i), pack: find(/^packaging/i), colors: find(/^colors?/i), pcs: find(/^pcs/i), size: find(/^carpet size/i),
      qty: find(/^quantity/i), price: find(/^unit price/i), amount: find(/^amount/i), inco: find(/^inco/i),
      disp: find(/^dispatch date/i), post: find(/^postpone/i), design: find(/^design/i), ref: find(/^ref/i),
      remarks: find(/^remarks/i), pi: find(/^pi no/i), inv: find(/^inv/i)
    };
    const blankHead = (c) => c >= 0 && txt(head[c] || "") === "";
    col.suffix = blankHead(col.mo + 1) ? col.mo + 1 : -1;
    col.unit = col.qty >= 0 && blankHead(col.qty + 1) ? col.qty + 1 : -1;
    col.extra = col.amount >= 0 && blankHead(col.amount + 1) ? col.amount + 1 : -1;
    const width = Math.max(...Object.values(col)) + 1;
    const cell = (row, c) => (c >= 0 && c < row.length ? row[c] : "");

    const stats = { rows: 0, docs: 0, lines: 0, sqm: 0, fixedOpen: 0, fixedShip: 0, skipped: 0, noOpen: 0, merged: 0 };
    const rawDocs = [], byNo = new Map();
    let block = { open: "", cust: "", po: "", inco: "", pi: "", inv: "" }, cur = null, prevLine = null;
    for (let i = h + 1; i < aoa.length; i++) {
      const row = aoa[i];
      if (!row || row.slice(0, width).every((c) => txt(c) === "")) continue;
      stats.rows++;
      if (row.some((c) => /to convert/i.test(txt(c)))) { stats.skipped++; continue; }
      const unitRaw = txt(cell(row, col.unit));
      if (unitRaw && !/^(m2|f2)$/i.test(unitRaw)) { stats.skipped++; continue; }

      const cust = txt(cell(row, col.cust));
      if (cust) block = { open: cell(row, col.open), cust, po: txt(cell(row, col.po)), inco: "", pi: "", inv: "" };
      else if (parseCell(cell(row, col.open))) block.open = cell(row, col.open);
      if (!cust && txt(cell(row, col.po)) && !block.po) block.po = txt(cell(row, col.po));
      if (txt(cell(row, col.inco))) block.inco = txt(cell(row, col.inco));
      if (txt(cell(row, col.pi))) block.pi = txt(cell(row, col.pi));
      if (txt(cell(row, col.inv))) block.inv = txt(cell(row, col.inv));

      const moV = txt(cell(row, col.mo));
      if (moV) {
        const sfx = txt(cell(row, col.suffix));
        const key = normNo(moV + sfx);
        cur = byNo.get(key);
        if (cur) stats.merged++;
        else { cur = { moRaw: moV, sfx, block, open: block.open, lines: [], extra: 0, remarks: [] }; byNo.set(key, cur); rawDocs.push(cur); }
        prevLine = null;
      }
      if (!cur) continue;

      const unit = (unitRaw || "M2").toUpperCase();
      const qty = numv(cell(row, col.qty)), price = numv(cell(row, col.price)), amount = numv(cell(row, col.amount));
      const design = txt(cell(row, col.design)), size = txt(cell(row, col.size)), location = txt(cell(row, col.loc));
      const extra = numv(cell(row, col.extra));
      if (extra && extra > 0) cur.extra += extra;
      const remark = txt(cell(row, col.remarks));
      if (remark) cur.remarks.push(remark);

      // แถวแปลงหน่วย: ขนาดเป็นเมตรและ ตร.ม. ของแถว F2 ก่อนหน้า (ไม่มีแบบ/ราคา)
      if (!moV && prevLine && prevLine.unit === "F2" && prevLine.metric == null && !design && price == null && amount == null && unit === "M2" && qty > 0) {
        prevLine.metric = qty; continue;
      }
      if (!moV && !design && qty == null && price == null && amount == null && !unitRaw) continue;

      const line = {
        design, location, quality: txt(cell(row, col.quality)), colors: txt(cell(row, col.colors)), pack: txt(cell(row, col.pack)),
        pcs: numv(cell(row, col.pcs)), size, unit, qty, price, amount,
        dispRaw: cell(row, col.disp), postRaw: cell(row, col.post), ref: txt(cell(row, col.ref)), metric: null
      };
      cur.lines.push(line); prevLine = line;
    }

    // วันเปิด M/O
    const openParsed = rawDocs.map((d) => parseCell(d.open));
    const { out: openISO, fixed } = resolveOpen(openParsed, mode);
    stats.fixedOpen = fixed;
    const key = seriesKey(market, "MO");
    const yyDefault = REPORT_DATE.getFullYear() % 100;
    const result = rawDocs.map((rd, k) => {
      const lines = rd.lines.map((l) => {
        const pi = parseCell(l.postRaw);
        const post = pi ? (pi.kind === "day" ? (pi.certain ? toISO(pi) : toISO(pi.swapped)) : monthISO(pi)) : "";
        const s = resolveShip(parseCell(l.dispRaw), openISO[k], post, mode);
        if (s.fixed) stats.fixedShip++;
        const sqm = l.unit === "F2" ? (l.metric != null ? l.metric : num(l.qty) * F2_TO_M2) : num(l.qty);
        const amount = l.amount != null ? l.amount : (l.price != null && l.qty != null ? l.price * l.qty : 0);
        return { design: l.design, location: l.location, quality: l.quality, colors: l.colors, pack: l.pack, pcs: l.pcs, size: l.size, unit: l.unit, qty: l.qty, price: l.price, sqm: round(sqm), amount: round(amount, 2), ship: s.value, post, ref: l.ref };
      });
      const firstShip = (lines.find((l) => l.ship) || {}).ship || "";
      lines.forEach((l) => { if (!l.ship) l.ship = firstShip; });
      const sfx = rd.sfx.match(/(\d{2})/);
      const yy = sfx ? Number(sfx[1]) : yyDefault;
      const seq = /^\d+$/.test(rd.moRaw) ? Number(rd.moRaw) : null;
      const doc = {
        id: uid(), market, type: "MO", no: seq != null ? formatNo(key, seq, yy) : `MO ${rd.moRaw}${rd.sfx}`,
        openDate: openISO[k] || "", customer: rd.block.cust, project: rd.block.po, pi: rd.block.pi, inv: rd.block.inv, incoterms: rd.block.inco,
        currency: MARKETS[market].currency, remarks: rd.remarks.join(" | "), status: "OPEN", actualShip: "", extra: round(rd.extra, 2),
        lines, source: "import"
      };
      if (!doc.openDate) stats.noOpen++;
      stats.lines += lines.length;
      stats.sqm += lines.reduce((t, l) => t + l.sqm, 0);
      return stamp(doc);
    });
    stats.docs = result.length;
    return { docs: result, stats };
  }
  function importWorkbook(wb, sheetName, opts) {
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: "", raw: true });
    return parseAoa(aoa, opts);
  }

  /* ---------- KPI ---------- */
  const blankBucket = () => ({ inSqm: 0, inAmt: {}, inCount: 0, outSqm: 0, outAmt: {}, outActual: 0, outCount: 0 });
  const addMoney = (o, cur, v) => { if (v) o[cur] = (o[cur] || 0) + v; };
  const inSel = (s, sel) => {
    if (!s || +s.slice(0, 4) !== sel.year) return false;
    if (sel.month && +s.slice(5, 7) !== sel.month) return false;
    if (sel.day) return s.length >= 10 && +s.slice(8, 10) === sel.day;
    return true;
  };
  function computeKpi(allDocs, market, sel) {
    const mos = allDocs.filter((d) => d.market === market && d.type === "MO");
    const sos = allDocs.filter((d) => d.market === market && d.type === "SO");
    const total = blankBucket();
    const months = Array.from({ length: 12 }, () => ({ ...blankBucket(), so: 0, soApproved: 0 }));
    const days = new Map();
    const day = (n) => { if (!days.has(n)) days.set(n, blankBucket()); return days.get(n); };
    const inDocs = new Set(), outDocs = new Set();
    mos.forEach((doc) => {
      const cur = doc.currency, sq = docSqm(doc), amt = docAmount(doc);
      const od = doc.openDate;
      if (od && od.length === 10 && +od.slice(0, 4) === sel.year) {
        const mIdx = +od.slice(5, 7) - 1, dNo = +od.slice(8, 10);
        const b = months[mIdx]; b.inSqm += sq; addMoney(b.inAmt, cur, amt); b.inCount++;
        if (sel.month === mIdx + 1) { const db = day(dNo); db.inSqm += sq; addMoney(db.inAmt, cur, amt); db.inCount++; }
        if (inSel(od, sel)) { total.inSqm += sq; addMoney(total.inAmt, cur, amt); total.inCount++; inDocs.add(doc.id); }
      }
      const shipped = new Set();
      doc.lines.forEach((l, idx) => {
        const sd = lineShip(doc, l);
        if (!sd || +sd.slice(0, 4) !== sel.year) return;
        const mIdx = +sd.slice(5, 7) - 1, la = num(l.amount) + (idx === 0 ? num(doc.extra) : 0), sq2 = num(l.sqm);
        const b = months[mIdx]; b.outSqm += sq2; addMoney(b.outAmt, cur, la); shipped.add(mIdx);
        if (sel.month === mIdx + 1 && sd.length >= 10) { const db = day(+sd.slice(8, 10)); db.outSqm += sq2; addMoney(db.outAmt, cur, la); }
        if (inSel(sd, sel)) {
          total.outSqm += sq2; addMoney(total.outAmt, cur, la); if (doc.actualShip) total.outActual += sq2; outDocs.add(doc.id);
        }
      });
      shipped.forEach((mIdx) => { months[mIdx].outCount++; });
    });
    total.outCount = outDocs.size;
    let soTotal = 0, soApproved = 0;
    sos.forEach((doc) => {
      const od = doc.openDate;
      if (!od || +od.slice(0, 4) !== sel.year) return;
      const mIdx = +od.slice(5, 7) - 1;
      months[mIdx].so++; if (doc.status === "APPROVED") months[mIdx].soApproved++;
      if (inSel(od, sel)) { soTotal++; if (doc.status === "APPROVED") soApproved++; }
    });
    return { total, months, days, inDocs, outDocs, soTotal, soApproved };
  }

  /* ---------- Sale ผู้ดำเนินการ ---------- */
  const NO_SALE = "ไม่ระบุ Sale";
  const custKey = (c) => txt(c).replace(/\s+/g, " ").toUpperCase();
  const costState = () => { try { return window.CostEngine ? window.CostEngine.getState().S : null; } catch (e) { return null; } };
  // ลำดับ: Sale ที่ระบุรายใบ → Sale ของ Design ที่เชื่อมอยู่ → จับคู่ลูกค้า (หน้านี้) → จับคู่ลูกค้าของหน้าต้นทุน Design
  function derivedSale(customer, designId) {
    if (designId && typeof designs !== "undefined" && typeof costSaleOf === "function") {
      const row = designs.find((x) => x.id === designId), v = row ? costSaleOf(row) : "";
      if (v) return v;
    }
    const k = custKey(customer);
    if (k && cfg.custSale[k]) return cfg.custSale[k];
    const cs = costState();
    return (cs && k && cs.customerSale && cs.customerSale[k]) || "";
  }
  const saleOf = (d) => d.sale || derivedSale(d.customer, d.designId);
  const saleName = (d) => saleOf(d) || NO_SALE;
  const allSaleNames = () => {
    const set = new Set(Object.values(cfg.custSale));
    docs.forEach((d) => { if (d.sale) set.add(d.sale); });
    const cs = costState();
    if (cs) [...Object.values(cs.customerSale || {}), ...Object.values(cs.projectSale || {})].forEach((v) => { if (v) set.add(v); });
    return [...set].filter(Boolean).sort((a, b) => a.localeCompare(b, "th"));
  };
  // KPI แยก Sale: คืน Map ชื่อ Sale → ผล computeKpi ของเอกสารเฉพาะ Sale นั้น
  function computeBySale(allDocs, market, sel) {
    const groups = new Map();
    allDocs.filter((d) => d.market === market).forEach((d) => { const n = saleName(d); if (!groups.has(n)) groups.set(n, []); groups.get(n).push(d); });
    const out = new Map();
    groups.forEach((list, n) => out.set(n, computeKpi(list, market, sel)));
    return out;
  }

  window.SalesEngine = { parseAoa, parseCell, resolveOpen, computeKpi, computeBySale, saleOf, derivedSale, formatNo, parseNo, normNo, getDocs: () => docs, getCfg: () => cfg, F2_TO_M2 };
  /* ============================================================
     UI — หน้า "รายงานขาย"
     ============================================================ */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const curYY = () => REPORT_DATE.getFullYear() % 100;
  const SYM = { USD: "$", THB: "฿", EUR: "€" };
  const ui = { market: "FOREIGN", year: REPORT_DATE.getFullYear(), month: 0, day: 0, reg: "MO", scope: "all", search: "", sale: "", saleMetric: "inAmt", expanded: new Set(), wb: null };
  let K = null; // ผล KPI ล่าสุด
  let form = null; // สถานะฟอร์ม M/O / SO

  const fmtMoney = (n, d = 2) => (n || 0).toLocaleString("th-TH", { minimumFractionDigits: d, maximumFractionDigits: d });
  function money(obj, d = 2) {
    const ks = Object.keys(obj || {}).filter((k) => Math.abs(obj[k]) >= 0.005);
    return ks.length ? ks.map((k) => `${SYM[k] || k + " "}${fmtMoney(obj[k], d)}`).join(" + ") : "-";
  }
  function moneyFx(obj, d = 2) {
    let s = esc(money(obj, d));
    if (cfg.fx > 0 && obj && obj.USD) s += `<span class="sr-fxnote">≈ ฿${fmtMoney(obj.USD * cfg.fx + (obj.THB || 0), 0)}</span>`;
    return s;
  }
  const periodLabel = () => (ui.day ? `${ui.day} ${SHORT_MONTHS[ui.month - 1]} ${ui.year}` : ui.month ? `${monthNames[ui.month - 1]} ${ui.year}` : `ทั้งปี ${ui.year}`);
  const selNow = () => ({ year: ui.year, month: ui.month, day: ui.day });

  function yearsAvailable() {
    const ys = new Set([REPORT_DATE.getFullYear(), ui.year]);
    docs.forEach((d) => {
      if (d.openDate) ys.add(+d.openDate.slice(0, 4));
      d.lines.forEach((l) => { const s = lineShip(d, l); if (s) ys.add(+s.slice(0, 4)); });
    });
    return [...ys].filter(Boolean).sort((a, b) => b - a);
  }

  /* ---------- ส่วนแสดงผลหลัก ---------- */
  function renderTabs() {
    const cnt = (m) => docs.filter((d) => d.market === m && d.type === "MO").length;
    $("#srMarketTabs").innerHTML = Object.entries(MARKETS).map(([k, v]) => `<button data-sr="market" data-market="${k}" class="${ui.market === k ? "active" : ""}">รายงาน${v.label}<small>${k === "FOREIGN" ? "MO · SO SC" : "MO TH · SO D"} · ${v.currency} · ${cnt(k)} M/O</small></button>`).join("");
  }
  function renderPeriod() {
    $("#srYear").innerHTML = yearsAvailable().map((y) => `<option value="${y}" ${y === ui.year ? "selected" : ""}>${y}</option>`).join("");
    $("#srMonth").innerHTML = `<option value="0">ทั้งปี</option>` + monthNames.map((n, i) => `<option value="${i + 1}" ${ui.month === i + 1 ? "selected" : ""}>${n}</option>`).join("");
    const dim = ui.month ? new Date(ui.year, ui.month, 0).getDate() : 0;
    $("#srDay").innerHTML = `<option value="0">${ui.month ? "ทั้งเดือน" : "—"}</option>` + Array.from({ length: dim }, (_, i) => `<option value="${i + 1}" ${ui.day === i + 1 ? "selected" : ""}>${i + 1}</option>`).join("");
    $("#srDay").disabled = !ui.month;
    const names = [...new Set(docs.filter((d) => d.market === ui.market).map(saleName))].sort((a, b) => (a === NO_SALE) - (b === NO_SALE) || a.localeCompare(b, "th"));
    if (ui.sale && !names.includes(ui.sale)) ui.sale = "";
    $("#srSale").innerHTML = `<option value="">ทั้งหมด</option>` + names.map((n) => `<option value="${esc(n)}" ${ui.sale === n ? "selected" : ""}>${esc(n)}</option>`).join("");
    $("#srSaleList").innerHTML = allSaleNames().map((n) => `<option value="${esc(n)}">`).join("");
  }
  const scoped = () => (ui.sale ? docs.filter((d) => saleName(d) === ui.sale) : docs);
  function renderKpi() {
    K = computeKpi(scoped(), ui.market, selNow());
    const t = K.total, mk = MARKETS[ui.market];
    $("#srKpiTitle").textContent = `KPI ฝ่ายขาย${mk.label} · ${periodLabel()}${ui.sale ? ` · Sale: ${ui.sale}` : ""}`;
    const ratio = t.inSqm > 0 ? ` · ${Math.round((t.outSqm / t.inSqm) * 100)}% ของรับเข้า` : "";
    const avg = t.inSqm > 0 && t.inAmt[mk.currency] ? `${SYM[mk.currency]}${fmtMoney(t.inAmt[mk.currency] / t.inSqm)}` : "-";
    const cards = [
      ["", "รับเข้า (ตร.ม.)", fmtSqm(t.inSqm), `${fmtInt(t.inCount)} M/O ตามวันเปิด`],
      ["out", "ส่งออก (ตร.ม.)", fmtSqm(t.outSqm), `${fmtInt(t.outCount)} M/O${t.outActual > 0 ? ` · ยืนยันส่งจริง ${fmtSqm(t.outActual)}` : ""}${ratio}`],
      ["money", "ยอดขาย (ตามวันเปิด M/O)", moneyFx(t.inAmt, 0), `${mk.currency} · รวมยอดของ M/O ที่เปิดในช่วงนี้`],
      ["money2", "มูลค่าส่งออก", moneyFx(t.outAmt, 0), "ตามวันส่งออก"],
      ["cnt", "ยอดขายเฉลี่ย / ตร.ม.", avg, "ยอดขาย ÷ ตร.ม. รับเข้า"],
      ["so", "SO ตัวอย่าง", `${K.soApproved}/${K.soTotal}`, "Approved / ทั้งหมด (ตามวันที่ SO)"]
    ];
    $("#srKpi").innerHTML = cards.map(([c, l, v, n]) => `<article class="sr-kpi ${c}"><small>${l}</small><strong>${v}</strong><span>${n}</span></article>`).join("") +
      (ui.day ? `<small class="sr-hint" style="grid-column:1/-1">รายวันไม่รวมรายการที่ Dispatch ระบุเฉพาะเดือน (จะนับในยอดรายเดือนเท่านั้น)</small>` : "");
  }
  function sumMoney(list, key) { const o = {}; list.forEach((b) => Object.entries(b[key]).forEach(([c, v]) => addMoney(o, c, v))); return o; }
  /* ---------- ยอดขายแยก Sale ---------- */
  const saleSort = (a, b) => (a.n === NO_SALE) - (b.n === NO_SALE);
  function renderSaleSummary() {
    const cur = MARKETS[ui.market].currency;
    $("#srSaleTitle").textContent = `ยอดขายแยก Sale · ${periodLabel()}`;
    const rows = [...computeBySale(docs, ui.market, selNow()).entries()].map(([n, k]) => ({ n, t: k.total, so: k.soTotal, soA: k.soApproved })).filter((r) => r.t.inCount || r.t.outSqm || r.so);
    rows.sort((a, b) => saleSort(a, b) || (b.t.inAmt[cur] || 0) - (a.t.inAmt[cur] || 0) || b.t.inSqm - a.t.inSqm);
    const totAmt = rows.reduce((t, r) => t + (r.t.inAmt[cur] || 0), 0);
    $("#srSaleBody").innerHTML = rows.length ? rows.map((r) => {
      const share = totAmt > 0 ? ((r.t.inAmt[cur] || 0) / totAmt) * 100 : 0;
      return `<tr class="pick ${ui.sale === r.n ? "selected" : ""} ${r.n === NO_SALE ? "zero" : ""}" data-sr="pick-sale" data-sale="${esc(r.n)}"><td><strong>${esc(r.n)}</strong></td><td class="num">${fmtInt(r.t.inCount)}</td><td class="num">${fmtSqm(r.t.inSqm)}</td><td class="num">${moneyFx(r.t.inAmt)}</td><td style="min-width:120px">${share.toFixed(1)}%<span class="sr-bar"><i style="width:${share}%"></i></span></td><td class="num">${fmtSqm(r.t.outSqm)}</td><td class="num">${moneyFx(r.t.outAmt)}</td><td class="num">${r.soA}/${r.so}</td></tr>`;
    }).join("") : `<tr><td colspan="8"><div class="sr-empty">ช่วงเวลานี้ยังไม่มีรายการ</div></td></tr>`;
    const sum = (f) => rows.reduce((t, r) => t + f(r), 0), mo = {}, oa = {};
    rows.forEach((r) => { Object.entries(r.t.inAmt).forEach(([c, v]) => addMoney(mo, c, v)); Object.entries(r.t.outAmt).forEach(([c, v]) => addMoney(oa, c, v)); });
    $("#srSaleFoot").innerHTML = rows.length ? `<tr><td>รวม ${rows.length} Sale</td><td class="num">${fmtInt(sum((r) => r.t.inCount))}</td><td class="num">${fmtSqm(sum((r) => r.t.inSqm))}</td><td class="num">${moneyFx(mo)}</td><td></td><td class="num">${fmtSqm(sum((r) => r.t.outSqm))}</td><td class="num">${moneyFx(oa)}</td><td class="num">${sum((r) => r.soA)}/${sum((r) => r.so)}</td></tr>` : "";
  }
  const METRICS = { inAmt: "ยอดขาย (ตามวันเปิด M/O)", inSqm: "รับเข้า (ตร.ม.)", outSqm: "ส่งออก (ตร.ม.)", outAmt: "มูลค่าส่งออก" };
  function renderSaleMatrix() {
    const cur = MARKETS[ui.market].currency, metric = ui.saleMetric, isMoney = metric.endsWith("Amt");
    $("#srSaleMetric").value = metric;
    $("#srSaleMatrixTitle").textContent = `${METRICS[metric]} รายเดือนแยก Sale · ${ui.year}${isMoney ? ` (${cur})` : ""}`;
    const val = (m) => (isMoney ? m[metric][cur] || 0 : m[metric]);
    const f = (n) => (Math.abs(n) < 0.005 ? "-" : isMoney ? fmtMoney(n, 0) : fmtMoney(n, 1));
    const rows = [...computeBySale(docs, ui.market, { year: ui.year, month: 0, day: 0 }).entries()].map(([n, k]) => { const v = k.months.map(val); return { n, v, tot: v.reduce((t, x) => t + x, 0) }; }).filter((r) => r.v.some((x) => Math.abs(x) >= 0.005));
    rows.sort((a, b) => saleSort(a, b) || b.tot - a.tot);
    const hl = (i) => (ui.month === i + 1 ? "hl" : "");
    $("#srSaleMatrixHead").innerHTML = `<tr><th>Sale</th>${SHORT_MONTHS.map((m, i) => `<th class="num ${hl(i)}">${m}</th>`).join("")}<th class="num">รวม</th></tr>`;
    $("#srSaleMatrixBody").innerHTML = rows.length ? rows.map((r) => `<tr class="pick ${ui.sale === r.n ? "selected" : ""} ${r.n === NO_SALE ? "zero" : ""}" data-sr="pick-sale" data-sale="${esc(r.n)}"><td><strong>${esc(r.n)}</strong></td>${r.v.map((x, i) => `<td class="num ${hl(i)}">${f(x)}</td>`).join("")}<td class="num"><strong>${f(r.tot)}</strong></td></tr>`).join("") : `<tr><td colspan="14"><div class="sr-empty">ปี ${ui.year} ยังไม่มีข้อมูล</div></td></tr>`;
    $("#srSaleMatrixFoot").innerHTML = rows.length ? `<tr><td>รวม</td>${Array.from({ length: 12 }, (_, i) => `<td class="num ${hl(i)}">${f(rows.reduce((t, r) => t + r.v[i], 0))}</td>`).join("")}<td class="num">${f(rows.reduce((t, r) => t + r.tot, 0))}</td></tr>` : "";
  }
  function renderSaleMap() {
    const m = new Map(), cs = costState();
    docs.filter((d) => d.market === ui.market).forEach((d) => {
      const k = custKey(d.customer); if (!k) return;
      if (!m.has(k)) m.set(k, { key: k, name: d.customer, n: 0, sqm: 0 });
      const o = m.get(k); o.n++; o.sqm += docSqm(d);
    });
    const list = [...m.values()].sort((a, b) => b.sqm - a.sqm);
    $("#srSaleMapGrid").innerHTML = list.length ? list.map((c) => `<label><span>${esc(c.name)} <em>${c.n} M/O · ${fmtSqm(c.sqm)} ตร.ม.</em></span><input list="srSaleList" data-cust-sale="${esc(c.key)}" value="${esc(cfg.custSale[c.key] || "")}" placeholder="${esc((cs && cs.customerSale && cs.customerSale[c.key]) || NO_SALE)}"></label>`).join("") : `<em class="muted">ยังไม่มีลูกค้าในรายงานตลาดนี้ — นำเข้า Excel หรือเปิด M/O ก่อน</em>`;
  }
  function renderMonthly() {
    const ms = K.months, mx = Math.max(1, ...ms.map((m) => Math.max(m.inSqm, m.outSqm)));
    $("#srMonthlyTitle").textContent = `สรุปรายเดือน${MARKETS[ui.market].label} · ${ui.year}${ui.sale ? ` · Sale: ${ui.sale}` : ""}`;
    $("#srMonthlyBody").innerHTML = ms.map((m, i) => {
      const empty = !m.inCount && !m.outSqm && !m.so;
      return `<tr class="pick ${ui.month === i + 1 ? "selected" : ""} ${empty ? "zero" : ""}" data-sr="pick-month" data-m="${i + 1}">
        <td><strong>${monthNames[i]}</strong></td><td class="num">${fmtInt(m.inCount)}</td>
        <td class="num">${fmtSqm(m.inSqm)}<span class="sr-bar"><i style="width:${(m.inSqm / mx) * 100}%"></i></span></td>
        <td class="num">${moneyFx(m.inAmt)}</td>
        <td class="num">${fmtSqm(m.outSqm)}<span class="sr-bar out"><i style="width:${(m.outSqm / mx) * 100}%"></i></span></td>
        <td class="num">${moneyFx(m.outAmt)}</td><td class="num">${m.soApproved}/${m.so}</td><td>${ui.month === i + 1 ? "◂ เลือกอยู่" : ""}</td></tr>`;
    }).join("");
    $("#srMonthlyFoot").innerHTML = `<tr><td>รวมทั้งปี ${ui.year}</td><td class="num">${fmtInt(ms.reduce((t, m) => t + m.inCount, 0))}</td><td class="num">${fmtSqm(ms.reduce((t, m) => t + m.inSqm, 0))}</td><td class="num">${moneyFx(sumMoney(ms, "inAmt"))}</td><td class="num">${fmtSqm(ms.reduce((t, m) => t + m.outSqm, 0))}</td><td class="num">${moneyFx(sumMoney(ms, "outAmt"))}</td><td class="num">${ms.reduce((t, m) => t + m.soApproved, 0)}/${ms.reduce((t, m) => t + m.so, 0)}</td><td></td></tr>`;
  }
  function renderDaily() {
    $("#srDailyPanel").hidden = !ui.month;
    if (!ui.month) return;
    $("#srDailyTitle").textContent = `สรุปรายวัน · ${monthNames[ui.month - 1]} ${ui.year}`;
    const m = K.months[ui.month - 1], rows = [...K.days.entries()].sort((a, b) => a[0] - b[0]);
    let sOut = 0; const sOutAmt = {};
    rows.forEach(([, b]) => { sOut += b.outSqm; Object.entries(b.outAmt).forEach(([c, v]) => addMoney(sOutAmt, c, v)); });
    let html = rows.map(([d, b]) => `<tr class="pick ${ui.day === d ? "selected" : ""}" data-sr="pick-day" data-d="${d}"><td><strong>${d} ${SHORT_MONTHS[ui.month - 1]} ${ui.year}</strong></td><td class="num">${fmtInt(b.inCount)}</td><td class="num">${fmtSqm(b.inSqm)}</td><td class="num">${moneyFx(b.inAmt)}</td><td class="num">${fmtSqm(b.outSqm)}</td><td class="num">${moneyFx(b.outAmt)}</td><td>${ui.day === d ? "◂ เลือกอยู่" : ""}</td></tr>`).join("");
    const resid = m.outSqm - sOut, rAmt = {};
    Object.keys(m.outAmt).forEach((c) => addMoney(rAmt, c, m.outAmt[c] - (sOutAmt[c] || 0)));
    if (resid > 0.005) html += `<tr class="zero"><td>ไม่ระบุวัน (Dispatch ระบุเฉพาะเดือน)</td><td class="num">-</td><td class="num">-</td><td class="num">-</td><td class="num">${fmtSqm(resid)}</td><td class="num">${moneyFx(rAmt)}</td><td></td></tr>`;
    $("#srDailyBody").innerHTML = html || `<tr><td colspan="7"><div class="sr-empty">เดือนนี้ยังไม่มีรายการ</div></td></tr>`;
  }

  /* ---------- ทะเบียน M/O · SO ---------- */
  function shipRange(d) {
    const s = d.lines.map((l) => lineShip(d, l)).filter(Boolean).sort();
    if (!s.length) return { text: "-", last: "" };
    return { text: s[0] === s[s.length - 1] ? fmtDay(s[0]) : `${fmtDay(s[0])} → ${fmtDay(s[s.length - 1])}`, last: s[s.length - 1] };
  }
  function shipTag(d, last) {
    if (d.actualShip) return tag("ส่งจริงแล้ว", "");
    if (!last) return tag("ไม่ระบุวันส่ง", "info");
    const t = todayISO();
    const past = last.length === 10 ? last <= t : last <= t.slice(0, 7);
    return past ? tag("ตาม Dispatch", "review") : tag("รอส่ง", "info");
  }
  function regDocs() {
    let list = docs.filter((d) => d.market === ui.market && d.type === ui.reg);
    const sel = selNow();
    if (ui.sale) list = list.filter((d) => saleName(d) === ui.sale);
    if (ui.scope === "open") list = list.filter((d) => inSel(d.openDate, sel));
    else if (ui.scope === "ship") list = list.filter((d) => d.lines.some((l) => inSel(lineShip(d, l), sel)));
    const q = ui.search.trim().toLowerCase();
    if (q) list = list.filter((d) => `${d.no} ${d.customer} ${saleOf(d)} ${d.project} ${d.pi} ${d.inv} ${d.lines.map((l) => `${l.design} ${l.location}`).join(" ")}`.toLowerCase().includes(q));
    return list.sort((a, b) => (b.openDate || "").localeCompare(a.openDate || "") || (b.seq || 0) - (a.seq || 0));
  }
  function linesTable(d) {
    const isMO = d.type === "MO";
    const rows = d.lines.map((l) => `<tr><td>${esc(l.design) || "-"}</td><td>${esc(l.location) || "-"}</td><td>${esc([l.quality, l.colors].filter(Boolean).join(" · ")) || "-"}</td><td>${esc(l.size) || "-"}</td><td class="num">${l.qty != null ? fmtSqm(l.qty) : "-"} ${esc(l.unit || "")}</td><td class="num">${fmtSqm(l.sqm)}</td>${isMO ? `<td class="num">${l.price != null ? fmtMoney(l.price) : "-"}</td><td class="num">${fmtMoney(l.amount)}</td><td>${fmtDay(lineShip(d, l))}${l.post && !d.actualShip ? `<small>Postpone ${fmtDay(l.post)}</small>` : ""}</td>` : ""}</tr>`).join("");
    return `<table class="sr-lines"><thead><tr><th>Design No.</th><th>Location</th><th>Quality / สี</th><th>ขนาด</th><th class="num">จำนวน</th><th class="num">ตร.ม.</th>${isMO ? `<th class="num">ราคา/หน่วย</th><th class="num">Amount</th><th>ส่งออก</th>` : ""}</tr></thead><tbody>${rows}</tbody></table>` +
      (d.extra ? `<small class="muted">ยอดเพิ่มเติมนอกรายการ ${esc(money({ [d.currency]: d.extra }))}</small> ` : "") + (d.remarks ? `<small class="muted">หมายเหตุ: ${esc(d.remarks)}</small>` : "");
  }
  const saleCell = (d) => { const v = saleOf(d); return `<td><input class="sale-input" list="srSaleList" data-doc-sale="${d.id}" value="${esc(v)}" placeholder="${NO_SALE}" title="${d.sale ? "กำหนดรายใบ" : v ? "ตามลูกค้า" : "ยังไม่ได้จับคู่"}"></td>`; };
  function moRow(d) {
    const open = ui.expanded.has(d.id), sr = shipRange(d);
    const src = d.source === "import" ? "" : `<small>${d.source === "edited" ? "แก้ไข/ยืนยันในระบบ" : "บันทึกในระบบ"}</small>`;
    return `<tr><td style="white-space:nowrap"><button class="sr-toggle" data-sr="expand" data-id="${d.id}" title="ดูรายการ">${open ? "▾" : "▸"}</button><strong class="sr-no">${esc(d.no)}</strong>${src}${d.designId ? `<small>Design ${esc(d.designId)}</small>` : ""}</td>
      <td>${fmtDay(d.openDate)}</td><td><strong>${esc(d.customer) || "-"}</strong>${d.pi ? `<small>PI ${esc(d.pi)}</small>` : ""}</td>
      <td>${esc(d.project) || "-"}${d.incoterms ? `<small>${esc(d.incoterms)}</small>` : ""}</td>${saleCell(d)}
      <td class="num">${d.lines.length}</td><td class="num">${fmtSqm(docSqm(d))}</td><td class="num">${moneyFx({ [d.currency]: docAmount(d) })}</td>
      <td>${sr.text}${d.actualShip ? `<small>วันส่งจริง</small>` : ""}</td><td>${shipTag(d, sr.last)}</td>
      <td><div class="sr-rowbtn"><button class="action-button" data-sr="ship" data-id="${d.id}">${d.actualShip ? "แก้วันส่ง" : "ยืนยันส่ง"}</button><button class="action-button ghost" data-mo="print-doc" data-id="${d.id}" title="พิมพ์ใบ M/O A3 (หน้า 1–2) ส่ง Planning">ใบ M/O A3</button><button class="action-button ghost" data-sr="edit" data-id="${d.id}">แก้ไข</button><button class="action-button ghost" data-sr="del" data-id="${d.id}">ลบ</button></div></td></tr>` +
      (open ? `<tr class="sub"><td colspan="11">${linesTable(d)}</td></tr>` : "");
  }
  function soButtons(d) {
    const b = (st, label, cls = "") => `<button class="action-button ${cls}" data-sr="so-status" data-id="${d.id}" data-st="${st}">${label}</button>`;
    return { DRAFT: b("SENT", "ส่งให้ลูกค้า"), SENT: b("APPROVED", "Approve", "primary") + b("REJECTED", "ไม่อนุมัติ", "ghost"), REJECTED: b("SENT", "ส่งอีกครั้ง"), APPROVED: b("SENT", "ยกเลิก Approve", "ghost") }[d.status] || "";
  }
  function soRow(d) {
    const open = ui.expanded.has(d.id);
    return `<tr><td style="white-space:nowrap"><button class="sr-toggle" data-sr="expand" data-id="${d.id}">${open ? "▾" : "▸"}</button><strong class="sr-no">${esc(d.no)}</strong>${d.designId ? `<small>Design ${esc(d.designId)}</small>` : ""}</td>
      <td>${fmtDay(d.openDate)}</td><td><strong>${esc(d.customer) || "-"}</strong></td><td>${esc(d.project) || "-"}${d.remarks ? `<small>${esc(d.remarks)}</small>` : ""}</td>${saleCell(d)}
      <td class="num">${d.lines.length}</td><td class="num">${fmtSqm(docSqm(d))}</td>
      <td>${tag(SO_STATUS[d.status] || d.status, SO_KIND[d.status] || "")}${d.statusAt ? `<small>${fmtDay(d.statusAt)}</small>` : ""}</td>
      <td><div class="sr-rowbtn">${soButtons(d)}<button class="action-button ghost" data-sr="edit" data-id="${d.id}">แก้ไข</button><button class="action-button ghost" data-sr="del" data-id="${d.id}">ลบ</button></div></td></tr>` +
      (open ? `<tr class="sub"><td colspan="9">${linesTable(d)}</td></tr>` : "");
  }
  function renderRegister() {
    const all = (t) => docs.filter((d) => d.market === ui.market && d.type === t).length;
    $("#srRegTabs").innerHTML = `<button data-sr="reg-tab" data-reg="MO" class="${ui.reg === "MO" ? "active" : ""}">M/O (${all("MO")})</button><button data-sr="reg-tab" data-reg="SO" class="${ui.reg === "SO" ? "active" : ""}">SO ตัวอย่าง (${all("SO")})</button>`;
    const list = regDocs(), isMO = ui.reg === "MO";
    $("#srRegHead").innerHTML = isMO
      ? `<tr><th>เลขที่ M/O</th><th>วันเปิด</th><th>ลูกค้า</th><th>Project / PO</th><th>Sale</th><th class="num">รายการ</th><th class="num">ตร.ม.</th><th class="num">ยอดขาย</th><th>วันส่งออก</th><th>สถานะ</th><th></th></tr>`
      : `<tr><th>เลขที่ SO</th><th>วันที่</th><th>ลูกค้า</th><th>Project</th><th>Sale</th><th class="num">รายการ</th><th class="num">ตร.ม.</th><th>สถานะ</th><th></th></tr>`;
    $("#srRegBody").innerHTML = list.length ? list.map(isMO ? moRow : soRow).join("") : `<tr><td colspan="${isMO ? 11 : 9}"><div class="sr-empty">ไม่พบรายการ — ${docs.length ? "ลองปรับตัวกรอง" : "นำเข้า Excel หรือกด “+ เปิด M/O”"}</div></td></tr>`;
    $("#srRegCount").textContent = `${list.length} รายการ${isMO ? ` · ${fmtSqm(list.reduce((t, d) => t + docSqm(d), 0))} ตร.ม.` : ""}`;
    $("#srScope").value = ui.scope;
  }
  function autoSeq(key, yy) { let max = 0; docs.forEach((d) => { if (docSeries(d) === key && d.yy === yy && d.seq != null) max = Math.max(max, d.seq); }); return max + 1; }
  function renderSeries() {
    const yy = curYY();
    $("#srSeriesBody").innerHTML = Object.keys(SERIES_DEF).map((k) => {
      const s = cfg.series[k];
      return `<tr><td><strong>${esc(s.label)}</strong></td><td><strong>${esc(formatNo(k, nextSeq(k, yy), yy))}</strong></td>
        <td><input class="w-prefix" data-series="${k}" data-f="prefix" value="${esc(s.prefix)}"></td>
        <td><input class="w-digits" type="number" min="1" max="8" data-series="${k}" data-f="digits" value="${s.digits}"></td>
        <td><input class="w-next" type="number" min="0" data-series="${k}" data-f="next" value="${s.next || ""}" placeholder="อัตโนมัติ (${autoSeq(k, yy)})"></td></tr>`;
    }).join("");
    if (document.activeElement !== $("#srFx")) $("#srFx").value = cfg.fx || "";
  }
  function renderSalesReport(opts) {
    if (!ui.introShown) { ui.introShown = true; if (!docs.length) $("#srImportPanel").hidden = false; } // ยังไม่มีข้อมูล → เปิดแผงนำเข้าให้เลย
    renderTabs(); renderPeriod(); renderKpi(); renderSaleSummary(); renderSaleMatrix(); renderMonthly(); renderDaily(); renderRegister();
    if (!$("#srSaleMapPanel").hidden && !(opts && opts.keepMap)) renderSaleMap();
    if (!$("#srSeriesPanel").hidden) renderSeries();
    $("#srImportMarket").value = $("#srImportMarket").value || ui.market;
  }
  const refresh = () => {
    saveDocs();
    if ($("#salesreportView").classList.contains("active-view")) renderSalesReport();
    if ($("#salesView") && $("#salesView").classList.contains("active-view") && typeof renderSales === "function") renderSales(); // อัปเดตเลข M/O / SO ที่โชว์ในหน้า Sales
  };

  /* ---------- นำเข้า / ส่งออก Excel ---------- */
  const importStatus = (t) => { $("#srImportStatus").textContent = t; };
  async function onFile(e) {
    const f = e.target.files[0];
    if (!f) return;
    if (typeof XLSX === "undefined") { importStatus("โหลดตัวอ่าน Excel (SheetJS) ไม่ได้ — ต้องเชื่อมต่ออินเทอร์เน็ตเพื่อโหลดไลบรารี"); return; }
    try {
      ui.wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
      const names = ui.wb.SheetNames;
      const pref = names.find((n) => /2026/.test(n) && /current/i.test(n)) || names.find((n) => /current/i.test(n)) || names.find((n) => /2026/.test(n)) || names[0];
      $("#srSheet").innerHTML = names.map((n) => `<option value="${esc(n)}" ${n === pref ? "selected" : ""}>${esc(n)}</option>`).join("");
      $("#srSheet").disabled = false; $("#srImportBtn").disabled = false;
      importStatus(`${f.name} · พบ ${names.length} ชีต — เลือกชีตและตลาดแล้วกด “นำเข้า”`);
    } catch (err) { importStatus("อ่านไฟล์ไม่สำเร็จ: " + err.message); }
  }
  function doImport() {
    if (!ui.wb) return;
    const market = $("#srImportMarket").value, sheet = $("#srSheet").value;
    let res;
    try { res = importWorkbook(ui.wb, sheet, { market, dateMode: $("#srDateMode").value }); } catch (err) { importStatus("นำเข้าไม่สำเร็จ: " + err.message); return; }
    const keep = docs.filter((d) => !(d.market === market && d.type === "MO" && d.source === "import"));
    const keptNos = new Set(keep.filter((d) => d.market === market && d.type === "MO").map((d) => normNo(d.no)));
    const fresh = res.docs.filter((d) => !keptNos.has(normNo(d.no)));
    const replaced = docs.length - keep.length;
    const oldSale = new Map(docs.filter((d) => d.market === market && d.source === "import" && d.sale).map((d) => [normNo(d.no), d.sale]));
    fresh.forEach((d) => { const v = oldSale.get(normNo(d.no)); if (v) d.sale = v; }); // คง Sale ที่กำหนดรายใบไว้เมื่อนำเข้าซ้ำ
    docs = keep.concat(fresh);
    const yc = {}; fresh.forEach((d) => { if (d.openDate) yc[d.openDate.slice(0, 4)] = (yc[d.openDate.slice(0, 4)] || 0) + 1; });
    const topYear = Object.entries(yc).sort((a, b) => b[1] - a[1])[0];
    ui.market = market; ui.reg = "MO"; ui.month = 0; ui.day = 0; if (topYear) ui.year = +topYear[0];
    const s = res.stats;
    importStatus(`นำเข้า ${fresh.length} M/O · ${s.lines} รายการ · ${fmtSqm(s.sqm)} ตร.ม. (${sheet})${replaced ? ` · แทนที่ข้อมูลนำเข้าเดิม ${replaced}` : ""}${res.docs.length - fresh.length ? ` · ข้าม ${res.docs.length - fresh.length} เลขที่ซ้ำกับที่แก้ไขในระบบ` : ""} · ซ่อมวันเปิด ${s.fixedOpen} · ซ่อมวันส่ง ${s.fixedShip} · ข้ามแถวที่ไม่ใช่รายการ ${s.skipped}${s.noOpen ? ` · ไม่มีวันเปิด ${s.noOpen}` : ""}`);
    refresh(); toast(`นำเข้ารายงาน${MARKETS[market].label} ${fresh.length} M/O แล้ว`);
  }
  function exportXlsx() {
    if (typeof XLSX === "undefined") { toast("โหลดตัวอ่าน Excel ไม่ได้ — ต้องเชื่อมต่ออินเทอร์เน็ต"); return; }
    const mk = MARKETS[ui.market], cur = mk.currency, kp = computeKpi(docs, ui.market, { year: ui.year, month: ui.month, day: 0 });
    const r2 = (n) => Math.round(n * 100) / 100;
    const mHead = ["เดือน", "M/O เปิด", "รับเข้า (ตร.ม.)", `ยอดขาย (${cur})`, "ส่งออก (ตร.ม.)", `มูลค่าส่งออก (${cur})`, "SO Approved", "SO ทั้งหมด"];
    const mRows = kp.months.map((m, i) => [monthNames[i], m.inCount, r2(m.inSqm), r2(m.inAmt[cur] || 0), r2(m.outSqm), r2(m.outAmt[cur] || 0), m.soApproved, m.so]);
    mRows.push(["รวม", ...[1, 2, 3, 4, 5, 6, 7].map((c) => r2(mRows.reduce((t, r) => t + r[c], 0)))]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[`สรุปรายเดือน${mk.label} ${ui.year}`], mHead, ...mRows]), "สรุปรายเดือน");
    if (ui.month) {
      const dr = [...kp.days.entries()].sort((a, b) => a[0] - b[0]).map(([d, b]) => [`${ui.year}-${pad(ui.month)}-${pad(d)}`, b.inCount, r2(b.inSqm), r2(b.inAmt[cur] || 0), r2(b.outSqm), r2(b.outAmt[cur] || 0)]);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["วันที่", "M/O เปิด", "รับเข้า (ตร.ม.)", `ยอดขาย (${cur})`, "ส่งออก (ตร.ม.)", `มูลค่าส่งออก (${cur})`], ...dr]), `รายวัน ${pad(ui.month)}-${ui.year}`);
    }
    const by = computeBySale(docs, ui.market, { year: ui.year, month: 0, day: 0 });
    const names = [...by.keys()].sort((a, b) => (a === NO_SALE) - (b === NO_SALE) || a.localeCompare(b, "th"));
    const saleAoa = [[`ยอดขายแยก Sale ${mk.label} ${ui.year}`]];
    [["inAmt", `ยอดขาย ตามวันเปิด M/O (${cur})`], ["inSqm", "รับเข้า (ตร.ม.)"], ["outSqm", "ส่งออก (ตร.ม.)"], ["outAmt", `มูลค่าส่งออก (${cur})`]].forEach(([m, label]) => {
      saleAoa.push([], [label], ["Sale", ...monthNames, "รวม"]);
      names.forEach((n) => { const v = by.get(n).months.map((x) => r2(m.endsWith("Amt") ? x[m][cur] || 0 : x[m])); saleAoa.push([n, ...v, r2(v.reduce((t, x) => t + x, 0))]); });
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(saleAoa), "ยอดขายแยก Sale");
    const mo = docs.filter((d) => d.market === ui.market && d.type === "MO").sort((a, b) => (a.seq || 0) - (b.seq || 0));
    const lrows = [];
    mo.forEach((d) => d.lines.forEach((l) => lrows.push([d.no, d.openDate, d.customer, saleOf(d), d.project, d.pi, d.inv, d.incoterms, l.design, l.location, l.quality, l.colors, l.size, l.qty, l.unit, l.sqm, l.price, l.amount, l.ship, l.post, d.actualShip, d.currency, d.remarks])));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["เลขที่ M/O", "วันเปิด", "ลูกค้า", "Sale", "Project/PO", "PI", "INV", "Incoterms", "Design", "Location", "Quality", "Colors", "Size", "Qty", "Unit", "ตร.ม.", "Unit Price", "Amount", "Dispatch", "Postpone", "วันส่งจริง", "สกุลเงิน", "หมายเหตุ"], ...lrows]), "M-O รายการ");
    const so = docs.filter((d) => d.market === ui.market && d.type === "SO");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["เลขที่ SO", "วันที่", "ลูกค้า", "Sale", "Project", "สถานะ", "รายการ", "ตร.ม.", "หมายเหตุ"], ...so.map((d) => [d.no, d.openDate, d.customer, saleOf(d), d.project, SO_STATUS[d.status] || d.status, d.lines.length, r2(docSqm(d)), d.remarks])]), "SO ตัวอย่าง");
    XLSX.writeFile(wb, `sales-report-${ui.market.toLowerCase()}-${ui.year}.xlsx`);
  }

  /* ---------- Dialog ---------- */
  function showDialog(html, narrow) { $("#srDialogBody").innerHTML = html; $(".sr-dialog-card").classList.toggle("narrow", !!narrow); $("#srDialog").hidden = false; }
  function closeDialog() { $("#srDialog").hidden = true; $("#srDialogBody").innerHTML = ""; form = null; }

  const blankLine = () => ({ design: "", location: "", quality: "", colors: "", pack: "", pcs: null, size: "", unit: "M2", qty: null, price: null, sqm: 0, amount: 0, ship: "", post: "", ref: "" });
  const calcSqm = (l) => round(l.unit === "F2" ? num(l.qty) * F2_TO_M2 : num(l.qty), 4);
  const dateInput = (f, v) => (!v || v.length === 10 ? `<input data-f="${f}" type="date" value="${esc(v || "")}">` : `<input data-f="${f}" type="text" value="${esc(v)}" placeholder="yyyy-mm-dd">`);

  function openForm(opt) {
    const editing = opt.docId ? docs.find((d) => d.id === opt.docId) : null;
    let draft;
    if (editing) draft = JSON.parse(JSON.stringify(editing));
    else {
      const market = opt.market || ui.market, row = opt.designId ? designs.find((x) => x.id === opt.designId) : null;
      draft = { id: uid(), market, type: opt.type, no: "", openDate: todayISO(), customer: row ? row.customer || "" : "", project: row ? row.project || "" : "", pi: "", inv: "", incoterms: "", currency: MARKETS[market].currency, remarks: "", status: opt.type === "SO" ? "DRAFT" : "OPEN", actualShip: "", extra: 0, lines: [blankLine()], source: "manual", designId: row ? row.id : "" };
      if (row) draft.lines[0].design = row.id;
    }
    draft.lines.forEach((l) => { l._ms = num(l.sqm) > 0 && Math.abs(num(l.sqm) - calcSqm(l)) > 0.01; l._ma = l.amount != null && num(l.amount) > 0 && Math.abs(num(l.amount) - num(l.qty) * num(l.price)) > 0.5; });
    form = { draft, auto: !editing, editing: !!editing };
    if (!editing) draft.no = suggestNo(draft.market, draft.type, +draft.openDate.slice(2, 4));
    showDialog(formHtml());
    updateHint(); updateTotals(); updateSalePh();
  }
  function formHtml() {
    const d = form.draft, isMO = d.type === "MO";
    const curs = [...new Set(["USD", "THB", "EUR", d.currency])];
    return `<form class="sr-form" id="srForm" autocomplete="off">
      <h2>${form.editing ? "แก้ไข" : "เปิด"} ${isMO ? "M/O" : "SO ตัวอย่าง"}</h2>
      <p class="sub">${isMO ? "M/O เดียวกันมีได้หลายรายการ — ใส่เลขที่ซ้ำกับ M/O เดิมเพื่อเพิ่มรายการเข้าเลขเดิม" : "SO ตัวอย่างส่งให้ลูกค้า Approve — เป็นอิสระจาก M/O ไม่บล็อกการเปิด M/O"}${d.designId ? ` · เชื่อมกับ Design ${esc(d.designId)}` : ""}</p>
      <div class="sr-grid">
        <label>ตลาด<select name="market" ${form.editing ? "disabled" : ""}>${Object.entries(MARKETS).map(([k, v]) => `<option value="${k}" ${d.market === k ? "selected" : ""}>${v.label}</option>`).join("")}</select></label>
        <label class="span2">เลขที่ ${isMO ? "M/O" : "SO"} (แก้ไขได้)<span class="sr-noRow"><input name="no" value="${esc(d.no)}" required><button type="button" class="action-button" data-sr="f-nextno">ใช้เลขถัดไป</button></span><span id="srNoHint" class="sr-hint"></span></label>
        <label>วันที่${isMO ? "เปิด M/O" : " SO"}<input name="openDate" type="date" value="${esc(d.openDate)}" required></label>
        <label class="span2">ลูกค้า<input name="customer" value="${esc(d.customer)}"></label>
        <label class="span2">Project / PO<input name="project" value="${esc(d.project)}"></label>
        ${isMO ? `<label>PI No.<input name="pi" value="${esc(d.pi)}"></label><label>INV No.<input name="inv" value="${esc(d.inv)}"></label><label>Incoterms<input name="incoterms" value="${esc(d.incoterms)}"></label>` : ""}
        <label>สกุลเงิน<select name="currency">${curs.map((c) => `<option ${c === d.currency ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></label>
        ${isMO ? `<label>ยอดเพิ่มเติมนอกรายการ<input name="extra" type="number" step="any" value="${d.extra || ""}" placeholder="0"></label>` : ""}
        <label>Sale ผู้ดำเนินการ<input name="sale" list="srSaleList" value="${esc(d.sale || "")}"></label>
        <label class="span2">หมายเหตุ<input name="remarks" value="${esc(d.remarks)}"></label>
      </div>
      <div class="sr-form-lines"><div id="srLinesBox">${linesHtml()}</div><button type="button" class="action-button add" data-sr="f-addline">+ เพิ่มรายการ</button></div>
      ${isMO && window.MoForm ? window.MoForm.editorHtml(d) : ""}
      <div id="srFormMsg"></div>
      <div class="sr-form-actions"><button type="button" class="action-button ghost" data-sr="close-dlg">ยกเลิก</button><button type="submit" class="action-button primary">${form.editing ? "บันทึกการแก้ไข" : d.designId && isMO ? "บันทึกและเปิด Job ส่ง Planning" : "บันทึก"}</button></div>
    </form>`;
  }
  function linesHtml() {
    const isMO = form.draft.type === "MO";
    const rows = form.draft.lines.map((l, i) => `<tr data-i="${i}" data-ms="${l._ms ? 1 : 0}" data-ma="${l._ma ? 1 : 0}">
      <td><input data-f="design" value="${esc(l.design)}"></td><td><input data-f="location" value="${esc(l.location)}"></td><td><input data-f="size" value="${esc(l.size)}"></td>
      <td class="n"><input data-f="qty" type="number" step="any" value="${l.qty != null ? l.qty : ""}"></td>
      <td><select data-f="unit"><option ${l.unit !== "F2" ? "selected" : ""}>M2</option><option ${l.unit === "F2" ? "selected" : ""}>F2</option></select></td>
      <td class="n"><input data-f="sqm" type="number" step="any" value="${l.sqm ? l.sqm : ""}"></td>
      ${isMO ? `<td class="n"><input data-f="price" type="number" step="any" value="${l.price != null ? l.price : ""}"></td><td class="n"><input data-f="amount" type="number" step="any" value="${l.amount ? l.amount : ""}"></td><td>${dateInput("ship", l.ship)}</td><td>${dateInput("post", l.post)}</td>` : ""}
      <td><button type="button" class="action-button ghost" data-sr="f-delline" data-i="${i}" title="ลบรายการ">×</button></td></tr>`).join("");
    return `<div class="tw"><table><thead><tr><th>Design No.</th><th>Location</th><th>ขนาด</th><th>จำนวน</th><th>หน่วย</th><th>ตร.ม.</th>${isMO ? `<th>ราคา/หน่วย</th><th>Amount</th><th>Dispatch</th><th>Postpone</th>` : ""}<th></th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="5">รวม</td><td class="n" id="srTotSqm"></td>${isMO ? `<td>รวมยอด</td><td id="srTotAmt" colspan="3"></td>` : ""}<td></td></tr></tfoot></table></div>`;
  }
  function readLines() {
    return $$("#srLinesBox tr[data-i]").map((tr) => {
      const o = { ...(form.draft.lines[+tr.dataset.i] || blankLine()) };
      const g = (f) => { const el = tr.querySelector(`[data-f="${f}"]`); return el ? el.value : undefined; };
      ["design", "location", "size", "ship", "post"].forEach((f) => { const v = g(f); if (v !== undefined) o[f] = v.trim(); });
      ["qty", "price", "sqm", "amount"].forEach((f) => { const v = g(f); if (v !== undefined) o[f] = v === "" ? null : Number(v); });
      if (g("unit")) o.unit = g("unit");
      o._ms = tr.dataset.ms === "1"; o._ma = tr.dataset.ma === "1";
      return o;
    });
  }
  function lineInput(el) {
    const tr = el.closest("tr"), f = el.dataset.f, val = (n) => { const x = tr.querySelector(`[data-f="${n}"]`); return x && x.value !== "" ? Number(x.value) : null; };
    if (f === "sqm") tr.dataset.ms = "1";
    if (f === "amount") tr.dataset.ma = "1";
    if ((f === "qty" || f === "unit") && tr.dataset.ms !== "1") {
      const u = tr.querySelector('[data-f="unit"]').value, q = val("qty");
      const s = tr.querySelector('[data-f="sqm"]'); s.value = q == null ? "" : String(round(u === "F2" ? q * F2_TO_M2 : q, 4));
    }
    if ((f === "qty" || f === "price") && tr.dataset.ma !== "1") {
      const a = tr.querySelector('[data-f="amount"]'), q = val("qty"), p = val("price");
      if (a) a.value = q != null && p != null ? String(round(q * p, 2)) : "";
    }
  }
  function updateTotals() {
    const lines = readLines(), sq = lines.reduce((t, l) => t + num(l.sqm), 0), am = lines.reduce((t, l) => t + num(l.amount), 0) + num($("#srForm").elements.extra && $("#srForm").elements.extra.value);
    if ($("#srTotSqm")) $("#srTotSqm").textContent = fmtSqm(sq);
    if ($("#srTotAmt")) $("#srTotAmt").textContent = `${SYM[$("#srForm").elements.currency.value] || ""}${fmtMoney(am)}`;
  }
  function updateSalePh() {
    const f = $("#srForm"); if (!f || !f.elements.sale) return;
    f.elements.sale.placeholder = `ตามลูกค้า: ${derivedSale(f.elements.customer.value, form.draft.designId) || NO_SALE}`;
  }
  function fillNo() {
    const f = $("#srForm"), od = f.elements.openDate.value;
    f.elements.no.value = suggestNo(f.elements.market.value, form.draft.type, /^\d{4}/.test(od) ? +od.slice(2, 4) : curYY());
  }
  function findDup(no, market, type, selfId) { return docs.find((x) => x.id !== selfId && x.market === market && x.type === type && normNo(x.no) === normNo(no)); }
  function updateHint() {
    const f = $("#srForm"), h = $("#srNoHint"), d = form.draft, market = f.elements.market.value, v = f.elements.no.value.trim();
    const key = seriesKey(market, d.type), dup = v ? findDup(v, market, d.type, d.id) : null;
    let cls = "sr-hint", msg;
    if (!v) { cls += " err"; msg = "กรอกเลขที่เอกสาร"; }
    else if (dup) { cls += d.type === "MO" && !form.editing ? " warn" : " err"; msg = d.type === "MO" && !form.editing ? `เลขนี้มีอยู่แล้ว (${dup.lines.length} รายการ) — เมื่อบันทึกจะถามว่าจะรวมรายการเข้ากับ M/O เดิมหรือไม่` : "เลขที่ซ้ำกับเอกสารที่มีอยู่แล้ว"; }
    else if (!parseNo(key, v)) { cls += " warn"; msg = "รูปแบบเลขไม่ตรงกับชุดเลขนี้ — ใช้ได้ แต่จะไม่ถูกนับในเลขถัดไป"; }
    else msg = `${form.auto ? "เลขถัดไปอัตโนมัติ" : "กำหนดเอง"} · ${SERIES_DEF[key].label}`;
    h.className = cls; h.textContent = msg;
  }
  function onFormInput(e) {
    const t = e.target, f = $("#srForm");
    if (!f || !form) return;
    if (t.dataset.f) { lineInput(t); updateTotals(); return; }
    if (t.name === "no") form.auto = false;
    if (t.name === "market") {
      const old = form.draft.market; form.draft.market = t.value;
      if (f.elements.currency.value === MARKETS[old].currency) f.elements.currency.value = MARKETS[t.value].currency;
      if (form.auto) fillNo();
    }
    if (t.name === "openDate" && form.auto) fillNo();
    if (t.name === "extra" || t.name === "currency") updateTotals();
    if (t.name === "customer") updateSalePh();
    updateHint();
  }
  const msgBox = (html, warn) => { $("#srFormMsg").innerHTML = html ? `<div class="sr-msg ${warn ? "warn" : ""}">${html}</div>` : ""; };
  function collect() {
    const f = $("#srForm"), v = (n) => (f.elements[n] ? f.elements[n].value.trim() : ""), d = form.draft, errs = [];
    const raw = readLines().filter((l) => l.design || l.location || l.size || l.qty != null || num(l.sqm) || num(l.amount));
    const lines = raw.map((l, i) => {
      ["ship", "post"].forEach((k) => { if (l[k] && !/^\d{4}-\d{2}(-\d{2})?$/.test(l[k])) errs.push(`รายการที่ ${i + 1}: วันที่ ${k === "ship" ? "Dispatch" : "Postpone"} ต้องเป็น yyyy-mm-dd`); });
      const o = { ...l, sqm: round(num(l.sqm)), amount: round(num(l.amount), 2) };
      delete o._ms; delete o._ma; return o;
    });
    const doc = { ...d, market: v("market") || d.market, no: v("no"), openDate: v("openDate"), customer: v("customer"), project: v("project"), pi: v("pi"), inv: v("inv"), incoterms: v("incoterms"), currency: v("currency") || d.currency, remarks: v("remarks"), sale: v("sale") && v("sale") !== derivedSale(v("customer"), d.designId) ? v("sale") : "", extra: f.elements.extra ? round(num(f.elements.extra.value), 2) : 0, lines };
    delete doc.seq; delete doc.yy;
    if (doc.type === "MO" && window.MoForm) { const mf = window.MoForm.read(f); if (mf) doc.form = mf; }
    if (!doc.no) errs.push("กรอกเลขที่เอกสาร");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(doc.openDate)) errs.push("เลือกวันที่เปิดเอกสาร");
    if (doc.type === "MO" && !lines.length) errs.push("กรอกรายการอย่างน้อย 1 บรรทัด");
    return { doc, errs };
  }
  function saveForm(mergeInto) {
    const { doc, errs } = collect();
    if (errs.length) { msgBox(errs.map(esc).join("<br>")); return; }
    const dup = findDup(doc.no, doc.market, doc.type, doc.id);
    if (dup && !mergeInto) {
      if (doc.type === "MO" && !form.editing) {
        msgBox(`เลข <strong>${esc(dup.no)}</strong> มีอยู่แล้ว (${dup.lines.length} รายการ · ${fmtSqm(docSqm(dup))} ตร.ม.) — ต้องการรวมรายการนี้เข้ากับ M/O เดิมหรือไม่?<div class="sr-rowbtn"><button type="button" class="action-button primary" data-sr="f-merge" data-id="${dup.id}">รวมเข้ากับ ${esc(dup.no)}</button><button type="button" class="action-button ghost" data-sr="f-dupno">ใช้เลขอื่น</button></div>`, true);
      } else msgBox("เลขที่ซ้ำกับเอกสารที่มีอยู่แล้ว — กรุณาแก้เลขที่");
      return;
    }
    let target = doc;
    if (mergeInto) {
      target = mergeInto;
      target.lines.push(...doc.lines);
      target.extra = round(num(target.extra) + num(doc.extra), 2);
      ["customer", "project", "pi", "inv", "incoterms"].forEach((k) => { if (!target[k] && doc[k]) target[k] = doc[k]; });
      if (doc.remarks) target.remarks = [target.remarks, doc.remarks].filter(Boolean).join(" | ");
      if (doc.designId && !target.designId) target.designId = doc.designId;
      if (!target.form && doc.form) target.form = doc.form;
      if (doc.sale && !target.sale) target.sale = doc.sale;
      if (target.source === "import") target.source = "edited";
    } else if (form.editing) {
      if (doc.source === "import") doc.source = "edited";
      docs[docs.findIndex((x) => x.id === doc.id)] = doc;
    } else docs.push(doc);
    stamp(target);
    const s = cfg.series[docSeries(target)];
    if (s.next > 0 && target.seq != null && target.yy === curYY() && target.seq >= s.next) { s.next = 0; saveCfg(); }
    const designId = form.draft.designId, isNew = !form.editing;
    ui.market = target.market; ui.reg = target.type;
    if (target.openDate) ui.year = +target.openDate.slice(0, 4);
    closeDialog(); refresh();
    toast(`${mergeInto ? "รวมรายการเข้า" : "บันทึก"} ${target.no} แล้ว`);
    if (designId && isNew && target.type === "MO" && typeof finishOpenJob === "function") finishOpenJob(designId, target.no);
  }

  function openShipDialog(id) {
    const d = docs.find((x) => x.id === id);
    if (!d) return;
    const planned = d.lines.map((l) => l.post || l.ship || "").filter(Boolean).sort().pop() || "";
    const def = d.actualShip || (planned.length === 10 ? planned : todayISO());
    showDialog(`<div class="sr-form"><h2>ยืนยันวันส่งออกจริง</h2><p class="sub">${esc(d.no)} · ${esc(d.customer)} · ${fmtSqm(docSqm(d))} ตร.ม.<br>วัน Dispatch ตามแผน: ${planned ? fmtDay(planned) : "ไม่ระบุ"} — วันส่งจริงจะแทนวัน Dispatch ในการนับ KPI ส่งออก (ทุกรายการของ M/O นี้)</p>
      <label class="field">วันส่งจริง<input id="srShipDate" type="date" value="${esc(def)}"></label><div id="srFormMsg"></div>
      <div class="sr-form-actions"><button class="action-button ghost" data-sr="close-dlg">ยกเลิก</button>${d.actualShip ? `<button class="action-button ghost" data-sr="ship-clear" data-id="${id}">ล้างวันส่งจริง</button>` : ""}<button class="action-button primary" data-sr="ship-save" data-id="${id}">บันทึก</button></div></div>`, true);
  }
  function markEdited(d) { if (d.source === "import") d.source = "edited"; }

  /* ---------- events ---------- */
  function armDelete(el) {
    if (el.dataset.armed !== "1") {
      el.dataset.armed = "1"; const old = el.textContent; el.textContent = "ยืนยันลบ?"; el.classList.add("danger");
      setTimeout(() => { if (el.isConnected) { el.dataset.armed = "0"; el.textContent = old; el.classList.remove("danger"); } }, 3500);
      return false;
    }
    return true;
  }
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-sr]");
    if (!el || !(el.closest("#salesreportView") || el.closest("#srDialog"))) return;
    const id = el.dataset.id, a = el.dataset.sr;
    if (a === "market") { ui.market = el.dataset.market; ui.reg = "MO"; ui.search = ""; $("#srSearch").value = ""; $("#srImportMarket").value = ui.market; renderSalesReport(); }
    else if (a === "new-mo") openForm({ type: "MO" });
    else if (a === "new-so") openForm({ type: "SO" });
    else if (a === "toggle-import") { const p = $("#srImportPanel"); p.hidden = !p.hidden; }
    else if (a === "toggle-sales") { const p = $("#srSaleMapPanel"); p.hidden = !p.hidden; if (!p.hidden) renderSaleMap(); }
    else if (a === "pick-sale") { const n = el.dataset.sale; ui.sale = ui.sale === n ? "" : n; renderSalesReport(); }
    else if (a === "toggle-series") { const p = $("#srSeriesPanel"); p.hidden = !p.hidden; if (!p.hidden) renderSeries(); }
    else if (a === "export") exportXlsx();
    else if (a === "pick-month") { const m = +el.dataset.m; ui.month = ui.month === m ? 0 : m; ui.day = 0; renderSalesReport(); }
    else if (a === "pick-day") { const d = +el.dataset.d; ui.day = ui.day === d ? 0 : d; renderSalesReport(); }
    else if (a === "reg-tab") { ui.reg = el.dataset.reg; renderRegister(); }
    else if (a === "expand") { ui.expanded.has(id) ? ui.expanded.delete(id) : ui.expanded.add(id); renderRegister(); }
    else if (a === "edit") openForm({ docId: id });
    else if (a === "ship") openShipDialog(id);
    else if (a === "del") { if (armDelete(el)) { docs = docs.filter((d) => d.id !== id); ui.expanded.delete(id); refresh(); toast("ลบเอกสารแล้ว"); } }
    else if (a === "so-status") { const d = docs.find((x) => x.id === id); if (d) { d.status = el.dataset.st; d.statusAt = todayISO(); refresh(); toast(`${d.no}: ${SO_STATUS[d.status]}`); } }
    else if (a === "close-dlg") closeDialog();
    else if (a === "f-nextno") { form.auto = true; fillNo(); updateHint(); }
    else if (a === "f-addline") { form.draft.lines = readLines(); form.draft.lines.push(blankLine()); $("#srLinesBox").innerHTML = linesHtml(); updateTotals(); }
    else if (a === "f-delline") { const ls = readLines(); ls.splice(+el.dataset.i, 1); form.draft.lines = ls.length ? ls : [blankLine()]; $("#srLinesBox").innerHTML = linesHtml(); updateTotals(); }
    else if (a === "f-merge") saveForm(docs.find((d) => d.id === id));
    else if (a === "f-dupno") { msgBox(""); const n = $("#srForm").elements.no; n.focus(); n.select(); }
    else if (a === "ship-save") {
      const v = $("#srShipDate").value, d = docs.find((x) => x.id === id);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) { $("#srFormMsg").innerHTML = `<div class="sr-msg">เลือกวันส่งจริง</div>`; return; }
      d.actualShip = v; markEdited(d); closeDialog(); refresh(); toast(`${d.no}: ยืนยันส่งจริง ${fmtDay(v)}`);
    } else if (a === "ship-clear") { const d = docs.find((x) => x.id === id); d.actualShip = ""; markEdited(d); closeDialog(); refresh(); }
  });
  const dlg = $("#srDialog");
  dlg.addEventListener("input", onFormInput);
  dlg.addEventListener("change", onFormInput);
  dlg.addEventListener("submit", (e) => { e.preventDefault(); if (form) saveForm(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !dlg.hidden) closeDialog(); });
  $("#srYear").addEventListener("change", (e) => { ui.year = +e.target.value; ui.day = 0; renderSalesReport(); });
  $("#srMonth").addEventListener("change", (e) => { ui.month = +e.target.value; ui.day = 0; renderSalesReport(); });
  $("#srDay").addEventListener("change", (e) => { ui.day = +e.target.value; renderSalesReport(); });
  $("#srSale").addEventListener("change", (e) => { ui.sale = e.target.value; renderSalesReport(); });
  $("#srSaleMetric").addEventListener("change", (e) => { ui.saleMetric = e.target.value; renderSaleMatrix(); });
  $("#srSaleMapGrid").addEventListener("change", (e) => {
    const k = e.target.dataset.custSale; if (k === undefined) return;
    const v = txt(e.target.value);
    if (v) cfg.custSale[k] = v; else delete cfg.custSale[k];
    saveCfg(); renderSalesReport({ keepMap: true });
  });
  $("#srRegBody").addEventListener("change", (e) => {
    const id = e.target.dataset.docSale; if (!id) return;
    const d = docs.find((x) => x.id === id); if (!d) return;
    const v = txt(e.target.value);
    d.sale = v && v !== derivedSale(d.customer, d.designId) ? v : "";
    refresh(); toast(`${d.no}: Sale = ${saleOf(d) || NO_SALE}`);
  });
  $("#srScope").addEventListener("change", (e) => { ui.scope = e.target.value; renderRegister(); });
  $("#srSearch").addEventListener("input", (e) => { ui.search = e.target.value; renderRegister(); });
  $("#srFile").addEventListener("change", onFile);
  $("#srImportBtn").addEventListener("click", doImport);
  $("#srClearImport").addEventListener("click", (e) => {
    if (!armDelete(e.currentTarget)) return;
    const market = $("#srImportMarket").value, n = docs.filter((d) => d.market === market && d.source === "import").length;
    docs = docs.filter((d) => !(d.market === market && d.source === "import"));
    importStatus(`ลบข้อมูลที่นำเข้าของรายงาน${MARKETS[market].label}แล้ว ${n} รายการ`); refresh();
  });
  $("#srSeriesBody").addEventListener("change", (e) => {
    const t = e.target, k = t.dataset.series;
    if (!k) return;
    const s = cfg.series[k];
    if (t.dataset.f === "prefix") s.prefix = t.value; else if (t.dataset.f === "digits") s.digits = Math.max(1, Math.min(8, Math.round(num(t.value)) || s.digits)); else s.next = Math.max(0, Math.round(num(t.value)));
    saveCfg(); docs.forEach(stamp); saveDocs(); renderSalesReport(); renderSeries();
  });
  $("#srFx").addEventListener("change", (e) => { cfg.fx = Math.max(0, num(e.target.value)); saveCfg(); renderSalesReport(); });

  /* ---------- เชื่อมกับหน้า Sales Job Opening ---------- */
  function salesRowExtra(row) {
    const parts = [], mos = docs.filter((d) => d.type === "MO" && d.designId === row.id);
    if (mos.length) mos.forEach((d) => parts.push(d.no)); else if (row.moNo) parts.push(row.moNo);
    docs.filter((d) => d.type === "SO" && d.designId === row.id).forEach((d) => parts.push(`${d.no} (${SO_STATUS[d.status] || d.status})`));
    return parts.length ? `<small>${parts.map(esc).join(" · ")}</small>` : "";
  }
  window.renderSalesReport = renderSalesReport;
  window.salesOpenForm = openForm;
  window.salesRowExtra = salesRowExtra;
  Object.assign(window.SalesEngine, { collectDraft: () => (form && $("#srForm") ? collect().doc : null), importWorkbook, suggestNo, docSqm, docAmount, ui, saveDocs, setDocs: (d) => { docs = d; }, resetCfg: () => { cfg = loadCfg(); } });
})();
