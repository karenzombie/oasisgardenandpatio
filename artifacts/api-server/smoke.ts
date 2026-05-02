import { execSync } from "node:child_process";
import {
  generate,
  NobleCryptoPlugin,
  ScureBase32Plugin,
  generateURI,
} from "otplib";

const base = "http://localhost:80/api";
const cookieFile = "/tmp/cookies.txt";
const email = process.env.ADMIN_EMAIL!;
const password = "audittest12";

function curl(args: string): string {
  return execSync(`curl -s ${args}`, { encoding: "utf8" });
}

const login = JSON.parse(
  curl(
    `-c ${cookieFile} -X POST ${base}/auth/staff/login -H 'Content-Type: application/json' -d '${JSON.stringify({ email, password })}'`,
  ),
);
console.log("login:", login.stage);

const init = JSON.parse(
  curl(
    `-b ${cookieFile} -c ${cookieFile} -X POST ${base}/auth/staff/2fa/setup-init -H 'Content-Type: application/json' -d '{}'`,
  ),
);
const secret = new URL(
  init.otpAuthUrl.replace("otpauth://", "https://x/"),
).searchParams.get("secret")!;
console.log("secret:", secret.slice(0, 8) + "…");

const tokenRes = await generate({
  secret,
  period: 30,
  digits: 6,
  crypto: NobleCryptoPlugin,
  base32: ScureBase32Plugin,
});
const code = (tokenRes as { token?: string }).token ?? String(tokenRes);
console.log("code:", code);

const verify = curl(
  `-b ${cookieFile} -c ${cookieFile} -X POST ${base}/auth/staff/2fa/setup-verify -H 'Content-Type: application/json' -d '${JSON.stringify({ code })}'`,
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
  after.cancellationRequests.map((c: { status: string }) => c.status),
);

console.log(
  "\n--- unauth ---",
  curl(`-w '\\nHTTP %{http_code}' ${base}/admin/orders`),
);
// noop ref
void generateURI;
