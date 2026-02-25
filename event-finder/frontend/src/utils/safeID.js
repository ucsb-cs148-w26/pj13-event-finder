// src/utils/safeId.js
export async function sha256Base64Url(input) {
    const enc = new TextEncoder().encode(input);
    const buf = await crypto.subtle.digest("SHA-256", enc);
    const bytes = Array.from(new Uint8Array(buf));
    const b64 = btoa(String.fromCharCode(...bytes));
    // base64url (Firestore-safe)
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }