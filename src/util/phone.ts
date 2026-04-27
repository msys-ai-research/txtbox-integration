// PH mobile prefix blocks change frequently (new telcos, new NTC blocks).
// A whitelist false-rejects valid numbers within months. Use shape-only:
//   strip non-digit-non-plus → match ^(09|\+?639)\d{9}$
const PH_RE = /^(09|\+?639)\d{9}$/;

export function normalize(input: string): string {
  return input.replace(/[^\d+]/g, "");
}

export function isPhMobile(input: string): boolean {
  return PH_RE.test(normalize(input));
}

// Returns the international form the Txtbox upstream accepts: +639XXXXXXXXX.
// The local 09XXXXXXXXX form is rejected by the API.
export function toCanonical(input: string): string {
  const n = normalize(input);
  if (n.startsWith("+63")) return n;
  if (n.startsWith("63")) return "+" + n;
  if (n.startsWith("0")) return "+63" + n.slice(1);
  return n;
}
