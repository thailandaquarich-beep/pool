import jwt from "jsonwebtoken";

// Verify a Firebase Phone-Auth ID token WITHOUT the heavy firebase-admin SDK.
// A Firebase ID token is an RS256 JWT signed by Google; we fetch Google's public
// x509 certs, verify the signature + audience/issuer, and read the phone_number
// claim. Only FIREBASE_PROJECT_ID is needed (no service-account JSON).

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "";
export const firebaseConfigured = (): boolean => Boolean(PROJECT_ID);

const CERT_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

let certCache: { at: number; ttl: number; certs: Record<string, string> } | null = null;

async function getCerts(): Promise<Record<string, string>> {
  if (certCache && Date.now() - certCache.at < certCache.ttl) return certCache.certs;
  const resp = await fetch(CERT_URL);
  const certs = (await resp.json()) as Record<string, string>;
  const cc = resp.headers.get("cache-control") || "";
  const m = /max-age=(\d+)/.exec(cc);
  const ttl = (m ? parseInt(m[1], 10) : 3600) * 1000;
  certCache = { at: Date.now(), ttl, certs };
  return certs;
}

export interface FirebasePhone {
  uid: string;
  phone: string;
}

/** Verify the token and return the verified phone (E.164). Throws on any failure. */
export async function verifyFirebasePhoneToken(idToken: string): Promise<FirebasePhone> {
  if (!PROJECT_ID) throw new Error("Firebase not configured");

  const decoded = jwt.decode(idToken, { complete: true });
  if (!decoded || typeof decoded === "string") throw new Error("Malformed token");
  const kid = decoded.header.kid;
  if (!kid) throw new Error("Token has no key id");

  const certs = await getCerts();
  const pem = certs[kid];
  if (!pem) throw new Error("Unknown signing key");

  const payload = jwt.verify(idToken, pem, {
    algorithms: ["RS256"],
    audience: PROJECT_ID,
    issuer: `https://securetoken.google.com/${PROJECT_ID}`,
  }) as Record<string, unknown>;

  const uid = String(payload["sub"] || "");
  const phone = String(payload["phone_number"] || "");
  if (!uid) throw new Error("Token has no subject");
  if (!phone) throw new Error("Token has no phone_number");
  return { uid, phone };
}
