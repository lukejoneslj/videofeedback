import { initializeApp, getApps, getApp } from "firebase/app";
import { initializeFirestore, getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBEyLwxmeh21mIeywl_WJo1M8IRjxHg3KE",
  authDomain: "video-reviewer-lj-2026.firebaseapp.com",
  projectId: "video-reviewer-lj-2026",
  storageBucket: "video-reviewer-lj-2026.firebasestorage.app",
  messagingSenderId: "291919251260",
  appId: "1:291919251260:web:265d035a022559923d0039"
};

const isNew = !getApps().length;
const app = isNew ? initializeApp(firebaseConfig) : getApp();

// Next.js dev server uses WebSockets for HMR on the same port, which silently
// breaks Firestore's WebSocket transport. Force long polling so Firestore
// always connects reliably in both dev and production.
export const db = isNew
  ? initializeFirestore(app, { experimentalForceLongPolling: true })
  : getFirestore(app);
