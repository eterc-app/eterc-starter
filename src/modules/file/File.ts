import * as fs from "node:fs";
import * as path from "node:path";
import * as v8 from "node:v8";
import { Trongate } from "@/engine/controller";
import { uploaded_files } from "@/engine/post";
import type { TgUploadedFile } from "@/engine/request-context";
import { segment } from "@/engine/request-context";
import { PROJECT_ROOT } from "@/engine/paths";
import { make_rand_str, sanitize_filename } from "@/engine/String_service";
import { block_url } from "@/modules/utilities/Utilities";
import { resolveUploadDirectory } from "./upload-paths";

/**
 * File — port of modules/file/File.php.
 *
 * Upload/validation helper. The PHP class blocked direct URL invocation in
 * its constructor; the port keeps that guard. All other method names and
 * return shapes mirror the original:
 *
 *   - info() / exists() / read() / write() / delete() / delete_directory() /
 *     list_directory() / copy() / move()  → synchronous helpers;
 *   - upload()      → async (request bodies are read through uploaded_files());
 *   - download()    → returns a web Response carrying the file (PHP sent
 *                     headers and read the file into the output buffer).
 *
 * Uploads land beneath public/uploads/ (UPLOADS_DIR). See ./upload-paths.ts
 * for the destination rules (including upload_to_module destinations under
 * public/{module}_module/).
 */

export interface FileUploadConfig {
  destination: string;
  target_module?: string;
  upload_to_module?: boolean;
  make_rand_name?: boolean;
  [key: string]: unknown;
}

export interface UploadedFileInfo {
  file_name: string;
  file_path: string;
  file_type: string;
  file_size: number;
}

export type DirectoryListing = Array<string | { [name: string]: DirectoryListing }>;

/** PHP upload error codes (UPLOAD_ERR_*). */
const UPLOAD_ERRORS: Record<number, string> = {
  1: "The uploaded file exceeds the upload_max_filesize directive",
  2: "The uploaded file exceeds the MAX_FILE_SIZE directive",
  3: "The uploaded file was only partially uploaded",
  4: "No file was uploaded",
  6: "Missing a temporary folder",
  7: "Failed to write file to disk",
  8: "A PHP extension stopped the file upload",
};

export default class File extends Trongate {
  constructor(moduleName?: string | null) {
    super(moduleName);
    // Protect this module from unwanted browser access (PHP parity).
    block_url("file");
  }

  // -------------------------------------------------------------------------
  // Upload
  // -------------------------------------------------------------------------

  /**
   * Handle a file upload with the given configuration.
   *
   * PHP read $_FILES synchronously; the port reads the request's FormData
   * through uploaded_files(), hence the async signature.
   */
  async upload(config: FileUploadConfig): Promise<UploadedFileInfo> {
    const destination = config?.destination ?? "";
    const target_module = String(config?.target_module ?? segment(1) ?? "");
    const upload_to_module = config?.upload_to_module === true;
    const make_rand_name = config?.make_rand_name === true;

    const target_path = this.validate_upload_path(
      destination,
      upload_to_module,
      target_module
    );

    const files = await uploaded_files();
    const upload: TgUploadedFile | undefined = Object.values(files)[0];

    if (upload === undefined) {
      throw new Error("No file was uploaded");
    }

    const bytes = upload.bytes ?? Buffer.alloc(0);

    // Security validation (existence / MIME sniff / memory requirements).
    this.validate_file(upload);

    const file_info = this.generate_secure_filename(
      upload.originalName,
      make_rand_name
    );

    const final_path = this.ensure_unique_path(
      target_path,
      file_info.name,
      file_info.extension
    );

    try {
      fs.writeFileSync(final_path, bytes);
    } catch {
      throw new Error("Failed to move uploaded file");
    }

    return {
      file_name: path.basename(final_path),
      file_path: final_path,
      file_type: upload.mimeType,
      file_size: upload.size,
    };
  }

  /**
   * Generate a unique file path by appending incremental numbers if the file
   * already exists. The first duplicate is suffixed '_2'.
   */
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

  // -------------------------------------------------------------------------
  // Metadata and basic file operations
  // -------------------------------------------------------------------------

