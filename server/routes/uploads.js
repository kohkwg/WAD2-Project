const express = require("express");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const requireAuth = require("../lib/requireAuth");

const router = express.Router();

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

// POST /api/uploads/cover  { filename, contentType }
router.post("/cover", requireAuth, async (req, res) => {
  const { filename, contentType } = req.body;
  if (!filename || !/^image\/(jpeg|png|webp)$/.test(contentType)) {
    return res.status(400).json({ error: "Only jpeg, png or webp images" });
  }
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = `covers/${req.user.id}/${Date.now()}-${safe}`;

  const uploadUrl = await getSignedUrl(
    r2,
    new PutObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key, ContentType: contentType }),
    { expiresIn: 300 }
  );
  res.json({ uploadUrl, publicUrl: `${process.env.R2_PUBLIC_URL}/${key}` });
});

module.exports = router;
