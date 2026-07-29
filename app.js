// ============================================================
// صفارة (Soffara) — app.js  (Firebase / Firestore backend)
// ============================================================
const CFG = window.SOFFARA_CONFIG;
firebase.initializeApp(CFG.firebaseConfig);
const db = firebase.firestore();

const $ = (id) => document.getElementById(id);

// ---------- local device / profile ----------
function getDeviceId() {
  let id = localStorage.getItem("soffara_device_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("soffara_device_id", id);
  }
  return id;
}
function getLocalProfile() {
  const raw = localStorage.getItem("soffara_profile");
  return raw ? JSON.parse(raw) : null;
}
function setLocalProfile(p) {
  localStorage.setItem("soffara_profile", JSON.stringify(p));
}

let profile = getLocalProfile();
let bookingsCache = [];
let profilesById = {};   // profile_id -> {name, ...}
let votesCache = {};     // booking_id -> [{profile_id, status, name}]

// ---------- toast ----------
let toastTimer;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("hidden"), 2200);
}

// ---------- online/offline ----------
function updateOnlineStatus() {
  const dot = $("statusDot");
  const text = $("statusText");
  if (navigator.onLine) {
    dot.classList.remove("offline");
    text.textContent = "متصل";
  } else {
    dot.classList.add("offline");
    text.textContent = "مفيش نت";
  }
}
window.addEventListener("online", updateOnlineStatus);
window.addEventListener("offline", updateOnlineStatus);

// ---------- theme ----------
function applyTheme(name) {
  document.documentElement.setAttribute("data-theme", name);
  localStorage.setItem("soffara_theme", name);
  document.querySelectorAll(".theme-swatch").forEach((b) => {
    b.classList.toggle("active", b.dataset.theme === name);
  });
}
document.querySelectorAll(".theme-swatch").forEach((btn) => {
  btn.addEventListener("click", () => applyTheme(btn.dataset.theme));
});

// ---------- tabs ----------
function showView(name) {
  ["bookings", "chat", "settings"].forEach((v) => {
    $(`view-${v}`).classList.toggle("hidden", v !== name);
  });
  document.querySelectorAll(".nav-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === name);
  });
  $("fabNewBooking").classList.toggle("hidden", !(name === "bookings" && profile && profile.is_admin));
  if (name === "chat") scrollChatToBottom();
}
document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => showView(btn.dataset.view));
});

// ---------- image to base64 (kept small — Firestore doc limit ~1MB) ----------
function fileToDataUrl(file, cb) {
  if (!file) return cb(null);
  if (file.size > 700 * 1024) {
    toast("الصورة كبيرة أوي، اختار صورة أصغر");
    return cb(null);
  }
  const reader = new FileReader();
  reader.onload = () => cb(reader.result);
  reader.readAsDataURL(file);
}

// ============================================================
// Registration
// ============================================================
let regPhotoData = null;
$("regPhotoFile").addEventListener("change", (e) => {
  fileToDataUrl(e.target.files[0], (data) => {
    regPhotoData = data;
    if (data) $("regPhotoPreview").innerHTML = `<img src="${data}">`;
  });
});

$("registerBtn").addEventListener("click", async () => {
  const name = $("regName").value.trim();
  if (!name) return toast("اكتب اسمك الأول");
  const payload = {
    device_id: getDeviceId(),
    name,
    phone: $("regPhone").value.trim() || null,
    whatsapp: $("regWhatsapp").value.trim() || null,
    photo_url: regPhotoData,
    is_admin: false,
    created_at: firebase.firestore.FieldValue.serverTimestamp(),
  };
  try {
    const ref = await db.collection("profiles").add(payload);
    profile = { id: ref.id, ...payload };
    setLocalProfile(profile);
    $("registerOverlay").classList.add("hidden");
    bootAfterAuth();
  } catch (err) {
    console.error(err);
    toast("حصل خطأ، جرب تاني");
  }
});

// ============================================================
// Settings / profile edit
// ============================================================
let settingsPhotoData = null;
$("settingsPhotoFile").addEventListener("change", (e) => {
  fileToDataUrl(e.target.files[0], (data) => {
    if (data) { settingsPhotoData = data; $("profilePhotoPreview").innerHTML = `<img src="${data}">`; }
  });
});
function fillSettingsForm() {
  if (!profile) return;
  $("settingsName").value = profile.name || "";
  $("settingsPhone").value = profile.phone || "";
  $("settingsWhatsapp").value = profile.whatsapp || "";
  if (profile.photo_url) $("profilePhotoPreview").innerHTML = `<img src="${profile.photo_url}">`;
}
$("saveProfileBtn").addEventListener("click", async () => {
  const updates = {
    name: $("settingsName").value.trim() || profile.name,
    phone: $("settingsPhone").value.trim() || null,
    whatsapp: $("settingsWhatsapp").value.trim() || null,
  };
  if (settingsPhotoData) updates.photo_url = settingsPhotoData;
  try {
    await db.collection("profiles").doc(profile.id).update(updates);
    profile = { ...profile, ...updates };
    setLocalProfile(profile);
    $("userGreeting").textContent = `أهلاً بيك يا ${profile.name} 👋`;
    toast("اتحفظ بنجاح ✅");
  } catch (err) {
    console.error(err);
    toast("مقدرناش نحفظ، جرب تاني");
  }
});

