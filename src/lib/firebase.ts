import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getFirestore, initializeFirestore, Firestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBEyLwxmeh21mIeywl_WJo1M8IRjxHg3KE",
  authDomain: "video-reviewer-lj-2026.firebaseapp.com",
  projectId: "video-reviewer-lj-2026",
  storageBucket: "video-reviewer-lj-2026.firebasestorage.app",
  messagingSenderId: "291919251260",
  appId: "1:291919251260:web:265d035a022559923d0039"
};

let app: FirebaseApp;
let db: Firestore;

if (!getApps().length) {
  app = initializeApp(firebaseConfig);
  // Force long polling to bypass WebSocket hanging issues in Next.js dev server
  db = initializeFirestore(app, { experimentalForceLongPolling: true });
} else {
  app = getApp();
  db = getFirestore(app);
}

export { db };
