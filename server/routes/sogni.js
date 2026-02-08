import express from 'express';
import { getClientInfo, generateImage, generateVideo, getSessionClient, disconnectSessionClient, activeConnections, sessionClients, clearInvalidTokens } from '../services/sogni.js';
import { v4 as uuidv4 } from 'uuid';
import process from 'process';
import { Buffer } from 'buffer';

const router = express.Router();

// Map to store active SSE connections
const activeProjects = new Map();
const pendingProjectEvents = new Map();

// Middleware to ensure session ID cookie exists
const ensureSessionId = (req, res, next) => {
  const sessionCookieName = 'sogni_session_id';
  let sessionId = req.cookies?.[sessionCookieName];

  if (!sessionId) {
    sessionId = `sid-${uuidv4()}`;

    const isSecureContext = req.secure ||
                            req.headers['x-forwarded-proto'] === 'https' ||
                            process.env.NODE_ENV === 'production';

    const origin = req.headers.origin;
    const sameSiteSetting = (origin && origin.startsWith('https:')) ? 'none' : 'lax';
    const secure = isSecureContext || sameSiteSetting === 'none';

    console.log(`[SESSION] Creating new session ID: ${sessionId}`);

    res.cookie(sessionCookieName, sessionId, {
      maxAge: 30 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      secure: secure,
      sameSite: sameSiteSetting,
      path: '/'
    });
  }

  req.sessionId = sessionId;
  next();
};

// Helper function to send SSE messages
function forwardEventToSSE(localProjectId, clientAppId, sseEvent) {
  const eventType = sseEvent.type || 'unknown';
  const hasClients = activeProjects.has(localProjectId);
  const clientCount = hasClients ? activeProjects.get(localProjectId).size : 0;

  console.log(`[SSE-Forward] ${localProjectId} | type=${eventType} | clients=${clientCount} | hasResult=${!!sseEvent.resultUrl}`);

  if (hasClients && clientCount > 0) {
    const projectClients = activeProjects.get(localProjectId);
    projectClients.forEach(client => {
      try {
        const data = JSON.stringify(sseEvent);
        client.write(`data: ${data}\n\n`);
        console.log(`[SSE-Forward] Sent ${eventType} to client for ${localProjectId}`);
      } catch (error) {
        console.error(`[SSE-Forward] Error sending ${eventType}:`, error);
      }
    });
  } else {
    // Store for later pickup
    console.log(`[SSE-Forward] No clients, storing ${eventType} for later pickup`);
    if (!pendingProjectEvents.has(localProjectId)) {
      pendingProjectEvents.set(localProjectId, []);
    }
    pendingProjectEvents.get(localProjectId).push({ ...sseEvent, clientAppId });

    // Limit stored events
    const events = pendingProjectEvents.get(localProjectId);
    if (events.length > 50) {
      events.splice(0, events.length - 50);
    }
  }
}

// Status endpoint
router.get('/status', ensureSessionId, async (req, res) => {
  try {
    const clientAppId = req.headers['x-client-app-id'] || req.query.clientAppId;
    const status = await getClientInfo(req.sessionId, clientAppId);

    res.json({
      ...status,
      sessionId: req.sessionId
    });
  } catch (error) {
    console.error('Error getting Sogni client status:', error);
    res.status(500).json({
      error: 'Failed to connect to Sogni services',
      message: error.message
    });
  }
});

