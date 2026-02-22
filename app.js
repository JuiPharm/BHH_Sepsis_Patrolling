// ใส่ URL ของ Apps Script Web App
const API_URL = "https://script.google.com/macros/s/AKfycbzJKK_e-sacJdHwrH39jx9OGGZglHPADQnwT855KL4yMr31DXqcEdqN5ff3c7k5ojMR/exec";

// Bundle 5 ข้อ (Required, answers = Comply / Not comply เท่านั้น)
const bundleItems = [
  "ผู้ป่วยได้รับส่งตรวจ Lactate ภายใน 3 ชั่วโมง หลังวินิจฉัย Sepsis",
  "ผู้ป่วยได้รับการส่งเลือดเพาะเชื้อ (Hemoculture) ก่อนให้ยาปฏิชีวนะ",
  "ผู้ป่วยได้รับยาปฏิชีวนะที่ครอบคลุมเชื้อก่อโรค (Board spectrum antibiotics) ภายใน 1 ชั่วโมง",
  "ผู้ป่วยได้รับสารน้ำ ทางหลอดเลือด 30 ml/kg balanced crystalloid in 3 hours for hypotension.",
  "ผู้ปวยได้รับยา Vasopressors (eg. Norepinephrine) เพื่อให้ค่า MAP >/= 65 mmHg ภายใน 1 ชั่วโมง",
];

function escapeHtml(s){
  return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
}

// HN: 07-YY-xxxxxx
function validateHN(hn) {
  return /^07-\d{2}-\d{6}$/.test(hn);
}

function setVisible(el, visible) { el.style.display = visible ? "" : "none"; }

function showStatus(text, ok = null) {
  const el = document.getElementById("status");
  if (ok === true) el.className = "ok";
  else if (ok === false) el.className = "error";
  else el.className = "";
  el.textContent = text;
}

function clearErrors() {
  setVisible(document.getElementById("hnErr"), false);
  setVisible(document.getElementById("qsofaErr"), false);
  setVisible(document.getElementById("bundleErr"), false);
}

function showError(elId, msg) {
  const el = document.getElementById(elId);
  el.textContent = msg;
  setVisible(el, true);
}

async function loadDepartments() {
  // ดึง departments จาก Script Properties ผ่าน backend
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "get_departments" }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok === true && Array.isArray(data.departments) && data.departments.length) {
      renderDepartments(data.departments);
      return;
    }
  } catch (_) {}

  // fallback ถ้า backend ไม่ตอบ (กันหน้าเว็บว่าง)
  renderDepartments(["ICU","Ward 12","Ward 11","Ward 10","Ward 9","Ward 8","Ward 7","Ward 6","Ward 5","LR","ER","OPD MED"]);
}

function renderDepartments(departments) {
  const el = document.getElementById("dept");
  el.innerHTML = departments.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join("");
}

function renderBundle() {
  const el = document.getElementById("bundle");
  el.innerHTML = bundleItems.map((text, idx) => `
    <div class="qitem">
      <div><b>${idx + 1}) ${escapeHtml(text)}</b></div>
      <select class="bundle" data-q="${escapeHtml(text)}">
        <option value="">-- เลือก --</option>
        <option value="Comply">Comply</option>
        <option value="Not comply">Not comply</option>
      </select>
    </div>
  `).join("");
}

function collectQsofa() {
  const selects = [...document.querySelectorAll(".qsofa")];
  return {
    qsofa: selects.map(s => s.value),
    qsofaQuestions: selects.map(s => s.dataset.q)
  };
}

function collectBundle() {
  const selects = [...document.querySelectorAll(".bundle")];
  return {
    bundle: selects.map(s => s.value),
    bundleQuestions: selects.map(s => s.dataset.q)
  };
}

async function onSubmit() {
  clearErrors();
  showStatus("Sending...");

  const hn = document.getElementById("hn").value.trim();
  const department = document.getElementById("dept").value;

  if (!validateHN(hn)) {
    showError("hnErr", "รูปแบบ HN ไม่ถูกต้อง ต้องเป็น 07-YY-xxxxxx เช่น 07-26-123456");
    showStatus("Please fix errors.", false);
    return;
  }

  const { qsofa, qsofaQuestions } = collectQsofa();
  if (qsofa.some(v => !v)) {
    showError("qsofaErr", "กรุณาตอบ qSOFA ให้ครบทั้ง 3 ข้อ (Yes/No)");
    showStatus("Please fix errors.", false);
    return;
  }

  const { bundle, bundleQuestions } = collectBundle();
  if (bundle.some(v => !v)) {
    showError("bundleErr", "กรุณาตอบ First hour bundle ให้ครบทุกข้อ (Comply/Not comply)");
    showStatus("Please fix errors.", false);
    return;
  }

  const payload = { hn, department, qsofa, qsofaQuestions, bundle, bundleQuestions };

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok !== true) {
      showStatus(`Failed: ${res.status} ${JSON.stringify(data)}`, false);
      return;
    }
    showStatus("Done ✅ (sent + audited)", true);
  } catch (e) {
    showStatus(`Error: ${e && e.message ? e.message : e}`, false);
  }
}

async function onAddDept() {
  const adminStatus = document.getElementById("adminStatus");
  adminStatus.textContent = "Checking admin...";

  const adminCode = document.getElementById("adminCode").value.trim();
  const newDept = document.getElementById("newDept").value.trim();

  if (!adminCode || !newDept) {
    adminStatus.textContent = "กรุณากรอก Admin code และชื่อแผนกใหม่";
    return;
  }

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add_department", adminCode, newDept }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok !== true) {
      adminStatus.textContent = `Add failed: ${data && data.error ? data.error : JSON.stringify(data)}`;
      return;
    }

    if (Array.isArray(data.departments)) {
      renderDepartments(data.departments);
      document.getElementById("dept").value = newDept;
    }
    adminStatus.textContent = "Added ✅";
    document.getElementById("newDept").value = "";
  } catch (e) {
    adminStatus.textContent = `Error: ${e && e.message ? e.message : e}`;
  }
}

function onReset() {
  document.getElementById("hn").value = "";
  [...document.querySelectorAll(".qsofa")].forEach(s => s.value = "");
  [...document.querySelectorAll(".bundle")].forEach(s => s.value = "");
  clearErrors();
  showStatus("");
}

renderBundle();
loadDepartments();

document.getElementById("submitBtn").addEventListener("click", onSubmit);
document.getElementById("resetBtn").addEventListener("click", onReset);
document.getElementById("addDeptBtn").addEventListener("click", onAddDept);
