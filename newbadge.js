/* ============================================================
   NewBadge — ป้าย "NEW" แจ้งเตือนงาน M/O ใหม่ในแต่ละแผนก
   หลักการ: ไม่ต้องมี flag พิเศษบน design — ถือว่า "ใหม่" สำหรับแผนกใด
   ถ้าแผนกนั้นยังไม่เคยเปิด/เลือกงานนี้มาก่อน (เก็บ log แยกตามแผนกไว้ใน
   localStorage) พอผู้ใช้กดเปิดงานในแผนกนั้นครั้งแรก ก็ถือว่า "เห็นแล้ว"
   ป้าย NEW จะหายไปเฉพาะแผนกนั้น (แผนกอื่นที่ยังไม่เปิดจะยังเห็น NEW อยู่)
   ต้องโหลดหลัง app.js และก่อนไฟล์แผนกต่าง ๆ (planning.js, dyeing.js, pattern.js,
   weaving.js, weave-floor.js, finishing.js)
   ============================================================ */
(function () {
  "use strict";
  const KEY = "siam-seen-jobs"; // { [dept]: [designId, ...] }
  const readJson = (k, fb) => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : fb; } catch (e) { return fb; } };
  const writeJson = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ใช้ต่อได้แม้บันทึกไม่ได้ */ } };

  function seenSet(dept) {
    const all = readJson(KEY, {});
    return new Set(all[dept] || []);
  }
  function isNew(dept, id) {
    if (!id || !dept) return false;
    return !seenSet(dept).has(id);
  }
  function markSeen(dept, id) {
    if (!id || !dept) return;
    const all = readJson(KEY, {});
    const set = new Set(all[dept] || []);
    if (set.has(id)) return; // ไม่ต้องเขียนซ้ำถ้าเห็นแล้ว
    set.add(id);
    all[dept] = [...set];
    writeJson(KEY, all);
  }
  // ป้ายกำกับสำหรับใส่ในการ์ดงาน — ใส่ id ว่างได้ (จะไม่ขึ้นป้าย)
  function badgeHtml(dept, id) {
    return isNew(dept, id) ? `<span class="status-tag new" title="งาน M/O นี้เพิ่งเข้ามาใหม่ ยังไม่เคยเปิดในแผนกนี้">ใหม่ · NEW</span>` : "";
  }
  const DEPTS = ["planning", "weaveissue", "weavefloor", "pattern", "dyeing", "finishing"];
  // ครั้งแรกที่ฟีเจอร์นี้ทำงาน (ยังไม่เคยมี log เก็บไว้เลย) ให้ถือว่างานที่เปิดอยู่ก่อนหน้านี้ทั้งหมด "เห็นแล้ว" ทุกแผนก
  // ไม่งั้นพองานเก่าที่ทำค้างอยู่แล้วเป็นสิบเป็นร้อยรายการจะขึ้นป้าย "ใหม่" หลอกทันทีที่อัปเดตเว็บ — ป้าย NEW ควรขึ้นเฉพาะ
  // M/O ที่เพิ่งเข้ามาใหม่จริง ๆ นับจากอัปเดตนี้เป็นต้นไปเท่านั้น
  (function migrateExistingJobsAsSeen() {
    try {
      if (localStorage.getItem(KEY) != null) return; // เคยมี log แล้ว ไม่ต้อง migrate ซ้ำ
      if (typeof designs === "undefined" || !Array.isArray(designs)) return;
      const openedIds = designs.filter((d) => d.job === "OPENED").map((d) => d.id);
      if (!openedIds.length) { writeJson(KEY, {}); return; }
      const all = {};
      DEPTS.forEach((dept) => { all[dept] = [...openedIds]; });
      writeJson(KEY, all);
    } catch (e) { /* ข้ามการ migrate ได้ถ้ามีปัญหา ไม่กระทบการทำงานหลัก */ }
  })();
  window.NewBadge = { isNew, markSeen, badgeHtml, DEPTS };
})();
