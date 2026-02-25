// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || "placeholder",
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || "localhost",
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || "placeholder",
  appId: process.env.REACT_APP_FIREBASE_APP_ID || "placeholder",
};

console.log("FIREBASE CONFIG (client):", firebaseConfig);

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
googleProvider.setCustomParameters({ prompt: "select_account" });