// SSE progress endpoint
router.get('/progress/:projectId', ensureSessionId, (req, res) => {
  const projectId = req.params.projectId;
  const clientAppId = req.headers['x-client-app-id'] || req.query.clientAppId;

  console.log(`SSE connection for project: ${projectId}`);

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Content-Encoding', 'identity');
  res.setHeader('X-Accel-Buffering', 'no');

  // Send connected event
  res.write(`data: ${JSON.stringify({ type: 'connected', projectId, timestamp: Date.now() })}\n\n`);
  try { res.flushHeaders(); } catch {}

  // Track connection
  if (!activeProjects.has(projectId)) {
    activeProjects.set(projectId, new Set());
  }
  activeProjects.get(projectId).add(res);

  // Send pending events
  if (pendingProjectEvents.has(projectId)) {
    const events = pendingProjectEvents.get(projectId);
    console.log(`Sending ${events.length} pending events for ${projectId}`);
    try {
      for (const event of events) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
      pendingProjectEvents.delete(projectId);
    } catch (error) {
      console.error('Error sending pending events:', error);
    }
  }

  // Heartbeat
  const heartbeatInterval = setInterval(() => {
    if (res.writable) {
      try { res.write(":\n\n"); } catch {}
    } else {
      clearInterval(heartbeatInterval);
    }
  }, 15000);

  // Handle disconnect
  req.on('close', () => {
    clearInterval(heartbeatInterval);
    if (activeProjects.has(projectId)) {
      activeProjects.get(projectId).delete(res);
      if (activeProjects.get(projectId).size === 0) {
        activeProjects.delete(projectId);
      }
    }
  });

  // Timeout
  setTimeout(() => {
    clearInterval(heartbeatInterval);
    try {
      if (res.writable) {
        res.write(`data: ${JSON.stringify({ type: 'timeout', projectId })}\n\n`);
        res.end();
      }
    } catch {}
    if (activeProjects.has(projectId)) {
      activeProjects.get(projectId).delete(res);
      if (activeProjects.get(projectId).size === 0) {
        activeProjects.delete(projectId);
      }
    }
  }, 10 * 60 * 1000);
});

// Generate camera angle image
router.post('/generate-angle', ensureSessionId, async (req, res) => {
  const localProjectId = `angle-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  console.log(`[${localProjectId}] Starting camera angle generation`);

  try {
    let clientAppId = req.headers['x-client-app-id'] || req.body.clientAppId || req.query.clientAppId;
    if (!clientAppId) {
      clientAppId = `user-${req.sessionId}-${Date.now()}`;
    }

    const {
      contextImage,
      azimuthPrompt,
      elevationPrompt,
      distancePrompt,
      width,
      height,
      tokenType = 'spark',
      loraStrength = 0.9,
      // Image quality settings (from advanced settings)
      imageModel = 'qwen_image_edit_2511_fp8_lightning',
      imageSteps = 8,
      imageGuidance = 1,
      outputFormat = 'jpg'
    } = req.body;

    if (!contextImage || !azimuthPrompt || !elevationPrompt || !distancePrompt) {
      return res.status(400).json({
        error: 'Missing required parameters'
      });
    }

    // Build prompt
    const fullPrompt = `<sks> ${azimuthPrompt} ${elevationPrompt} ${distancePrompt}`;
    console.log(`[${localProjectId}] Prompt: ${fullPrompt}`);

    // Progress handler
    const progressHandler = (eventData) => {
      const sseEvent = {
        ...eventData,
        projectId: localProjectId
      };
      forwardEventToSSE(localProjectId, clientAppId, sseEvent);
    };

    // Get client
    const client = await getSessionClient(req.sessionId, clientAppId);

    // Prepare context image
    let contextImageBuffer;
    if (contextImage.startsWith('data:')) {
      const base64Data = contextImage.split(',')[1];
      contextImageBuffer = Buffer.from(base64Data, 'base64');
    } else if (contextImage.startsWith('http')) {
      const response = await fetch(contextImage);
      if (!response.ok) {
        throw new Error(`Failed to fetch context image: ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      contextImageBuffer = new Uint8Array(arrayBuffer);
    } else {
      contextImageBuffer = Buffer.from(contextImage, 'base64');
    }

    // Build project parameters using user's quality settings
    console.log(`[${localProjectId}] Using settings: model=${imageModel}, steps=${imageSteps}, guidance=${imageGuidance}, format=${outputFormat}`);
    const projectParams = {
      selectedModel: imageModel,
      positivePrompt: fullPrompt,
      negativePrompt: '',
      contextImages: [contextImageBuffer],
      width: width || 1024,
      height: height || 1024,
      numberImages: 1,
      inferenceSteps: imageSteps,
      promptGuidance: imageGuidance,
      tokenType: tokenType,
      outputFormat: outputFormat,
      sampler: 'euler',
      scheduler: 'simple',
      loras: ['multiple_angles'],
      loraStrengths: [loraStrength],
      clientAppId
    };

    // Start generation (async)
    generateImage(client, projectParams, progressHandler, localProjectId)
      .catch(error => {
        console.error(`[${localProjectId}] Generation error:`, error);
        forwardEventToSSE(localProjectId, clientAppId, {
          type: 'error',
          projectId: localProjectId,
          message: error.message || 'Generation failed'
        });
      });

    // Return immediately
    res.json({
      success: true,
      projectId: localProjectId,
      message: 'Camera angle generation started',
      clientAppId: clientAppId
    });

  } catch (error) {
    console.error(`[${localProjectId}] Error:`, error);
    res.status(500).json({
      error: 'Failed to initiate generation',
      message: error.message
    });
  }
});

