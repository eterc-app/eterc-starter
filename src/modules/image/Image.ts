import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import * as v8 from "node:v8";
import { segment } from "@/engine/request-context";
import { uploaded_files } from "@/engine/post";
import { sanitize_filename } from "@/engine/String_service";
import { block_url } from "@/modules/utilities/Utilities";
import {
  ensureDirectory,
  resolveUploadDirectory,
} from "@/modules/file/upload-paths";
import {
  ALLOWED_MIME_TYPES,
  MIME_EXTENSIONS,
  detectSupportedFormat,
  guessUnsupportedImageMime,
  isSignatureValid,
  readDimensions,
  type ImageFormat,
} from "./image-utils";

/**
 * Image service.
 *
 * Holds encoded image bytes and uses sharp for encoding and transformations:
 *
 *   - upload() / load() / save() / output() and the resize/crop methods are
 *     async;
 *   - get_width() / get_height() / get_header() are synchronous because
 *     dimensions are decoded from the container header on load;
 *   - output() always returns the encoded bytes as a Buffer;
 *   - the constructor installs block_url('image') to prevent direct access.
 *
 * Stored file names use the MIME type sniffed from the file content, never
 * the client's file name. `make_rand_name` uses 16 random bytes, hex-encoded,
 * prefixed 'img_'.
 */

// Numeric image type identifiers returned by get_image_type() and get_header().
const IMAGETYPE_GIF = 1;
const IMAGETYPE_JPEG = 2;
const IMAGETYPE_PNG = 3;
const IMAGETYPE_WEBP = 18;

const FORMAT_TO_TYPE: Record<ImageFormat, number> = {
  jpeg: IMAGETYPE_JPEG,
  png: IMAGETYPE_PNG,
  gif: IMAGETYPE_GIF,
  webp: IMAGETYPE_WEBP,
};

/** User-facing messages for numeric upload error codes. */
const UPLOAD_ERRORS: Record<number, string> = {
  1: "The uploaded file exceeds the server's size limit",
  2: "The uploaded file exceeds the configured size limit",
  3: "The uploaded file was only partially uploaded",
  4: "No file was uploaded",
  6: "The server's temporary folder is unavailable",
  7: "Failed to write file to disk",
  8: "The upload was stopped by a server extension",
};

export interface ImageUploadConfig {
  destination?: string;
  max_width?: number;
  max_height?: number;
  thumbnail_dir?: string;
  thumbnail_max_width?: number;
  thumbnail_max_height?: number;
  upload_to_module?: boolean;
  make_rand_name?: boolean;
  target_module?: string;
  [key: string]: unknown;
}

export interface ImageUploadInfo {
  file_name: string;
  file_path: string;
  file_type: string;
  file_size: number;
  thumbnail_path?: string;
}

export default class Image {
  /**
   * Exception code for a valid image whose format this runtime cannot
   * process. 415 is the HTTP status code for "Unsupported Media Type".
   */
  static readonly UNSUPPORTED_FORMAT = 415;

  /** The encoded bytes of the currently loaded image. */
  private image: Buffer | null = null;

  /** Numeric image type identifier. */
  private image_type: number | null = null;

  /** The loaded image's format. */
  private image_format: ImageFormat | null = null;

  /** Current pixel dimensions (updated by every transform). */
  private width = 0;
  private height = 0;

  /** File path of the loaded image. */
  private file_name: string | null = null;

  /** Associative array mapping image types to their MIME types. */
  private content_type: Record<number, string> = {
    [IMAGETYPE_JPEG]: "image/jpeg",
    [IMAGETYPE_GIF]: "image/gif",
    [IMAGETYPE_PNG]: "image/png",
    [IMAGETYPE_WEBP]: "image/webp",
  };

  /**
   * Constructor for standalone image utility.
   *
   * @param filename Path to an image file to load.
   */
  constructor(filename?: string | null) {
    // Protect this module from direct browser access.
    block_url("image");

    if (filename) {
      this.file_name = filename;
      this.load(filename);
    }
  }

