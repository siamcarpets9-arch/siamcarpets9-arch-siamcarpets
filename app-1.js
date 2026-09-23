const seedDesignsSample = [ // sample:true = ข้อมูลตัวอย่างของระบบ ไม่นำไปคำนวณต้นทุน
  {id:"DES-26031",project:"Seal Beach Collection",customer:"Nordic Living",scope:"Artwork + 3 Colorways",due:"24 ก.ย. 2026",progress:100,status:"APPROVED",quote:"READY",owner:"N. Ploy",job:"OPENED",sample:true},
  {id:"DES-26042",project:"Luna Gradient Series",customer:"Maison Lune",scope:"Artwork + Strike-off",due:"25 ก.ย. 2026",progress:100,status:"APPROVED",quote:"READY",owner:"K. May",job:"PENDING",sample:true},
  {id:"DES-26057",project:"Harbor Hospitality",customer:"Harbor & Co.",scope:"12 Layouts + Color Map",due:"28 ก.ย. 2026",progress:65,status:"IN REVIEW",quote:"WAITING",owner:"T. Beam",job:"BLOCKED",sample:true},
  {id:"DES-26063",project:"Northline Bespoke",customer:"Atelier North",scope:"Artwork + Yarn Mapping",due:"30 ก.ย. 2026",progress:30,status:"DRAFT",quote:"WAITING",owner:"N. Ploy",job:"BLOCKED",sample:true}
];
// ข้อมูลจริง นำเข้าจาก Google Sheet "QC Check Sheet" ของบริษัท (แท็บ M-O ต่างประเทศ/ในประเทศ, S-O ต่างประเทศ/ในประเทศ) เมื่อ 22 ก.ย. 2026
// นำเข้าเฉพาะข้อมูลสรุประดับหัวเอกสาร (เลข M/O-S/O, ลูกค้า, ตร.ม., วันที่, ตลาด, สถานะปัจจุบัน) — รายละเอียดลึกระดับแผนก (แผนวางแผน/ย้อม/ทอ/ตกแต่งรายวัน) ยังไม่ได้นำเข้า ต้องกรอกเพิ่มเองต่อ M/O ตามการทำงานจริง
// progress ที่แสดงคำนวณจาก CurrentStage ของชีตต้นทาง (planning≈15% dyeing≈40% weaving≈65% finishing≈85% ส่งของแล้ว=100%) เป็นค่าประมาณสำหรับแสดงผลเท่านั้น ไม่ใช่ตัวเลขจริงจากระบบเดิม
const seedDesignsReal = [
  {id:"MO-0109-26",project:"PO:CC2475 ENTRY ROOM FOYER",customer:"ART RUGS / ANNET NIX",scope:"-",due:"11 ก.ย. 2026",progress:100,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"0109/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"finishing",sample:false},
  {id:"MO-0110-26",project:"PO.CC2475 JR'S OFFICE",customer:"ART RUGS LTD. / ANNET NIX",scope:"-",due:"11 ก.ย. 2026",progress:100,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"0110/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"finishing",sample:false},
  {id:"MO-0111-26",project:"PO.CC2475 DINING ROOM",customer:"ART RUGS LTD. / ANNET NIX",scope:"-",due:"11 ก.ย. 2026",progress:100,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"0111/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"finishing",sample:false},
  {id:"MO-0112-26",project:"PO:CC2475 GLAM ROOM",customer:"ART RUGS / ANNET NIX",scope:"-",due:"11 ก.ย. 2026",progress:100,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"0112/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"finishing",sample:false},
  {id:"MO-0113-26",project:"PO.CC2475 BALLROOM",customer:"ART RUGS LTD. / ANNET NIX",scope:"-",due:"11 ก.ย. 2026",progress:100,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"0113/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"finishing",sample:false},
  {id:"MO-0115-26",project:"PO.CC 2475 TV ROOM",customer:"ART RUGS LTD. / ANNET NIX",scope:"-",due:"11 ก.ย. 2026",progress:100,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"0115/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"finishing",sample:false},
  {id:"MO-0119-26",project:"UMM FAHAD",customer:"GALLERY FRANCAIS",scope:"-",due:"4 ก.ย. 2026",progress:85,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"0119/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"finishing",sample:false},
  {id:"MO-0147-26",project:"VILLA 1063",customer:"ROLLS SUPPLY W.L.L.",scope:"-",due:"25 ก.ย. 2026",progress:65,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"0147/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"weaving",sample:false},
  {id:"MO-0148-26",project:"NIGERIA",customer:"INTERSPAZIO S.R.L.",scope:"-",due:"18 ก.ย. 2026",progress:85,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"0148/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"finishing",sample:false},
  {id:"MO-0149-26",project:"NIGERIA",customer:"INTERSPAZIO S.R.L.",scope:"-",due:"18 ก.ย. 2026",progress:65,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"0149/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"weaving",sample:false},
  {id:"MO-0150-26",project:"RLS/285/26 MAYSA STAIRS (RAWDA)",customer:"ROLLS SUPPLY W.L.L.",scope:"-",due:"18 ก.ย. 2026",progress:100,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"0150/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"finishing",sample:false},
  {id:"MO-0151-26",project:"PO.BRI500037 WESTIN HILTON HEAD",customer:"BRINTONS - USA.",scope:"-",due:"25 ก.ย. 2026",progress:65,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"0151/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"weaving",sample:false},
  {id:"MO-0152-26",project:"SC#2551(A)",customer:"INNOVATIVE CARPETS",scope:"-",due:"15 ก.ย. 2026",progress:100,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"0152/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"finishing",sample:false},
  {id:"MO-0153-26",project:"SC#2551(B)",customer:"INNOVATIVE CARPETS",scope:"-",due:"21 ก.ย. 2026",progress:85,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"0153/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"finishing",sample:false},
  {id:"MO-0154-26",project:"SC#2551(C)",customer:"INNOVATIVE CARPETS",scope:"-",due:"21 ก.ย. 2026",progress:85,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"0154/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"finishing",sample:false},
  {id:"MO-0155-26",project:"SHEIKHA DEEMA AL MANA",customer:"GALLERY FRANCAIS",scope:"-",due:"2 ต.ค. 2026",progress:40,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"0155/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"dyeing",sample:false},
  {id:"MO-0156-26",project:"SC#2553",customer:"INNOVATIVE CARPETS",scope:"-",due:"2 ต.ค. 2026",progress:65,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"0156/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"weaving",sample:false},
  {id:"MO-0157-26",project:"SC#2554",customer:"INNOVATIVE CARPETS",scope:"-",due:"14 ต.ค. 2026",progress:65,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"0157/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"weaving",sample:false},
  {id:"MO-0158-26",project:"SC#2555(A)",customer:"INNOVATIVE",scope:"-",due:"7 ต.ค. 2026",progress:40,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"0158/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"dyeing",sample:false},
  {id:"MO-0159-26",project:"SC#2555(B)",customer:"INNOVATIVE",scope:"-",due:"7 ต.ค. 2026",progress:40,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"0159/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"dyeing",sample:false},
  {id:"MO-0160-26",project:"SC#2556(A)",customer:"INNOVATIVE CARPETS",scope:"-",due:"30 ต.ค. 2026",progress:40,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"0160/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"dyeing",sample:false},
  {id:"MO-0161-26",project:"SC#2556(B)",customer:"INNOVATIVE CARPETS",scope:"HWO-450 CUT & LOW TIGHT LOOP WITH 25% T/S, แต่งเรียบ/พับขอบ",due:"30 ต.ค. 2026",progress:40,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"0161/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"dyeing",sample:false},
  {id:"MO-0162-26",project:"SC#2556(C)",customer:"INNOVATIVE CARPETS",scope:"-",due:"30 ต.ค. 2026",progress:40,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"0162/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"dyeing",sample:false},
  {id:"MO-0164-26",project:"SC#2556(E)",customer:"INNOVATIVE CARPETS",scope:"-",due:"30 ต.ค. 2026",progress:65,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"0164/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"weaving",sample:false},
  {id:"MO-0165-26",project:"SC#2552(A)",customer:"INNOVATIVE CARPETS",scope:"-",due:"9 ต.ค. 2026",progress:65,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"0165/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"weaving",sample:false},
  {id:"MO-0166-26",project:"SC#2552(B)",customer:"INNOVATIVE CARPETS",scope:"-",due:"9 ต.ค. 2026",progress:65,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"0166/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"weaving",sample:false},
  {id:"MO-0167-26",project:"SC#2552(C)",customer:"INNOVATIVE CARPETS",scope:"-",due:"9 ต.ค. 2026",progress:40,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"0167/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"dyeing",sample:false},
  {id:"MO-0168-26",project:"SC#2552(D)",customer:"INNOVATIVE CARPETS",scope:"-",due:"9 ต.ค. 2026",progress:65,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"0168/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"weaving",sample:false},
  {id:"MO-0169-26",project:"PO.3315/26 THE HOUR GLASS-SIAM ICON",customer:"SCM.98",scope:"-",due:"9 ต.ค. 2026",progress:40,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"0169/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"dyeing",sample:false},
  {id:"MO-0170-26",project:"PO.3315/26 THE HOUR GLASS-SIAM ICON",customer:"SCM.98",scope:"-",due:"9 ต.ค. 2026",progress:40,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"0170/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"dyeing",sample:false},
  {id:"MO-0171-26",project:"PO.101346 MAIN VILLA",customer:"AREEN DESIGN",scope:"HPA-450 CUT & LOOP WITH CARVING",due:"2 ต.ค. 2026",progress:15,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"0171/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"planning",sample:false},
  {id:"MO-0172-26",project:"RLS/287/26 ITALY NEW RUGS AN013",customer:"ROLLS SUPPLY",scope:"HWO-450 CUT WITH CARVING",due:"6 พ.ย. 2026",progress:15,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"0172/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"planning",sample:false},
  {id:"MO-0173-26",project:"RLS/287/26 ITALY NEW RUGS AN013",customer:"ROLLS SUPPLY",scope:"HWO-450 CUT WITH CARVING",due:"6 พ.ย. 2026",progress:40,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"0173/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"dyeing",sample:false},
  {id:"MO-0174-26",project:"RLS/287/26 ITALY NEW RUGS AN013",customer:"ROLLS SUPPLY",scope:"HWO-450 CUT WITH CARVING",due:"6 พ.ย. 2026",progress:40,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"0174/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"dyeing",sample:false},
  {id:"MO-0175-26",project:"RLS/287/26 ITALY NEW RUGS AN013",customer:"ROLLS SUPPLY",scope:"HWO-450 CUT WITH CARVING",due:"6 พ.ย. 2026",progress:40,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"0175/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"dyeing",sample:false},
  {id:"MO-0176-26",project:"RLS/286/26 TANUJA",customer:"ROLLS SUPPLY",scope:"HWO-450 CUT WITH CARVING",due:"6 พ.ย. 2026",progress:40,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"0176/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"dyeing",sample:false},
  {id:"MO-0177-26",project:"CEO LIVING ROOM",customer:"GALLERY FRANCAIS",scope:"HWO-450 CUT WIYH CARVING",due:"13 พ.ย. 2026",progress:40,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"0177/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"dyeing",sample:false},
  {id:"MO-0178-26",project:"RLS/288/26 GCC26",customer:"ROLLS SUPPLY",scope:"HWO-450 CUT",due:"25 ก.ย. 2026",progress:65,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"0178/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"weaving",sample:false},
  {id:"MO-0179-26",project:"RLS/288/26 GCC26",customer:"ROLLS SUPPLY",scope:"HWO-450 CUT",due:"25 ก.ย. 2026",progress:40,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"0179/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"dyeing",sample:false},
  {id:"MO-0180-26",project:"MADAM NOOR AL MAADEED",customer:"GALLERY FRANCAIS",scope:"HWO-450 CUT WITH CARVING",due:"13 พ.ย. 2026",progress:15,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"0180/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"planning",sample:false},
  {id:"MO-0181-26",project:"RLS/289/26 CPCMW6",customer:"ROLLS SUPPLY",scope:"HWO-450 CUT WITH CARVING",due:"6 พ.ย. 2026",progress:15,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"0181/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"planning",sample:false},
  {id:"MO-0182-26",project:"RLS/289/26 CPCMW6",customer:"ROLLS SUPPLY",scope:"HWO-450 CUT WITH CARVING",due:"6 พ.ย. 2026",progress:15,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"0182/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"planning",sample:false},
  {id:"MO-TH 123-26",project:"S 047/2569",customer:"คุณ กชวรรณ สัจจา",scope:"-",due:"11 ก.ย. 2026",progress:100,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"TH 123-26",market:"DOMESTIC",importSource:"QC Check Sheet",importStage:"finishing",sample:false},
  {id:"MO-TH 126-26",project:"S 014/2569 Rev.6 “ วังบางขุนพรหม_ ห้องโถงจุไรรัตน์”",customer:"บริษัท เอส.พี.คาร์เปท แอนด์ คลีน จำกัด",scope:"-",due:"10 ก.ย. 2026",progress:100,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"TH 126/26",market:"DOMESTIC",importSource:"QC Check Sheet",importStage:"finishing",sample:false},
  {id:"MO-TH 128-26 CC046-26",project:"PO#000914 D000700 Innovation",customer:"COLIN CAMPBELL",scope:"-",due:"8 ก.ย. 2026",progress:85,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"TH 128/26 CC046/26",market:"DOMESTIC",importSource:"QC Check Sheet",importStage:"finishing",sample:false},
  {id:"MO-TH 131-26",project:"S.052/2569 \"บ้านส่วนตัว\"",customer:"CYRILLE BUHRMAN",scope:"-",due:"21 ก.ย. 2026",progress:100,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"TH 131/26",market:"DOMESTIC",importSource:"QC Check Sheet",importStage:"finishing",sample:false},
  {id:"MO-TH 140-26 CC048-26",project:"PO:0316  PROJECT:ZIG SKINK TUAPE",customer:"DILANA",scope:"-",due:"13 ต.ค. 2026",progress:40,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"TH 140/26 CC048/26",market:"DOMESTIC",importSource:"QC Check Sheet",importStage:"dyeing",sample:false},
  {id:"MO-TH 141-26",project:"S 053/2569",customer:"กองทุนสร้างพระมหาเจดีย์วัดพระธาตุดอยสะเก็ด",scope:"-",due:"15 ก.ย. 2026",progress:100,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"TH 141/26",market:"DOMESTIC",importSource:"QC Check Sheet",importStage:"finishing",sample:false},
  {id:"MO-TH 146-26 CC053-26",project:"PO:#0011140-COLIN CAMPBELL PROJECT BLOOP MAROON",customer:"COLIN CAMPBELL",scope:"-",due:"19 ก.ย. 2026",progress:85,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"TH 146/26 CC053/26",market:"DOMESTIC",importSource:"QC Check Sheet",importStage:"finishing",sample:false},
  {id:"MO-TH 147-26 CC054-26",project:"PO:#0011440-COLIN CAMPBELL PROJECT BLOOP OCHRE",customer:"COLIN CAMPBELL",scope:"-",due:"19 ก.ย. 2026",progress:85,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"TH 147/26 CC054/26",market:"DOMESTIC",importSource:"QC Check Sheet",importStage:"finishing",sample:false},
  {id:"MO-TH 148-26 CC055-26",project:"PO:#001140-COLIN CAMPBELL PROJECT BLOOP DENIM",customer:"COLIN CAMPBELL",scope:"-",due:"19 ก.ย. 2026",progress:40,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"TH 148/26 CC055/26",market:"DOMESTIC",importSource:"QC Check Sheet",importStage:"dyeing",sample:false},
  {id:"MO-TH 150-26",project:"S 072/2569 \"PIANO CARPETS\"",customer:"บริษัท ทูล บ๊อกซ์ โซน จำกัด",scope:"-",due:"14 ก.ย. 2026",progress:100,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"TH 150/26",market:"DOMESTIC",importSource:"QC Check Sheet",importStage:"finishing",sample:false},
  {id:"MO-TH 151-26",project:"S 072/2569 \"PIANO CARPETS\"",customer:"บริษัท ทูล บ๊อกซ์ โซน จำกัด",scope:"-",due:"14 ก.ย. 2026",progress:100,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"TH 151/26",market:"DOMESTIC",importSource:"QC Check Sheet",importStage:"finishing",sample:false},
  {id:"MO-TH 152-26",project:"S 072/26 \"PIANO CARPETS\"",customer:"บริษัท ทูล บ๊อกซ์ โซน จำกัด",scope:"-",due:"14 ก.ย. 2026",progress:100,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"TH 152/26",market:"DOMESTIC",importSource:"QC Check Sheet",importStage:"finishing",sample:false},
  {id:"MO-TH 155-26",project:"TH 155/26",customer:"คุณนรเศรษฐ์ วรเศรษฐ์รักษา",scope:"-",due:"25 ก.ย. 2026",progress:65,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"TH 155/26",market:"DOMESTIC",importSource:"QC Check Sheet",importStage:"weaving",sample:false},
  {id:"MO-TH 159-26",project:"S 074/2569",customer:"บริษัท วีระศิลป์ดีไซน์ จำกัด",scope:"HPA-450CUT(PH=8MM.)",due:"30 ก.ย. 2026",progress:15,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"TH 159/26",market:"DOMESTIC",importSource:"QC Check Sheet",importStage:"planning",sample:false},
  {id:"MO-TH 161-26",project:"PO-D04-6909010 หน้าสาขา ร้าน Reunrom @ FL.G Siam Paragon",customer:"บริษัท คาร์มาร์ท จำกัด (มหาชน) สำนักงานใหญ่",scope:"-",due:"29 ก.ย. 2026",progress:65,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"TH 161/26",market:"DOMESTIC",importSource:"QC Check Sheet",importStage:"weaving",sample:false},
  {id:"MO-TH 162-26",project:"S 051/2569 REV.3",customer:"บริษัท ไอ คอนโด ภูเก็ต จำกัด",scope:"HPRSK-450CUT(PH=7MM.)",due:"20 ต.ค. 2026",progress:40,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"TH 162/26",market:"DOMESTIC",importSource:"QC Check Sheet",importStage:"dyeing",sample:false},
  {id:"MO-TH 164-26",project:"S 089/2569",customer:"คุณคิว",scope:"HPA-450CUT(PH=8MM.)",due:"",progress:15,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"TH 164/26",market:"DOMESTIC",importSource:"QC Check Sheet",importStage:"planning",sample:false},
  {id:"MO-TH 158-26",project:"S 056/2569 LITTLE BUNNY",customer:"บริษัท ลิตเติ้ลบันนี่ กรุ๊ป จำกัด",scope:"-",due:"28 ก.ย. 2026",progress:65,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"TH 158/26",market:"DOMESTIC",importSource:"QC Check Sheet",importStage:"weaving",sample:false},
  {id:"MO-TH 157-26",project:"S054/2569",customer:"บริษัท แปซิฟิก รีเทล จำกัด",scope:"HPA45 LOOP (PH:7MM.)",due:"25 ก.ย. 2026",progress:15,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"TH 157/26",market:"DOMESTIC",importSource:"QC Check Sheet",importStage:"planning",sample:false},
  {id:"MO-TH 132-26 CC047-26",project:"PO#001054 PROJECT HUGHES WOITAS",customer:"COLIN CAMPBELL",scope:"-",due:"9 ก.ย. 2026",progress:100,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"TH 132/26 CC047/26",market:"DOMESTIC",importSource:"QC Check Sheet",importStage:"finishing",sample:false},
  {id:"MO-TH 133-26",project:"S 066/2569",customer:"บริษัท วงปี กรุ๊ป จำกัด",scope:"-",due:"5 ก.ย. 2026",progress:85,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"TH 133-26",market:"DOMESTIC",importSource:"QC Check Sheet",importStage:"finishing",sample:false},
  {id:"MO-TH 160-26  CC057-26",project:"PO-0321",customer:"CACHET CARPETS / DILANA",scope:"-",due:"1 พ.ย. 2026",progress:40,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"TH 160/26  CC057/26",market:"DOMESTIC",importSource:"QC Check Sheet",importStage:"dyeing",sample:false},
  {id:"SO-SC 0358-26",project:"CS4951 [D2605_AE_R1S2_(CS4927)]",customer:"ART RUGS LTD. / LOOP HOUSE",scope:"-",due:"9 ก.ย. 2026",progress:85,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"SC 0358/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"finishing",sample:false},
  {id:"SO-SC 0359-26",project:"MADAM NOOR AL MAADEED (LIVING AREA)",customer:"GALLERY FRANCAIS",scope:"-",due:"9 ก.ย. 2026",progress:100,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"SC 0359/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"finishing",sample:false},
  {id:"SO-SC 0360-26",project:"MADAM NOOR AL MAADEED",customer:"GALLERY FRANCAIS",scope:"-",due:"9 ก.ย. 2026",progress:85,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"SC 0360/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"finishing",sample:false},
  {id:"SO-SC 0361-26",project:"NOOR AL BAKER - RUG 1 (OPTION 04)",customer:"GALLERY FRANCAIS",scope:"-",due:"9 ก.ย. 2026",progress:85,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"SC 0361/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"finishing",sample:false},
  {id:"SO-SC 0362-26",project:"PO VANCOUVER CLUB (OPTION 4)",customer:"M.R. EVANS TRADING CO.,LTD. •",scope:"HWO-550CUT(PH:10MM.)",due:"10 ก.ย. 2026",progress:85,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"SC 0362/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"finishing",sample:false},
  {id:"SO-SC 0363-26",project:"VANCOUVER CLUB (OPTION 2)",customer:"M.R. EVANS TRADING CO.,LTD.",scope:"-",due:"10 ก.ย. 2026",progress:85,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"SC 0363/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"finishing",sample:false},
  {id:"SO-SC 0364-26",project:"CS4952 CONCENTRIC",customer:"ART RUGS LTD. / NINA BURGESS",scope:"-",due:"9 ก.ย. 2026",progress:85,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"SC 0364/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"finishing",sample:false},
  {id:"SO-SC 0365-26",project:"CS 4953 CONCENTRIC",customer:"ART RUGS LTD. / NINA BURGESS",scope:"-",due:"9 ก.ย. 2026",progress:85,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"SC 0365/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"finishing",sample:false},
  {id:"SO-SC 0366-26",project:"HHSM OFFICE",customer:"ROLLS SUPPLY W.L.L.",scope:"-",due:"11 ก.ย. 2026",progress:85,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"SC 0366/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"finishing",sample:false},
  {id:"SO-SC 0367-26",project:"IC#3403(F)",customer:"INNOVATIVE",scope:"HWO-450 CUT (PH=9 MM.)",due:"18 ก.ย. 2026",progress:85,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"SC 0367/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"finishing",sample:false},
  {id:"SO-SC 0368-26",project:"GCC26",customer:"ROLLS SUPPLY W.L.L.",scope:"HWO-450 CUT (PH=9 MM.)",due:"16 ก.ย. 2026",progress:40,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"SC 0368/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"dyeing",sample:false},
  {id:"SO-SC 0371-26",project:"CS4956",customer:"ART RUGS LTD./LOOPHOUSE",scope:"HWO-550CUT(PH:9MM.)UNTWISTED YARN&(PH::8MM.) UNTWISTED YARN",due:"25 ก.ย. 2026",progress:15,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"SC 0371/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"planning",sample:false},
  {id:"SO-SC 0369-26",project:"CPCMW6",customer:"ROLLS SUPPLY W.L.L.",scope:"HWO-450 CUT WITH CARVING (PH=9 MM.)",due:"21 ก.ย. 2026",progress:15,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"SC 0369/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"planning",sample:false},
  {id:"SO-SC 0378-26",project:"CPCMW6",customer:"ROLLS SUPPLY W.L.L.",scope:"HWO-450 CUT WITH CARVING (PH=9 MM.)",due:"21 ก.ย. 2026",progress:15,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"SC 0378/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"planning",sample:false},
  {id:"SO-SC 0370-26",project:"QUALITY SAMPLE",customer:"SIAM CARPETS",scope:"HWO-650 CUT (HIGHT PH:15MM., LOW PH:6MM.) WITH CARVING",due:"28 ก.ย. 2026",progress:15,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"SC 0370/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"planning",sample:false},
  {id:"SO-SC 0372-26",project:"QUALITY SAMPLE",customer:"SIAM CARPETS",scope:"HWO-650 CUT (PH=12 MM.) & HWO-450 CUT (PH=8 MM.)",due:"28 ก.ย. 2026",progress:15,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"SC 0372/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"planning",sample:false},
  {id:"SO-SC 0373-26",project:"QUALITY SAMPLE",customer:"SIAM CARPETS",scope:"HWO-750 CUT & HWO/PRSK-750 CUT & HWO/SPSK-750 CUT (PH=15 TO 6 MM.) WITH CARVING",due:"28 ก.ย. 2026",progress:15,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"SC 0373/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"planning",sample:false},
  {id:"SO-SC 0374-26",project:"QUALITY SAMPLE",customer:"SIAM CARPETS",scope:"HWO-450 CUT (PH:7MM.) & LOOP (PH:6, 7 MM.) & SIGNATURE LOOP (PH:5MM.) & RANDOM LOOP (PH:5MM.) WITH T/S 25%",due:"28 ก.ย. 2026",progress:15,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"SC 0374/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"planning",sample:false},
  {id:"SO-SC 0375-26",project:"QUALITY SAMPLES",customer:"SIAM CARPETS",scope:"HWO-550 CUT WITH CARVING (PH=11 MM.)",due:"28 ก.ย. 2026",progress:15,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"SC 0375/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"planning",sample:false},
  {id:"SO-SC 0376-26",project:"QUALITY SAMPLE",customer:"SIAM CARPETS",scope:"HWO-450 HI/LOW CUT (PH=10, 8 MM.)",due:"28 ก.ย. 2026",progress:15,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"SC 0376/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"planning",sample:false},
  {id:"SO-SC 0377-26",project:"QUALITY SAMPLE",customer:"SIAM CARPETS",scope:"HWO/BBVC-450 CUT & LOOP WITH CARVING (PH=9 MM.)",due:"28 ก.ย. 2026",progress:15,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"SC 0377/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"planning",sample:false},
  {id:"SO-SC 0381-26",project:"HAMAD VILLA",customer:"GALLERY",scope:"HWO-450 CUT (PH=9 MM.)",due:"26 ก.ย. 2026",progress:15,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"SC 0381/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"planning",sample:false},
  {id:"SO-SC 0384-26",project:"HAMAD VILLA",customer:"GALLERY",scope:"HWO-450 CUT (PH=9 MM.)",due:"26 ก.ย. 2026",progress:15,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"SC 0384/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"planning",sample:false},
  {id:"SO-SC 0382-26",project:"ทดสอบไหม NYLON",customer:"SIAM CARPETS",scope:"HPA-450 CUT & LOOP (PH=9 MM.)",due:"22 ก.ย. 2026",progress:15,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"SC 0382/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"planning",sample:false},
  {id:"SO-SC 0383-26",project:"ทดสอบไหม NYLON",customer:"SIAM CARPETS",scope:"HPA-450 CUT & LOOP (PH=9 MM.)",due:"22 ก.ย. 2026",progress:15,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"SC 0383/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"planning",sample:false},
  {id:"SO-SC 0379-26",project:"ทดสอบไหม NYLON",customer:"SIAM CARPETS",scope:"HPA-450 CUT & LOOP (PH=9 MM.)",due:"22 ก.ย. 2026",progress:15,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"SC 0379/26",market:"FOREIGN",importSource:"QC Check Sheet",importStage:"planning",sample:false},
  {id:"SO-D 171-26",project:"HANN RESIDENCE",customer:"บริษัท อาณาสรา ดีเวลลอปเมนท์ จำกัด",scope:"-",due:"7 ก.ย. 2026",progress:85,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"D 171/26",market:"DOMESTIC",importSource:"QC Check Sheet",importStage:"finishing",sample:false},
  {id:"SO-D 176-26",project:"HANN RESIDENCE",customer:"บริษัท อาณาสรา ดีเวลลอปเมนท์ จำกัด",scope:"HBBVC-550 HI-CUT (PH= 10, 8 MM.)",due:"18 ก.ย. 2026",progress:65,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"D 176/26",market:"DOMESTIC",importSource:"QC Check Sheet",importStage:"weaving",sample:false},
  {id:"SO-D0177-26",project:"D0177/26",customer:"บริษัท อาสาเฟอร์นิเจอร์ จำกัด",scope:"-",due:"",progress:65,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"D0177/26",market:"DOMESTIC",importSource:"QC Check Sheet",importStage:"weaving",sample:false},
  {id:"SO-D0178-26",project:"แพนแปซิฟิค ทองหล่อ",customer:"บริษัท ปิยะ สมบัตื ทองหล่อ จำกัด",scope:"HWO/HBBVC-450CUT(PH=8MM.)",due:"24 ก.ย. 2026",progress:15,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"D0178/26",market:"DOMESTIC",importSource:"QC Check Sheet",importStage:"planning",sample:false},
  {id:"SO-D0179-26",project:"แพนแปซิฟิค ทองหล่อ",customer:"บริษัท ปิยะ สมบัตื ทองหล่อ จำกัด",scope:"HWO-450CUT/LOOP_OVERTUFT",due:"24 ก.ย. 2026",progress:15,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"D0179/26",market:"DOMESTIC",importSource:"QC Check Sheet",importStage:"planning",sample:false},
  {id:"SO-D0180-26",project:"SHOP GUCCI",customer:"บริษัท ยัวร์ คอนเซ็ปต์ จำกัด",scope:"HPA-450CUT(PH=8MM.)",due:"",progress:15,status:"APPROVED",quote:"READY",owner:"",job:"OPENED",moNo:"D0180/26",market:"DOMESTIC",importSource:"QC Check Sheet",importStage:"planning",sample:false}
];
const seedDesigns = [...seedDesignsSample, ...seedDesignsReal];
const storedDesigns = (() => {
  try { return JSON.parse(localStorage.getItem("enterprise-design-requests") || "null"); } catch { return null; }
})();
const designs = Array.isArray(storedDesigns) && storedDesigns.length ? storedDesigns : seedDesigns;
const saveDesigns = () => localStorage.setItem("enterprise-design-requests", JSON.stringify(designs));

const baseTasks = [
  {designId:"DES-26031",id:"JOB-26031",name:"Seal Beach Collection",dept:"Production",start:0,end:1,color:"production",status:"done"},
  {designId:"DES-26031",id:"JOB-26031",name:"Dye Plan · SB-04",dept:"Dyeing",start:1,end:2.5,color:"dyeing",status:"active"},
  {designId:"DES-26031",id:"JOB-26031",name:"Weaving · SB-04",dept:"Weaving",start:2,end:5,color:"weaving",status:"active"}
];

const days = [["จ.",21],["อ.",22],["พ.",23],["พฤ.",24],["ศ.",25],["ส.",26],["อา.",27]];
const monthNames=["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
let offset = 0;

function tag(text, kind=""){return `<span class="status-tag ${kind}">${text}</span>`;}
function statusKind(status){return status==="APPROVED"||status==="READY"||status==="OPENED"?"":status==="IN REVIEW"||status==="PENDING"?"review":"blocked";}
function toast(message){const el=document.createElement("div");el.className="toast";el.textContent=message;document.body.append(el);setTimeout(()=>el.remove(),2200);}
const REPORT_DATE = new Date("2026-09-21T23:59:59");
function toDate(value){
  if(!value) return null;
  if(value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const text=String(value).trim();
  if(!text) return null;
  const thai=text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(thai){
    const year=Number(thai[3])>2400?Number(thai[3])-543:Number(thai[3]);
    return new Date(`${year}-${String(thai[2]).padStart(2,"0")}-${String(thai[1]).padStart(2,"0")}T12:00:00`);
  }
  const date=new Date(text);
  return Number.isNaN(date.getTime())?null:date;
}
const isBlank=(value)=>value===undefined||value===null||String(value).trim()==="";
function mergeDesignRow(oldRow,newRow){
  const merged={...oldRow};
  Object.entries(newRow).forEach(([key,value])=>{ if(!isBlank(value)||!(key in merged)) merged[key]=isBlank(value)?"":value; });
  return merged;
}
function excelDateToISO(value){
  if(value instanceof Date&&!Number.isNaN(value.getTime())) return `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,"0")}-${String(value.getDate()).padStart(2,"0")}`;
  if(typeof value==="number"&&value>20000&&value<80000) return new Date(Date.UTC(1899,11,30)+Math.floor(value)*86400000).toISOString().slice(0,10);
  return isBlank(value)?"":String(value).trim();
}
function normalizeDesigner(value){return String(value||"ไม่ระบุ").trim().replace(/\s+/g," ").toUpperCase();}
function periodRange(value){
  if(!value||value==="all") return null;
  const [period,yearPart,...rest]=value.split("-");
  const year=Number(yearPart);
  if(period==="month"){
    const month=Number(rest[0]);
    return {start:new Date(year,month-1,1),end:new Date(year,month,1)};
  }
  if(period==="quarter"){
    const quarter=Number(String(rest[0]||"").replace("Q",""));
    const startMonth=(quarter-1)*3;
    return {start:new Date(year,startMonth,1),end:new Date(year,startMonth+3,1)};
  }
  if(period==="year") return {start:new Date(year,0,1),end:new Date(year+1,0,1)};
  return null;
}
function inPeriod(dateValue, range){
  if(!range) return true;
  const date=toDate(dateValue);
  return Boolean(date&&date>=range.start&&date<range.end);
}

function setView(view){
  $$(".app-view").forEach((section)=>section.classList.toggle("active-view",section.id===`${view}View`||(view==="overview"&&section.id==="planningView"))); // หน้า Planning (Master Plan Gantt) เดิม ถูกย้ายมารวมแสดงต่อท้ายหน้า "ภาพรวมการผลิต" แล้ว ไม่มีแท็บแยกอีกต่อไป
  $$(".nav-link[data-view]").forEach((button)=>button.classList.toggle("active",button.dataset.view===view));
  const flowView=({cost:"design",salesreport:"sales",shipping:"sales",calc:"design",colors:"design",planwork:"planning",pattern:"planning",weaveissue:"planning",weavefloor:"planning",finishing:"planning",qcdash:"planning"})[view]||view; // หน้าต้นทุนอยู่ในขั้น Design · รายงานขาย/ใบส่งอยู่ในขั้น Sales · ใบวางแผนงาน/เจาะลาย/ส่งแผนกทอ/แผนกทอ/ทากาวตกแต่ง/QC อยู่ในขั้น Planning
  $$(".workflow-step").forEach((step)=>{
    const order={design:1,sales:2,planning:3};
    step.classList.toggle("active",step.dataset.workflow===flowView);
    step.classList.toggle("completed",order[step.dataset.workflow]<order[flowView]);
  });
  const strip=$(".workflow-strip");if(strip) strip.classList.toggle("hidden-strip",view==="overview");
  if(view==="overview"&&typeof renderOverview==="function") renderOverview();
  if(view==="design"){populateDesignerPeriods();renderDesign();}
  if(view==="cost"&&typeof renderCost==="function") renderCost();
  if(view==="sales") renderSales();
  if(view==="salesreport"&&typeof renderSalesReport==="function") renderSalesReport();
  if(view==="shipping"&&typeof renderShipping==="function") renderShipping();
  if(view==="calc"&&typeof renderCalc==="function") renderCalc();
  if(view==="colors"&&typeof renderColors==="function") renderColors();
  if(view==="overview") renderPlanning();
  if(view==="planwork"&&typeof renderPlanWork==="function") renderPlanWork();
  if(view==="pattern"&&typeof renderPattern==="function") renderPattern();
  if(view==="weaveissue"&&typeof renderWeaveIssue==="function") renderWeaveIssue();
  if(view==="weavefloor"&&typeof renderWeaveFloor==="function") renderWeaveFloor();
  if(view==="finishing"&&typeof renderFinishing==="function") renderFinishing();
  if(view==="qcdash"&&typeof renderQcDashboard==="function") renderQcDashboard();
}

function summaryCards(target,cards){
  $(target).innerHTML=cards.map(([label,value,note])=>`<article class="summary-card"><small>${label}</small><strong>${value}</strong><span>${note}</span></article>`).join("");
}

function renderDesign(){
  populateDesignerPeriods();
  const query=$("#designSearch").value.trim().toLowerCase();
  const rows=designs.filter((row)=>!query||`${row.id} ${row.project} ${row.customer}`.toLowerCase().includes(query));
  summaryCards("#designSummary",[
    ["คำขอทั้งหมด",designs.length,"Design requests"],
    ["กำลังจัดทำ",designs.filter(x=>["DRAFT","IN REVIEW"].includes(x.status)).length,"Draft และ Review"],
    ["อนุมัติแล้ว",designs.filter(x=>x.status==="APPROVED").length,"พร้อมส่งฝ่ายขาย"],
    ["รออนุมัติ",designs.filter(x=>x.status!=="APPROVED").length,"ยังเปิดงานไม่ได้"]
  ]);
  const completed=designs.filter(x=>x.status==="APPROVED"||x.submittedDate).length;
  const received=designs.filter(x=>x.receivedDate).length;
  const overdue=designs.filter(x=>x.dueDate && !x.submittedDate && new Date(x.dueDate)<new Date()).length;
  const leadTimes=designs.filter(x=>x.receivedDate&&x.submittedDate).map(x=>(new Date(x.submittedDate)-new Date(x.receivedDate))/86400000).filter(x=>x>=0);
  const avgLead=leadTimes.length ? `${(leadTimes.reduce((a,b)=>a+b,0)/leadTimes.length).toFixed(1)} วัน` : "ไม่มีข้อมูล";
  const designers=new Set(designs.map(x=>x.owner||x.designer).filter(Boolean)).size;
  $("#designKpiGrid").innerHTML=[
    ["งานรับเข้า",received,"รายการที่มีวันที่รับงาน",""],["ส่งงานแล้ว",completed,`${received?((completed/received)*100).toFixed(1):0}% ของงานรับเข้า`,""],["งานค้าง",Math.max(0,received-completed),"ยังไม่มีวันที่ส่งงาน",""],["งานเกินกำหนด",overdue,"ยังไม่ส่งและเกิน Due Date",overdue?"risk":""],["Lead time เฉลี่ย",avgLead,"จากวันที่รับถึงส่งงาน",""],["Designer ที่มีงาน",designers,"จำนวนผู้รับผิดชอบ",""]
  ].map(([label,value,note,kind])=>`<article class="design-kpi ${kind}"><small>${label}</small><strong>${value}</strong><span>${note}</span></article>`).join("");
  renderDesignerKpi();
  $("#designTable").innerHTML=rows.map((row)=>`<tr>
    <td><strong>${row.id}</strong><small>${row.owner}</small></td>
    <td><strong>${row.project}</strong><small>${row.customer}</small>${typeof salesRowExtra==="function"?salesRowExtra(row):""}</td>
    <td>${row.scope}</td><td>${row.due}</td>
    <td><strong>${row.progress}%</strong><div class="row-progress"><i style="width:${row.progress}%"></i></div></td>
    <td>${tag(row.status,statusKind(row.status))}</td>
    <td><button class="action-button ${row.status==="IN REVIEW"?"primary":""}" data-approve="${row.id}" ${row.status==="APPROVED"?"disabled":""}>${row.status==="APPROVED"?"ส่งฝ่ายขายแล้ว":row.status==="IN REVIEW"?"อนุมัติแบบ":"อัปเดตแบบ"}</button></td>
  </tr>`).join("");
  $$("[data-approve]").forEach((button)=>button.addEventListener("click",()=>approveDesign(button.dataset.approve)));
}

function renderDesignerKpi(){
  const selectedPeriod=$("#designerKpiPeriod")?.value||"all";
  const range=periodRange(selectedPeriod);
  const periodRows=designs.filter((row)=>inPeriod(row.receivedDate,range));
  const groups=new Map();
  periodRows.forEach((row)=>{
    const key=normalizeDesigner(row.owner||row.designer);
    if(!groups.has(key)) groups.set(key,{name:key,total:0,submitted:0,onTime:0,pending:0,overdue:0,lead:[]});
    const item=groups.get(key);
    item.total+=1;
    const received=toDate(row.receivedDate);
    const due=toDate(row.dueDate);
    const submitted=toDate(row.submittedDate);
    if(submitted){
      item.submitted+=1;
      if(due&&submitted<=due) item.onTime+=1;
      if(received){
        const days=(submitted-received)/86400000;
        if(days>=0) item.lead.push(days);
      }
    } else {
      item.pending+=1;
      if(due&&due<REPORT_DATE) item.overdue+=1;
    }
  });
  const rows=[...groups.values()].sort((a,b)=>a.name.localeCompare(b.name));
  $("#designerKpiCount").textContent=`${rows.length} Designer · ${periodRows.length} งาน`;
  $("#designerKpiTable").innerHTML=rows.length?rows.map((row)=>{
    const rate=row.submitted?`${(row.onTime/row.submitted*100).toFixed(1)}%`:"ไม่มีข้อมูล";
    const avg=row.lead.length?`${(row.lead.reduce((a,b)=>a+b,0)/row.lead.length).toFixed(1)} วัน`:"ไม่มีข้อมูล";
    const status=row.overdue?"ต้องติดตาม":row.pending?"กำลังทำ":"ตามแผน";
    const kind=row.overdue?"blocked":row.pending?"review":"";
    return `<tr><td class="designer-name">${row.name}</td><td>${row.total}</td><td>${row.submitted}</td><td>${row.onTime}</td><td><div class="designer-score"><span>${rate}</span>${row.submitted?`<span class="score-bar"><i style="width:${Math.min(row.onTime/row.submitted*100,100)}%"></i></span>`:""}</div></td><td>${row.pending}</td><td>${row.overdue}</td><td>${avg}</td><td>${tag(status,kind)}</td></tr>`;
  }).join(""):`<tr><td colspan="9" class="empty-gantt">ยังไม่มีข้อมูล Designer</td></tr>`;
}
function populateDesignerPeriods(){
  const select=$("#designerKpiPeriod");
  const current=select.value||"all";
  const years=new Set();
  designs.forEach((row)=>{const date=toDate(row.receivedDate);if(date) years.add(date.getFullYear());});
  years.add(2026);
  const orderedYears=[...years].sort((a,b)=>b-a);
  select.innerHTML=`<option value="all">ทุกช่วงเวลา</option>${orderedYears.map((year)=>`
    <optgroup label="รายเดือน · ${year}">${monthNames.map((name,index)=>`<option value="month-${year}-${String(index+1).padStart(2,"0")}">${name} ${year}</option>`).join("")}</optgroup>
    <optgroup label="รายไตรมาส · ${year}">${[1,2,3,4].map((quarter)=>`<option value="quarter-${year}-Q${quarter}">ไตรมาส ${quarter} · ${year}</option>`).join("")}</optgroup>
    <option value="year-${year}">ปี ${year}</option>`).join("")}`;
  if([...select.options].some((option)=>option.value===current)) select.value=current;
}

function approveDesign(id){
  const row=designs.find((item)=>item.id===id);
  if(row.status==="DRAFT"){row.status="IN REVIEW";row.progress=85;toast(`${id}: ส่งแบบเข้าตรวจสอบแล้ว`);}
  else if(row.status==="IN REVIEW"){row.status="APPROVED";row.progress=100;row.job="PENDING";row.submittedDate=row.submittedDate||"2026-09-21";toast(`${id}: อนุมัติแบบและส่งฝ่ายขายแล้ว`);}
  saveDesigns();
  renderDesign();
}

function renderSales(){
  const query=$("#salesSearch").value.trim().toLowerCase();
  const rows=designs.filter((row)=>!query||`${row.id} ${row.project} ${row.customer}`.toLowerCase().includes(query));
  const approved=designs.filter(x=>x.status==="APPROVED").length;
  $("#salesGateLabel").textContent=`แบบอนุมัติ ${approved} รายการ`;
  summaryCards("#salesSummary",[
    ["รายการจาก Design",designs.length,"Design references"],
    ["แบบอนุมัติ",approved,"ผ่าน Gate 1"],
    ["Quotation พร้อม",designs.filter(x=>x.quote==="READY").length,"พร้อมเปิด Job"],
    ["เปิดไป Planning",designs.filter(x=>x.job==="OPENED").length,"Sales confirmed"]
  ]);
  $("#salesTable").innerHTML=rows.map((row)=>{
    const canOpen=row.status==="APPROVED"&&row.quote==="READY"&&row.job!=="OPENED";
    return `<tr>
      <td><strong>${row.id}</strong></td><td><strong>${row.project}</strong><small>${row.customer}</small>${typeof salesRowExtra==="function"?salesRowExtra(row):""}</td>
      <td>${tag(row.status,statusKind(row.status))}</td><td>${tag(row.quote,statusKind(row.quote))}</td>
      <td>${(typeof costSaleOf==="function"&&costSaleOf(row))||row.owner}</td><td>${tag(row.job,statusKind(row.job))}</td>
      <td><button class="action-button ${canOpen?"primary":""}" data-open-job="${row.id}" ${canOpen?"":"disabled"}>${row.job==="OPENED"?"ส่ง Planning แล้ว":"เปิด Job · ออกเลข M/O"}</button>${typeof salesOpenForm==="function"?` <button class="action-button" data-so="${row.id}">+ SO ตัวอย่าง</button>`:""}</td>
    </tr>`;
  }).join("");
  $$("[data-open-job]").forEach((button)=>button.addEventListener("click",()=>openJob(button.dataset.openJob)));
  $$("[data-so]").forEach((button)=>button.addEventListener("click",()=>salesOpenForm({type:"SO",designId:button.dataset.so})));
}

function openJob(id){
  const row=designs.find((item)=>item.id===id);
  if(row.status!=="APPROVED"){toast("ยังเปิดงานไม่ได้: Design ยังไม่อนุมัติแบบ");return;}
  if(row.quote!=="READY"){toast("ยังเปิดงานไม่ได้: Quotation ยังไม่พร้อม");return;}
  // ฝ่ายขายออกเลข M/O ก่อน (รายงานขาย) แล้วจึงส่ง Planning — ถ้าไม่มีโมดูลรายงานขายให้เปิด Job ทันที
  if(typeof salesOpenForm==="function"){salesOpenForm({type:"MO",designId:id});return;}
  finishOpenJob(id);
}

function finishOpenJob(id,moNo){
  const row=designs.find((item)=>item.id===id);
  if(!row) return;
  row.job="OPENED";
  if(moNo) row.moNo=moNo;
  if(!baseTasks.some((task)=>task.designId===id)){
    baseTasks.push({designId:id,id:`JOB-${id.slice(4)}`,name:row.project,dept:"Production",start:3.2,end:4.3,color:"production",status:"active"});
    baseTasks.push({designId:id,id:`JOB-${id.slice(4)}`,name:`Planning · ${row.project}`,dept:"Dyeing",start:4.3,end:5.5,color:"dyeing",status:"active"});
  }
  saveDesigns();
  toast(`${id}: ฝ่ายขายเปิด Job${moNo?` (${moNo})`:""} และส่ง Planning แล้ว`);
  renderSales();
}

function renderPlanning(){
  const kpi=typeof WeavingEngine!=="undefined"&&WeavingEngine.planningKpi?WeavingEngine.planningKpi():null;
  summaryCards("#summaryCards",[
    ["Job จากฝ่ายขาย",designs.filter(x=>x.job==="OPENED").length,"Sales opened"],
    ["กำลังวางแผน",baseTasks.length,"Scheduled operations"],
    ["M/O รับเข้า (Planning)",kpi?kpi.intake:0,"บันทึกแผนแล้ว"],
    ["ช่วงแผน","21–27 ก.ย.","Current horizon"],
    ["งานเสร็จแล้ว",baseTasks.filter(x=>x.status==="done").length,"Completed operations"],
    ["KPI ส่งตรงตามกำหนด",kpi&&kpi.passRate!=null?`${kpi.passRate.toFixed(0)}%`:"ไม่มีข้อมูล",kpi?`ผ่าน ${kpi.onTime} · ไม่ผ่าน ${kpi.late} · รอส่ง ${kpi.pending}`:"รอข้อมูลวันส่งจริงจากฝ่ายขาย"]
  ]);
  renderDates();
  renderGantt();
  $("#unallocatedCount").textContent=`${designs.filter(x=>x.job==="OPENED"&&!baseTasks.some(t=>t.designId===x.id)).length} รายการ`;
  renderPlanningKpiTable(kpi);
  renderPlanningYarnRequests();
}
function renderPlanningYarnRequests(){
  const el=$("#planningYarnRequests");
  if(!el) return;
  const reqs=typeof WeaveFloorEngine!=="undefined"&&WeaveFloorEngine.pendingYarnRequests?WeaveFloorEngine.pendingYarnRequests():[];
  if(!reqs.length){ el.innerHTML=`<p class="col-empty">ยังไม่มีคำขอไหมเพิ่มจากแผนกทอที่รอดำเนินการ</p>`; return; }
  el.innerHTML=`<table class="calc-table"><thead><tr><th>Design/M-O</th><th>หม้อย้อม/สี</th><th class="num">ขอเพิ่ม (กก.)</th><th>ต้องการภายใน</th><th>เหตุผล</th><th>ขอเมื่อ</th></tr></thead><tbody>${reqs.map(r=>{const plan=WeaveFloorEngine.planFor(r.designId);return `<tr><td>${plan?(plan.moNo||r.designId):r.designId}</td><td>${r.label}</td><td class="num">${(+r.requestedKg||0).toFixed(3)}</td><td>${r.neededDate||"-"}</td><td>${r.reason||"-"}</td><td>${new Date(r.requestedAt).toLocaleDateString("th-TH")}</td></tr>`;}).join("")}</tbody></table><p style="color:var(--muted);font-size:10px;margin:6px 2px 0">ไปออกใบสั่งย้อมเพิ่มในหน้า "ใบวางแผนงาน" ของ M/O นั้น แล้วกดยืนยันผู้อนุมัติที่แท็บ "สรุป/ส่งออก/แจ้งเตือน" ในหน้าแผนกทอ</p>`;
}
function renderPlanningKpiTable(kpi){
  const el=$("#planningKpiTable");
  if(!el) return;
  if(!kpi||!kpi.rows.length){ el.innerHTML=`<p class="col-empty">ยังไม่มี M/O ที่ Planning บันทึกแผน</p>`; return; }
  const statusTag=(s)=>s==="onTime"?tag("ส่งตรงตามกำหนด",""):s==="late"?tag("ส่งล่าช้า","blocked"):tag("รอส่ง/รอ INV","review");
  el.innerHTML=`<table class="calc-table"><thead><tr><th>Design</th><th>M/O</th><th>โปรเจกต์</th><th>กำหนดตาม Plan</th><th>เลข INV</th><th>วันส่งจริง</th><th>สถานะ</th></tr></thead><tbody>${kpi.rows.map(r=>`<tr><td>${r.designId}</td><td>${r.moNo}</td><td>${r.project}</td><td>${r.committed||"-"}</td><td>${r.inv||"-"}</td><td>${r.shipped||"-"}</td><td>${statusTag(r.status)}</td></tr>`).join("")}</tbody></table>`;
}

function renderDates(){
  $("#dateHeader").innerHTML=days.map(([label,date],index)=>`<div class="date-cell ${index===0&&$("#showToday").checked?"today":""}"><span>${label}</span><strong>${date+offset}</strong></div>`).join("");
}

function renderGantt(){
  const query=$("#searchInput").value.trim().toLowerCase();
  const rows=baseTasks.filter((task)=>(!$("#hideDone").checked||task.status!=="done")&&(!query||`${task.id} ${task.name} ${task.dept}`.toLowerCase().includes(query)));
  $("#resultCount").textContent=`${rows.length} งาน`;
  if(!rows.length){
    $("#taskRows").innerHTML='<div class="empty-gantt">ยังไม่มี Job ที่ผ่าน Sales Gate</div>';
    $("#barsArea").innerHTML="";
    return;
  }
  $("#taskRows").innerHTML=rows.map(task=>`<div class="task-row"><div><strong>${task.dept}</strong><small>${task.id} · ${task.name}</small></div></div>`).join("");
  $("#barsArea").innerHTML=rows.map(task=>`<div class="bar-row"><div class="bar ${task.color}" style="left:${task.start/7*100}%;width:${Math.max((task.end-task.start)/7*100,9)}%">${task.name}</div></div>`).join("");
  if($("#showToday").checked){const line=document.createElement("div");line.className="today-line";line.style.left="18%";$("#barsArea").append(line);}
}

$$(".nav-link[data-view]").forEach((button)=>button.addEventListener("click",()=>setView(button.dataset.view)));
$("#designSearch").addEventListener("input",renderDesign);
$("#designerKpiPeriod").addEventListener("change",renderDesignerKpi);
$("#salesSearch").addEventListener("input",renderSales);
$("#searchInput").addEventListener("input",renderGantt);
$("#hideDone").addEventListener("change",renderGantt);
$("#showToday").addEventListener("change",()=>{renderDates();renderGantt();});
$("#refreshButton").addEventListener("click",()=>{offset=0;renderPlanning();});
$("#refreshSalesButton").addEventListener("click",renderSales);
$("#prevWeek").addEventListener("click",()=>{offset-=7;renderDates();renderGantt();});
$("#nextWeek").addEventListener("click",()=>{offset+=7;renderDates();renderGantt();});
$("#addDesignButton").addEventListener("click",()=>{$("#designFormPanel").hidden=false;$("#designFormPanel").scrollIntoView({behavior:"smooth",block:"center"});});
$("#closeDesignForm").addEventListener("click",()=>$("#designFormPanel").hidden=true);
$("#designForm").addEventListener("submit",(event)=>{
  event.preventDefault();
  const data=Object.fromEntries(new FormData(event.currentTarget).entries());
  designs.unshift({id:data.id,project:data.project||"-",customer:data.customer,scope:data.description||"ทำแบบ",due:data.dueDate||"",progress:data.submittedDate?100:20,status:data.submittedDate?"APPROVED":"DRAFT",quote:"WAITING",owner:data.designer,designer:data.designer,receivedDate:data.receivedDate, dueDate:data.dueDate, submittedDate:data.submittedDate, note:data.note,job:"BLOCKED"});
  saveDesigns();event.currentTarget.reset();$("#designFormPanel").hidden=true;toast("บันทึกรายการทำแบบแล้ว");renderDesign();
});
$("#designFile").addEventListener("change",async(event)=>{
  const file=event.target.files[0]; if(!file) return;
  if(!window.XLSX){$("#importStatus").textContent="ไม่พบตัวอ่าน Excel กรุณาเปิดหน้าเว็บขณะเชื่อมต่ออินเทอร์เน็ต";return;}
  // อ่านวันที่เป็นเลข serial แล้วแปลงเอง เพื่อไม่ให้วันที่เลื่อน 1 วันตามเขตเวลา (cellDates ใน UTC+7 ทำให้ 9 ม.ค. กลายเป็น 8 ม.ค.)
  const buffer=await file.arrayBuffer(); const workbook=XLSX.read(buffer,{type:"array"});
  const picker=$("#sheetPicker"); picker.innerHTML=`<option value="__ALL__">ทุกชีต (${workbook.SheetNames.length})</option>`+workbook.SheetNames.map(name=>`<option value="${name}">${name}</option>`).join(""); picker.disabled=false; $("#importDesignButton").disabled=false;
  event.target._workbook=workbook; $("#importStatus").textContent=`โหลดไฟล์ ${file.name} แล้ว · ${workbook.SheetNames.length} ชีต`;
});
$("#importDesignButton").addEventListener("click",()=>{
  const file=$("#designFile").files[0], input=$("#designFile"); const workbook=input._workbook;
  if(!workbook){toast("กรุณาเลือกไฟล์ Excel ก่อน");return;}
  const sheet=$("#sheetPicker").value, rows=[];
  // นำเข้าชีตที่มีแถวมากที่สุด (ชีตรวม "ตารางการทำงาน") ก่อน แล้วให้ชีตลูกค้าทับด้วยค่าที่ไม่ว่าง เพราะวันที่รับงานในชีตลูกค้าน่าเชื่อถือกว่า
  const sheetSize=(name)=>{const ref=workbook.Sheets[name]["!ref"];return ref?XLSX.utils.decode_range(ref).e.r:0;};
  workbook.SheetNames.filter(name=>sheet==="__ALL__"||name===sheet).sort((a,b)=>sheetSize(b)-sheetSize(a)).forEach(name=>{
    const values=XLSX.utils.sheet_to_json(workbook.Sheets[name],{header:1,defval:""});
    values.forEach(row=>{
      if(!row[3]||String(row[3]).trim()==="Design No."||String(row[3]).trim()==="") return;
      rows.push({id:String(row[3]).trim(),receivedDate:excelDateToISO(row[0]),dueDate:excelDateToISO(row[1]),grade:row[2],description:row[4],customer:row[5],project:row[6],owner:row[7],designer:row[7],submittedDate:excelDateToISO(row[8]),note:row[9]});
    });
  });
  // Design No. เดียวกันอาจอยู่ทั้งในชีตลูกค้าและชีต "ตารางการทำงาน" → รวมโดยไม่ให้ค่าว่างทับค่าที่มีอยู่
  const map=new Map(designs.map(row=>[row.id,row]));
  rows.forEach(row=>{
    const merged=mergeDesignRow(map.get(row.id)||{status:"IN REVIEW",progress:40,quote:"WAITING",job:"BLOCKED"},row);
    merged.scope=merged.description||merged.scope||"ทำแบบ";
    if(merged.submittedDate&&merged.status!=="APPROVED"){merged.status="APPROVED";merged.progress=100;}
    map.set(row.id,merged);
  });
  designs.splice(0,designs.length,...map.values()); saveDesigns();
  $("#importStatus").textContent=`นำเข้าแล้ว ${rows.length} แถว → ${new Set(rows.map(r=>r.id)).size} Design No. (รวมรายการซ้ำระหว่างชีตแล้ว) จากชีต ${sheet==="__ALL__"?"ทุกชีต":sheet}`; toast("นำเข้าตารางทำแบบเรียบร้อย"); renderDesign();
});
$$(".view-btn").forEach((button)=>button.addEventListener("click",()=>{$$(".view-btn").forEach(b=>b.classList.remove("active"));button.classList.add("active");toast(`เปลี่ยนมุมมองเป็น ${button.textContent}`);}));

setView("design");