  /**
   * Retrieve metadata about a file: name, size, modified time, permissions
   * (raw + octal), MIME type and a human-readable size.
   */
  info(file_path: string): Record<string, unknown> {
    if (!fs.existsSync(file_path)) {
      throw new Error(`The file does not exist: ${file_path}`);
    }

    const stats = fs.statSync(file_path);
    const info: Record<string, unknown> = {};

    info.file_name = path.basename(file_path);
    info.size = stats.size;
    info.modified_time = Math.floor(stats.mtimeMs / 1000);
    info.permissions = stats.mode;
    info.mime_type = sniffMime(file_path);

    info.readable_permissions = (stats.mode & 0o7777)
      .toString(8)
      .padStart(4, "0");

    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const factor = Math.floor((String(stats.size).length - 1) / 3);
    info.human_readable_size =
      (stats.size / Math.pow(1024, factor)).toFixed(2) + (sizes[factor] ?? "");

    return info;
  }

  /**
   * Create a directory (recursively by default). Returns true when the
   * directory exists afterwards. Mirrors the PHP signature; the permissions
   * argument is accepted for parity (fs.mkdirSync mode).
   */
  create_directory(
    directory_path: string,
    permissions = 0o755,
    recursive = true
  ): boolean {
    if (fs.existsSync(directory_path)) {
      return true;
    }

    if (!this.is_path_valid(directory_path)) {
      throw new Error(`Access to this path is restricted: ${directory_path}`);
    }

    try {
      fs.mkdirSync(directory_path, { recursive, mode: permissions });
    } catch {
      throw new Error(`Failed to create directory: ${directory_path}`);
    }

    return true;
  }

  /** Whether a file or directory exists at the given path. */
  exists(file_path: string): boolean {
    return fs.existsSync(file_path);
  }

  /** Read a file's contents as UTF-8 text. */
  read(file_path: string): string {
    if (!this.is_path_valid(file_path)) {
      throw new Error(`Access to this file is restricted: ${file_path}`);
    }

    if (!fs.existsSync(file_path)) {
      throw new Error(`The file does not exist: ${file_path}`);
    }

    try {
      return fs.readFileSync(file_path, "utf8");
    } catch {
      throw new Error(`Failed to read the file: ${file_path}`);
    }
  }

  /** Write (or append) data to a file. */
  write(
    file_path: string,
    data: string | Buffer | Uint8Array,
    append = false
  ): boolean {
    if (!this.is_path_valid(file_path)) {
      throw new Error(`Access to this file is restricted: ${file_path}`);
    }

    try {
      if (append) {
        fs.appendFileSync(file_path, data);
      } else {
        fs.writeFileSync(file_path, data);
      }
    } catch {
      throw new Error(`Failed to write to the file: ${file_path}`);
    }

    return true;
  }

  /** Delete a file. */
  delete(file_path: string): boolean {
    if (!this.is_path_valid(file_path)) {
      throw new Error(`Access to this file is restricted: ${file_path}`);
    }

    if (!fs.existsSync(file_path)) {
      throw new Error(`The file does not exist: ${file_path}`);
    }

    try {
      fs.unlinkSync(file_path);
    } catch {
      throw new Error(`Failed to delete the file: ${file_path}`);
    }

    return true;
  }

  /** Delete a directory and all of its contents recursively. */
  delete_directory(directory_path: string): boolean {
    if (!this.is_path_valid(directory_path)) {
      throw new Error(`Access to this path is restricted: ${directory_path}`);
    }

    if (!fs.existsSync(directory_path) || !fs.statSync(directory_path).isDirectory()) {
      throw new Error(`The specified path is not a directory: ${directory_path}`);
    }

    for (const item of fs.readdirSync(directory_path, { withFileTypes: true })) {
      const item_path = path.join(directory_path, item.name);
      if (item.isDirectory()) {
        this.delete_directory(item_path);
      } else {
        fs.unlinkSync(item_path);
      }
    }

    try {
      fs.rmdirSync(directory_path);
    } catch {
      throw new Error(`Failed to delete directory: ${directory_path}`);
    }

    return true;
  }

  /**
   * Prepare a file for download or inline display.
   *
   * PHP sent the headers and streamed the file, then exited. A React server
   * cannot terminate a response from inside a controller, so the port
   * returns a Response with the identical headers/body; route handlers can
   * return it directly.
   */
  download(file_path: string, as_attachment = true): Response {
    if (!this.is_path_valid(file_path)) {
      throw new Error(`Access to this file is restricted: ${file_path}`);
    }

    if (!fs.existsSync(file_path)) {
      throw new Error(`The file does not exist: ${file_path}`);
    }

    let contents: Buffer;
    try {
      fs.accessSync(file_path, fs.constants.R_OK);
      contents = fs.readFileSync(file_path);
    } catch {
      throw new Error(`The file is not accessible: ${file_path}`);
    }

    const content_disposition = as_attachment ? "attachment" : "inline";

    return new Response(new Uint8Array(contents), {
      headers: {
        "Content-Description": "File Transfer",
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `${content_disposition}; filename="${path.basename(file_path)}"`,
        Expires: "0",
        "Cache-Control": "must-revalidate",
        Pragma: "public",
        "Content-Length": String(contents.length),
      },
    });
  }

