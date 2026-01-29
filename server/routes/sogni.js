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
      loraStrength = 0.9
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

    // Build project parameters
    const projectParams = {
      selectedModel: 'qwen_image_edit_2511_fp8_lightning',
      positivePrompt: fullPrompt,
      negativePrompt: '',
      contextImages: [contextImageBuffer],
      width: width || 1024,
      height: height || 1024,
      numberImages: 1,
      inferenceSteps: 5,
      promptGuidance: 1,
      tokenType: tokenType,
      outputFormat: 'png',
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
      width = 480,
      height = 480,
      frames = 49,
      steps = 4,
      model = 'wan_v2.2-14b-fp8_i2v_lightx2v',
      tokenType = 'spark'
    } = req.body;

    if (!referenceImage || !referenceImageEnd) {
      return res.status(400).json({
        error: 'Missing required parameters: referenceImage and referenceImageEnd are required'
      });
    }

    console.log(`[${localProjectId}] Prompt: ${prompt}`);
    console.log(`[${localProjectId}] Resolution: ${width}x${height}, Frames: ${frames}, Steps: ${steps}`);

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
    const projectParams = {
      selectedModel: model,
      positivePrompt: prompt || '',
      negativePrompt: negativePrompt || '',
      referenceImage: refImageBuffer,
      referenceImageEnd: refImageEndBuffer,
      width,
      height,
      frames,
      inferenceSteps: steps,
      promptGuidance: 5,
      sampler: 'euler',
      scheduler: 'simple',
      tokenType,
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
      tokenType = 'spark'
    } = req.body;

    if (!model) {
      return res.status(400).json({ error: 'Model is required' });
    }

    const clientAppId = req.headers['x-client-app-id'] || req.body.clientAppId;
    const client = await getSessionClient(req.sessionId, clientAppId);

    const result = await client.projects.estimateCost({
      network,
      model,
      imageCount,
      previewCount,
      stepCount,
      scheduler,
      guidance,
      contextImages,
      tokenType
    });

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
