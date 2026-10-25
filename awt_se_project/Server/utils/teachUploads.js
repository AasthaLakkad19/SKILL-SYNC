const fs = require("fs");
const path = require("path");

// Where uploaded lesson videos live. Served publicly at /uploads/teach-videos/<file>
// (file names are random, so links are only known to people who can open the session).
const UPLOAD_ROOT = process.env.TEACH_UPLOAD_DIR || path.join(__dirname, "..", "uploads");
const VIDEO_DIR = path.join(UPLOAD_ROOT, "teach-videos");
const VIDEO_URL_PREFIX = "/uploads/teach-videos/";

const MAX_VIDEO_MB = Number(process.env.TEACH_MAX_VIDEO_MB) || 200;

// <24 hex user id>-<32 hex random>.<ext>  (the user id prefix = who owns the file)
const FILE_RE = /^([a-f0-9]{24})-([a-f0-9]{32})\.(mp4|webm|mov)$/;
const MIME = { mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime" };

function ensureVideoDir() {
    fs.mkdirSync(VIDEO_DIR, { recursive: true });
}

// Decide the real type from the first bytes instead of trusting the browser.
// MP4/MOV start with "....ftyp", WebM starts with the EBML header 1A 45 DF A3.
function detectVideoExt(buf) {
    if (buf.length >= 12 && buf.toString("latin1", 4, 8) === "ftyp") {
        return buf.toString("latin1", 8, 12) === "qt  " ? "mov" : "mp4";
    }
    if (buf.length >= 4 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
        return "webm";
    }
    return null;
}

function fileNameFromUrl(url) {
    if (typeof url !== "string" || !url.startsWith(VIDEO_URL_PREFIX)) return null;
    const name = url.slice(VIDEO_URL_PREFIX.length);
    return FILE_RE.test(name) ? name : null;
}

// A video url is only accepted if it is one of THIS user's uploads and still exists.
function resolveOwnedVideo(url, userId) {
    const name = fileNameFromUrl(url);
    if (!name || !name.startsWith(String(userId) + "-")) return null;
    try {
        const stat = fs.statSync(path.join(VIDEO_DIR, name));
        if (!stat.isFile()) return null;
        return { url, size: stat.size, mimeType: MIME[name.split(".").pop()] };
    } catch (e) {
        return null;
    }
}

function removeVideoByUrl(url) {
    const name = fileNameFromUrl(url);
    if (name) fs.unlink(path.join(VIDEO_DIR, name), () => {});
}

// Shown to the teacher; strip any path and odd characters from the original name.
function safeOriginalName(name) {
    return String(name || "")
        .split(/[\\/]/).pop()
        .replace(/[^\w.\- ()]/g, "")
        .slice(0, 100);
}

module.exports = {
    UPLOAD_ROOT, VIDEO_DIR, VIDEO_URL_PREFIX, MAX_VIDEO_MB, MIME,
    ensureVideoDir, detectVideoExt, fileNameFromUrl, resolveOwnedVideo,
    removeVideoByUrl, safeOriginalName
};