// Generate video transition between two images
router.post('/generate-transition', ensureSessionId, async (req, res) => {
  const localProjectId = `transition-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  console.log(`[${localProjectId}] Starting video transition generation`);

  try {
    let clientAppId = req.headers['x-client-app-id'] || req.body.clientAppId || req.query.clientAppId;
    if (!clientAppId) {
      clientAppId = `user-${req.sessionId}-${Date.now()}`;
    }

    const {
      referenceImage,     // Base64 or data URL for start frame
      referenceImageEnd,  // Base64 or data URL for end frame
      prompt,
      negativePrompt = '',
      width = 720,
      height = 720,
      frames = 25,        // Default: 1.5s at 16fps base rate
      fps = 32,           // Output fps (post-processing interpolation)
      steps = 4,
      shift,              // Motion intensity (model-specific: lightx2v 5.0, full 8.0)
      guidance,           // Guidance scale (model-specific: lightx2v 1.0, full 4.0)
      model = 'wan_v2.2-14b-fp8_i2v_lightx2v',
      tokenType = 'spark',
      trimEndFrame = false
    } = req.body;

    if (!referenceImage || !referenceImageEnd) {
      return res.status(400).json({
        error: 'Missing required parameters: referenceImage and referenceImageEnd are required'
      });
    }

    console.log(`[${localProjectId}] Prompt: ${prompt}`);
    console.log(`[${localProjectId}] Resolution: ${width}x${height}`);
    console.log(`[${localProjectId}] Frames: ${frames} (16fps base), Output: ${fps}fps`);
    console.log(`[${localProjectId}] Steps: ${steps}, Shift: ${shift}, Guidance: ${guidance}`);

    // Progress handler
    const progressHandler = (eventData) => {
      const sseEvent = {
        ...eventData,
        projectId: localProjectId
      };
      forwardEventToSSE(localProjectId, clientAppId, sseEvent);
    };

    // Get client
    const client = await getSessionClient(req.sessionId, clientAppId);

    // Prepare reference images
    const prepareImageBuffer = async (imageData) => {
      if (imageData instanceof Uint8Array || Buffer.isBuffer(imageData)) {
        return imageData;
      }
      if (typeof imageData === 'string') {
        if (imageData.startsWith('data:')) {
          const base64Data = imageData.split(',')[1];
          return Buffer.from(base64Data, 'base64');
        } else if (imageData.startsWith('http')) {
          const response = await fetch(imageData);
          if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.statusText}`);
          }
          const arrayBuffer = await response.arrayBuffer();
          return new Uint8Array(arrayBuffer);
        } else {
          return Buffer.from(imageData, 'base64');
        }
      }
      throw new Error('Invalid image format');
    };

    const [refImageBuffer, refImageEndBuffer] = await Promise.all([
      prepareImageBuffer(referenceImage),
      prepareImageBuffer(referenceImageEnd)
    ]);

    // Build project parameters
    // Use shift and guidance from request (model-specific optimal values from quality config)
    const projectParams = {
      selectedModel: model,
      positivePrompt: prompt || '',
      negativePrompt: negativePrompt || '',
      referenceImage: refImageBuffer,
      referenceImageEnd: refImageEndBuffer,
      width,
      height,
      frames,
      fps,
      inferenceSteps: steps,
      shift: shift,               // Motion intensity (lightx2v: 5.0, full: 8.0)
      promptGuidance: guidance,   // Guidance scale (lightx2v: 1.0, full: 4.0)
      sampler: 'euler',
      scheduler: 'simple',
      tokenType,
      trimEndFrame,
      clientAppId
    };

    // Start generation (async)
    generateVideo(client, projectParams, progressHandler, localProjectId)
      .catch(error => {
        console.error(`[${localProjectId}] Video generation error:`, error);
        forwardEventToSSE(localProjectId, clientAppId, {
          type: 'error',
          projectId: localProjectId,
          message: error.message || 'Video generation failed'
        });
      });

    // Return immediately
    res.json({
      success: true,
      projectId: localProjectId,
      message: 'Video transition generation started',
      clientAppId: clientAppId
    });

  } catch (error) {
    console.error(`[${localProjectId}] Error:`, error);
    res.status(500).json({
      error: 'Failed to initiate video generation',
      message: error.message
    });
  }
});

