// database.js (module)
// Load as <script type="module" src="database.js"></script>

// Firebase SDK imports (Firestore + Auth)
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { deleteDoc } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

// add Timestamp import near other firestore imports:
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  doc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  getDoc,
  startAfter,
  Timestamp
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";

// --- Your Firebase config ---
const firebaseConfig = {
  apiKey: "AIzaSyC0DuiHxAuUNSKQ9a1Ji1SoKmvuMcfxGYw",
  authDomain: "afro-daafi-7e725.firebaseapp.com",
  projectId: "afro-daafi-7e725",
  storageBucket: "afro-daafi-7e725.appspot.com",
  messagingSenderId: "1008650758210",
  appId: "1:1008650758210:web:bfad0ba99437927fe9a5db",
  measurementId: "G-9LX8DN4EYN"
};

// Initialize Firebase services
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Utility: remove undefined properties recursively (keeps false/null/0)
function stripUndefined(obj) {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) {
    const arr = obj.map(item => stripUndefined(item)).filter(item => typeof item !== "undefined");
    return arr;
  }
  const out = {};
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (typeof v === "undefined") continue; // skip undefined
    if (v === null) { out[k] = null; continue; }
    if (Array.isArray(v)) {
      const arr = stripUndefined(v);
      if (Array.isArray(arr) && arr.length > 0) out[k] = arr;
      continue;
    }
    if (typeof v === "object") {
      const cleaned = stripUndefined(v);
      if (cleaned && (Array.isArray(cleaned) ? cleaned.length > 0 : Object.keys(cleaned).length > 0)) {
        out[k] = cleaned;
      }
      continue;
    }
    out[k] = v;
  }
  return out;
}

// ------------------
// Simple in-memory cache (short TTL) to avoid repeat reads
// ------------------
const __dbCache = {
  store: {},
  get(key) {
    const e = this.store[key];
    if (!e) return null;
    if (Date.now() - e.ts > (20 * 1000)) { // 20s TTL
      delete this.store[key];
      return null;
    }
    return e.val;
  },
  set(key, val) {
    this.store[key] = { val, ts: Date.now() };
  },
  clear(key) { delete this.store[key]; }
};

// Helper: find admin doc by email
async function findAdminDocByEmail(email) {
  try {
    const collectionsToTry = ["admins", "admin"];
    for (const colName of collectionsToTry) {
      try {
        const q = query(collection(db, colName), where("email", "==", email));
        const snap = await getDocs(q);
        let docData = null;
        snap.forEach(d => { docData = { id: d.id, ...d.data(), _collection: colName }; });
        if (docData) {
          console.log(`findAdminDocByEmail: found admin in collection "${colName}"`, docData);
          return { success: true, admin: docData };
        }
      } catch (innerErr) {
        console.warn(`findAdminDocByEmail: query in "${colName}" failed or collection missing:`, innerErr && innerErr.message ? innerErr.message : innerErr);
      }
    }
    return { success: true, admin: null };
  } catch (err) {
    console.error("findAdminDocByEmail error", err);
    return { success: false, error: err };
  }
}

