// ==============================================================================
// script.js - FINAL FIXED VERSION for Smart Result Analysis
// ==============================================================================

// ---------------- FIREBASE IMPORTS ----------------
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signOut,
  signInWithEmailAndPassword, createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
  getFirestore, doc, setDoc, getDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// ---------------- GLOBAL VARIABLES ----------------
let db, auth, userId, userRole;
let isPageSetupDone = false;
let uploadedResultData = [];

// ---------------- FIREBASE CONFIG ----------------
const firebaseConfig = {
  apiKey: "AIzaSyBm98gcFTKt9zJ_Ndq7MhAQM0KpCkU96iY",
  authDomain: "result-analysis-b36a5.firebaseapp.com",
  projectId: "result-analysis-b36a5",
  storageBucket: "result-analysis-b36a5.firebasestorage.app",
  messagingSenderId: "908014873083",
  appId: "1:908014873083:web:32ecc0fd98baaa81e2435e",
  measurementId: "G-F5GMLGTZHR"
};

// ---------------- HELPER: Display message ----------------
const displayMessage = (message, type = 'error') => {
  const msg = document.createElement('div');
  msg.className = `custom-message ${type}`;
  msg.textContent = message;
  msg.style.position = 'fixed';
  msg.style.top = '16px';
  msg.style.right = '16px';
  msg.style.padding = '10px 14px';
  msg.style.borderRadius = '6px';
  msg.style.zIndex = 9999;
  msg.style.boxShadow = '0 4px 10px rgba(0,0,0,0.15)';
  msg.style.color = 'white';
  msg.style.background = type === 'success' ? '#10b981'
                    : type === 'warning' ? '#f59e0b'
                    : '#ef4444';
  document.body.appendChild(msg);
  setTimeout(() => msg.remove(), 2200);
};

// ---------------- INIT FIREBASE ----------------
async function initFirebase() {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
  console.log("Firebase initialized.");
}

// ---------------- LOGOUT ----------------
function handleLogout() {
  signOut(auth).then(() => window.location.href = "index.html");
}

// ---------------- PAGE SETUP BY ROLE ----------------
function handleAuthAndPageSetup() {
  if (isPageSetupDone) return;
  isPageSetupDone = true;
  const page = window.location.pathname.split("/").pop();

  if (userRole === 'teacher' || userRole === 'admin') {
    if (page === 'teacher-upload.html') setupTeacherUploadPage();
    if (page === 'teacher-analysis-report.html' || page === 'teacher-dashboard.html')
      loadTeacherDashboardData();
  }
  if (userRole === 'student' && page === 'student-dashboard.html')
    renderStudentDashboard();
}

// ---------------- LOGIN HANDLERS ----------------
function setupTeacherLoginPage() {
  const form = document.getElementById("teacher-login-form");
  if (form) {
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const email = document.getElementById("teacher-username").value.trim();
      const pass = document.getElementById("teacher-password").value.trim();
      try {
        let cred;
        try {
          cred = await signInWithEmailAndPassword(auth, email, pass);
          displayMessage("Signed in successfully — redirecting...", "success");
          setTimeout(() => window.location.href = "teacher-upload.html", 700);
        } catch (err) {
          if (err.code === 'auth/user-not-found') {
            cred = await createUserWithEmailAndPassword(auth, email, pass);
            await setDoc(doc(db, "users", cred.user.uid), {
              email, role: 'teacher', createdAt: serverTimestamp()
            });
            displayMessage("New teacher account created!", "success");
            setTimeout(() => window.location.href = "teacher-upload.html", 700);
          } else throw err;
        }
      } catch (err) {
        displayMessage("Login failed: " + err.message, "error");
      }
    });
  }

  // ---------------- DEMO STUDENT LOGIN (No Firebase) ----------------
const sForm = document.getElementById("student-login-form");
if (sForm) {
  sForm.addEventListener('submit', e => {
    e.preventDefault();

    const email = document.getElementById("student-username").value.trim();
    const pass = document.getElementById("student-password").value.trim();

    // Demo credentials (you can customize)
    const demoEmail = "student@demo.com";
    const demoPass = "student123";

    if (email === demoEmail && pass === demoPass) {
      displayMessage("Demo student login successful!", "success");
      localStorage.setItem("studentDemoLogin", "true"); // optional, to remember login
      setTimeout(() => window.location.href = "student-dashboard.html", 700);
    } else {
      displayMessage("Invalid demo credentials.", "error");
    }
  });
}
}