  // -------------------------------------------------------------------------
  // Upload
  // -------------------------------------------------------------------------
  async upload(data: ImageUploadConfig = {}): Promise<ImageUploadInfo> {
    const destination = String(data.destination ?? "");
    const max_width = Number(data.max_width ?? 450);
    const max_height = Number(data.max_height ?? 450);
    const thumbnail_dir = String(data.thumbnail_dir ?? "");
    const thumbnail_max_width = Number(data.thumbnail_max_width ?? 0);
    const thumbnail_max_height = Number(data.thumbnail_max_height ?? 0);
    const upload_to_module = data.upload_to_module === true;
    const make_rand_name = data.make_rand_name === true;
    const target_module = String(data.target_module ?? segment(1) ?? "");

    // VALIDATION: follow the File module's approach (first uploaded file).
    const files = await uploaded_files();
    const uploaded_file = Object.values(files)[0];

    if (uploaded_file === undefined) {
      throw new Error("No file was uploaded");
    }

    const bytes = uploaded_file.bytes ?? Buffer.alloc(0);

    if (bytes.length === 0) {
      throw new Error(this.get_upload_error_message(4));
    }

    // Validate it is an image (content-based sniff, like finfo_file()).
    const format = detectSupportedFormat(bytes);
    if (format === null) {
      throw new Error("Invalid file type. Only image files are allowed.");
    }

    const mime_type = mimeForFormat(format);
    if (!ALLOWED_MIME_TYPES.includes(mime_type)) {
      throw new Error("Invalid file type. Only image files are allowed.");
    }

    const destination_dir = resolveUploadDirectory(
      destination,
      upload_to_module,
      target_module
    );
    ensureDirectory(destination_dir);

    // The stored extension is decided by the MIME type sniffed from the
    // file's CONTENT — never by the client's file name.
    const extension = this.extension_for_mime_type(mime_type);

    if (extension === "") {
      throw new Error("Invalid file type. Only image files are allowed.");
    }

    let file_path: string;

    if (make_rand_name === true) {
      file_path = this.ensure_unique_path(
        destination_dir,
        this.random_base_name(),
        "." + extension
      );
    } else {
      // Use sanitize_filename() for robust cleaning.
      const sanitized = sanitize_filename(uploaded_file.originalName);
      const file_info_parts = returnFileInfo(sanitized);
      file_path = this.ensure_unique_path(
        destination_dir,
        file_info_parts.file_name,
        "." + extension
      );
    }

    const file_name = path.basename(file_path);

    try {
      fs.writeFileSync(file_path, bytes);
    } catch {
      throw new Error("Failed to move uploaded file to destination.");
    }

    const file_info: ImageUploadInfo = {
      file_name: file_name,
      file_path: file_path,
      file_type: mime_type,
      file_size: uploaded_file.size || bytes.length,
    };

    // Load the uploaded image for further processing.
    this.load(file_path);

    // Resize the image if necessary.
    let reencode = false;

    if (
      (max_width > 0 && this.width > max_width) ||
      (max_height > 0 && this.height > max_height)
    ) {
      const resize_factor_w = max_width > 0 ? this.width / max_width : 0;
      const resize_factor_h = max_height > 0 ? this.height / max_height : 0;

      if (resize_factor_w > resize_factor_h) {
        await this.resize_to_width(max_width);
      } else {
        await this.resize_to_height(max_height);
      }

      reencode = true;
    }

    // A file that is not resized above is published exactly as the client
    // sent it — unless its first 4 KB contain a short open tag byte pair,
    // in which case it is re-encoded so no such bytes survive (see the
    // original's carries_short_open_tag_bytes()).
    if (!reencode && this.carries_short_open_tag_bytes(file_path)) {
      reencode = true;
    }

    if (reencode) {
      await this.save(file_path);
    }

    // Generate a thumbnail if requested.
    if (
      thumbnail_max_width > 0 &&
      thumbnail_max_height > 0 &&
      thumbnail_dir !== ""
    ) {
      const thumbnail_base_dir = resolveUploadDirectory(
        thumbnail_dir,
        upload_to_module,
        target_module
      );
      ensureDirectory(thumbnail_base_dir);

      // Extract filename parts for the thumbnail.
      const thumbnail_file_info = returnFileInfo(file_name);
      let thumbnail_base_name = thumbnail_file_info.file_name;
      const thumbnail_extension = thumbnail_file_info.file_extension;

      // If the thumbnail is in the same directory as the main image, use a
      // different base name.
      if (thumbnail_base_dir === destination_dir) {
        thumbnail_base_name = "thumb_" + thumbnail_base_name;
      }

      const thumbnail_path = this.ensure_unique_path(
        thumbnail_base_dir,
        thumbnail_base_name,
        thumbnail_extension
      );

      await this.saveResizedCopy(
        thumbnail_path,
        thumbnail_max_width,
        thumbnail_max_height
      );
      file_info.thumbnail_path = thumbnail_path;
    }

    return file_info;
  }

