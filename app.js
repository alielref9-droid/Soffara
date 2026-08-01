// ============================================================
// صفارة (Soffara) — app.js  (Firebase / Firestore backend)
// ============================================================
const CFG = window.SOFFARA_CONFIG;
firebase.initializeApp(CFG.firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

const $ = (id) => document.getElementById(id);
const MAX_ADMINS = 3;

// ---------- i18n ----------
function getLang() { return localStorage.getItem("soffara_lang") || "ar"; }
function t(key, ...args) {
  const dict = window.SOFFARA_I18N[getLang()];
  const val = dict[key];
  if (typeof val === "function") return val(...args);
  return val !== undefined ? val : key;
}
function applyStaticI18n() {
  const lang = getLang();
  const dict = window.SOFFARA_I18N[lang];
  document.documentElement.lang = lang;
  document.documentElement.dir = dict.dir;
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (dict[key] !== undefined) el.innerHTML = typeof dict[key] === "function" ? dict[key]() : dict[key];
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (dict[key] !== undefined) el.placeholder = dict[key];
  });
  document.querySelectorAll(".lang-swatch").forEach((b) => {
    b.classList.toggle("active", b.dataset.lang === lang);
  });
  renderPositionPickers();
  renderLevelSelects();
}
function setLang(lang) {
  localStorage.setItem("soffara_lang", lang);
  applyStaticI18n();
  if (profile) {
    renderBookings();
    reflectAdminUI();
    reflectGoogleLinkUI();
    $("userGreeting").textContent = t("greeting", profile.name);
  }
}
document.querySelectorAll(".lang-swatch").forEach((btn) => {
  btn.addEventListener("click", () => setLang(btn.dataset.lang));
});

// ---------- positions / level pickers ----------
const POSITION_KEYS = ["gk", "def", "mid", "fwd"];
let regSelectedPositions = [];
let settingsSelectedPositions = [];

function renderPositionPickers() {
  const dict = window.SOFFARA_I18N[getLang()];
  [["regPositions", () => regSelectedPositions], ["settingsPositions", () => settingsSelectedPositions]].forEach(([containerId, getSel]) => {
    const el = $(containerId);
    if (!el) return;
    el.innerHTML = POSITION_KEYS.map((k) => `<button type="button" class="chip-option ${getSel().includes(k) ? "active" : ""}" data-pos="${k}">${dict.positions[k]}</button>`).join("");
    el.querySelectorAll(".chip-option").forEach((btn) => {
      btn.addEventListener("click", () => {
        const sel = getSel();
        const k = btn.dataset.pos;
        const idx = sel.indexOf(k);
        if (idx >= 0) sel.splice(idx, 1); else sel.push(k);
        renderPositionPickers();
      });
    });
  });
}
function renderLevelSelects() {
  const dict = window.SOFFARA_I18N[getLang()];
  ["regLevel", "settingsLevel"].forEach((id) => {
    const el = $(id);
    if (!el) return;
    const current = el.value;
    el.innerHTML = Object.keys(dict.levels).map((k) => `<option value="${k}">${dict.levels[k]}</option>`).join("");
    el.value = current || "";
  });
}

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
let profilesById = {};
let votesCache = {};

// ---------- toast ----------
let toastTimer;
function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 2200);
}

// ---------- online/offline ----------
function updateOnlineStatus() {
  const dot = $("statusDot");
  const text = $("statusText");
  if (navigator.onLine) {
    dot.classList.remove("offline");
    text.textContent = t("connected");
  } else {
    dot.classList.add("offline");
    text.textContent = t("offline");
  }
}
window.addEventListener("online", updateOnlineStatus);
window.addEventListener("offline", updateOnlineStatus);

// ---------- theme ----------
const CUSTOM_COLOR_MAP = {
  customBgColor: "--chalk",
  customCardColor: "--card",
  customHeaderColor: "--pitch-dark",
  customTextColor: "--ink",
  customAccentColor: "--gold",
};
function hexToRgba(hex, alpha) {
  const h = String(hex).replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
function applyCustomColor(inputId, val) {
  document.documentElement.style.setProperty(CUSTOM_COLOR_MAP[inputId], val);
  if (inputId === "customTextColor") {
    document.documentElement.style.setProperty("--ink-soft", hexToRgba(val, 0.62));
  }
}
function applyTheme(name) {
  document.documentElement.setAttribute("data-theme", name === "custom" ? "pitch" : name);
  localStorage.setItem("soffara_theme", name);
  document.querySelectorAll(".theme-swatch").forEach((b) => {
    b.classList.toggle("active", b.dataset.theme === name);
  });
  $("customThemeRow").classList.toggle("hidden", name !== "custom");
  Object.keys(CUSTOM_COLOR_MAP).forEach((inputId) => {
    const cssVar = CUSTOM_COLOR_MAP[inputId];
    if (name === "custom") {
      const saved = localStorage.getItem(`soffara_custom_${inputId}`) || $(inputId).value;
      applyCustomColor(inputId, saved);
      $(inputId).value = saved;
    } else {
      document.documentElement.style.removeProperty(cssVar);
      if (inputId === "customTextColor") document.documentElement.style.removeProperty("--ink-soft");
    }
  });
}
document.querySelectorAll(".theme-swatch").forEach((btn) => {
  btn.addEventListener("click", () => applyTheme(btn.dataset.theme));
});
Object.keys(CUSTOM_COLOR_MAP).forEach((inputId) => {
  $(inputId).addEventListener("input", (e) => {
    const val = e.target.value;
    localStorage.setItem(`soffara_custom_${inputId}`, val);
    applyCustomColor(inputId, val);
  });
});

// ---------- tabs ----------
function showView(name) {
  ["bookings", "chat", "memories", "crew", "settings"].forEach((v) => {
    $(`view-${v}`).classList.toggle("hidden", v !== name);
  });
  document.querySelectorAll(".nav-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === name);
  });
  $("fabNewBooking").classList.toggle("hidden", !(name === "bookings" && profile && profile.is_admin));
  $("fabNewMemory").classList.toggle("hidden", !(name === "memories" && profile));
  if (name === "chat") scrollChatToBottom();
}
document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => showView(btn.dataset.view));
});

