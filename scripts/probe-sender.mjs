#!/usr/bin/env node
// v2 helper. NOT used by the runtime.
//
// Probes the public Txtbox endpoint with several plausible field names for
// "custom sender" to discover which key the API honors. Intended for one-off
// manual use against a project that has an *approved* custom sender.
//
// Usage:
//   TXTBOX_API_KEY=tbx_xxx \
//   TXTBOX_TEST_RECIPIENT=09171234567 \
//   TXTBOX_PROBE_SENDER=BRANDX \
//     node scripts/probe-sender.mjs
//
// For each candidate field the script sends one SMS, prints the response, and
// asks the operator to check the recipient phone for which sender name appeared.
// The winning field is the v2 API surface for `sender`.

const KEY = process.env.TXTBOX_API_KEY;
const TO = process.env.TXTBOX_TEST_RECIPIENT;
const SENDER = process.env.TXTBOX_PROBE_SENDER ?? "PROBETEST";

if (!KEY || !TO) {
  console.error("set TXTBOX_API_KEY and TXTBOX_TEST_RECIPIENT to run.");
  process.exit(1);
}

const URL = "https://ws-v2.txtbox.com/messaging/v1/sms/push";
const CANDIDATES = ["sender", "mask_name", "from", "sender_id", "sender_name"];

for (const field of CANDIDATES) {
  const body = new URLSearchParams({
    to: TO,
    message: `probe ${field}=${SENDER}`,
    [field]: SENDER,
  }).toString();

  const start = Date.now();
  const res = await fetch(URL, {
    method: "POST",
    headers: {
      "X-TXTBOX-Auth": KEY,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });
  const text = await res.text();
  console.log(`field=${field} status=${res.status} ms=${Date.now() - start}`);
  console.log(text);
  console.log("---");
  // Throttle a bit to be polite.
  await new Promise((r) => setTimeout(r, 1500));
}

console.log(
  "Done. Check the recipient phone — whichever message shows the custom sender",
  `"${SENDER}" instead of the account default identifies the public field name.`,
);