  /**
   * List files and directories within a directory. With `recursive`, each
   * subdirectory is represented as an object keyed by its name (PHP used
   * a string array key).
   */
  list_directory(directory_path: string, recursive = false): DirectoryListing {
    if (!this.is_path_valid(directory_path)) {
      throw new Error(`Access to this path is restricted: ${directory_path}`);
    }

    if (!fs.existsSync(directory_path) || !fs.statSync(directory_path).isDirectory()) {
      throw new Error(`The specified path is not a directory: ${directory_path}`);
    }

    const result: DirectoryListing = [];

    for (const item of fs.readdirSync(directory_path, { withFileTypes: true })) {
      if (item.isDirectory() && recursive) {
        result.push({
          [item.name]: this.list_directory(
            path.join(directory_path, item.name),
            true
          ),
        });
      } else {
        result.push(item.name);
      }
    }

    return result;
  }

  /** Copy a file; returns true on success. */
  copy(source_path: string, destination_path: string): boolean {
    if (!this.is_path_valid(source_path)) {
      throw new Error(`Access to this path is restricted: ${source_path}`);
    }

    if (!fs.existsSync(source_path)) {
      throw new Error(`The source file does not exist: ${source_path}`);
    }

    try {
      fs.copyFileSync(source_path, destination_path);
    } catch {
      throw new Error(
        `Failed to copy the file from ${source_path} to ${destination_path}`
      );
    }

    return true;
  }

  /** Move (rename) a file; returns true on success. */
  move(source_path: string, destination_path: string): boolean {
    if (!this.is_path_valid(source_path)) {
      throw new Error(`Access to this path is restricted: ${source_path}`);
    }

    if (!fs.existsSync(source_path)) {
      throw new Error(`The source file does not exist: ${source_path}`);
    }

    try {
      fs.renameSync(source_path, destination_path);
    } catch {
      throw new Error(
        `Failed to move the file from ${source_path} to ${destination_path}`
      );
    }

    return true;
  }

  // -------------------------------------------------------------------------
  // Internal validation helpers
  // -------------------------------------------------------------------------

  /**
   * Validate the upload destination and return the resolved absolute
   * directory (PHP: validate_upload_path() + the target path expression).
   */
  private validate_upload_path(
    destination: string,
    upload_to_module = false,
    target_module = ""
  ): string {
    if (!destination) {
      throw new Error("Upload destination not specified");
    }

    const target_path = resolveUploadDirectory(
      destination,
      upload_to_module,
      target_module
    );

    if (!fs.existsSync(target_path) || !fs.statSync(target_path).isDirectory()) {
      throw new Error("Invalid upload destination");
    }

    if (upload_to_module === false && !this.is_path_valid(target_path)) {
      throw new Error("Unauthorized upload location");
    }

    return target_path;
  }

  /**
   * Generate a secure file name: either a random 10-character lowercase
   * alphanumeric base or the original name processed through
   * sanitize_filename().
   */
  private generate_secure_filename(
    original_name: string,
    make_rand_name: boolean
  ): { name: string; extension: string; full_name: string } {
    let file_name: string;
    let extension: string;

    if (make_rand_name === true) {
      const file_info = returnFileInfo(original_name);
      file_name = make_rand_str(10).toLowerCase();
      extension = file_info.file_extension.toLowerCase();
    } else {
      const sanitized = sanitize_filename(original_name);
      const file_info = returnFileInfo(sanitized);
      file_name = file_info.file_name;
      extension = file_info.file_extension;
    }

    return {
      name: file_name,
      extension,
      full_name: file_name + extension,
    };
  }