  // -------------------------------------------------------------------------
  // Load / validate
  // -------------------------------------------------------------------------
  load(filename: string): void {
    const bytes = this.validate_image(filename);

    const format = detectSupportedFormat(bytes) as ImageFormat;
    const dimensions = readDimensions(bytes, format);
    if (dimensions === null) {
      throw new Error("Failed to get image information");
    }

    this.image = bytes;
    this.image_format = format;
    this.image_type = FORMAT_TO_TYPE[format];
    this.width = dimensions.width;
    this.height = dimensions.height;
  }
  private validate_image(filename: string): Buffer {
    if (!fs.existsSync(filename)) {
      throw new Error(`File not found: ${filename}`);
    }

    let bytes: Buffer;
    try {
      bytes = fs.readFileSync(filename);
    } catch {
      throw new Error("Failed to get image information");
    }

    // Enhanced MIME validation: the format is sniffed from the CONTENT.
    const format = detectSupportedFormat(bytes);

    if (format === null) {
      const unsupported_mime = guessUnsupportedImageMime(bytes);

      if (unsupported_mime !== null && unsupported_mime.startsWith("image/")) {
        // A valid image, in a format that Eterc does not accept.
        throw withCode(
          `Unsupported image type: ${unsupported_mime}`,
          Image.UNSUPPORTED_FORMAT
        );
      }

      throw new Error("Invalid image type");
    }

    const dimensions = readDimensions(bytes, format);
    if (dimensions === null) {
      throw new Error("Failed to get image information");
    }

    // Verify the file signature matches the sniffed format.
    if (!isSignatureValid(bytes, format)) {
      throw new Error("Invalid file signature");
    }

    // Reject executable markup in the image header. Short open tags are not
    // scanned because those bytes occur by chance in compressed image data;
    // such files are re-encoded before publishing instead (see upload()).
    const opening_bytes = bytes.subarray(0, 256).toString("latin1");
    if (/<(script|iframe|object|embed|applet)[\s>]/i.test(opening_bytes)) {
      throw new Error("Potential security threat detected in image");
    }

    const required_memory = dimensions.width * dimensions.height * 4 * 1.5;
    if (process.memoryUsage().heapUsed + required_memory > this.get_memory_limit()) {
      throw new Error("Image too large to process");
    }

    return bytes;
  }

  // -------------------------------------------------------------------------
  // Save / output
  // -------------------------------------------------------------------------
  async save(
    filename?: string | null,
    compression = 100,
    permissions?: number | null
  ): Promise<void> {
    const target = filename ? filename : this.file_name;

    const format = this.image_format;
    if (this.image === null || format === null) {
      throw new Error("Unsupported image type or required properties not set.");
    }

    if (!target) {
      throw new Error("No file name was specified for saving the image.");
    }

    const sharp = await this.loadSharp();
    const buffer = await this.encode(
      sharp(this.image, { animated: false }),
      format,
      compression
    );

    try {
      fs.writeFileSync(target, buffer);
    } catch {
      throw new Error(`Failed to write the image to: ${target}`);
    }

    if (permissions !== null && permissions !== undefined) {
      try {
        fs.chmodSync(target, permissions);
      } catch {
        throw new Error("Failed to set file permissions.");
      }
    }
  }
  async output(return_data = false): Promise<Buffer> {
    void return_data;

    const format = this.image_format;
    if (this.image === null || format === null) {
      throw new Error("No image is loaded.");
    }

    const sharp = await this.loadSharp();
    return this.encode(sharp(this.image, { animated: false }), format, 100);
  }

  // -------------------------------------------------------------------------
  // Metadata
  // -------------------------------------------------------------------------

  /** The width of the currently loaded image, in pixels. */
  get_width(): number {
    if (this.image === null) {
      throw new Error("No image is loaded.");
    }
    return this.width;
  }

  /** The height of the currently loaded image, in pixels. */
  get_height(): number {
    if (this.image === null) {
      throw new Error("No image is loaded.");
    }
    return this.height;
  }
  get_header(): string {
    if (this.image_type === null) {
      throw new Error("No image has been loaded, or image type is unset.");
    }
    return this.content_type[this.image_type];
  }
  protected get_image_type(): number | null {
    return this.image_type;
  }

