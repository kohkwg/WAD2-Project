const express = require('express');
const { randomUUID } = require('node:crypto');
const { URL } = require('node:url');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const requireAuth = require('../lib/requireAuth');
const supabaseForUser = require('../lib/userSupabase');

const router = express.Router();
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function publicBase() {
  const url = new URL(process.env.R2_PUBLIC_URL);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Invalid public URL');
  return url.href.replace(/\/+$/, '');
}

function validFile(body, requireSize = false) {
  return body && typeof body.filename === 'string' && body.filename.trim().length > 0 && body.filename.length <= 200
    && /^image\/(jpeg|png|webp)$/.test(body.contentType)
    && ((!requireSize && body.size === undefined) || (Number.isInteger(body.size) && body.size > 0 && body.size <= MAX_IMAGE_BYTES));
}

async function signImage(req, res, prefix) {
  try {
    const base = publicBase();
    if (!['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'].every(key => process.env[key])) throw new Error('Missing R2 configuration');
    const r2 = new S3Client({
      region: 'auto', endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
    });
    const safe = req.body.filename.trim().replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `${prefix}/${randomUUID()}-${safe}`;
    const uploadUrl = await getSignedUrl(r2, new PutObjectCommand({
      Bucket: process.env.R2_BUCKET, Key: key, ContentType: req.body.contentType,
      ...(req.body.size === undefined ? {} : { ContentLength: req.body.size }),
    }), { expiresIn: 300 });
    return res.json({ uploadUrl, publicUrl: `${base}/${key}`, key });
  } catch {
    return res.status(503).json({ error: 'Image uploads are unavailable. Please try again later.' });
  }
}

// Existing cover callers may omit size; new callers send it to bind Content-Length.
router.post('/cover', requireAuth, async (req, res) => {
  if (!validFile(req.body)) return res.status(400).json({ error: 'Choose a JPEG, PNG or WebP image up to 10 MiB.' });
  return signImage(req, res, `covers/${req.user.id}`);
});

router.post('/floor-plan', requireAuth, async (req, res) => {
  const { eventId, floorPlanId, kind } = req.body || {};
  // A plan background is an editor image: organisers may add it before the event is published.
  const background = kind === 'background';
  if (!UUID.test(eventId) || !UUID.test(floorPlanId) || !validFile(req.body, true)) {
    return res.status(400).json({ error: 'An event, floor plan and JPEG, PNG or WebP image up to 10 MiB are required.' });
  }
  try {
    const client = supabaseForUser(req.accessToken);
    const { data: organiser, error: roleError } = await client.rpc('is_event_organiser', { p_event_id: eventId });
    if (roleError) throw roleError;
    if (organiser !== true) return res.status(403).json({ error: 'Only event organisers can upload a floor plan.' });
    if (!background) {
      const { data: event, error: eventError } = await client.from('events').select('id').eq('id', eventId).eq('status', 'published').maybeSingle();
      if (eventError) throw eventError;
      if (!event) return res.status(404).json({ error: 'Published event not found.' });
    }
    const { data: plan, error: planError } = await client.from('floor_plans').select('id').eq('id', floorPlanId).eq('event_id', eventId).maybeSingle();
    if (planError) throw planError;
    if (!plan) return res.status(404).json({ error: 'Floor plan not found for this event.' });
    return signImage(req, res, `floorplans/${eventId}/${floorPlanId}${background ? '/background' : ''}`);
  } catch {
    return res.status(503).json({ error: 'Unable to check floor-plan permissions. Please try again.' });
  }
});

// Always anonymous: this endpoint only resolves deliberately public finished images.
router.get('/floor-plan/:assetId', async (req, res) => {
  if (!UUID.test(req.params.assetId)) return res.status(400).json({ error: 'Invalid image ID.' });
  try {
    const client = supabaseForUser();
    const { data: asset, error } = await client.from('floor_plan_assets').select('r2_key,event_id')
      .eq('id', req.params.assetId).eq('kind', 'finished').eq('is_public', true).maybeSingle();
    if (error) throw error;
    if (!asset) return res.status(404).json({ error: 'Public floor-plan image not found.' });
    const { data: event, error: eventError } = await client.from('events').select('id').eq('id', asset.event_id).eq('status', 'published').maybeSingle();
    if (eventError) throw eventError;
    if (!event || typeof asset.r2_key !== 'string' || !asset.r2_key.startsWith(`floorplans/${asset.event_id}/`)
      || asset.r2_key.split('/').some(part => part === '.' || part === '..') || /[?#\\]/.test(asset.r2_key)) {
      return res.status(404).json({ error: 'Public floor-plan image not found.' });
    }
    return res.json({ publicUrl: `${publicBase()}/${asset.r2_key.split('/').map(encodeURIComponent).join('/')}` });
  } catch {
    return res.status(503).json({ error: 'Floor-plan image is unavailable. Please try again.' });
  }
});

module.exports = router;