// Enhance image with Z-Image Turbo
router.post('/enhance-image', ensureSessionId, async (req, res) => {
  const localProjectId = `enhance-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  console.log(`[${localProjectId}] Starting image enhancement`);

  try {
    let clientAppId = req.headers['x-client-app-id'] || req.body.clientAppId || req.query.clientAppId;
    if (!clientAppId) {
      clientAppId = `user-${req.sessionId}-${Date.now()}`;
    }

    const {
      sourceImage,  // Base64 or data URL of image to enhance
      width,
      height,
      tokenType = 'spark',
      prompt = '(Extra detailed and contrasty portrait) Portrait masterpiece',
      steps = 6 // Z-Image inference steps (4-10 based on quality tier)
    } = req.body;

    if (!sourceImage) {
      return res.status(400).json({
        error: 'Missing required parameter: sourceImage'
      });
    }

    console.log(`[${localProjectId}] Enhancing image at ${width}x${height}`);
    console.log(`[${localProjectId}] Prompt: ${prompt}`);

    // Progress handler
    const progressHandler = (eventData) => {
      const sseEvent = {
        ...eventData,
        projectId: localProjectId
      };
      forwardEventToSSE(localProjectId, clientAppId, sseEvent);
    };

    // Get client
    const client = await getSessionClient(req.sessionId, clientAppId);

    // Prepare source image
    let sourceImageBuffer;
    if (sourceImage.startsWith('data:')) {
      const base64Data = sourceImage.split(',')[1];
      sourceImageBuffer = Buffer.from(base64Data, 'base64');
    } else if (sourceImage.startsWith('http')) {
      const response = await fetch(sourceImage);
      if (!response.ok) {
        throw new Error(`Failed to fetch source image: ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      sourceImageBuffer = new Uint8Array(arrayBuffer);
    } else {
      sourceImageBuffer = Buffer.from(sourceImage, 'base64');
    }

    // Build project parameters for Z-Image Turbo enhancement
    // Key: startingImage + startingImageStrength for img2img enhancement
    // Clamp steps to valid range (4-10) for Z-Image Turbo
    const inferenceSteps = Math.max(4, Math.min(10, steps));
    const projectParams = {
      selectedModel: 'z_image_turbo_bf16',
      positivePrompt: prompt,
      negativePrompt: '',
      startingImage: sourceImageBuffer,
      startingImageStrength: 0.75, // 0.75 preserves 75% of original
      width: width || 1024,
      height: height || 1024,
      numberImages: 1,
      inferenceSteps, // Quality-based: Fast=4, Balanced=6, Quality=8, Pro=10
      promptGuidance: 3.5, // Z-Image Turbo default guidance
      tokenType: tokenType,
      outputFormat: 'jpg',
      sampler: 'euler',
      scheduler: 'simple',
      clientAppId
    };

    // Start generation (async)
    generateImage(client, projectParams, progressHandler, localProjectId)
      .catch(error => {
        console.error(`[${localProjectId}] Enhancement error:`, error);
        forwardEventToSSE(localProjectId, clientAppId, {
          type: 'error',
          projectId: localProjectId,
          message: error.message || 'Enhancement failed'
        });
      });

    // Return immediately
    res.json({
      success: true,
      projectId: localProjectId,
      message: 'Image enhancement started',
      clientAppId: clientAppId
    });

  } catch (error) {
    console.error(`[${localProjectId}] Error:`, error);
    res.status(500).json({
      error: 'Failed to initiate enhancement',
      message: error.message
    });
  }
});