  /**
   * Frees the memory held by the loaded image. The object can be re-loaded
   * with load() afterwards.
   */
  destroy(): void {
    if (this.image !== null) {
      this.image = null;
    }
  }

  // -------------------------------------------------------------------------
  // Transformations
  // -------------------------------------------------------------------------

  /**
   * Resize the image to a specified height, maintaining the aspect ratio.
   */
  async resize_to_height(height: number): Promise<void> {
    if (this.image === null) {
      throw new Error("No image is loaded to resize.");
    }
    if (height <= 0) {
      throw new Error("Height must be greater than zero.");
    }

    const current_height = this.height;
    if (current_height === 0) {
      throw new Error("Loaded image has zero height, cannot resize.");
    }

    const ratio = height / current_height;
    const width = this.width * ratio;
    await this.resize(width, height);
  }

  /**
   * Resize the image to a specified width, maintaining the aspect ratio.
   */
  async resize_to_width(width: number): Promise<void> {
    if (this.image === null) {
      throw new Error("No image is loaded to resize.");
    }
    if (width <= 0) {
      throw new Error("Width must be greater than zero.");
    }

    const current_width = this.width;
    if (current_width === 0) {
      throw new Error("Loaded image has zero width, cannot resize.");
    }

    const ratio = width / current_width;
    const height = this.height * ratio;
    await this.resize(width, height);
  }

  /**
   * Scale the image by a given percentage (100 keeps the original size).
   */
  async scale(scale: number): Promise<void> {
    if (this.image === null) {
      throw new Error("No image is loaded to scale.");
    }
    if (scale <= 0) {
      throw new Error("Scale must be a positive number.");
    }

    const width = (this.width * scale) / 100;
    const height = (this.height * scale) / 100;
    await this.resize(width, height);
  }

