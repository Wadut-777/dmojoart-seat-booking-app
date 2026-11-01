import { createHmac, createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

import { exec, sql, transaction } from "./db.server";

/**
 * NTT DATA Payment Services (Atom / NDPS) client — server only.
 * Flow: AUTH API -> atomTokenId -> browser opens atomcheckout.js -> Atom POSTs the
 * encrypted result to our returnUrl -> we decrypt, verify the HMAC signature and settle.
 * The Transaction Status API is used to reconcile when the browser never came back.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Obj = Record<string, any>;

export function paymentProvider(): "atom" | "simulated" {
  return process.env["PAYMENT_PROVIDER"] === "simulated" ? "simulated" : "atom";
}

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Payment gateway is not configured (missing ${name}).`);
  return v;
}

export function atomConfig() {
  return {
    env: (process.env["ATOM_ENV"] === "prod" ? "prod" : "uat") as "uat" | "prod",
    merchId: need("ATOM_MERCHANT_ID"),
    password: need("ATOM_PASSWORD"),
    product: need("ATOM_PRODUCT"),
    reqKey: need("ATOM_REQ_ENC_KEY"),
    reqSalt: need("ATOM_REQ_SALT"),
    resKey: need("ATOM_RES_ENC_KEY"),
    resSalt: need("ATOM_RES_SALT"),
    reqHashKey: need("ATOM_REQ_HASH_KEY"),
    resHashKey: need("ATOM_RES_HASH_KEY"),
    authUrl: need("ATOM_AUTH_URL"),
    statusUrl: need("ATOM_STATUS_URL"),
    jsUrl: need("ATOM_JS_URL"),
    baseUrl: (process.env["PUBLIC_BASE_URL"] ?? "http://localhost:3000").replace(/\/+$/, ""),
    fallbackEmail: process.env["ATOM_FALLBACK_EMAIL"] ?? "noreply@dmojoart.in",
  };
}

/* ───────────── crypto (AES-256-CBC, PBKDF2-HMAC-SHA512, fixed IV 0..15) ───────────── */

const IV = Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
const keyCache = new Map<string, Buffer>();

function deriveKey(key: string, salt: string): Buffer {
  const id = `${key}:${salt}`;
  let k = keyCache.get(id);
  if (!k) {
    k = pbkdf2Sync(Buffer.from(key, "ascii"), Buffer.from(salt, "ascii"), 65536, 32, "sha512");
    keyCache.set(id, k);
  }
  return k;
}

export function encryptRequest(data: unknown, key: string, salt: string): string {
  const cipher = createCipheriv("aes-256-cbc", deriveKey(key, salt), IV);
  const out = Buffer.concat([cipher.update(JSON.stringify(data), "utf8"), cipher.final()]);
  return out.toString("hex").toUpperCase();
}

export function decryptResponse(hex: string, key: string, salt: string): Obj {
  const decipher = createDecipheriv("aes-256-cbc", deriveKey(key, salt), IV);
  const out = Buffer.concat([decipher.update(Buffer.from(hex, "hex")), decipher.final()]);
  return JSON.parse(out.toString("utf8"));
}

const hmacHex = (key: string, text: string) => createHmac("sha512", key).update(text, "utf8").digest("hex");

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a.toLowerCase());
  const y = Buffer.from(b.toLowerCase());
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Signature of the result Atom posts to the returnUrl (response hash key). */
export function callbackSignatureString(r: Obj): string {
  const sub = r.payModeSpecificData?.subChannel;
  return [
    r.merchDetails?.merchId,
    r.payDetails?.atomTxnId,
    r.merchDetails?.merchTxnId,
    Number(r.payDetails?.totalAmount ?? 0).toFixed(2),
    r.responseDetails?.statusCode,
    Array.isArray(sub) ? sub[0] : sub,
    r.payModeSpecificData?.bankDetails?.bankTxnId,
  ]
    .map((v) => (v === undefined || v === null ? "" : String(v)))
    .join("");
}

/** Signature for the Transaction Status API (request hash key). Amount is an integer. */
export function statusSignature(merchId: string, merchTxnId: string, amount: number, currency: string, reqHashKey: string) {
  return hmacHex(reqHashKey, `${merchId}${merchTxnId}${Math.floor(amount)}${currency}`);
}