// Expose methods on window.FirebaseDB for non-module scripts
window.FirebaseDB = {
  // Save order to Firestore
  saveOrder: async function(order) {
    try {
      const docRef = await addDoc(collection(db, "orders"), {
        ...order,
        status: order.status || "pending",
        createdAt: serverTimestamp()
      });
      return { success: true, id: docRef.id };
    } catch (err) {
      console.error("Firestore saveOrder error:", err);
      return { success: false, error: err };
    }
  },

  // Get visitor orders by visitorId (limited + cached)
  getOrdersForVisitor: async function(visitorId) {
    try {
      if (!visitorId) return { success: true, orders: [] };

      // small cache key scoped to visitor
      const cacheKey = `orders_for_${visitorId}`;
      const cached = __dbCache.get(cacheKey);
      if (cached) return { success: true, orders: cached };

      // Limit results so one call doesn't read thousands of docs.
      const LIMIT = 100;
      const q = query(
        collection(db, "orders"),
        where("visitorId", "==", visitorId),
        orderBy("createdAt", "desc"),
        limit(LIMIT)
      );

      const snap = await getDocs(q);
      const orders = [];
      snap.forEach(d => orders.push({ id: d.id, ...d.data() }));

      // cache for short period
      __dbCache.set(cacheKey, orders);
      return { success: true, orders };
    } catch (err) {
      const needsIndex =
        (err && err.message && err.message.toLowerCase().includes("requires an index")) ||
        (err && err.code === "failed-precondition");

      if (needsIndex) {
        console.warn("getOrdersForVisitor: composite index required. Falling back to limited client-side query.");
        try {
          const LIMIT = 100;
          const q2 = query(collection(db, "orders"), where("visitorId", "==", visitorId), limit(LIMIT));
          const snap2 = await getDocs(q2);
          const orders = [];
          snap2.forEach(d => orders.push({ id: d.id, ...d.data() }));
          orders.sort((a, b) => {
            const ta = a.createdAt && a.createdAt.seconds ? a.createdAt.seconds * 1000 : (a.timestamp ? new Date(a.timestamp).getTime() : 0);
            const tb = b.createdAt && b.createdAt.seconds ? b.createdAt.seconds * 1000 : (b.timestamp ? new Date(b.timestamp).getTime() : 0);
            return tb - ta;
          });
          __dbCache.set(`orders_for_${visitorId}`, orders);
          return { success: true, orders };
        } catch (err2) {
          console.error("getOrdersForVisitor fallback error:", err2);
          return { success: false, error: err2 };
        }
      }

      console.error("getOrdersForVisitor error:", err);
      return { success: false, error: err };
    }
  },

  // New: paginated list of orders.
  // Accepts { limit = 50, startAfterId = null }.
  // Returns { success: true, orders: [...], nextCursor: '<lastDocId>' }
  listOrdersPage: async function({ limit: pageLimit = 50, startAfterId = null } = {}) {
    try {
      // safety bounds
      const LIMIT = Math.min(Math.max(Number(pageLimit) || 50, 1), 1000); // allow 1..1000
      let q;
      if (startAfterId) {
        // fetch the document snapshot to use as cursor (startAfter requires a snapshot or field value)
        const startSnap = await getDoc(doc(db, "orders", startAfterId));
        if (!startSnap.exists()) {
          return { success: false, error: "startAfterId-not-found" };
        }
        q = query(collection(db, "orders"), orderBy("createdAt", "desc"), startAfter(startSnap), limit(LIMIT));
      } else {
        q = query(collection(db, "orders"), orderBy("createdAt", "desc"), limit(LIMIT));
      }

      const snap = await getDocs(q);
      const orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const lastDoc = snap.docs[snap.docs.length - 1] || null;
      const nextCursor = lastDoc ? lastDoc.id : null;
      return { success: true, orders, nextCursor };
    } catch (err) {
      console.error("listOrdersPage error:", err);
      return { success: false, error: err };
    }
  },

  

  // convenience wrapper (keeps backwards compatibility) - returns first page (limit adjustable)
  listAllOrders: async function(opts = {}) {
    const l = opts.limit || 500;
    return await this.listOrdersPage({ limit: l, startAfterId: null });
  },

  // Real-time snapshot of recent orders (admin) — limited to avoid large read churn
  onOrdersSnapshot: function(callback, opts = {}) {
    try {
      const max = (opts && opts.limit) ? opts.limit : 50; // default 50
      const q = query(collection(db, "orders"), orderBy("createdAt", "desc"), limit(max));
      const unsub = onSnapshot(q, snapshot => {
        const orders = [];
        snapshot.forEach(d => orders.push({ id: d.id, ...d.data() }));
        callback(orders);
      }, err => {
        console.error("onOrdersSnapshot error:", err);
      });
      return unsub;
    } catch (err) {
      console.error("onOrdersSnapshot init error", err);
      return () => {};
    }
  },

  // Update order status (admin)
  updateOrderStatus: async function(orderId, status) {
    try {
      const orderRef = doc(db, "orders", orderId);
      await updateDoc(orderRef, { status });
      return { success: true };
    } catch (err) {
      console.error("updateOrderStatus error:", err);
      return { success: false, error: err };
    }
  },

  // --- AUTH / ADMIN helpers ---

  // Admin sign in with email/password
  adminSignIn: async function(email, password) {
    try {
      const userCred = await signInWithEmailAndPassword(auth, email, password);
      const user = userCred.user;
      const adm = await findAdminDocByEmail(email);
      if (!adm.success) {
        await signOut(auth);
        return { success: false, error: 'admin-check-failed' };
      }
      if (!adm.admin) {
        await signOut(auth);
        return { success: false, error: 'not-an-admin' };
      }
      return { success: true, user: { uid: user.uid, email: user.email }, adminDoc: adm.admin };
    } catch (err) {
      console.error("adminSignIn error", err);
      return { success: false, error: err.code || err.message || err };
    }
  },

  // Admin sign out
  adminSignOut: async function() {
    try {
      await signOut(auth);
      return { success: true };
    } catch (err) {
      console.error("adminSignOut error", err);
      return { success: false, error: err };
    }
  },

  // Listen for auth state changes (returns firebase user or null)
  onAuthStateChange: function(callback) {
    return onAuthStateChanged(auth, async (user) => {
      if (!user) {
        callback(null);
        return;
      }
      const adm = await findAdminDocByEmail(user.email);
      if (adm.success && adm.admin) {
        callback({ uid: user.uid, email: user.email, adminDoc: adm.admin });
      } else {
        try { await signOut(auth); } catch(e){/* ignore */ }
        callback(null);
      }
    });
  },

  deleteOrder: async function(orderId) {
    try {
      await deleteDoc(doc(db, 'orders', orderId));
      return { success: true };
    } catch (err) {
      console.error('deleteOrder error', err);
      return { success: false, error: err };
    }
  },

  getAdminByEmail: findAdminDocByEmail,

  updateAdminProfile: async function(adminDocId, profileUpdates) {
    try {
      const adminRef = doc(db, "admins", adminDocId);
      await updateDoc(adminRef, profileUpdates);
      return { success: true };
    } catch (err) {
      console.error("updateAdminProfile error", err);
      return { success: false, error: err };
    }
  }
};

