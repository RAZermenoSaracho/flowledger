import { describe, expect, it } from "vitest";
import { CimdError } from "../../types/cimd.types.js";
import { parseClientIdUrl } from "../clientUrl.js";
import { isPublicAddress } from "../ipGuard.js";

describe("isPublicAddress", () => {
  it.each([
    "0.0.0.0",
    "10.0.0.5",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.0.0.1",
    "192.0.2.1",
    "192.168.1.1",
    "198.18.0.1",
    "198.51.100.1",
    "203.0.113.1",
    "224.0.0.1",
    "240.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "fd00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "::ffff:10.0.0.1",
    "64:ff9b::7f00:1",
    "64:ff9b::a9fe:a9fe",
    "2002:7f00:1::1",
    "2001::1",
    "2001:db8::1",
    "ff02::1",
    "fe80::1%eth0",
    "not-an-ip",
    ""
  ])("rejects %j", (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each([
    "8.8.8.8",
    "1.1.1.1",
    "172.15.255.255",
    "172.32.0.1",
    "100.63.255.255",
    "100.128.0.1",
    "2606:4700:4700::1111",
    "2a00:1450:4001::200e",
    "::ffff:8.8.8.8",
    "64:ff9b::808:808"
  ])("accepts %j", (address) => {
    expect(isPublicAddress(address)).toBe(true);
  });
});

describe("parseClientIdUrl", () => {
  it.each(["https://chatgpt.com/oauth/client.json", "https://8.8.8.8/c.json"])(
    "accepts %j",
    (clientId) => {
      const url = parseClientIdUrl(clientId);
      expect(url).toBeInstanceOf(URL);
      expect(url.href).toBe(clientId);
    }
  );

  it.each([
    "http://a.example/c.json",
    "https://user:pw@a.example/c.json",
    "https://a.example/c.json#x",
    "https://a.example:8443/c.json",
    "https://a.example/",
    "https://a.example",
    "not a url",
    "https://127.0.0.1/c.json",
    "https://[::1]/c.json",
    "https://10.0.0.1/c.json"
  ])("rejects %j with CimdError", (clientId) => {
    expect(() => parseClientIdUrl(clientId)).toThrow(CimdError);
  });
});