/* ───────────── HTTP ───────────── */

/** "yyyy-MM-dd HH:mm:ss" in Indian Standard Time. */
export function istTimestamp(date = new Date()): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((x) => [x.type, x.value]),
  );
  return `${p["year"]}-${p["month"]}-${p["day"]} ${p["hour"]}:${p["minute"]}:${p["second"]}`;
}

// Atom answers with Content-Type application/json but the body is url-encoded: merchId=…&encData=…
async function callAtom(url: string, merchId: string, payload: unknown): Promise<Obj> {
  const cfg = atomConfig();
  const body = new URLSearchParams({ encData: encryptRequest(payload, cfg.reqKey, cfg.reqSalt), merchId });
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  const enc = new URLSearchParams(text).get("encData");
  if (!enc) {
    let detail = text.slice(0, 200);
    try {
      const j = JSON.parse(text);
      detail = j.txnDescription ?? j.message ?? detail;
    } catch {
      /* not JSON */
    }
    throw new Error(`Payment gateway error (HTTP ${res.status}): ${detail}`);
  }
  return decryptResponse(enc, cfg.resKey, cfg.resSalt);
}

/** AUTH API: returns the atomTokenId the browser needs to open the payment page. */
export async function requestAtomToken(a: {
  merchTxnId: string;
  merchTxnDate: string;
  amount: number;
  email: string;
  mobile: string;
  reference: string;
}): Promise<string> {
  const cfg = atomConfig();
  const result = await callAtom(cfg.authUrl, cfg.merchId, {
    payInstrument: {
      headDetails: { api: "AUTH", version: "OTSv1.1", platform: "FLASH" },
      merchDetails: {
        merchId: cfg.merchId,
        password: cfg.password,
        merchTxnId: a.merchTxnId,
        merchTxnDate: a.merchTxnDate,
      },
      payDetails: { amount: a.amount, product: cfg.product, txnCurrency: "INR" },
      custDetails: { custEmail: a.email, custMobile: a.mobile },
      extras: { udf1: a.reference, udf2: "-", udf3: "-", udf4: "-", udf5: "-" },
    },
  });
  const code = result.responseDetails?.txnStatusCode;
  if (code !== "OTS0000" || !result.atomTokenId) {
    throw new Error(
      `Could not start the payment (${code ?? "no code"}: ${result.responseDetails?.txnDescription ?? "unknown error"}).`,
    );
  }
  return String(result.atomTokenId);
}

/* ───────────── outcomes ───────────── */

export type AtomOutcome = {
  merchTxnId: string;
  atomTxnId: string | null;
  status: "paid" | "failed";
  statusCode: string;
  description: string;
  amount: number;
};

function toOutcome(r: Obj): AtomOutcome {
  const code = String(r.responseDetails?.statusCode ?? "");
  return {
    merchTxnId: String(r.merchDetails?.merchTxnId ?? ""),
    atomTxnId: r.payDetails?.atomTxnId != null ? String(r.payDetails.atomTxnId) : null,
    status: code === "OTS0000" ? "paid" : "failed",
    statusCode: code,
    description: String(r.responseDetails?.description ?? r.responseDetails?.message ?? ""),
    amount: Number(r.payDetails?.amount ?? 0),
  };
}

const firstInstrument = (d: Obj): Obj | undefined => (Array.isArray(d.payInstrument) ? d.payInstrument[0] : d.payInstrument);

/** Decrypts what Atom POSTed to our returnUrl and checks its signature. */
export function parseReturn(encData: string): { outcome: AtomOutcome; signatureValid: boolean } {
  const cfg = atomConfig();
  const r = firstInstrument(decryptResponse(encData, cfg.resKey, cfg.resSalt));
  if (!r) throw new Error("Unexpected payment response.");
  const expected = hmacHex(cfg.resHashKey, callbackSignatureString(r));
  const received = String(r.payDetails?.signature ?? "");
  return { outcome: toOutcome(r), signatureValid: !!received && safeEqual(expected, received) };
}