// returns { success: true, orders: [...], nextCursor: '<docId>' }
window.FirebaseDB.listOrdersSince = async function({ fromTimestamp, limit: userLimit = 200 } = {}) {
  try {
    if (!fromTimestamp) return { success: false, error: 'missing-fromTimestamp' };

    // normalize incoming timestamp (allow Date, ISO string, or milliseconds)
    const dt = (fromTimestamp instanceof Date) ? fromTimestamp : new Date(fromTimestamp);
    if (isNaN(dt.getTime())) return { success: false, error: 'invalid-fromTimestamp' };

    const ts = Timestamp.fromDate(dt);

    const LIMIT = Math.min(Math.max(Number(userLimit) || 200, 1), 1000);
    // Query: all orders with createdAt >= fromTimestamp, newest first (desc)
    const q = query(
      collection(db, 'orders'),
      where('createdAt', '>=', ts),
      orderBy('createdAt', 'desc'),
      limit(LIMIT)
    );

    const snap = await getDocs(q);
    const orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const lastDoc = snap.docs[snap.docs.length - 1] || null;
    const nextCursor = lastDoc ? lastDoc.id : null;
    return { success: true, orders, nextCursor };
  } catch (err) {
    console.error('listOrdersSince error:', err);
    return { success: false, error: err };
  }
};


// ================= CONTACTS (ADMIN) =================

// list all contacts (admin only)
export async function listContacts() {
  try {
    const cacheKey = 'listContacts_v1';
    const cached = __dbCache.get(cacheKey);
    if (cached) return { success: true, contacts: cached };

    const q = query(collection(db, 'contacts'), orderBy('createdAt', 'desc'), limit(200));
    const snap = await getDocs(q);
    const contacts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    __dbCache.set(cacheKey, contacts);
    return {
      success: true,
      contacts
    };
  } catch (e) {
    return { success: false, error: e };
  }
}

