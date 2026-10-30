import { BlockList, isIPv4, isIPv6 } from "node:net";

const blockedV4 = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4]
] as const) {
  blockedV4.addSubnet(net, prefix, "ipv4");
}

/** Expands an IPv6 literal into its 8 16-bit groups; returns `null` if it is not a plain IPv6 address. */
function ipv6Groups(address: string): number[] | null {
  if (address.includes("%") || !URL.canParse(`http://[${address}]/`)) return null;
  const normalized = new URL(`http://[${address}]/`).hostname.slice(1, -1);
  const [head = "", tail] = normalized.split("::");
  const headGroups = head ? head.split(":") : [];
  const tailGroups = tail === undefined ? [] : tail ? tail.split(":") : [];
  const fill = tail === undefined ? 0 : 8 - headGroups.length - tailGroups.length;
  const groups = [...headGroups, ...Array<string>(Math.max(fill, 0)).fill("0"), ...tailGroups].map(
    (g) => parseInt(g, 16)
  );
  return groups.length === 8 && groups.every((g) => g >= 0 && g <= 0xffff) ? groups : null;
}

function v4FromGroups(high: number, low: number) {
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}

/**
 * True only for a globally routable address. IPv4 is checked against a private/reserved denylist.
 * IPv6 must be global unicast (`2000::/3`) outside Teredo, documentation and 6to4 space; IPv4-mapped
 * (`::ffff:a.b.c.d`) and NAT64 (`64:ff9b::/96`) forms are unwrapped and judged as the embedded IPv4.
 * Anything unparsable (zone ids, garbage) is not public.
 */
export function isPublicAddress(address: string): boolean {
  if (isIPv4(address)) return !blockedV4.check(address, "ipv4");
  if (!isIPv6(address)) return false;

  const g = ipv6Groups(address);
  if (!g) return false;

  const mapped = g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff;
  const nat64 = g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0);
  if (mapped || nat64) return isPublicAddress(v4FromGroups(g[6]!, g[7]!));

  if ((g[0]! & 0xe000) !== 0x2000) return false;
  if (g[0] === 0x2001 && (g[1] === 0 || g[1] === 0xdb8)) return false;
  if (g[0] === 0x2002) return false;
  return true;
}