/** Transaction Status API (server to server). Returns null when Atom has no usable answer. */
export async function fetchAtomStatus(a: {
  merchTxnId: string;
  merchTxnDate: string;
  amount: number;
}): Promise<AtomOutcome | null> {
  const cfg = atomConfig();
  try {
    const data = await callAtom(cfg.statusUrl, cfg.merchId, {
      payInstrument: {
        payDetails: {
          amount: Math.floor(a.amount),
          signature: statusSignature(cfg.merchId, a.merchTxnId, a.amount, "INR", cfg.reqHashKey),
          txnCurrency: "INR",
        },
        merchDetails: { merchId: Number(cfg.merchId), merchTxnId: a.merchTxnId, merchTxnDate: a.merchTxnDate.slice(0, 10) },
      },
    });
    const r = firstInstrument(data);
    if (!r?.responseDetails) return null;
    const o = toOutcome({ ...r, merchDetails: { ...r.merchDetails, merchTxnId: r.merchDetails?.merchTxnId ?? a.merchTxnId } });
    return o;
  } catch (e) {
    console.error("[atom] status check failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

/* ───────────── settlement ───────────── */

export function newMerchTxnId(bookingRef: string): string {
  return `${bookingRef.replace(/[^A-Za-z0-9]/g, "")}${randomBytes(3).toString("hex").toUpperCase()}`;
}

function makeTicketCode(bookingRef: string) {
  return `TKT-${bookingRef}-${randomBytes(3).toString("hex").toUpperCase().slice(0, 5)}`;
}

/** Records a verified outcome. Idempotent: a paid attempt/booking is never downgraded. Returns the booking id. */
export async function settleOutcome(o: AtomOutcome): Promise<string | null> {
  const [attempt] = await sql<{ id: string; booking_id: string; amount: number; status: string }[]>`
    SELECT id, booking_id, amount, status FROM payment_attempts WHERE merch_txn_id = ${o.merchTxnId}`;
  if (!attempt) return null;
  if (attempt.status === "paid") return attempt.booking_id;

  let status = o.status;
  let description = o.description;
  if (status === "paid" && Number(o.amount) !== Number(attempt.amount)) {
    console.error(`[atom] amount mismatch for ${o.merchTxnId}: expected ${attempt.amount}, got ${o.amount}`);
    status = "failed";
    description = "Amount mismatch — flagged for review";
  }

  await transaction(async (tx) => {
    await tx.exec`
      UPDATE payment_attempts
      SET status = ${status}, atom_txn_id = ${o.atomTxnId}, status_code = ${o.statusCode},
          description = ${description.slice(0, 500)}, completed_at = UTC_TIMESTAMP(3)
      WHERE id = ${attempt.id} AND status <> 'paid'`;
    if (status === "paid") {
      const [b] = await tx.sql<{ booking_ref: string }[]>`SELECT booking_ref FROM bookings WHERE id = ${attempt.booking_id}`;
      await tx.exec`
        UPDATE bookings
        SET payment_status = 'paid', payment_provider = 'atom', payment_ref = ${o.atomTxnId ?? o.merchTxnId},
            paid_at = UTC_TIMESTAMP(3), ticket_code = COALESCE(ticket_code, ${makeTicketCode(b!.booking_ref)}), status = 'confirmed'
        WHERE id = ${attempt.booking_id} AND payment_status <> 'paid'`;
    } else {
      await tx.exec`UPDATE bookings SET payment_status = 'failed' WHERE id = ${attempt.booking_id} AND payment_status = 'pending'`;
    }
  });
  return attempt.booking_id;
}

/** Asks Atom directly about an attempt and settles it. */
export async function syncAttempt(merchTxnId: string): Promise<void> {
  const [a] = await sql<{ merch_txn_id: string; merch_txn_date: string; amount: number }[]>`
    SELECT merch_txn_id, merch_txn_date, amount FROM payment_attempts WHERE merch_txn_id = ${merchTxnId}`;
  if (!a) return;
  const outcome = await fetchAtomStatus({ merchTxnId: a.merch_txn_id, merchTxnDate: a.merch_txn_date, amount: a.amount });
  if (outcome) await settleOutcome({ ...outcome, merchTxnId: a.merch_txn_id });
}