// ============================================================
// Photo cropper (shared: registration + settings)
// ============================================================
let cropperState = { scale: 1, x: 0, y: 0, naturalW: 0, naturalH: 0, onConfirm: null };

function openCropper(file, onConfirm) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const img = $("cropperImg");
    img.onload = () => {
      cropperState = {
        scale: 1, x: 0, y: 0,
        naturalW: img.naturalWidth, naturalH: img.naturalHeight,
        onConfirm,
      };
      fitCropperImage();
      $("cropperZoom").value = 1;
      $("cropperOverlay").classList.remove("hidden");
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}
function fitCropperImage() {
  const vp = 220;
  const scaleToCover = Math.max(vp / cropperState.naturalW, vp / cropperState.naturalH);
  cropperState.baseScale = scaleToCover;
  updateCropperTransform();
}
function updateCropperTransform() {
  const img = $("cropperImg");
  const totalScale = cropperState.baseScale * cropperState.scale;
  img.style.width = `${cropperState.naturalW * totalScale}px`;
  img.style.height = `${cropperState.naturalH * totalScale}px`;
  img.style.transform = `translate(-50%, -50%) translate(${cropperState.x}px, ${cropperState.y}px)`;
}
$("cropperZoom").addEventListener("input", (e) => {
  cropperState.scale = parseFloat(e.target.value);
  updateCropperTransform();
});
(function setupCropperDrag() {
  const vp = $("cropperViewport");
  let dragging = false, startX = 0, startY = 0, origX = 0, origY = 0;
  const start = (x, y) => { dragging = true; startX = x; startY = y; origX = cropperState.x; origY = cropperState.y; vp.style.cursor = "grabbing"; };
  const move = (x, y) => {
    if (!dragging) return;
    cropperState.x = origX + (x - startX);
    cropperState.y = origY + (y - startY);
    updateCropperTransform();
  };
  const end = () => { dragging = false; vp.style.cursor = "grab"; };
  vp.addEventListener("pointerdown", (e) => start(e.clientX, e.clientY));
  window.addEventListener("pointermove", (e) => move(e.clientX, e.clientY));
  window.addEventListener("pointerup", end);
})();
$("cropperCancelBtn").addEventListener("click", () => $("cropperOverlay").classList.add("hidden"));
$("cropperConfirmBtn").addEventListener("click", () => {
  const OUT = 480;
  const canvas = document.createElement("canvas");
  canvas.width = OUT; canvas.height = OUT;
  const ctx = canvas.getContext("2d");
  const img = $("cropperImg");
  const vp = 220;
  const totalScale = cropperState.baseScale * cropperState.scale;
  const drawnW = cropperState.naturalW * totalScale;
  const drawnH = cropperState.naturalH * totalScale;
  const outScale = OUT / vp;
  const dx = (vp / 2 + cropperState.x) * outScale - (drawnW * outScale) / 2;
  const dy = (vp / 2 + cropperState.y) * outScale - (drawnH * outScale) / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(OUT / 2, OUT / 2, OUT / 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(img, dx, dy, drawnW * outScale, drawnH * outScale);
  ctx.restore();
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  if (dataUrl.length > 900 * 1024) {
    toast(t("toastPhotoBig"));
  } else if (cropperState.onConfirm) {
    cropperState.onConfirm(dataUrl);
  }
  $("cropperOverlay").classList.add("hidden");
});

$("regPhotoFile").addEventListener("change", (e) => {
  openCropper(e.target.files[0], (dataUrl) => {
    regPhotoData = dataUrl;
    $("regPhotoPreview").innerHTML = `<img src="${dataUrl}">`;
  });
});
$("settingsPhotoFile").addEventListener("change", (e) => {
  openCropper(e.target.files[0], (dataUrl) => {
    settingsPhotoData = dataUrl;
    $("profilePhotoPreview").innerHTML = `<img src="${dataUrl}">`;
  });
});

// ============================================================
// Google Sign-In (optional — persists profile across devices)
// ============================================================
async function findOrCreateProfileForGoogleUser(user) {
  const snap = await db.collection("profiles").where("auth_uid", "==", user.uid).limit(1).get();
  if (!snap.empty) {
    const doc = snap.docs[0];
    return { id: doc.id, ...doc.data() };
  }
  const payload = {
    device_id: getDeviceId(),
    auth_uid: user.uid,
    auth_email: user.email || null,
    name: user.displayName || "عضو",
    phone: null,
    whatsapp: null,
    photo_url: user.photoURL || null,
    positions: [],
    level: null,
    is_admin: false,
    created_at: firebase.firestore.FieldValue.serverTimestamp(),
  };
  const ref = await db.collection("profiles").add(payload);
  return { id: ref.id, ...payload };
}
$("googleRegisterBtn").addEventListener("click", () => {
  const provider = new firebase.auth.GoogleAuthProvider();
  localStorage.setItem("soffara_google_intent", "register");
  auth.signInWithRedirect(provider);
});
$("googleLinkBtn").addEventListener("click", () => {
  if (profile.auth_uid) return;
  const provider = new firebase.auth.GoogleAuthProvider();
  localStorage.setItem("soffara_google_intent", "link");
  auth.signInWithRedirect(provider);
});
async function handleGoogleRedirectResult() {
  const intent = localStorage.getItem("soffara_google_intent");
  if (!intent) return;
  try {
    const result = await auth.getRedirectResult();
    if (!result || !result.user) return;
    localStorage.removeItem("soffara_google_intent");
    if (intent === "register") {
      const banned = await isBanned({ deviceId: getDeviceId(), email: result.user.email || null });
      if (banned) { toast(t("toastBanned")); return; }
      profile = await findOrCreateProfileForGoogleUser(result.user);
      setLocalProfile(profile);
      profilesById[profile.id] = profile;
      $("registerOverlay").classList.add("hidden");
      bootAfterAuth();
    } else if (intent === "link" && profile) {
      const updates = { auth_uid: result.user.uid, auth_email: result.user.email || null };
      await db.collection("profiles").doc(profile.id).update(updates);
      profile = { ...profile, ...updates };
      setLocalProfile(profile);
      reflectGoogleLinkUI();
      toast(t("toastGoogleLinked"));
      showView("settings");
    }
  } catch (err) {
    console.error(err);
    localStorage.removeItem("soffara_google_intent");
    toast(t("toastGoogleFailed"));
  }
}
function reflectGoogleLinkUI() {
  const btn = $("googleLinkBtn");
  const label = $("googleLinkBtnText");
  if (profile && profile.auth_uid) {
    btn.classList.add("linked");
    btn.disabled = true;
    label.textContent = t("googleAlreadyLinked", profile.auth_email || "");
  } else {
    btn.classList.remove("linked");
    btn.disabled = false;
    label.textContent = t("googleLinkBtn");
  }
}

// ============================================================
// Registration
// ============================================================
let regPhotoData = null;

// ============================================================
// Ban check (admin can kick + block re-registration with same data)
// ============================================================
async function isBanned({ deviceId, phone, whatsapp, email }) {
  const checks = [];
  if (deviceId) checks.push(db.collection("banned").where("device_id", "==", deviceId).limit(1).get());
  if (phone) checks.push(db.collection("banned").where("phone", "==", phone).limit(1).get());
  if (whatsapp) checks.push(db.collection("banned").where("whatsapp", "==", whatsapp).limit(1).get());
  if (email) checks.push(db.collection("banned").where("auth_email", "==", email).limit(1).get());
  if (!checks.length) return false;
  const results = await Promise.all(checks);
  return results.some((snap) => !snap.empty);
}

$("registerBtn").addEventListener("click", async () => {
  const name = $("regName").value.trim();
  if (!name) return toast(t("toastNeedName"));
  const phone = $("regPhone").value.trim() || null;
  const whatsapp = $("regWhatsapp").value.trim() || null;
  const banned = await isBanned({ deviceId: getDeviceId(), phone, whatsapp });
  if (banned) return toast(t("toastBanned"));
  const payload = {
    device_id: getDeviceId(),
    name,
    phone,
    whatsapp,
    photo_url: regPhotoData,
    positions: regSelectedPositions.slice(),
    level: $("regLevel").value || null,
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
    toast(t("toastRegFailed"));
  }
});

// ============================================================
// Settings / profile edit
// ============================================================
let settingsPhotoData = null;
function fillSettingsForm() {
  if (!profile) return;
  $("settingsName").value = profile.name || "";
  $("settingsPhone").value = profile.phone || "";
  $("settingsWhatsapp").value = profile.whatsapp || "";
  if (profile.photo_url) $("profilePhotoPreview").innerHTML = `<img src="${profile.photo_url}">`;
  settingsSelectedPositions = (profile.positions || []).slice();
  renderPositionPickers();
  $("settingsLevel").value = profile.level || "";
  reflectGoogleLinkUI();
}
$("saveProfileBtn").addEventListener("click", async () => {
  const updates = {
    name: $("settingsName").value.trim() || profile.name,
    phone: $("settingsPhone").value.trim() || null,
    whatsapp: $("settingsWhatsapp").value.trim() || null,
    positions: settingsSelectedPositions.slice(),
    level: $("settingsLevel").value || null,
  };
  if (settingsPhotoData) updates.photo_url = settingsPhotoData;
  try {
    await db.collection("profiles").doc(profile.id).update(updates);
    profile = { ...profile, ...updates };
    setLocalProfile(profile);
    profilesById[profile.id] = profile;
    $("userGreeting").textContent = t("greeting", profile.name);
    toast(t("toastSaveOk"));
  } catch (err) {
    console.error(err);
    toast(t("toastSaveFailed"));
  }
});

// admin login (max 3 admins)
$("adminLoginBtn").addEventListener("click", async () => {
  const code = $("adminCodeInput").value;
  if (code !== CFG.ADMIN_CODE) return toast(t("toastWrongCode"));
  try {
    const adminsSnap = await db.collection("profiles").where("is_admin", "==", true).get();
    if (adminsSnap.size >= MAX_ADMINS) return toast(t("toastAdminFull"));
    await db.collection("profiles").doc(profile.id).update({ is_admin: true });
    profile = { ...profile, is_admin: true };
    setLocalProfile(profile);
    profilesById[profile.id] = profile;
    reflectAdminUI();
    toast(t("toastAdminOk"));
  } catch (err) {
    console.error(err);
  }
});
function reflectAdminUI() {
  const isAdmin = !!(profile && profile.is_admin);
  $("adminLoggedOut").classList.toggle("hidden", isAdmin);
  $("adminLoggedIn").classList.toggle("hidden", !isAdmin);
  $("adminLoggedInBadge").textContent = t("adminBadgeLoggedIn");
  $("adminBadge").innerHTML = isAdmin ? `<span class="admin-badge">${t("adminBadge")}</span>` : "";
  $("fabNewBooking").classList.toggle("hidden", !(isAdmin && !$("view-bookings").classList.contains("hidden")));
  renderBannedList();
}

// ============================================================
// Avatar rendering helper
// ============================================================
function avatarHtml(p, sizeClass) {
  const ring = p && p.is_admin ? "admin-ring" : "";
  if (p && p.photo_url) {
    return `<img class="${sizeClass || "avatar-img"} ${ring}" src="${p.photo_url}">`;
  }
  const initial = ((p && p.name) || "?").trim().charAt(0);
  return `<span class="${sizeClass === "avatar-img" ? "avatar-fallback" : "avatar-fallback"} ${ring}">${escapeHtml(initial)}</span>`;
}

// ============================================================
// Crew directory + member profile viewer
// ============================================================
let crewCache = [];
function renderCrew() {
  const list = $("crewList");
  if (!crewCache.length) {
    list.innerHTML = `<div class="empty-state">${t("emptyCrew")}</div>`;
    return;
  }
  const dict = window.SOFFARA_I18N[getLang()];
  list.innerHTML = crewCache.map((p) => {
    const posText = (p.positions || []).map((k) => dict.positions[k]).join("، ");
    const lvlText = p.level ? dict.levels[p.level] : "";
    const meta = [posText, lvlText].filter(Boolean).join(" · ");
    return `
      <div class="crew-row" data-member="${p.id}">
        ${avatarHtml(p, "avatar-img")}
        <div>
          <div class="crew-row-name">${escapeHtml(p.name || "?")}</div>
          ${meta ? `<div class="crew-row-meta">${escapeHtml(meta)}</div>` : ""}
        </div>
      </div>`;
  }).join("");
  list.querySelectorAll("[data-member]").forEach((row) => {
    row.addEventListener("click", () => openProfileView(row.dataset.member));
  });
}
async function openProfileView(profileId) {
  const p = profilesById[profileId] || (await ensureProfileCached(profileId));
  const dict = window.SOFFARA_I18N[getLang()];
  $("profileViewAvatar").innerHTML = avatarHtml(p, "avatar-img");
  $("profileViewName").textContent = p.name || "?";
  $("profileViewAdminTag").classList.toggle("hidden", !p.is_admin);

  const rows = [];
  if (p.phone) rows.push(`<div class="profile-view-row"><span class="label">${t("phoneLabel")}</span><a class="value" href="tel:${p.phone}">${escapeHtml(p.phone)}</a></div>`);
  if (p.whatsapp) rows.push(`<div class="profile-view-row"><span class="label">${t("whatsappLabel")}</span><a class="value" href="https://wa.me/${p.whatsapp.replace(/[^\d]/g, "")}" target="_blank" rel="noopener">${escapeHtml(p.whatsapp)}</a></div>`);
  if (p.positions && p.positions.length) rows.push(`<div class="profile-view-row"><span class="label">${t("positionsLabel")}</span><span class="value">${p.positions.map((k) => dict.positions[k]).join("، ")}</span></div>`);
  if (p.level) rows.push(`<div class="profile-view-row"><span class="label">${t("levelLabel")}</span><span class="value">${dict.levels[p.level]}</span></div>`);
  $("profileViewRows").innerHTML = rows.join("") || `<div class="empty-state">${t("noProfileInfo")}</div>`;

  const kickBtn = $("profileViewKickBtn");
  const canKick = profile && profile.is_admin && p.id !== profile.id;
  kickBtn.classList.toggle("hidden", !canKick);
  kickBtn.dataset.confirming = "";
  kickBtn.textContent = t("kickBtn");
  kickBtn.onclick = canKick ? () => {
    if (kickBtn.dataset.confirming === "1") {
      kickMember(p);
    } else {
      kickBtn.dataset.confirming = "1";
      kickBtn.textContent = t("kickConfirmInline");
      setTimeout(() => {
        if (kickBtn.dataset.confirming === "1") {
          kickBtn.dataset.confirming = "";
          kickBtn.textContent = t("kickBtn");
        }
      }, 4000);
    }
  } : null;

  $("profileViewOverlay").classList.remove("hidden");
}
$("profileViewCloseBtn").addEventListener("click", () => $("profileViewOverlay").classList.add("hidden"));

async function kickMember(p) {
  try {
    await db.collection("banned").add({
      device_id: p.device_id || null,
      phone: p.phone || null,
      whatsapp: p.whatsapp || null,
      auth_email: p.auth_email || null,
      name: p.name || null,
      banned_by: profile.id,
      banned_at: firebase.firestore.FieldValue.serverTimestamp(),
    });
    await db.collection("profiles").doc(p.id).delete();
    $("profileViewOverlay").classList.add("hidden");
    toast(t("toastKicked", p.name));
  } catch (err) {
    console.error(err);
    toast(t("toastKickFailed"));
  }
}

let bannedCache = [];
function renderBannedList() {
  $("bannedCard").classList.toggle("hidden", !(profile && profile.is_admin));
  const list = $("bannedList");
  if (!list) return;
  if (!bannedCache.length) {
    list.innerHTML = `<div class="empty-state">${t("emptyBanned")}</div>`;
    return;
  }
  list.innerHTML = bannedCache.map((b) => `
    <div class="banned-row">
      <span class="banned-row-name">${escapeHtml(b.name || "?")}</span>
      <button class="unban-btn" data-unban="${b.id}">${t("unbanBtn")}</button>
    </div>`).join("");
  list.querySelectorAll("[data-unban]").forEach((btn) => {
    btn.addEventListener("click", () => unbanMember(btn.dataset.unban));
  });
}
async function unbanMember(banId) {
  try {
    await db.collection("banned").doc(banId).delete();
    toast(t("toastUnbanned"));
  } catch (err) {
    console.error(err);
    toast(t("toastKickFailed"));
  }
}


$("openNewBookingBtn").addEventListener("click", () => $("newBookingOverlay").classList.remove("hidden"));
$("cancelNewBookingBtn").addEventListener("click", () => $("newBookingOverlay").classList.add("hidden"));

function normalizeDigits(str) {
  const eastern = "٠١٢٣٤٥٦٧٨٩";
  const persian = "۰۱۲۳۴۵۶۷۸۹";
  return String(str).replace(/[٠-٩۰-۹]/g, (d) => {
    const i1 = eastern.indexOf(d);
    if (i1 > -1) return i1;
    const i2 = persian.indexOf(d);
    if (i2 > -1) return i2;
    return d;
  });
}
$("submitNewBookingBtn").addEventListener("click", async () => {
  const field_name = $("nbField").value.trim();
  const address = $("nbAddress").value.trim();
  const price = parseFloat(normalizeDigits($("nbPrice").value));
  const capacity = parseInt(normalizeDigits($("nbCapacity").value), 10);
  const match_date = $("nbDate").value;
  const match_time = $("nbTimeFrom").value || null;
  const match_time_end = $("nbTimeTo").value || null;
  const notes = $("nbNotes").value.trim() || null;
  if (!field_name || !address || Number.isNaN(price) || Number.isNaN(capacity) || !match_date) {
    return toast(t("toastFillRequired"));
  }
  try {
    await db.collection("bookings").add({
      field_name, address, price, capacity, match_date, match_time, match_time_end, notes,
      created_by: profile.id,
      created_at: firebase.firestore.FieldValue.serverTimestamp(),
    });
    ["nbField","nbAddress","nbPrice","nbCapacity","nbDate","nbTimeFrom","nbTimeTo","nbNotes"].forEach((id) => $(id).value = "");
    $("newBookingOverlay").classList.add("hidden");
    toast(t("toastBookingOk"));
  } catch (err) {
    console.error(err);
    toast(t("toastBookingFailed"));
  }
});

async function ensureProfileCached(id) {
  if (profilesById[id]) return profilesById[id];
  const doc = await db.collection("profiles").doc(id).get();
  const data = doc.exists ? { id, ...doc.data() } : { id, name: "?" };
  profilesById[id] = data;
  return data;
}

async function refreshVotesForBooking(bookingId) {
  const snap = await db.collection("votes").where("booking_id", "==", bookingId).get();
  const rows = [];
  for (const doc of snap.docs) {
    const v = doc.data();
    const p = await ensureProfileCached(v.profile_id);
    rows.push({ profile_id: v.profile_id, status: v.status, profileObj: p });
  }
  votesCache[bookingId] = rows;
}

async function renderBookings() {
  const list = $("bookingsList");
  if (!bookingsCache.length) {
    list.innerHTML = `<div class="empty-state">${profile?.is_admin ? t("emptyBookingsAdmin") : t("emptyBookingsUser")}</div>`;
    return;
  }
  await Promise.all(bookingsCache.map((b) => refreshVotesForBooking(b.id)));

  list.innerHTML = bookingsCache.map((b) => {
    const votes = votesCache[b.id] || [];
    const inList = votes.filter((v) => v.status === "coming");
    const outList = votes.filter((v) => v.status === "not_coming");
    const myVote = votes.find((v) => v.profile_id === profile.id);
    const isFull = inList.length >= b.capacity;
    const dateFmt = new Date(b.match_date + "T00:00:00").toLocaleDateString(getLang() === "ar" ? "ar-EG" : "en-GB", { weekday: "long", day: "numeric", month: "long" });

    const chipRow = (arr) => arr.map((v) => `<span class="avatar-chip">${avatarHtml(v.profileObj, "avatar-img")}${escapeHtml(v.profileObj.name || "?")}</span>`).join("") || `<span class="avatar-chip">${t("nobodyYet")}</span>`;

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
          ${b.match_time ? `<span>⏰ ${b.match_time.slice(0,5)}${b.match_time_end ? ` - ${b.match_time_end.slice(0,5)}` : ""}</span>` : ""}
          <span>👥 ${inList.length}/${b.capacity}</span>
        </div>
        <div class="perforation"></div>
        <div class="ticket-body">
          <div class="vote-row">
            <button class="vote-btn in ${myVote?.status === "coming" ? "active" : ""}" data-booking="${b.id}" data-status="coming">${t("comingBtn")}</button>
            <button class="vote-btn out ${myVote?.status === "not_coming" ? "active" : ""}" data-booking="${b.id}" data-status="not_coming">${t("notComingBtn")}</button>
          </div>
          <div class="vote-count">${t("comingCountLabel", inList.length)}</div>
          <div class="avatars">${chipRow(inList)}</div>
          ${outList.length ? `<div class="vote-count" style="margin-top:8px">${t("notComingCountLabel", outList.length)}</div><div class="avatars">${chipRow(outList)}</div>` : ""}
          ${b.notes ? `<div class="vote-count" style="margin-top:8px">📝 ${escapeHtml(b.notes)}</div>` : ""}
          <button class="ticket-draw-btn" data-draw="${b.id}">🎲 ${t("drawBtn")}</button>
        </div>
        ${profile?.is_admin ? `<div class="ticket-admin"><button class="link-danger" data-delete="${b.id}">${t("deleteBookingBtn")}</button></div>` : ""}
      </div>
    `;
  }).join("");

  list.querySelectorAll(".vote-btn").forEach((btn) => {
    btn.addEventListener("click", () => castVote(btn.dataset.booking, btn.dataset.status));
  });
  list.querySelectorAll("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", () => deleteBooking(btn.dataset.delete));
  });
  list.querySelectorAll("[data-draw]").forEach((btn) => {
    btn.addEventListener("click", () => openDrawView(btn.dataset.draw));
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
    toast(t("toastVoteFailed"));
  }
}

async function deleteBooking(id) {
  if (!confirm(t("confirmDeleteBooking"))) return;
  try {
    await db.collection("bookings").doc(id).delete();
    const votesSnap = await db.collection("votes").where("booking_id", "==", id).get();
    await Promise.all(votesSnap.docs.map((d) => d.ref.delete()));
    toast(t("toastDeleteOk"));
  } catch (err) {
    console.error(err);
    toast(t("toastDeleteFailed"));
  }
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ============================================================
// Team draw (lottery)
// ============================================================
const LEVEL_WEIGHT = { beginner: 1, mid_level: 2, pro: 3 };
function levelWeight(level) {
  return LEVEL_WEIGHT[level] || 2;
}
function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function balanceTeams(participants) {
  const shuffled = shuffleArray(participants).sort((a, b) => levelWeight(b.level) - levelWeight(a.level));
  const teamA = [], teamB = [];
  let sumA = 0, sumB = 0;
  shuffled.forEach((p) => {
    const w = levelWeight(p.level);
    if (sumA <= sumB) { teamA.push(p); sumA += w; } else { teamB.push(p); sumB += w; }
  });
  return { teamA, teamB };
}

let drawBookingId = null;
let drawSource = "voters";
let drawCustomSelection = new Set();

async function openDrawView(bookingId) {
  drawBookingId = bookingId;
  drawSource = "voters";
  drawCustomSelection = new Set();
  await loadAndRenderDraw();
  $("drawOverlay").classList.remove("hidden");
}
$("drawCloseBtn").addEventListener("click", () => $("drawOverlay").classList.add("hidden"));

async function loadAndRenderDraw() {
  const doc = await db.collection("draws").doc(drawBookingId).get();
  const existing = doc.exists ? doc.data() : null;
  renderDrawBody(existing);
}

function renderDrawBody(existing) {
  const body = $("drawBody");
  const isAdmin = profile && profile.is_admin;
  let html = "";

  if (isAdmin) {
    html += `
      <div class="draw-source-row">
        <button class="draw-source-btn ${drawSource === "voters" ? "active" : ""}" id="drawSrcVoters">${t("drawSourceVoters")}</button>
        <button class="draw-source-btn ${drawSource === "custom" ? "active" : ""}" id="drawSrcCustom">${t("drawSourceCustom")}</button>
      </div>`;
    if (drawSource === "custom") {
      html += `<div class="draw-pick-list">${crewCache.map((p) => `
        <div class="draw-pick-row ${drawCustomSelection.has(p.id) ? "checked" : ""}" data-pick="${p.id}">
          ${avatarHtml(p, "avatar-img")}
          <span class="draw-pick-name">${escapeHtml(p.name || "?")}</span>
          <span class="draw-pick-level">${p.level ? window.SOFFARA_I18N[getLang()].levels[p.level] : ""}</span>
        </div>`).join("")}</div>`;
    }
    html += `<button class="btn-primary btn-block" id="drawGenerateBtn">🎲 ${t("drawGenerateBtn")}</button>`;
  }

  if (existing && existing.team_a && existing.team_b) {
    const renderTeam = (team, label) => `
      <div class="draw-team">
        <h4>${label}</h4>
        ${team.map((m) => `<div class="draw-team-member">${avatarHtml(profilesById[m.id] || m, "avatar-img")}<span>${escapeHtml(m.name || "?")}</span></div>`).join("") || `<div class="empty-state" style="padding:10px">-</div>`}
      </div>`;
    html += `<div class="draw-teams">${renderTeam(existing.team_a, t("teamA"))}${renderTeam(existing.team_b, t("teamB"))}</div>`;
    const when = existing.created_at && existing.created_at.toDate ? existing.created_at.toDate() : null;
    html += `<div class="draw-meta">${when ? t("drawMadeAt", when.toLocaleString(getLang() === "ar" ? "ar-EG" : "en-GB")) : ""}</div>`;
  } else if (!isAdmin) {
    html += `<div class="empty-state">${t("noDrawYet")}</div>`;
  }

  body.innerHTML = html;

  if (isAdmin) {
    $("drawSrcVoters")?.addEventListener("click", () => { drawSource = "voters"; loadAndRenderDraw(); });
    $("drawSrcCustom")?.addEventListener("click", () => { drawSource = "custom"; loadAndRenderDraw(); });
    body.querySelectorAll("[data-pick]").forEach((row) => {
      row.addEventListener("click", () => {
        const id = row.dataset.pick;
        if (drawCustomSelection.has(id)) drawCustomSelection.delete(id); else drawCustomSelection.add(id);
        loadAndRenderDraw();
      });
    });
    $("drawGenerateBtn")?.addEventListener("click", generateDraw);
  }
}

async function generateDraw() {
  let participantIds = [];
  if (drawSource === "voters") {
    const votes = votesCache[drawBookingId] || [];
    participantIds = votes.filter((v) => v.status === "coming").map((v) => v.profile_id);
  } else {
    participantIds = Array.from(drawCustomSelection);
  }
  if (participantIds.length < 2) return toast(t("toastDrawNeedMore"));

  const participants = participantIds.map((id) => {
    const p = profilesById[id] || { id, name: "?" };
    return { id, name: p.name, level: p.level || null };
  });
  const { teamA, teamB } = balanceTeams(participants);
  try {
    await db.collection("draws").doc(drawBookingId).set({
      team_a: teamA,
      team_b: teamB,
      source: drawSource,
      created_by: profile.id,
      created_at: firebase.firestore.FieldValue.serverTimestamp(),
    });
    toast(t("toastDrawDone"));
    loadAndRenderDraw();
  } catch (err) {
    console.error(err);
    toast(t("toastKickFailed"));
  }
}

// ============================================================
// Memories (gallery)
// ============================================================
let memoriesCache = [];
let memoryPhotoData = null;

$("openNewMemoryBtn").addEventListener("click", () => {
  const select = $("memoryBookingSelect");
  select.innerHTML = bookingsCache.map((b) => `<option value="${b.id}">${escapeHtml(b.field_name)} — ${b.match_date}</option>`).join("") || `<option value="">-</option>`;
  memoryPhotoData = null;
  $("memoryPhotoPreview").innerHTML = "📷";
  $("memoryPhotoFile").value = "";
  $("newMemoryOverlay").classList.remove("hidden");
});
$("cancelNewMemoryBtn").addEventListener("click", () => $("newMemoryOverlay").classList.add("hidden"));
$("memoryPhotoFile").addEventListener("change", (e) => {
  fileToDataUrl(e.target.files[0], (data) => {
    if (data) { memoryPhotoData = data; $("memoryPhotoPreview").innerHTML = `<img src="${data}">`; }
  });
});
$("submitNewMemoryBtn").addEventListener("click", async () => {
  const bookingId = $("memoryBookingSelect").value;
  const booking = bookingsCache.find((b) => b.id === bookingId);
  if (!bookingId || !booking || !memoryPhotoData) return toast(t("toastMemoryNeedFields"));
  try {
    await db.collection("memories").add({
      booking_id: bookingId,
      field_name: booking.field_name,
      match_date: booking.match_date,
      photo_url: memoryPhotoData,
      uploaded_by: profile.id,
      created_at: firebase.firestore.FieldValue.serverTimestamp(),
    });
    $("newMemoryOverlay").classList.add("hidden");
    toast(t("toastMemoryAdded"));
  } catch (err) {
    console.error(err);
    toast(t("toastMemoryFailed"));
  }
});

function renderMemories() {
  const list = $("memoriesList");
  if (!memoriesCache.length) {
    list.innerHTML = `<div class="empty-state">${t("emptyMemories")}</div>`;
    return;
  }
  const dateFmt = (d) => new Date(d + "T00:00:00").toLocaleDateString(getLang() === "ar" ? "ar-EG" : "en-GB", { day: "numeric", month: "long", year: "numeric" });
  list.innerHTML = memoriesCache.map((m) => `
    <div class="memory-card">
      <div class="memory-frame"><img src="${m.photo_url}" loading="lazy"></div>
      <div class="memory-caption">
        <div class="mc-field">${escapeHtml(m.field_name || "")}</div>
        <div class="mc-date">${m.match_date ? dateFmt(m.match_date) : ""}</div>
      </div>
      ${profile?.is_admin ? `<button class="memory-delete" data-mem-delete="${m.id}">${t("memoryDeleteBtn")}</button>` : ""}
    </div>`).join("");
  list.querySelectorAll("[data-mem-delete]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.confirming === "1") {
        deleteMemory(btn.dataset.memDelete);
      } else {
        btn.dataset.confirming = "1";
        btn.textContent = t("kickConfirmInline");
        setTimeout(() => { btn.dataset.confirming = ""; btn.textContent = t("memoryDeleteBtn"); }, 4000);
      }
    });
  });
}
async function deleteMemory(id) {
  try {
    await db.collection("memories").doc(id).delete();
    toast(t("toastMemoryDeleted"));
  } catch (err) {
    console.error(err);
    toast(t("toastMemoryFailed"));
  }
}

// ============================================================
// Chat + typing indicator
// ============================================================
function chatDateLabel(d) {
  const now = new Date();
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const diffDays = Math.round((startOf(now) - startOf(d)) / 86400000);
  if (diffDays === 0) return t("dateToday");
  if (diffDays === 1) return t("dateYesterday");
  return d.toLocaleDateString(getLang() === "ar" ? "ar-EG" : "en-GB", { day: "numeric", month: "long", year: "numeric" });
}
function renderMessages(msgs) {
  const log = $("chatLog");
  let lastDateKey = null;
  const parts = [];
  msgs.forEach((m) => {
    const d = m.created_at && m.created_at.toDate ? m.created_at.toDate() : new Date();
    const dateKey = d.toDateString();
    if (dateKey !== lastDateKey) {
      lastDateKey = dateKey;
      parts.push(`<div class="chat-date-divider"><span>${chatDateLabel(d)}</span></div>`);
    }
    const mine = m.profile_id === profile.id;
    const p = profilesById[m.profile_id] || { name: "?" };
    const timeStr = d.toLocaleTimeString(getLang() === "ar" ? "ar-EG" : "en-GB", { hour: "2-digit", minute: "2-digit" });
    const quoteHtml = m.reply_to
      ? `<div class="msg-quote"><span class="qname">${escapeHtml(m.reply_to.name)}</span><span class="qtext">${escapeHtml(m.reply_to.text)}</span></div>`
      : "";
    parts.push(`
      <div class="msg-with-avatar ${mine ? "mine" : ""}" data-msgid="${m.id}" data-sender="${m.profile_id}" data-sendername="${escapeHtml(p.name || "?")}" data-text="${escapeHtml(m.content)}">
        <span class="msg-avatar-tap" data-profile-tap="${m.profile_id}">${avatarHtml(p, "avatar-img")}</span>
        <div class="msg-col">
          <div class="msg-name" data-profile-tap="${m.profile_id}">${escapeHtml(p.name || "?")}</div>
          <div class="msg-bubble">${quoteHtml}${escapeHtml(m.content)}</div>
          <div class="msg-time">${timeStr}</div>
        </div>
      </div>`);
  });
  log.innerHTML = parts.join("");
  log.querySelectorAll("[data-profile-tap]").forEach((el) => {
    el.addEventListener("click", (e) => { e.stopPropagation(); openProfileView(el.dataset.profileTap); });
  });
  setupSwipeToReply(log);
  scrollChatToBottom();
}
function scrollChatToBottom() {
  const log = $("chatLog");
  if (log) log.scrollTop = log.scrollHeight;
}

// ---------- swipe-to-reply ----------
let replyTarget = null;
function setReplyTarget(id, name, text) {
  replyTarget = { id, name, text };
  $("replyPreviewName").textContent = name;
  $("replyPreviewText").textContent = text;
  $("replyPreview").classList.remove("hidden");
  $("chatInput").focus();
}
function clearReplyTarget() {
  replyTarget = null;
  $("replyPreview").classList.add("hidden");
}
$("replyPreviewCancel").addEventListener("click", clearReplyTarget);

function setupSwipeToReply(log) {
  log.querySelectorAll(".msg-with-avatar").forEach((el) => {
    let startX = 0, dx = 0, dragging = false;
    const threshold = 55;
    const onDown = (x) => { dragging = true; startX = x; };
    const onMove = (x) => {
      if (!dragging) return;
      dx = x - startX;
      const clamped = Math.max(-70, Math.min(70, dx));
      el.style.transform = `translateX(${clamped}px)`;
    };
    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      el.style.transform = "";
      if (Math.abs(dx) > threshold) {
        setReplyTarget(el.dataset.msgid, el.dataset.sendername, el.dataset.text);
      }
      dx = 0;
    };
    el.addEventListener("pointerdown", (e) => onDown(e.clientX));
    el.addEventListener("pointermove", (e) => onMove(e.clientX));
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
  });
}
async function sendMessage() {
  const input = $("chatInput");
  const content = input.value.trim();
  if (!content) return;
  input.value = "";
  clearTyping();
  const payload = {
    profile_id: profile.id, content,
    created_at: firebase.firestore.FieldValue.serverTimestamp(),
  };
  if (replyTarget) {
    payload.reply_to = { id: replyTarget.id, name: replyTarget.name, text: replyTarget.text.slice(0, 120) };
  }
  clearReplyTarget();
  try {
    await db.collection("messages").add(payload);
  } catch (err) {
    console.error(err);
    toast(t("toastMsgFailed"));
  }
}
$("chatSendBtn").addEventListener("click", sendMessage);
$("chatInput").addEventListener("keydown", (e) => { if (e.key === "Enter") sendMessage(); });

let typingDebounce;
$("chatInput").addEventListener("input", () => {
  clearTimeout(typingDebounce);
  setTyping();
  typingDebounce = setTimeout(clearTyping, 3000);
});
function setTyping() {
  if (!profile) return;
  db.collection("typing").doc(profile.id).set({ name: profile.name, ts: Date.now() }).catch(() => {});
}
function clearTyping() {
  if (!profile) return;
  db.collection("typing").doc(profile.id).delete().catch(() => {});
}
function renderTyping(docs) {
  const now = Date.now();
  const others = docs
    .filter((d) => d.id !== profile.id)
    .map((d) => d.data())
    .filter((d) => now - (d.ts || 0) < 4000);
  const el = $("typingIndicator");
  if (!others.length) { el.classList.add("hidden"); el.textContent = ""; return; }
  el.classList.remove("hidden");
  el.textContent = others.length === 1 ? t("typingSingle", others[0].name) : t("typingMultiple", others.length);
}

// ============================================================
// Realtime listeners
// ============================================================
function setupRealtime() {
  db.collection("profiles").onSnapshot((snap) => {
    crewCache = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || "").localeCompare(b.name || "", "ar"));
    crewCache.forEach((p) => { profilesById[p.id] = p; });
    renderCrew();
  }, (err) => {
    console.error(err);
    $("crewList").innerHTML = `<div class="empty-state">⚠️ ${escapeHtml(err.message || err.code || String(err))}</div>`;
  });

  db.collection("banned").onSnapshot((snap) => {
    bannedCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderBannedList();
  }, (err) => console.error(err));

  db.collection("memories").orderBy("created_at", "desc").onSnapshot((snap) => {
    memoriesCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderMemories();
  }, (err) => console.error(err));

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

  db.collection("typing").onSnapshot((snap) => {
    renderTyping(snap.docs);
  }, (err) => console.error(err));
}

// ============================================================
// Boot
// ============================================================
function bootAfterAuth() {
  $("userGreeting").textContent = t("greeting", profile.name);
  fillSettingsForm();
  reflectAdminUI();
  setupRealtime();
}

(function init() {
  applyStaticI18n();
  updateOnlineStatus();
  applyTheme(localStorage.getItem("soffara_theme") || "pitch");
  renderPositionPickers();
  renderLevelSelects();

  const cfgLooksEmpty = Object.values(CFG.firebaseConfig).some((v) => String(v).includes("PASTE_HERE"));
  if (cfgLooksEmpty) toast(t("toastNeedConfig"));

  if (profile) {
    $("registerOverlay").classList.add("hidden");
    bootAfterAuth();
  } else {
    $("registerOverlay").classList.remove("hidden");
  }

  handleGoogleRedirectResult();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW failed", e));
  }
})();