  /**
   * Resize and crop the image to the exact target dimensions, keeping the
   * aspect ratio and cropping the excess (center-cropped).
   */
  async resize_and_crop(width: number, height: number): Promise<void> {
    if (this.image === null) {
      throw new Error("No image is loaded to resize and crop.");
    }
    if (width <= 0 || height <= 0) {
      throw new Error("Width and height must be positive integers.");
    }

    const target_ratio = width / height;
    const actual_ratio = this.width / this.height;

    if (target_ratio === actual_ratio) {
      await this.resize(width, height);
    } else if (target_ratio > actual_ratio) {
      await this.resize_to_width(width);
      await this.crop(width, height);
    } else {
      await this.resize_to_height(height);
      await this.crop(width, height);
    }
  }
  protected async resize(width: number, height: number): Promise<void> {
    if (this.image === null) {
      throw new Error("No image is loaded to resize.");
    }
    if (width <= 0 || height <= 0) {
      throw new Error("Width and height must be positive integers.");
    }

    const target_width = Math.max(1, Math.round(width));
    const target_height = Math.max(1, Math.round(height));

    const sharp = await this.loadSharp();
    const buffer = await sharp(this.image, { animated: false })
      .resize(target_width, target_height, { fit: "fill" })
      .toBuffer();

    this.image = buffer;
    this.width = target_width;
    this.height = target_height;
  }
  async crop(width: number, height: number, trim = "center"): Promise<void> {
    if (this.image === null) {
      throw new Error("No image is loaded to crop.");
    }
    if (width <= 0 || height <= 0) {
      throw new Error("Width and height must be positive integers.");
    }

    let offset_x = 0;
    let offset_y = 0;

    if (trim !== "left") {
      if (this.width > width) {
        const diff = this.width - width;
        offset_x = trim === "center" ? Math.floor(diff / 2) : diff;
      }
      if (this.height > height) {
        const diff = this.height - height;
        offset_y = trim === "center" ? Math.floor(diff / 2) : diff;
      }
    }

    const extract_width = Math.min(width, this.width - offset_x);
    const extract_height = Math.min(height, this.height - offset_y);

    const sharp = await this.loadSharp();
    let pipeline = sharp(this.image, { animated: false }).extract({
      left: offset_x,
      top: offset_y,
      width: extract_width,
      height: extract_height,
    });

    if (extract_width !== width || extract_height !== height) {
      pipeline = pipeline.extend({
        right: width - extract_width,
        bottom: height - extract_height,
        background: { r: 0, g: 0, b: 0, alpha: 1 },
      });
    }

    this.image = await pipeline.toBuffer();
    this.width = width;
    this.height = height;
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /** Map a numeric upload error code to its message. */
  private get_upload_error_message(error_code: number): string {
    return UPLOAD_ERRORS[error_code] ?? "Unknown upload error";
  }

  /** The canonical extension for a sniffed image MIME type. */
  private extension_for_mime_type(mime_type: string): string {
    return MIME_EXTENSIONS[mime_type.toLowerCase().trim()] ?? "";
  }

  /**
   * Check whether a file's first 4 KB contain a short open tag ('<?').
   * A storage decision (re-encode before publishing), never a verdict.
   */
  private carries_short_open_tag_bytes(file_path: string): boolean {
    let handle: number;
    try {
      handle = fs.openSync(file_path, "r");
    } catch {
      return false;
    }

    try {
      const buffer = Buffer.alloc(4096);
      const read = fs.readSync(handle, buffer, 0, 4096, 0);
      return buffer.subarray(0, read).includes("<?");
    } catch {
      return false;
    } finally {
      fs.closeSync(handle);
    }
  }

  /** A cryptographically random base name for a stored upload. */
  private random_base_name(): string {
    return "img_" + crypto.randomBytes(16).toString("hex");
  }

  /** Generate a unique path, appending '_2', '_3', ... when needed. */
  private ensure_unique_path(
    directory: string,
    base_name: string,
    extension: string
  ): string {
    let final_path = `${directory}/${base_name}${extension}`;

    if (!fs.existsSync(final_path)) {
      return final_path;
    }

    let counter = 2;
    do {
      final_path = `${directory}/${base_name}_${counter}${extension}`;
      counter++;
    } while (fs.existsSync(final_path));

    return final_path;
  }
  private async saveResizedCopy(
    new_file_path: string,
    max_width: number,
    max_height: number,
    compression = 100
  ): Promise<void> {
    if (
      (max_width > 0 && this.width > max_width) ||
      (max_height > 0 && this.height > max_height)
    ) {
      const resize_factor_w = max_width > 0 ? this.width / max_width : 0;
      const resize_factor_h = max_height > 0 ? this.height / max_height : 0;

      if (resize_factor_w > resize_factor_h) {
        await this.resize_to_width(max_width);
      } else {
        await this.resize_to_height(max_height);
      }
    }

    await this.save(new_file_path, compression, 0o755);
  }
  private get_memory_limit(): number {
    return v8.getHeapStatistics().heap_size_limit;
  }
  private async encode(
    pipeline: import("sharp").Sharp,
    format: ImageFormat,
    compression: number
  ): Promise<Buffer> {
    const quality = clampCompression(compression);

    switch (format) {
      case "jpeg":
        return pipeline.jpeg({ quality }).toBuffer();
      case "webp":
        return pipeline.webp({ quality }).toBuffer();
      case "png":
        return pipeline.png().toBuffer();
      case "gif":
        return pipeline.gif().toBuffer();
      default:
        throw new Error("Unsupported image type or required properties not set.");
    }
  }

  /** Load the sharp module (its native runtime is loaded lazily). */
  private async loadSharp(): Promise<typeof import("sharp").default> {
    const module = await import("sharp");
    return module.default;
  }
}

// ---------------------------------------------------------------------------
// Module-level helpers
// ---------------------------------------------------------------------------

function mimeForFormat(format: ImageFormat): string {
  return format === "jpeg" ? "image/jpeg" : `image/${format}`;
}

/** Attach a numeric error code to an Error. */
function withCode(message: string, code: number): Error {
  const error = new Error(message) as Error & { code?: number };
  error.code = code;
  return error;
}

function clampCompression(compression: number): number {
  if (!Number.isFinite(compression)) return 100;
  return Math.max(0, Math.min(100, Math.round(compression)));
}

/** Build file name and extension metadata from a path. */
function returnFileInfo(file_string: string): {
  file_name: string;
  file_extension: string;
} {
  const last_slash = Math.max(
    file_string.lastIndexOf("/"),
    file_string.lastIndexOf("\\")
  );
  const base = file_string.slice(last_slash + 1);
  const last_dot = base.lastIndexOf(".");
  const file_extension = last_dot === -1 ? "" : base.slice(last_dot + 1);
  const file_name = file_string.split("." + file_extension).join("");
  return { file_name, file_extension: "." + file_extension };
}
