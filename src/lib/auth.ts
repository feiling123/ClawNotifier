const encoder = new TextEncoder();

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");

const importHmacKey = (secret: string): Promise<CryptoKey> =>
  crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);

const sign = async (secret: string, payload: string): Promise<string> => {
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return toHex(new Uint8Array(signature));
};

const timingSafeEqual = (left: string, right: string): boolean => {
  if (left.length !== right.length) {
    return false;
  }

  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return diff === 0;
};

export const ADMIN_SESSION_COOKIE = "ilink_admin_session";
export const ADMIN_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export const createAdminSessionToken = async (
  adminToken: string,
  ttlSeconds = ADMIN_SESSION_TTL_SECONDS
): Promise<string> => {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const signature = await sign(adminToken, `${adminToken}.${expiresAt}`);
  return `${expiresAt}.${signature}`;
};

export const verifyAdminSessionToken = async (adminToken: string, token: string): Promise<boolean> => {
  const [expiresAtRaw, signature] = token.split(".");
  if (!expiresAtRaw || !signature) {
    return false;
  }

  const expiresAt = Number.parseInt(expiresAtRaw, 10);
  if (!Number.isInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) {
    return false;
  }

  const expected = await sign(adminToken, `${adminToken}.${expiresAtRaw}`);
  return timingSafeEqual(signature, expected);
};