/// ---------------- UPLOAD PAGE ----------------
function setupTeacherUploadPage() {
  const form = document.getElementById('upload-form');
  const fileInput = document.getElementById('fileElem');
  const dropArea = document.getElementById('drop-area');
  const status = document.getElementById('file-name-display') || document.querySelector('.file-name-display');
  if (!form || !fileInput || !dropArea) return;

  // ---- Prevent page reload no matter what ----
  form.addEventListener("submit", e => e.preventDefault());

  // ---- Drag & drop ----
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(ev =>
    dropArea.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); })
  );
  ['dragenter', 'dragover'].forEach(ev =>
    dropArea.addEventListener(ev, () => dropArea.classList.add('highlight'))
  );
  ['dragleave', 'drop'].forEach(ev =>
    dropArea.addEventListener(ev, () => dropArea.classList.remove('highlight'))
  );

  dropArea.addEventListener('drop', e => handleFiles(e.dataTransfer.files));
  fileInput.addEventListener('change', e => handleFiles(e.target.files));

  function handleFiles(files) {
    if (!files.length) return;
    const file = files[0];
    if (!file.name.endsWith('.csv')) {
      displayMessage("Please upload a CSV file.", "error");
      return;
    }
    if (!window.Papa) {
      displayMessage("PapaParse not loaded.", "error");
      return;
    }
    Papa.parse(file, {
  skipEmptyLines: true,
  complete: res => {
    // 🔍 Find the row that looks like the header (contains "UID" and "Total Marks")
    let headerRowIndex = res.data.findIndex(row =>
      Array.isArray(row) &&
      row.some(cell => typeof cell === "string" && cell.toLowerCase().includes("uid")) &&
      row.some(cell => typeof cell === "string" && cell.toLowerCase().includes("total"))
    );

    if (headerRowIndex === -1) {
      displayMessage("Could not detect header row in CSV.", "error");
      console.error("Header not found:", res.data.slice(0, 10));
      return;
    }

    // Extract headers and convert subsequent rows into objects
    const headers = res.data[headerRowIndex].map(h => h.trim());
    const rows = res.data.slice(headerRowIndex + 1);
    uploadedResultData = rows
      .map(r => {
        const obj = {};
        headers.forEach((h, i) => (obj[h] = r[i]));
        return obj;
      })
      .filter(r => Object.keys(r).length > 0 && r.UID);

    if (!uploadedResultData.length) {
      displayMessage("No student records found.", "error");
      console.log("CSV parse result (empty):", res.data.slice(0, 20));
      return;
    }

    displayMessage(`Loaded ${uploadedResultData.length} student records.`, "success");
    if (status)
      status.textContent = `File Ready: ${file.name} (${uploadedResultData.length} rows)`;

    console.log("✅ CSV parsed properly:", uploadedResultData.slice(0, 3));
  },
  error: err => displayMessage("Parse error: " + err.message, "error")
});
  }

  // ---- Upload button handler ----
  const uploadBtn = document.getElementById('upload-btn');
  if (uploadBtn) {
    uploadBtn.addEventListener('click', async () => {
      if (!uploadedResultData.length) {
        displayMessage("No CSV loaded.", "warning");
        return;
      }
      if (!userId) {
        displayMessage("User not signed in.", "error");
        return;
      }
      try {
        // --- CLEAN DATA before uploading ---
const cleanData = uploadedResultData.map(row => {
  const cleaned = {};
  for (const key in row) {
    if (key && key.trim() !== "") {
      let value = row[key];
      if (value === undefined || value === null) value = "";
      cleaned[key.trim()] = value;
    }
  }
  return cleaned;
});

await setDoc(doc(db, "teacher_results", userId), {
  data: cleanData,
  uploadedAt: serverTimestamp(),
  fileName: fileInput.files[0]?.name || "results.csv"
});

        displayMessage("Upload successful! Redirecting...", "success");
console.log("Redirecting now to teacher-analysis-report.html");
setTimeout(() => {
  console.log("Redirect triggered!");
  window.location.href = "teacher-analysis-report.html";
}, 1000);

      } catch (err) {
        displayMessage("Upload failed: " + err.message, "error");
      }
    });
  }

  console.log("Teacher upload page ready.");
}


// ---------------- LOAD DASHBOARD / REPORT ----------------
async function loadTeacherDashboardData() {
  const page = window.location.pathname.split("/").pop();
  const container = document.querySelector('.dashboard-container');
  try {
    const docSnap = await getDoc(doc(db, "teacher_results", userId));
    if (!docSnap.exists()) {
      container.innerHTML = `<p>No data found. Upload a CSV first.</p>`;
      return;
    }
    const data = docSnap.data().data || [];
    if (page === 'teacher-analysis-report.html') setupIndividualReportLookup(data);
    else renderTeacherDashboard(data);
  } catch (err) {
    container.innerHTML = `<p class="text-red">Error: ${err.message}</p>`;
  }
}

