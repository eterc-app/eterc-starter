
export type ImageFormat = "jpeg" | "png" | "gif" | "webp";

export const FORMAT_MIME: Record<ImageFormat, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
};
export const MIME_EXTENSIONS: Record<string, "jpg" | "png" | "gif" | "webp"> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};

export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
];

export interface DetectedImage {
  format: ImageFormat;
  mime_type: string;
  width: number;
  height: number;
}

/**
 * Detect an accepted image (format, MIME type and dimensions) from its
 * bytes. Returns null when the bytes are not an accepted image; callers can
 * use guessUnsupportedImageMime() to distinguish "valid image in an
 * unsupported format" from "not an image".
 */
export function detectImage(bytes: Buffer): DetectedImage | null {
  const format = detectSupportedFormat(bytes);
  if (format === null) return null;

  const dimensions = readDimensions(bytes, format);
  if (dimensions === null) return null;

  return {
    format,
    mime_type: FORMAT_MIME[format],
    width: dimensions.width,
    height: dimensions.height,
  };
}

export function detectSupportedFormat(bytes: Buffer): ImageFormat | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "png";
  }
  const head = bytes.subarray(0, 12).toString("latin1");
  if (head.startsWith("GIF87a") || head.startsWith("GIF89a")) {
    return "gif";
  }
  if (head.startsWith("RIFF") && head.slice(8, 12) === "WEBP") {
    return "webp";
  }
  return null;
}

/**
 * Guess the MIME type of a valid image in a format Eterc does not
 * accept (used to raise the 415 UNSUPPORTED_FORMAT error).
 */
export function guessUnsupportedImageMime(bytes: Buffer): string | null {
  const head = bytes.subarray(0, 16).toString("latin1");

  if (head.startsWith("BM")) return "image/bmp";
  if (head.startsWith("II*\u0000") || head.startsWith("MM\u0000*")) {
    return "image/tiff";
  }
  if (bytes.length >= 4 && bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0) {
    return "image/x-icon";
  }
  if (head.startsWith("8BPS")) return "image/vnd.adobe.photoshop";

  const brand = bytes.subarray(4, 12).toString("latin1");
  if (brand.startsWith("ftyp")) {
    const major = bytes.subarray(8, 12).toString("latin1");
    if (major === "avif" || major === "avis") return "image/avif";
    if (major === "heic" || major === "heix" || major === "mif1" || major === "msf1") {
      return "image/heic";
    }
  }

  const asText = bytes.subarray(0, 1024).toString("utf8").toLowerCase();
  if (asText.includes("<svg")) return "image/svg+xml";

  return null;
}

export function isSignatureValid(bytes: Buffer, format: ImageFormat): boolean {
  switch (format) {
    case "jpeg":
      return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case "png":
      return (
        bytes.length >= 8 &&
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47 &&
        bytes[4] === 0x0d &&
        bytes[5] === 0x0a &&
        bytes[6] === 0x1a &&
        bytes[7] === 0x0a
      );
    case "gif": {
      const head = bytes.subarray(0, 6).toString("latin1");
      return head === "GIF87a" || head === "GIF89a";
    }
    case "webp": {
      const head = bytes.subarray(0, 12).toString("latin1");
      return head.startsWith("RIFF") && head.slice(8, 12) === "WEBP";
    }
    default:
      return false;
  }
}

export function readDimensions(
  bytes: Buffer,
  format: ImageFormat
): { width: number; height: number } | null {
  try {
    switch (format) {
      case "png":
        return readPngDimensions(bytes);
      case "gif":
        return readGifDimensions(bytes);
      case "jpeg":
        return readJpegDimensions(bytes);
      case "webp":
        return readWebpDimensions(bytes);
      default:
        return null;
    }
  } catch {
    return null;
  }
}

function readPngDimensions(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.length < 24) return null;
  if (bytes.subarray(12, 16).toString("latin1") !== "IHDR") return null;
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width <= 0 || height <= 0) return null;
  return { width, height };
}

function readGifDimensions(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.length < 10) return null;
  const width = bytes.readUInt16LE(6);
  const height = bytes.readUInt16LE(8);
  if (width <= 0 || height <= 0) return null;
  return { width, height };
}

function readJpegDimensions(bytes: Buffer): { width: number; height: number } | null {
  let i = 2;

  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) {
      i++;
      continue;
    }

    let marker = bytes[i + 1];
    while (marker === 0xff && i + 2 < bytes.length) {
      i++;
      marker = bytes[i + 1];
    }

    // Standalone markers without a length field.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    if (marker === 0xd8) {
      i += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) {
      return null;
    }

    const length = bytes.readUInt16BE(i + 2);
    if (length < 2) return null;

    // SOF markers (excluding DHT/JPG/DAC) carry the frame dimensions.
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    ) {
      const height = bytes.readUInt16BE(i + 5);
      const width = bytes.readUInt16BE(i + 7);
      if (width <= 0 || height <= 0) return null;
      return { width, height };
    }

    i += 2 + length;
  }

  return null;
}

function readWebpDimensions(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.length < 30) return null;
  const fourcc = bytes.subarray(12, 16).toString("latin1");

  if (fourcc === "VP8X") {
    const width = bytes.readUIntLE(24, 3) + 1;
    const height = bytes.readUIntLE(27, 3) + 1;
    return width > 0 && height > 0 ? { width, height } : null;
  }

  if (fourcc === "VP8 ") {
    const width = bytes.readUInt16LE(26) & 0x3fff;
    const height = bytes.readUInt16LE(28) & 0x3fff;
    return width > 0 && height > 0 ? { width, height } : null;
  }

  if (fourcc === "VP8L") {
    const packed = bytes.readUInt32LE(21);
    const width = (packed & 0x3fff) + 1;
    const height = ((packed >>> 14) & 0x3fff) + 1;
    return width > 0 && height > 0 ? { width, height } : null;
  }

  return null;
}
