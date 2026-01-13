// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyDBtqMrWWEJU2ieFcBRagHnJWl0Xb0WYjM",
  authDomain: "schoool-exam.firebaseapp.com",
  projectId: "schoool-exam",
  storageBucket: "schoool-exam.firebasestorage.app",
  messagingSenderId: "25150289194",
  appId: "1:25150289194:web:a26f8ee62d58be68a99a53",
  measurementId: "G-EL3GJ3T07K"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