// ---------------- TEACHER DASHBOARD (Modern Design + Charts + Top 5) ----------------
function renderTeacherDashboard(data) {
  console.log("Rendering teacher dashboard with TR data:", data);

  // Helper: safely convert to number
  const toNum = (v) => parseFloat(v?.toString().replace(/[^\d.-]/g, "")) || 0;

  // --- Basic Stats ---
  const totalStudents = data.length;

  const passStudents = data.filter(s => {
    const res = (s["Result"] || s["RESULT"] || "").toLowerCase();
    if (res.includes("pass")) return true;
    if (res.includes("fail")) return false;

    // fallback if Result column not present
    const total = toNum(s["Total Marks"] || s["TOTAL"]);
    const max = toNum(s["Max Marks"] || s["MAX"] || 600);
    return (total / max) * 100 >= 35;
  });

  const passCount = passStudents.length;
  const failCount = totalStudents - passCount;
  const passRate = totalStudents > 0 ? ((passCount / totalStudents) * 100).toFixed(1) : 0;

  // --- Average SGPA of class ---
  const avgSGPA = (
    data.map(s => toNum(s["SGPA"])).reduce((a, b) => a + b, 0) / totalStudents
  ).toFixed(2);

  // --- Update dashboard cards ---
  document.getElementById("total-count").textContent = totalStudents;
  document.getElementById("pass-count").textContent = passCount;
  document.getElementById("fail-count").textContent = failCount;
  document.getElementById("pass-rate").textContent = `${passRate}%`;
  if (document.getElementById("avg-sgpa")) {
    document.getElementById("avg-sgpa").textContent = avgSGPA;
  }

  const toppers = [...data]
  .map(s => {
    const roll = s["Roll No"] || s["Roll No."] || s["ROLL NO"] || s["ROLL NO."] || "—";
    const uid = s["UID"] || s["Uid"] || "—";
    const name = s["Name"] || s["Name of Student"] || s["Name of Examinee"] || "—";
    const total = toNum(s["Total Marks"] || s["TOTAL"] || s["Total"] || 0);
    const max = toNum(s["Max Marks"] || s["MAX"] || 600);
    const sgpa = toNum(s["SGPA"] || s["Sgpa"]);
    const cgpa = toNum(s["CGPA"] || s["Cgpa"]);

    return { roll, uid, name, total,sgpa, cgpa };
  })
  .sort((a, b) => b.total - a.total)
  .slice(0, 5);


  const toppersTable = document.getElementById("topper-table-body");
  if (toppersTable) {
    toppersTable.innerHTML = toppers.map(t => `
      <tr class="hover:bg-gray-100 border-b">
        <td>${t.roll}</td>
        <td>${t.uid}</td>
        <td>${t.name}</td>
        <td>${t.total}</td>
        <td>${t.sgpa}</td>
        <td>${t.cgpa}</td>
      </tr>
    `).join("");
  }

  // --- Charts setup ---
  const ctx1 = document.getElementById("performanceChart");
  const ctx2 = document.getElementById("gradePie");

  if (window.performanceChart && typeof window.performanceChart.destroy === "function") window.performanceChart.destroy();
  if (window.gradePie && typeof window.gradePie.destroy === "function") window.gradePie.destroy();

  // Bar chart: Pass vs Fail
  window.performanceChart = new Chart(ctx1, {
    type: "bar",
    data: {
      labels: ["Pass", "Fail"],
      datasets: [{
        label: "Students",
        data: [passCount, failCount],
        backgroundColor: ["#10b981", "#ef4444"],
        borderRadius: 8
      }]
    },
    options: {
      plugins: {
        title: { display: true, text: "Pass vs Fail", font: { size: 18 } },
        legend: { display: false }
      },
      scales: { y: { beginAtZero: true } }
    }
  });

  // Pie chart: SGPA Distribution
  const s1 = data.filter(s => toNum(s["SGPA"]) >= 9).length;
  const s2 = data.filter(s => toNum(s["SGPA"]) >= 8 && toNum(s["SGPA"]) < 9).length;
  const s3 = data.filter(s => toNum(s["SGPA"]) >= 7 && toNum(s["SGPA"]) < 8).length;
  const s4 = totalStudents - (s1 + s2 + s3);

  window.gradePie = new Chart(ctx2, {
    type: "doughnut",
    data: {
      labels: ["≥9 SGPA", "8–9 SGPA", "7–8 SGPA", "<7 SGPA"],
      datasets: [{
        data: [s1, s2, s3, s4],
        backgroundColor: ["#22c55e", "#3b82f6", "#facc15", "#ef4444"]
      }]
    },
    options: {
      plugins: {
        title: { display: true, text: "SGPA Distribution", font: { size: 18 } },
        legend: { position: "bottom" }
      }
    }
  });

  console.log(`✅ Dashboard updated: ${passCount} pass, ${failCount} fail, Avg SGPA ${avgSGPA}`);
}


