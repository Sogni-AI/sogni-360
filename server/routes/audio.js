import express from 'express';

const router = express.Router();

// Allowed audio hosts that we'll proxy
const ALLOWED_HOSTS = [
  'pub-5bc58981af9f42659ff8ada57bfea92c.r2.dev',
  'cdn.sogni.ai'
];

/**
 * Proxy endpoint to fetch audio files from allowed external hosts.
 * This bypasses CORS restrictions for audio files needed by the frontend.
 *
 * GET /api/audio/proxy?url=<encoded-url>
 */
router.get('/proxy', async (req, res) => {
  const { url } = req.query;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  // Verify the host is allowed
  if (!ALLOWED_HOSTS.includes(parsedUrl.hostname)) {
    console.warn(`[Audio Proxy] Blocked request to disallowed host: ${parsedUrl.hostname}`);
    return res.status(403).json({ error: 'Host not allowed' });
  }

  // Only allow audio file extensions
  const allowedExtensions = ['.m4a', '.mp3', '.mp4', '.aac', '.wav', '.ogg'];
  const ext = parsedUrl.pathname.toLowerCase().slice(parsedUrl.pathname.lastIndexOf('.'));
  if (!allowedExtensions.includes(ext)) {
    return res.status(400).json({ error: 'Not an audio file' });
  }

  console.log(`[Audio Proxy] Fetching: ${url}`);

  try {
    const response = await fetch(url);

    if (!response.ok) {
      console.error(`[Audio Proxy] Failed to fetch: ${response.status}`);
      return res.status(response.status).json({
        error: 'Failed to fetch audio',
        status: response.status
      });
    }

    // Forward content-type header
    const contentType = response.headers.get('content-type');
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }

    // Forward content-length if available
    const contentLength = response.headers.get('content-length');
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    // Set cache headers (1 hour)
    res.setHeader('Cache-Control', 'public, max-age=3600');

    // Stream the response
    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));

    console.log(`[Audio Proxy] Success: ${url} (${contentLength || 'unknown'} bytes)`);
  } catch (error) {
    console.error(`[Audio Proxy] Error fetching ${url}:`, error);
    res.status(500).json({ error: 'Failed to fetch audio', details: error.message });
  }
});

export default router;