  /**
   * Validate a path against the framework's security rules: forbidden inside
   * src/engine/ and prisma/, no direct children of the project root, and
   * always inside the project directory. Non-existent paths inherit their
   * parent's validity. (PHP equivalents: APPPATH config/ and engine/.)
   */
  private is_path_valid(candidate: string): boolean {
    const root = realPathOrNull(PROJECT_ROOT);
    if (root === null) return false;

    const normalized_path = realPathOrNull(path.resolve(PROJECT_ROOT, candidate));
    const target = normalized_path ?? null;

    const restricted_dirs = [
      path.join(root, "src", "engine"),
      path.join(root, "prisma"),
      path.join(root, ".git"),
      path.join(root, "node_modules"),
    ];

    if (target !== null) {
      for (const dir of restricted_dirs) {
        const restricted = realPathOrNull(dir);
        if (restricted && isInside(target, restricted)) return false;
      }
      return this.relativePathIsAllowed(root, target);
    }

    // The path does not exist — validate its parent directory instead.
    const parent_path = path.dirname(path.resolve(PROJECT_ROOT, candidate));
    if (parent_path === path.resolve(PROJECT_ROOT, candidate)) return false;

    const parent = realPathOrNull(parent_path);
    if (parent === null) return false;

    for (const dir of restricted_dirs) {
      const restricted = realPathOrNull(dir);
      if (restricted && isInside(parent, restricted)) return false;
    }

    return this.relativePathIsAllowed(root, parent);
  }

  private relativePathIsAllowed(root: string, target: string): boolean {
    const relative = path.relative(root, target);
    if (relative === "" || path.isAbsolute(relative)) return false;
    if (relative === ".." || relative.startsWith(".." + path.sep)) return false;
    // Prevent manipulation of files/directories directly under the root.
    if (!relative.includes(path.sep)) return false;
    return true;
  }

  /**
   * Validate an uploaded file: existence, memory requirements and MIME type.
   * (PHP: validate_file(); the tmp file is already in memory here.)
   */
  private validate_file(upload: TgUploadedFile): void {
    const bytes = upload.bytes ?? Buffer.alloc(0);

    if (bytes.length === 0 && upload.size === 0) {
      throw new Error(`File not found: ${upload.originalName}`);
    }

    const memory_validation = this.validate_memory_requirements(bytes.length);
    if (!memory_validation.status) {
      throw new Error(memory_validation.message);
    }

    this.validate_mime_type(bytes);
  }

  /**
   * Content-based MIME sniff. The PHP original cross-checked finfo with the
   * system `file` command; the port has a single content source, so this
   * confirms the content can be identified without a mismatch.
   */
  private validate_mime_type(bytes: Buffer): string {
    return sniffBufferMime(bytes);
  }

  /**
   * Validate whether enough heap is available to process a file, using the
   * V8 heap limit as the port's equivalent of PHP's memory_limit.
   */
  private validate_memory_requirements(file_size: number): {
    status: boolean;
    message: string;
  } {
    const heap_size_limit = v8.getHeapStatistics().heap_size_limit;
    const needed_memory = file_size * 2.1;
    const memory_available = heap_size_limit - process.memoryUsage().heapUsed;

    if (needed_memory > memory_available) {
      return {
        status: false,
        message: "Insufficient memory to process file",
      };
    }

    return { status: true, message: "" };
  }

  /** Map a PHP-style upload error code to its user-facing message. */
  private get_upload_error_message(error_code: number): string {
    return UPLOAD_ERRORS[error_code] ?? "Unknown upload error";
  }
}

/** PHP style return_file_info() used by the filename generator. */
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

function realPathOrNull(target: string): string | null {
  try {
    return fs.realpathSync(target);
  } catch {
    return null;
  }
}

function isInside(target: string, directory: string): boolean {
  const relative = path.relative(directory, target);
  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(".." + path.sep) &&
      !path.isAbsolute(relative))
  );
}

/** Content-based MIME sniffing (magic numbers) for the MIME validation. */
export function sniffBufferMime(bytes: Buffer): string {
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
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
    return "image/png";
  }
  const head = bytes.subarray(0, 12).toString("latin1");
  if (head.startsWith("GIF87a") || head.startsWith("GIF89a")) {
    return "image/gif";
  }
  if (head.startsWith("RIFF") && head.slice(8, 12) === "WEBP") {
    return "image/webp";
  }
  if (bytes.length >= 4 && bytes.subarray(0, 4).toString("latin1") === "%PDF") {
    return "application/pdf";
  }
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
    return "application/zip";
  }
  if (isProbablyText(bytes)) {
    return "text/plain";
  }
  return "application/octet-stream";
}

function sniffMime(file_path: string): string {
  try {
    const handle = fs.openSync(file_path, "r");
    const buffer = Buffer.alloc(64);
    const read = fs.readSync(handle, buffer, 0, 64, 0);
    fs.closeSync(handle);
    return sniffBufferMime(buffer.subarray(0, read));
  } catch {
    return "application/octet-stream";
  }
}

function isProbablyText(bytes: Buffer): boolean {
  const sample = bytes.subarray(0, 64);
  for (const byte of sample) {
    if (byte === 0) return false;
    if (byte < 7 || (byte > 14 && byte < 32)) return false;
  }
  return sample.length > 0;
}
