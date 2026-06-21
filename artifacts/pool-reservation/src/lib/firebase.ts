// Firebase Phone Authentication — initialised lazily from Vite env vars.
// If the env vars are absent the app falls back to a server dev-OTP flow, so
// registration stays testable before a real Firebase project is wired up.
//
// Set these in artifacts/pool-reservation/.env (see .env.example):
//   VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID,
//   VITE_FIREBASE_APP_ID, VITE_FIREBASE_SENDER_ID (optional)
import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  getAuth, RecaptchaVerifier, signInWithPhoneNumber,
  type Auth, type ConfirmationResult,
} from "firebase/auth";

const cfg = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_SENDER_ID as string | undefined,
};

export const firebaseConfigured = (): boolean =>
  Boolean(cfg.apiKey && cfg.authDomain && cfg.projectId && cfg.appId);

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

export function getFirebaseAuth(): Auth {
  if (!firebaseConfigured()) throw new Error("Firebase is not configured");
  if (!auth) {
    app = initializeApp(cfg as Record<string, string>);
    auth = getAuth(app);
    auth.languageCode = "th";
  }
  return auth;
}

/** Convert a Thai local number to E.164 (+66…). Returns null if implausible. */
export function toE164(input: string): string | null {
  let s = input.trim().replace(/[\s\-().]/g, "");
  if (s.startsWith("+")) {
    const d = s.slice(1).replace(/\D/g, "");
    return d.length >= 8 && d.length <= 15 ? "+" + d : null;
  }
  s = s.replace(/\D/g, "");
  if (s.length === 10 && s.startsWith("0")) return "+66" + s.slice(1);
  if (s.startsWith("66") && s.length >= 11) return "+" + s;
  if (s.length === 9) return "+66" + s;
  return null;
}

export { RecaptchaVerifier, signInWithPhoneNumber };
export type { ConfirmationResult };