// Cost estimation
router.post('/estimate-cost', ensureSessionId, async (req, res) => {
  try {
    const {
      network = 'fast',
      model,
      imageCount = 1,
      previewCount = 5,
      stepCount = 5,
      scheduler = 'simple',
      guidance = 1,
      contextImages = 1,
      tokenType = 'spark',
      guideImage = false,
      denoiseStrength
    } = req.body;

    if (!model) {
      return res.status(400).json({ error: 'Model is required' });
    }

    const clientAppId = req.headers['x-client-app-id'] || req.body.clientAppId;
    const client = await getSessionClient(req.sessionId, clientAppId);

    const estimateParams = {
      network,
      model,
      imageCount,
      previewCount,
      stepCount,
      scheduler,
      guidance,
      contextImages,
      tokenType,
      guideImage
    };

    // Add denoiseStrength only if guideImage is true
    if (guideImage && denoiseStrength !== undefined) {
      estimateParams.denoiseStrength = denoiseStrength;
    }

    const result = await client.projects.estimateCost(estimateParams);

    res.json(result);
  } catch (error) {
    console.error('Error estimating cost:', error);
    res.status(500).json({ error: 'Failed to estimate cost', message: error.message });
  }
});

// Health check
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// Image proxy to bypass CORS for S3 downloads
router.get('/proxy-image', async (req, res) => {
  const imageUrl = req.query.url;

  if (!imageUrl) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }

  // Only allow proxying from trusted S3/R2 domains
  const allowedDomains = [
    'complete-images-production.s3-accelerate.amazonaws.com',
    'complete-images-staging.s3-accelerate.amazonaws.com',
    'complete-images-production.s3.amazonaws.com',
    'complete-images-staging.s3.amazonaws.com',
    's3.amazonaws.com',
    's3-accelerate.amazonaws.com',
    // Cloudflare R2 public bucket for demo projects
    'pub-5bc58981af9f42659ff8ada57bfea92c.r2.dev'
  ];

  try {
    const url = new URL(imageUrl);
    const isAllowed = allowedDomains.some(domain =>
      url.hostname === domain || url.hostname.endsWith(`.${domain}`)
    );

    if (!isAllowed) {
      console.warn(`[Image Proxy] Blocked request to untrusted domain: ${url.hostname}`);
      return res.status(403).json({ error: 'Domain not allowed' });
    }

    console.log(`[Image Proxy] Fetching: ${imageUrl.slice(0, 100)}...`);

    const response = await fetch(imageUrl);

    if (!response.ok) {
      console.error(`[Image Proxy] Upstream error: ${response.status} ${response.statusText}`);
      return res.status(response.status).json({
        error: 'Failed to fetch image',
        status: response.status
      });
    }

    // Get content type from response
    const contentType = response.headers.get('content-type') || 'application/octet-stream';

    // Stream the response to the client
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=3600');

    const arrayBuffer = await response.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));

  } catch (error) {
    console.error('[Image Proxy] Error:', error);
    res.status(500).json({ error: 'Failed to proxy image', message: error.message });
  }
});

// Refresh signed URL for expired media
router.post('/refresh-url', ensureSessionId, async (req, res) => {
  try {
    const { sdkProjectId, sdkJobId, mediaType = 'image' } = req.body;

    if (!sdkProjectId || !sdkJobId) {
      return res.status(400).json({
        error: 'Missing required parameters: sdkProjectId and sdkJobId'
      });
    }

    console.log(`[Refresh URL] Refreshing ${mediaType} URL for project=${sdkProjectId}, job=${sdkJobId}`);

    const client = await getSessionClient(req.sessionId);

    let freshUrl;
    if (mediaType === 'video') {
      freshUrl = await client.projects.mediaDownloadUrl({
        jobId: sdkProjectId,
        id: sdkJobId,
        type: 'complete'
      });
    } else {
      freshUrl = await client.projects.downloadUrl({
        jobId: sdkProjectId,
        imageId: sdkJobId,
        type: 'complete'
      });
    }

    console.log(`[Refresh URL] Got fresh URL for ${mediaType}`);

    res.json({
      success: true,
      url: freshUrl
    });

  } catch (error) {
    console.error('[Refresh URL] Error:', error);
    res.status(500).json({
      error: 'Failed to refresh URL',
      message: error.message
    });
  }
});

// Disconnect
router.post('/disconnect', ensureSessionId, async (req, res) => {
  try {
    console.log(`Disconnect request for session ${req.sessionId}`);
    await disconnectSessionClient(req.sessionId);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error(`Error disconnecting session:`, error);
    res.status(500).json({ error: 'Failed to disconnect', message: error.message });
  }
});

export default router;
