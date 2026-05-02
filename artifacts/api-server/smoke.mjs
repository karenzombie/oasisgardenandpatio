import { execSync } from "node:child_process";
import { createHmac } from "node:crypto";

const base = "http://localhost:80/api";
const cookieFile = "/tmp/cookies.txt";
const email = process.env.ADMIN_EMAIL;
const password = "audittest12";

function curl(args) {
  return execSync(`curl -s ${args}`, { encoding: "utf8" });
}

function base32Decode(s) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  s = s.toUpperCase().replace(/=+$/, "");
  const bytes = [];
  let bits = 0,
    value = 0;
  for (const c of s) {
    const i = alphabet.indexOf(c);
    if (i < 0) continue;
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >> bits) & 0xff);
    }
  }
  return Buffer.from(bytes);
}

function totp(secret, period = 30, digits = 6) {
  const key = base32Decode(secret);
  let counter = Math.floor(Date.now() / 1000 / period);
  const buf = Buffer.alloc(8);
  for (let i = 7; i >= 0; i--) {
    buf[i] = counter & 0xff;
    counter = Math.floor(counter / 256);
  }
  const hmac = createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 10 ** digits).padStart(digits, "0");
}

const login = JSON.parse(
  curl(
    `-c ${cookieFile} -X POST ${base}/auth/staff/login -H 'Content-Type: application/json' -d '${JSON.stringify({ email, password })}'`,
  ),
);
console.log("login:", login.stage);

let secret;
if (login.stage === "needs_2fa_verify") {
  secret = execSync(
    `psql "$DATABASE_URL" -tA -c "SELECT two_factor_secret FROM users WHERE email = '${email}'"`,
    { encoding: "utf8" },
  ).trim();
} else {
  const init = JSON.parse(
    curl(
      `-b ${cookieFile} -c ${cookieFile} -X POST ${base}/auth/staff/2fa/setup-init -H 'Content-Type: application/json' -d '{}'`,
    ),
  );
  secret = new URL(
    init.otpAuthUrl.replace("otpauth://", "https://x/"),
  ).searchParams.get("secret");
}
console.log("secret:", secret.slice(0, 8) + "…");

const code = totp(secret);
console.log("code:", code);

const verifyEndpoint =
  login.stage === "needs_2fa_verify"
    ? `${base}/auth/staff/2fa/verify`
    : `${base}/auth/staff/2fa/setup-verify`;
const verify = curl(
  `-b ${cookieFile} -c ${cookieFile} -X POST ${verifyEndpoint} -H 'Content-Type: application/json' -d '${JSON.stringify({ code })}'`,
);
console.log("verify:", verify.slice(0, 200));

console.log("\n--- list ---");
console.log(curl(`-b ${cookieFile} ${base}/admin/orders?limit=10`).slice(0, 700));

console.log("\n--- detail #1 ---");
console.log(curl(`-b ${cookieFile} ${base}/admin/orders/1`).slice(0, 800));

console.log("\n--- cancellations ---");
console.log(curl(`-b ${cookieFile} ${base}/admin/cancellation-requests`).slice(0, 600));

console.log("\n--- status->confirmed ---");
console.log(
  curl(
    `-b ${cookieFile} -X POST ${base}/admin/orders/1/status -H 'Content-Type: application/json' -d '{"toStatus":"confirmed","note":"phone"}'`,
  ).slice(0, 200),
);

console.log("\n--- bad status ---");
console.log(
  curl(
    `-b ${cookieFile} -w '\\nHTTP %{http_code}' -X POST ${base}/admin/orders/1/status -H 'Content-Type: application/json' -d '{"toStatus":"banana"}'`,
  ),
);

console.log("\n--- notes ---");
console.log(
  curl(
    `-b ${cookieFile} -X POST ${base}/admin/orders/1/notes -H 'Content-Type: application/json' -d '{"notes":"smoke test note"}'`,
  ).slice(0, 200),
);

console.log("\n--- approve cancellation ---");
console.log(
  curl(
    `-b ${cookieFile} -X POST ${base}/admin/cancellation-requests/1/review -H 'Content-Type: application/json' -d '{"decision":"approved","reviewNote":"OK","refundAmount":500}'`,
  ).slice(0, 400),
);

const after = JSON.parse(curl(`-b ${cookieFile} ${base}/admin/orders/1`));
console.log(
  "\nafter -> status:",
  after.status,
  "history len:",
  after.statusHistory.length,
  "cancellations:",
  after.cancellationRequests.map((c) => c.status),
);

console.log(
  "\n--- unauth ---",
  curl(`-w '\\nHTTP %{http_code}' ${base}/admin/orders`),
);
