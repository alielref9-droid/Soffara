// ============================================================
// صفارة — سكريبت الإشعارات
// بيشتغل كل 5 دقايق عن طريق GitHub Actions (مجاني، من غير أي بطاقة).
// بيدور على أي حاجة جديدة (حجز/رسالة/صورة) أو حجز اتمسح، وبيبعت إشعار
// لكل الأعضاء اللي مفعّلين الإشعارات (ما عدا صاحب الحدث نفسه، وما عدا
// اللي كاتم الشات لو الإشعار بتاع رسالة).
// ============================================================
const admin = require("firebase-admin");

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const messaging = admin.messaging();

function toDate(ts) {
  return ts && typeof ts.toDate === "function" ? ts.toDate() : null;
}

async function sendToTokens(tokens, title, body, tag) {
  if (!tokens.length) return;
  for (let i = 0; i < tokens.length; i += 500) {
    const chunk = tokens.slice(i, i + 500);
    try {
      const res = await messaging.sendEachForMulticast({
        tokens: chunk,
        notification: { title, body },
        data: { tag: tag || "soffara", title, body },
      });
      console.log(`sent: ${title} -> ${res.successCount}/${chunk.length}`);
    } catch (err) {
      console.error("send error", err);
    }
  }
}

async function main() {
  const stateRef = db.collection("notify_state").doc("state");
  const stateSnap = await stateRef.get();
  const state = stateSnap.exists ? stateSnap.data() : {};
  const lastRun = toDate(state.last_run) || new Date(Date.now() - 10 * 60 * 1000);
  const knownBookings = state.known_bookings || {};

  const profilesSnap = await db.collection("profiles").get();
  const tokenOwner = {};
  const mutedProfiles = new Set();
  profilesSnap.forEach((doc) => {
    const p = doc.data();
    if (p.fcm_token) tokenOwner[p.fcm_token] = doc.id;
    if (p.chat_muted) mutedProfiles.add(doc.id);
  });
  const allTokens = Object.keys(tokenOwner);

  function tokensFor({ excludeProfileId, respectMute } = {}) {
    return allTokens.filter((tok) => {
      const owner = tokenOwner[tok];
      if (excludeProfileId && owner === excludeProfileId) return false;
      if (respectMute && mutedProfiles.has(owner)) return false;
      return true;
    });
  }

  const bookingsSnap = await db.collection("bookings").get();
  const currentBookings = {};
  for (const doc of bookingsSnap.docs) {
    const b = doc.data();
    currentBookings[doc.id] = b.field_name || "ملعب";
    const createdAt = toDate(b.created_at);
    if (createdAt && createdAt > lastRun) {
      await sendToTokens(
        tokensFor({ excludeProfileId: b.created_by }),
        "حجز جديد ⚽",
        `${b.field_name || ""} - ${b.match_date || ""}`,
        "booking"
      );
    }
  }
  for (const id of Object.keys(knownBookings)) {
    if (!currentBookings[id]) {
      await sendToTokens(tokensFor({}), "اتمسح حجز", knownBookings[id] || "", "booking");
    }
  }

  const msgsSnap = await db.collection("messages").orderBy("created_at", "desc").limit(50).get();
  for (const doc of msgsSnap.docs) {
    const m = doc.data();
    const createdAt = toDate(m.created_at);
    if (createdAt && createdAt > lastRun) {
      let senderName = "حد في الشلة";
      try {
        const senderSnap = await db.collection("profiles").doc(m.profile_id).get();
        if (senderSnap.exists) senderName = senderSnap.data().name || senderName;
      } catch (e) { /* ignore */ }
      await sendToTokens(
        tokensFor({ excludeProfileId: m.profile_id, respectMute: true }),
        `${senderName} كتب رسالة`,
        String(m.content || "").slice(0, 120),
        "chat"
      );
    }
  }

  const memSnap = await db.collection("memories").get();
  for (const doc of memSnap.docs) {
    const mm = doc.data();
    const createdAt = toDate(mm.created_at);
    if (createdAt && createdAt > lastRun) {
      await sendToTokens(
        tokensFor({ excludeProfileId: mm.uploaded_by }),
        "صورة جديدة اتضافت 📸",
        mm.field_name || "",
        "memory"
      );
    }
  }

  await stateRef.set({
    last_run: admin.firestore.Timestamp.now(),
    known_bookings: currentBookings,
  });
  console.log("done.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("notify.js failed:", err);
    process.exit(1);
  });