function setupIndividualReportLookup(data) {
  const btn = document.getElementById('lookup-btn-report');
  const inp = document.getElementById('student-uid-input');
  const out = document.getElementById('lookup-result-report');
  if (!btn || !inp || !out) return;
  btn.addEventListener('click', () => {
    const roll = inp.value.trim();
    const s = data.find(d => d.UID === roll || d['Roll No.'] === roll);
    if (!s) { out.innerHTML = `<p>No student found for ${roll}</p>`; return; }
    let html = `<h4>${s.Name || 'Student'} (${roll})</h4><ul>`;
    for (const k in s) html += `<li><b>${k}:</b> ${s[k]}</li>`;
    html += `</ul>`;
    out.innerHTML = html;
  });
}

// ---------------- STUDENT DASHBOARD ----------------
// ---------------- STUDENT DASHBOARD (Beautiful Offline Demo) ----------------
async function renderStudentDashboard() {
  const cont = document.querySelector(".dashboard-container");
  if (!cont) return;

  cont.innerHTML = `
    <div class="student-dashboard">
      <div class="header">
        <h2>🎓 Smart Result Analysis</h2>
        <p>Enter your Roll No / UID to view your detailed performance</p>
      </div>

      <div class="input-area">
        <input type="text" id="student-lookup-input" placeholder="Enter UID / Roll No" class="input-style"/>
        <button id="student-lookup-btn" class="btn-primary">Show Result</button>
      </div>

      <div id="student-result-display" class="result-display hidden">
        <div class="result-card">
          <h3 id="student-name"></h3>
          <p><b>UID:</b> <span id="student-uid"></span></p>
          <p><b>Total Marks:</b> <span id="student-total"></span></p>
          <p><b>Percentage:</b> <span id="student-percentage"></span>%</p>
          <p><b>Status:</b> <span id="student-status"></span></p>
        </div>

        <div class="chart-container">
          <canvas id="marksBarChart"></canvas>
        </div>
        <div class="chart-container">
          <canvas id="gradePieChart"></canvas>
        </div>
      </div>
    </div>
  `;

  const sampleResults = [
    { UID: "1001", Name: "Aarav Sharma", Total: 450, OutOf: 600, Subjects: { DS: 75, Math: 85, DBMS: 88, OS: 70, COA: 60, Java: 72 } },
    { UID: "1002", Name: "Riya Patel", Total: 380, OutOf: 600, Subjects: { DS: 68, Math: 60, DBMS: 75, OS: 55, COA: 65, Java: 57 } },
    { UID: "1003", Name: "Ishaan Mehta", Total: 295, OutOf: 600, Subjects: { DS: 40, Math: 50, DBMS: 45, OS: 55, COA: 55, Java: 50 } },
    { UID: "1004", Name: "Ananya Singh", Total: 520, OutOf: 600, Subjects: { DS: 90, Math: 85, DBMS: 88, OS: 80, COA: 90, Java: 87 } },
    { UID: "1005", Name: "Vivaan Joshi", Total: 270, OutOf: 600, Subjects: { DS: 40, Math: 35, DBMS: 45, OS: 40, COA: 50, Java: 60 } }
  ];

  const btn = document.getElementById("student-lookup-btn");
  const input = document.getElementById("student-lookup-input");
  const resultDisplay = document.getElementById("student-result-display");

  btn.addEventListener("click", () => {
    const uid = input.value.trim();
    const student = sampleResults.find(s => s.UID === uid);
    if (!student) {
      displayMessage("No record found for UID: " + uid, "error");
      return;
    }

    const percentage = ((student.Total / student.OutOf) * 100).toFixed(2);
    const status = percentage >= 35 ? "PASS ✅" : "FAIL ❌";
    const statusColor = percentage >= 35 ? "green" : "red";

    // Update Result Info
    document.getElementById("student-name").textContent = student.Name;
    document.getElementById("student-uid").textContent = student.UID;
    document.getElementById("student-total").textContent = `${student.Total} / ${student.OutOf}`;
    document.getElementById("student-percentage").textContent = percentage;
    const statusEl = document.getElementById("student-status");
    statusEl.textContent = status;
    statusEl.style.color = statusColor;
    resultDisplay.classList.remove("hidden");

    // Destroy old charts if they exist
    if (window.barChartInstance) window.barChartInstance.destroy();
    if (window.pieChartInstance) window.pieChartInstance.destroy();

    // Draw Bar Chart (Subject-wise Marks)
    const ctx1 = document.getElementById("marksBarChart");
    window.barChartInstance = new Chart(ctx1, {
      type: "bar",
      data: {
        labels: Object.keys(student.Subjects),
        datasets: [{
          label: "Marks Obtained",
          data: Object.values(student.Subjects),
          backgroundColor: [
            "#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#06b6d4"
          ],
          borderRadius: 6
        }]
      },
      options: {
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, max: 100 } },
        animation: { duration: 1000 }
      }
    });

    // Draw Pie Chart (Grade Distribution)
    const ctx2 = document.getElementById("gradePieChart");
    window.pieChartInstance = new Chart(ctx2, {
      type: "pie",
      data: {
        labels: ["A (80-100)", "B (60-79)", "C (40-59)", "F (<40)"],
        datasets: [{
          data: [
            Object.values(student.Subjects).filter(m => m >= 80).length,
            Object.values(student.Subjects).filter(m => m >= 60 && m < 80).length,
            Object.values(student.Subjects).filter(m => m >= 40 && m < 60).length,
            Object.values(student.Subjects).filter(m => m < 40).length
          ],
          backgroundColor: ["#16a34a", "#3b82f6", "#f59e0b", "#ef4444"]
        }]
      },
      options: {
        plugins: {
          legend: { position: "bottom" }
        },
        animation: { duration: 1200 }
      }
    });
  });
}