// admin login
$("adminLoginBtn").addEventListener("click", async () => {
  const code = $("adminCodeInput").value;
  if (code !== CFG.ADMIN_CODE) return toast("الكود غلط");
  try {
    await db.collection("profiles").doc(profile.id).update({ is_admin: true });
    profile = { ...profile, is_admin: true };
    setLocalProfile(profile);
    reflectAdminUI();
    toast("اتسجلت كأدمن ✅");
  } catch (err) {
    console.error(err);
    toast("حصل خطأ");
  }
});
function reflectAdminUI() {
  const isAdmin = !!(profile && profile.is_admin);
  $("adminLoggedOut").classList.toggle("hidden", isAdmin);
  $("adminLoggedIn").classList.toggle("hidden", !isAdmin);
  $("adminBadge").innerHTML = isAdmin ? `<span class="admin-badge">أدمن</span>` : "";
  $("fabNewBooking").classList.toggle("hidden", !(isAdmin && !$("view-bookings").classList.contains("hidden")));
}

// ============================================================
// Bookings + voting
// ============================================================
$("openNewBookingBtn").addEventListener("click", () => $("newBookingOverlay").classList.remove("hidden"));
$("cancelNewBookingBtn").addEventListener("click", () => $("newBookingOverlay").classList.add("hidden"));

$("submitNewBookingBtn").addEventListener("click", async () => {
  const field_name = $("nbField").value.trim();
  const address = $("nbAddress").value.trim();
  const price = parseFloat($("nbPrice").value);
  const capacity = parseInt($("nbCapacity").value, 10);
  const match_date = $("nbDate").value;
  const match_time = $("nbTime").value || null;
  const notes = $("nbNotes").value.trim() || null;
  if (!field_name || !address || !price || !capacity || !match_date) {
    return toast("املا كل الخانات المطلوبة (*)");
  }
  try {
    await db.collection("bookings").add({
      field_name, address, price, capacity, match_date, match_time, notes,
      created_by: profile.id,
      created_at: firebase.firestore.FieldValue.serverTimestamp(),
    });
    ["nbField","nbAddress","nbPrice","nbCapacity","nbDate","nbTime","nbNotes"].forEach((id) => $(id).value = "");
    $("newBookingOverlay").classList.add("hidden");
    toast("اتحجز بنجاح ⚽");
  } catch (err) {
    console.error(err);
    toast("مقدرناش نحجز، جرب تاني");
  }
});

async function ensureProfileCached(id) {
  if (profilesById[id]) return profilesById[id];
  const doc = await db.collection("profiles").doc(id).get();
  const data = doc.exists ? doc.data() : { name: "عضو" };
  profilesById[id] = data;
  return data;
}

async function refreshVotesForBooking(bookingId) {
  const snap = await db.collection("votes").where("booking_id", "==", bookingId).get();
  const rows = [];
  for (const doc of snap.docs) {
    const v = doc.data();
    const p = await ensureProfileCached(v.profile_id);
    rows.push({ profile_id: v.profile_id, status: v.status, name: p.name || "عضو" });
  }
  votesCache[bookingId] = rows;
}

