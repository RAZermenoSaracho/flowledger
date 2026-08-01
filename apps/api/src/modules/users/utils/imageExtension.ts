export function imageExtension(data: Buffer, contentType: string) {
  if (
    contentType === "image/png" &&
    data.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  ) {
    return "png";
  }

  if (
    contentType === "image/jpeg" &&
    data.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
  ) {
    return "jpg";
  }

  if (
    contentType === "image/gif" &&
    (data.subarray(0, 6).toString("ascii") === "GIF87a" ||
      data.subarray(0, 6).toString("ascii") === "GIF89a")
  ) {
    return "gif";
  }

  if (
    contentType === "image/webp" &&
    data.subarray(0, 4).toString("ascii") === "RIFF" &&
    data.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "webp";
  }

  return null;
}