// realtime listener
export function onContactsSnapshot(cb) {
  const q = query(collection(db, 'contacts'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, snap => {
    cb(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

// mark contact as read
export async function markContactRead(id) {
  try {
    await updateDoc(doc(db, 'contacts', id), { read: true });
    return { success: true };
  } catch (e) {
    return { success: false, error: e };
  }
}

// unread count
export async function getUnreadContactsCount() {
  try {
    const snap = await getDocs(
      query(collection(db, 'contacts'), where('read', '==', false))
    );
    return { success: true, count: snap.size };
  } catch (e) {
    return { success: false, error: e };
  }
}

// === CONTACTS API (exposed on window.FirebaseDB) ===

window.FirebaseDB.saveContact = async function(contact) {
  try {
    const docRef = await addDoc(collection(db, 'contacts'), {
      ...contact,
      read: false,
      handled: false,
      createdAt: serverTimestamp()
    });
    return { success: true, id: docRef.id };
  } catch (err) {
    console.error('saveContact error', err);
    return { success: false, error: err };
  }
};

window.FirebaseDB.listContacts = async function() {
  try {
    const cacheKey = 'listContacts_v1';
    const cached = __dbCache.get(cacheKey);
    if (cached) return { success: true, contacts: cached };

    const q = query(collection(db, 'contacts'), orderBy('createdAt', 'desc'), limit(200));
    const snap = await getDocs(q);
    const contacts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    __dbCache.set(cacheKey, contacts);
    return { success: true, contacts };
  } catch (err) {
    console.error('listContacts error', err);
    return { success: false, error: err };
  }
};

window.FirebaseDB.onContactsSnapshot = function(callback) {
  try {
    const q = query(collection(db, 'contacts'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      const contacts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      callback(contacts);
    }, err => {
      console.error('onContactsSnapshot error', err);
    });
    return unsub;
  } catch (err) {
    console.error('onContactsSnapshot init error', err);
    return () => {}; // noop unsubscribe
  }
};

window.FirebaseDB.markContactRead = async function(contactId) {
  try {
    await updateDoc(doc(db, 'contacts', contactId), { read: true });
    return { success: true };
  } catch (err) {
    console.error('markContactRead error', err);
    return { success: false, error: err };
  }
};

window.FirebaseDB.getUnreadContactsCount = async function() {
  try {
    const q = query(collection(db, 'contacts'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    const count = snap.docs.filter(d => {
      const data = d.data();
      return data.read !== true;
    }).length;
    return { success: true, count };
  } catch (err) {
    console.error('getUnreadContactsCount error', err);
    return { success: false, error: err };
  }
};

window.FirebaseDB.deleteContact = async function(contactId) {
  try {
    await deleteDoc(doc(db, 'contacts', contactId));
    return { success: true };
  } catch (err) {
    console.error('deleteContact error', err);
    return { success: false, error: err };
  }
};
// -------- Order tracking / payment helpers (add to window.FirebaseDB) ---------

/**
 * Update customer (client) location for an order.
 * Expects orderId (string) and { lat, lng } numbers.
 */
window.FirebaseDB.updateOrderLocation = async function(orderId, { lat, lng } = {}) {
  if (!orderId) return { success: false, error: 'missing-orderId' };
  try {
    const orderRef = doc(db, 'orders', orderId);
    await updateDoc(orderRef, {
      clientLocation: { lat: Number(lat), lng: Number(lng), ts: serverTimestamp() }
    });
    return { success: true };
  } catch (err) {
    console.error('updateOrderLocation error', err);
    return { success: false, error: err };
  }
};

/**
 * Update delivery rider location for an order.
 * Saves under deliveryLocation field with timestamp.
 */
window.FirebaseDB.updateDeliveryLocation = async function(orderId, { lat, lng } = {}) {
  if (!orderId) return { success: false, error: 'missing-orderId' };
  try {
    const orderRef = doc(db, 'orders', orderId);
    await updateDoc(orderRef, {
      deliveryLocation: { lat: Number(lat), lng: Number(lng), ts: serverTimestamp() }
    });
    return { success: true };
  } catch (err) {
    console.error('updateDeliveryLocation error', err);
    return { success: false, error: err };
  }
};

/**
 * Get single order by ID (returns { success, order })
 */
window.FirebaseDB.getOrder = async function(orderId) {
  if (!orderId) return { success: false, error: 'missing-orderId' };
  try {
    const d = await getDoc(doc(db, 'orders', orderId));
    if (!d.exists()) return { success: false, error: 'not-found' };
    return { success: true, order: { id: d.id, ...d.data() } };
  } catch (err) {
    console.error('getOrder error', err);
    return { success: false, error: err };
  }
};

/**
 * Lightweight realtime single-order listener.
 * callback receives the order object or null.
 * Returns unsubscribe function.
 */
window.FirebaseDB.onOrderSnapshot = function(orderId, callback) {
  try {
    const orderRef = doc(db, 'orders', orderId);
    const unsub = onSnapshot(orderRef, snap => {
      if (!snap.exists()) return callback(null);
      callback({ id: snap.id, ...snap.data() });
    }, err => {
      console.error('onOrderSnapshot error', err);
    });
    return unsub;
  } catch (err) {
    console.error('onOrderSnapshot init error', err);
    return () => {};
  }
};

/**
 * Update payment status (admin or visitor notification).
 * paymentStatus: 'paid' | 'cod' | 'pending' | 'failed' etc.
 */
window.FirebaseDB.updateOrderPaymentStatus = async function(orderId, paymentStatus) {
  if (!orderId) return { success: false, error: 'missing-orderId' };
  try {
    const orderRef = doc(db, 'orders', orderId);
    await updateDoc(orderRef, {
      paymentStatus: String(paymentStatus || 'pending'),
      paymentUpdatedAt: serverTimestamp()
    });
    return { success: true };
  } catch (err) {
    console.error('updateOrderPaymentStatus error', err);
    return { success: false, error: err };
  }
};

/**
 * Simple notifyPayment helper (optional: could trigger cloud functions).
 * Here it just writes a small note in the order to be visible to admins.
 */
window.FirebaseDB.notifyPayment = async function(orderId, payload = {}) {
  if (!orderId) return { success: false, error: 'missing-orderId' };
  try {
    const orderRef = doc(db, 'orders', orderId);
    const note = {
      notifiedAt: serverTimestamp(),
      payload: stripUndefined(payload)
    };
    // append to an array-notes field (Firestore requires read->write for arrayUnion, but we avoid adding imports)
    // We'll set lastPaymentNotify for simplicity:
    await updateDoc(orderRef, {
      lastPaymentNotify: note,
      lastPaymentNotifyRaw: JSON.stringify(note.payload || {})
    });
    return { success: true };
  } catch (err) {
    console.error('notifyPayment error', err);
    return { success: false, error: err };
  }
};

// End of file