// ============================================================================
// ❌ OLD AUTH STATE LISTENER (commented out)
// ============================================================================
/*
onAuthStateChanged(auth, async (user) => {
  // Old duplicate listener - disabled
});
*/

// ---------------- MAIN ENTRY ----------------
document.addEventListener("DOMContentLoaded", async () => {
  await initFirebase();
  setupTeacherLoginPage();
  document.querySelectorAll('.btn-logout,.btn-outline-red')
    .forEach(b => b.addEventListener('click', handleLogout));

  onAuthStateChanged(auth, async (user) => {
  const page = window.location.pathname.split("/").pop();
  const secure = [
    "teacher-upload.html",
    "teacher-dashboard.html",
    "teacher-analysis-report.html",
    "student-dashboard.html"
  ];

  // 🧠 NEW: Check for demo student login (offline)
  const demoStudent = localStorage.getItem("studentDemoLogin");

  // ✅ If demo student is logged in, skip Firebase redirect logic
  if (demoStudent && page === "student-dashboard.html") {
    console.log("Demo student logged in (offline mode)");
    renderStudentDashboard();
    return; // prevent further checks
  }

  if (user) {
    userId = user.uid;
    const udoc = await getDoc(doc(db, "users", userId));
    userRole = udoc.exists() ? udoc.data().role : "student";
    console.log("Logged-in role:", userRole);

    handleAuthAndPageSetup();

    const teacherPages = [
      "teacher-upload.html",
      "teacher-dashboard.html",
      "teacher-analysis-report.html"
    ];
    const isTeacherPage = teacherPages.includes(page);
    const isStudentPage = page === "student-dashboard.html";

    if (
      (userRole === "teacher" || userRole === "admin") &&
      !isTeacherPage &&
      page !== "teacher-analysis-report.html"
    ) {
      console.log("Redirecting teacher to upload page");
      window.location.href = "teacher-upload.html";
    } else if (userRole === "student" && !isStudentPage) {
      console.log("Redirecting student to dashboard");
      window.location.href = "student-dashboard.html";
    }
  } else {
    // 🛑 Only redirect to index.html if it's not a demo student
    if (secure.includes(page) && !demoStudent) {
      window.location.href = "index.html";
    }
  }
});
});



// Polyfill UUID
if (typeof crypto.randomUUID === 'undefined') {
  crypto.randomUUID = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'
    .replace(/[xy]/g, c => {
      const r = Math.random()*16|0, v = c==='x'?r:(r&0x3|0x8);
      return v.toString(16);
    });
}
