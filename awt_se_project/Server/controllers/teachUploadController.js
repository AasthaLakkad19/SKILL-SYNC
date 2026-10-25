const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const {
    VIDEO_DIR, VIDEO_URL_PREFIX, MAX_VIDEO_MB, MIME,
    ensureVideoDir, detectVideoExt, safeOriginalName
} = require("../utils/teachUploads");

// POST /api/teach/upload?name=lesson.mp4
// Body = the raw video file (Content-Type: video/*). Streamed straight to disk,
// so no extra package (multer) is needed and big files don't sit in memory.
exports.uploadVideo = (req, res) => {
    const maxBytes = MAX_VIDEO_MB * 1024 * 1024;
    const length = Number(req.headers["content-length"]);
    const type = String(req.headers["content-type"] || "").toLowerCase();

    if (!Number.isFinite(length) || length <= 0) {
        return res.status(411).json({ message: "No video was sent" });
    }
    if (length > maxBytes) {
        return res.status(413).json({ message: `Video is too large. The limit is ${MAX_VIDEO_MB} MB.` });
    }
    if (!type.startsWith("video/") && !type.startsWith("application/octet-stream")) {
        return res.status(415).json({ message: "Please upload a video file (MP4, WebM or MOV)" });
    }

    try {
        ensureVideoDir();
    } catch (err) {
        console.error("uploadVideo mkdir:", err);
        return res.status(500).json({ message: "Server can't store videos right now" });
    }

    const userId = String(req.user._id);
    const tmpPath = path.join(VIDEO_DIR, `${userId}-${crypto.randomBytes(16).toString("hex")}.part`);
    const out = fs.createWriteStream(tmpPath, { flags: "wx" });

    let bytes = 0;
    let head = Buffer.alloc(0);
    let finished = false;

    const fail = (status, message) => {
        if (finished) return;
        finished = true;
        req.unpipe(out);
        out.destroy();
        fs.unlink(tmpPath, () => {});
        if (!res.headersSent) {
            res.set("Connection", "close");
            res.status(status).json({ message });
        }
        // stop reading the rest of an oversized / bad upload once the reply is out
        res.once("finish", () => req.destroy());
    };

    req.on("data", (chunk) => {
        bytes += chunk.length;
        if (head.length < 16) head = Buffer.concat([head, chunk]).subarray(0, 16);
        if (bytes > maxBytes) fail(413, `Video is too large. The limit is ${MAX_VIDEO_MB} MB.`);
    });
    req.on("aborted", () => fail(400, "Upload cancelled"));
    req.on("error", () => fail(400, "Upload failed"));
    out.on("error", (err) => {
        console.error("uploadVideo write:", err);
        fail(500, "Could not save the video");
    });

    out.on("finish", () => {
        if (finished) return;

        const ext = detectVideoExt(head);
        if (!ext) return fail(415, "That file doesn't look like an MP4, WebM or MOV video");

        const fileName = `${userId}-${crypto.randomBytes(16).toString("hex")}.${ext}`;
        fs.rename(tmpPath, path.join(VIDEO_DIR, fileName), (err) => {
            if (err) {
                console.error("uploadVideo rename:", err);
                return fail(500, "Could not save the video");
            }
            finished = true;
            res.status(201).json({
                message: "Video uploaded",
                video: {
                    url: VIDEO_URL_PREFIX + fileName,
                    originalName: safeOriginalName(req.query.name) || `lesson.${ext}`,
                    size: bytes,
                    mimeType: MIME[ext]
                }
            });
        });
    });

    req.pipe(out);
};
