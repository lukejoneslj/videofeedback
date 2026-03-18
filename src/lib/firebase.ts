import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBEyLwxmeh21mIeywl_WJo1M8IRjxHg3KE",
  authDomain: "video-reviewer-lj-2026.firebaseapp.com",
  projectId: "video-reviewer-lj-2026",
  storageBucket: "video-reviewer-lj-2026.firebasestorage.app",
  messagingSenderId: "291919251260",
  appId: "1:291919251260:web:265d035a022559923d0039"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);

export { db };