async function renderBookings() {
  const list = $("bookingsList");
  if (!bookingsCache.length) {
    list.innerHTML = `<div class="empty-state">مفيش حجوزات لسه.<br>${profile?.is_admin ? "اضغط + حجز جديد تحت." : "استنى الأدمن يحجز ملعب 👀"}</div>`;
    return;
  }
  await Promise.all(bookingsCache.map((b) => refreshVotesForBooking(b.id)));

  list.innerHTML = bookingsCache.map((b) => {
    const votes = votesCache[b.id] || [];
    const inList = votes.filter((v) => v.status === "coming");
    const outList = votes.filter((v) => v.status === "not_coming");
    const myVote = votes.find((v) => v.profile_id === profile.id);
    const isFull = inList.length >= b.capacity;
    const dateFmt = new Date(b.match_date + "T00:00:00").toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long" });

    return `
      <div class="ticket ${isFull ? "full" : ""}">
        <div class="ticket-head">
          <div>
            <div class="ticket-field">${escapeHtml(b.field_name)}</div>
            <div class="ticket-addr">📍 ${escapeHtml(b.address)}</div>
          </div>
          <div class="ticket-price">${b.price} ج.م</div>
        </div>
        <div class="ticket-meta">
          <span>🗓️ ${dateFmt}</span>
          ${b.match_time ? `<span>⏰ ${b.match_time.slice(0,5)}</span>` : ""}
          <span>👥 ${inList.length}/${b.capacity}</span>
        </div>
        <div class="perforation"></div>
        <div class="ticket-body">
          <div class="vote-row">
            <button class="vote-btn in ${myVote?.status === "coming" ? "active" : ""}" data-booking="${b.id}" data-status="coming">✅ أنا جاي</button>
            <button class="vote-btn out ${myVote?.status === "not_coming" ? "active" : ""}" data-booking="${b.id}" data-status="not_coming">❌ مش هقدر</button>
          </div>
          <div class="vote-count">الجايين (${inList.length}): </div>
          <div class="avatars">${inList.map((v) => `<span class="avatar-chip">${escapeHtml(v.name)}</span>`).join("") || '<span class="avatar-chip">لسه محدش</span>'}</div>
          ${outList.length ? `<div class="vote-count" style="margin-top:8px">مش هيقدروا (${outList.length}): </div><div class="avatars">${outList.map((v) => `<span class="avatar-chip">${escapeHtml(v.name)}</span>`).join("")}</div>` : ""}
          ${b.notes ? `<div class="vote-count" style="margin-top:8px">📝 ${escapeHtml(b.notes)}</div>` : ""}
        </div>
        ${profile?.is_admin ? `<div class="ticket-admin"><button class="link-danger" data-delete="${b.id}">مسح الحجز</button></div>` : ""}
      </div>
    `;
  }).join("");

  list.querySelectorAll(".vote-btn").forEach((btn) => {
    btn.addEventListener("click", () => castVote(btn.dataset.booking, btn.dataset.status));
  });
  list.querySelectorAll("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", () => deleteBooking(btn.dataset.delete));
  });
}

async function castVote(bookingId, status) {
  try {
    const voteId = `${bookingId}_${profile.id}`;
    await db.collection("votes").doc(voteId).set({
      booking_id: bookingId, profile_id: profile.id, status,
      created_at: firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  } catch (err) {
    console.error(err);
    toast("مقدرناش نسجل صوتك");
  }
}

async function deleteBooking(id) {
  if (!confirm("متأكد عايز تمسح الحجز ده؟")) return;
  try {
    await db.collection("bookings").doc(id).delete();
    const votesSnap = await db.collection("votes").where("booking_id", "==", id).get();
    await Promise.all(votesSnap.docs.map((d) => d.ref.delete()));
    toast("اتمسح الحجز");
  } catch (err) {
    console.error(err);
    toast("مقدرناش نمسح");
  }
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ============================================================
// Chat
// ============================================================
function renderMessages(msgs) {
  const log = $("chatLog");
  log.innerHTML = msgs.map((m) => {
    const mine = m.profile_id === profile.id;
    const name = profilesById[m.profile_id]?.name || "عضو";
    return `
      <div class="msg ${mine ? "mine" : ""}">
        <div class="msg-name">${escapeHtml(name)}</div>
        <div class="msg-bubble">${escapeHtml(m.content)}</div>
      </div>`;
  }).join("");
  scrollChatToBottom();
}
function scrollChatToBottom() {
  const log = $("chatLog");
  if (log) log.scrollTop = log.scrollHeight;
}
async function sendMessage() {
  const input = $("chatInput");
  const content = input.value.trim();
  if (!content) return;
  input.value = "";
  try {
    await db.collection("messages").add({
      profile_id: profile.id, content,
      created_at: firebase.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error(err);
    toast("مقدرناش نبعت الرسالة");
  }
}
$("chatSendBtn").addEventListener("click", sendMessage);
$("chatInput").addEventListener("keydown", (e) => { if (e.key === "Enter") sendMessage(); });

// ============================================================
// Realtime listeners
// ============================================================
function setupRealtime() {
  db.collection("bookings").orderBy("match_date", "asc")
    .onSnapshot((snap) => {
      bookingsCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderBookings();
    }, (err) => console.error(err));

  db.collection("votes").onSnapshot(() => {
    renderBookings();
  }, (err) => console.error(err));

  db.collection("messages").orderBy("created_at", "asc").limit(300)
    .onSnapshot(async (snap) => {
      const msgs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      await Promise.all(msgs.map((m) => ensureProfileCached(m.profile_id)));
      renderMessages(msgs);
    }, (err) => console.error(err));
}

// ============================================================
// Boot
// ============================================================
function bootAfterAuth() {
  $("userGreeting").textContent = `أهلاً بيك يا ${profile.name} 👋`;
  fillSettingsForm();
  reflectAdminUI();
  setupRealtime();
}

(function init() {
  updateOnlineStatus();
  applyTheme(localStorage.getItem("soffara_theme") || "pitch");

  const cfgLooksEmpty = Object.values(CFG.firebaseConfig).some((v) => String(v).includes("PASTE_HERE"));
  if (cfgLooksEmpty) {
    toast("لازم تحط بيانات Firebase في config.js الأول");
  }

  if (profile) {
    $("registerOverlay").classList.add("hidden");
    bootAfterAuth();
  } else {
    $("registerOverlay").classList.remove("hidden");
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW failed", e));
  }
})();
