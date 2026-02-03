import { v4 as uuidv4 } from 'uuid';
import process from 'process';

// Import SogniClient dynamically
let SogniClient;

// Connection tracking
export const activeConnections = new Map();
const connectionLastActivity = new Map();
export const sessionClients = new Map();

// Single global Sogni client
let globalSogniClient = null;
let clientCreationPromise = null;
let sogniUsername = null;
let sogniEnv = null;
let sogniUrls = null;
let password = null;
let authLoginPromise = null;

// Sogni environment configuration
const SOGNI_HOSTS = {
  local: {
    api: 'https://api-local.sogni.ai',
    socket: 'wss://socket-local.sogni.ai',
    rest: 'https://api-local.sogni.ai'
  },
  staging: {
    api: 'https://api-staging.sogni.ai',
    socket: 'wss://socket-staging.sogni.ai',
    rest: 'https://api-staging.sogni.ai'
  },
  production: {
    api: 'https://api.sogni.ai',
    socket: 'wss://socket.sogni.ai',
    rest: 'https://api.sogni.ai'
  }
};

const getSogniUrls = (env) => {
  if (!SOGNI_HOSTS[env]) {
    console.warn(`Unknown Sogni environment: ${env}, falling back to production`);
    return SOGNI_HOSTS.production;
  }
  return SOGNI_HOSTS[env];
};

// Activity tracking
export function getActiveConnectionsCount() {
  return activeConnections.size;
}

function recordClientActivity(clientId) {
  if (clientId) {
    connectionLastActivity.set(clientId, Date.now());
  }
}

// Create or get the global Sogni client
async function getOrCreateGlobalSogniClient() {
  if (globalSogniClient && globalSogniClient.account.currentAccount.isAuthenicated) {
    console.log(`[GLOBAL] Reusing existing authenticated global client: ${globalSogniClient.appId}`);
    recordClientActivity(globalSogniClient.appId);
    return globalSogniClient;
  }

  if (clientCreationPromise) {
    console.log(`[GLOBAL] Client creation already in progress, waiting...`);
    return await clientCreationPromise;
  }

  clientCreationPromise = (async () => {
    try {
      if (!sogniUsername || !password) {
        sogniEnv = process.env.SOGNI_ENV || 'production';
        sogniUsername = process.env.SOGNI_USERNAME;
        password = process.env.SOGNI_PASSWORD;
        sogniUrls = getSogniUrls(sogniEnv);

        if (!sogniUsername || !password) {
          throw new Error('Sogni credentials not configured - check SOGNI_USERNAME and SOGNI_PASSWORD');
        }
      }

      const clientAppId = `sogni-360-${uuidv4()}`;

      console.log(`[GLOBAL] Creating new global Sogni client with app ID: ${clientAppId}`);

      if (!SogniClient) {
        const sogniModule = await import('@sogni-ai/sogni-client');
        SogniClient = sogniModule.SogniClient;
      }

      const client = await SogniClient.createInstance({
        appId: clientAppId,
        network: 'fast',
        restEndpoint: sogniUrls.rest,
        socketEndpoint: sogniUrls.socket,
        testnet: sogniEnv === 'local' || sogniEnv === 'staging'
      });

      try {
        console.log(`[GLOBAL] Authenticating global client...`);
        await client.account.login(sogniUsername, password, false);
        console.log(`[GLOBAL] Successfully authenticated global client: ${clientAppId}`);
      } catch (error) {
        console.error(`[GLOBAL] Authentication failed:`, error);
        throw error;
      }

      globalSogniClient = client;
      activeConnections.set(clientAppId, client);
      recordClientActivity(clientAppId);

      return globalSogniClient;
    } catch (error) {
      console.error(`[GLOBAL] Failed to create global client:`, error);
      throw error;
    } finally {
      clientCreationPromise = null;
    }
  })();

  return await clientCreationPromise;
}

// Get session client
export async function getSessionClient(sessionId, clientAppId) {
  console.log(`[SESSION] Getting client for session ${sessionId}`);
  try {
    const client = await getOrCreateGlobalSogniClient();
    sessionClients.set(sessionId, client.appId);
    return client;
  } catch (error) {
    console.error(`[SESSION] Failed to get client for session ${sessionId}:`, error);
    throw error;
  }
}

// Disconnect session client
export async function disconnectSessionClient(sessionId) {
  console.log(`[SESSION] Disconnecting session client for session ${sessionId}`);
  sessionClients.delete(sessionId);
  return true;
}

// Get client info
export async function getClientInfo(sessionId) {
  try {
    const client = await getOrCreateGlobalSogniClient();

    return {
      appId: client.appId,
      isAuthenticated: client.account.currentAccount.isAuthenicated,
      networkStatus: client.account.currentAccount.networkStatus,
      network: client.account.currentAccount.network,
      hasToken: !!client.account.currentAccount.token,
      walletAddress: client.account.currentAccount.walletAddress,
      username: client.account.currentAccount.username,
      balance: client.account.currentAccount.balance,
      sessionId: sessionId,
      globalClientActive: !!globalSogniClient,
      activeConnectionsCount: activeConnections.size
    };
  } catch (error) {
    console.error('[INFO] Error getting client info:', error);
    return {
      error: error.message,
      sessionId: sessionId,
      globalClientActive: !!globalSogniClient,
      activeConnectionsCount: activeConnections.size
    };
  }
}

// Generate image (camera angle)
export async function generateImage(client, params, progressCallback, localProjectId = null) {
  console.log('[IMAGE] Starting image generation with params:', {
    model: params.selectedModel,
    outputFormat: params.outputFormat
  });

  const projectOptions = {
    type: 'image',
    modelId: params.selectedModel,
    positivePrompt: params.positivePrompt || '',
    negativePrompt: params.negativePrompt || '',
    sizePreset: 'custom',
    width: params.width,
    height: params.height,
    steps: params.inferenceSteps || 5,
    guidance: params.promptGuidance || 1,
    numberOfMedia: params.numberImages || 1,
    numberOfPreviews: 5,
    sampler: params.sampler || 'euler',
    scheduler: params.scheduler || 'simple',
    disableNSFWFilter: true,
    outputFormat: params.outputFormat || 'jpg',
    tokenType: params.tokenType || 'spark'
  };

  // Add context images if provided
  if (params.contextImages && Array.isArray(params.contextImages)) {
    const contextImagesData = params.contextImages.map(img => {
      return img instanceof Uint8Array ? img : new Uint8Array(img);
    });
    projectOptions.contextImages = contextImagesData;
  }

  // Add LoRA configuration if provided
  if (params.loras && Array.isArray(params.loras)) {
    projectOptions.loras = params.loras;
  }
  if (params.loraStrengths && Array.isArray(params.loraStrengths)) {
    projectOptions.loraStrengths = params.loraStrengths;
  }

  // Add starting image for enhancement (img2img)
  if (params.startingImage) {
    const startImg = params.startingImage instanceof Uint8Array
      ? params.startingImage
      : new Uint8Array(params.startingImage);
    projectOptions.startingImage = startImg;
    projectOptions.startingImageStrength = params.startingImageStrength || 0.75;
  }

  // Create project
  const project = await client.projects.create(projectOptions);
  console.log('[IMAGE] Project created:', project.id);

  // Send initial queued event
  if (progressCallback) {
    progressCallback({
      type: 'queued',
      projectId: localProjectId || project.id,
      queuePosition: 1
    });
  }

  return new Promise((resolve, reject) => {
    let projectFinished = false;
    const sentJobCompletions = new Set();

    // Job event handler
    const jobHandler = (event) => {
      if (event.projectId !== project.id) return;

      console.log(`[SDK-Event] ${localProjectId} | type=${event.type} | step=${event.step}/${event.stepCount} | resultUrl=${!!event.resultUrl}`);

      let progressEvent = null;

      switch (event.type) {
        case 'started':
        case 'initiating':
          progressEvent = {
            type: event.type,
            jobId: event.jobId,
            projectId: localProjectId || event.projectId,
            workerName: event.workerName || 'Worker'
          };
          break;

        case 'progress':
          if (event.step && event.stepCount) {
            const progress = Math.floor(event.step / event.stepCount * 100);
            progressEvent = {
              type: 'progress',
              progress: progress / 100,
              step: event.step,
              stepCount: event.stepCount,
              jobId: event.jobId,
              projectId: localProjectId || event.projectId,
              workerName: event.workerName || 'Worker'
            };
          }
          break;

        case 'preview':
          if (event.url) {
            progressEvent = {
              type: 'preview',
              jobId: event.jobId,
              projectId: localProjectId || event.projectId,
              previewUrl: event.url,
              resultUrl: event.url
            };
          }
          break;

        case 'completed':
        case 'jobCompleted':
          console.log(`[SDK-Event] ${localProjectId} | JOB COMPLETED | resultUrl=${event.resultUrl} | isNSFW=${event.isNSFW}`);
          if (event.jobId && !sentJobCompletions.has(event.jobId)) {
            sentJobCompletions.add(event.jobId);
            progressEvent = {
              type: 'jobCompleted',
              jobId: event.jobId,
              projectId: localProjectId || event.projectId,
              resultUrl: event.resultUrl,
              isNSFW: event.isNSFW,
              seed: event.seed,
              // Include SDK IDs for URL refresh capability
              sdkProjectId: event.projectId,
              sdkJobId: event.jobId
            };
          }
          break;

        default:
          console.log(`[SDK-Event] ${localProjectId} | Unhandled event type: ${event.type}`);
      }

      if (progressEvent && progressCallback) {
        progressCallback(progressEvent);
      }
    };

    // Register handler
    client.projects.on('job', jobHandler);

    // Handle completion
    project.on('completed', (imageUrls) => {
      console.log(`[PROJECT] ${localProjectId} | completed event fired | images=${imageUrls?.length} | urls=${JSON.stringify(imageUrls)}`);
      if (projectFinished) {
        console.log(`[PROJECT] ${localProjectId} | Already finished, ignoring duplicate completed`);
        return;
      }
      projectFinished = true;

      console.log(`[PROJECT] ${localProjectId} | Sending completed SSE event`);

      client.projects.off('job', jobHandler);

      if (progressCallback) {
        progressCallback({
          type: 'completed',
          projectId: localProjectId || project.id,
          imageUrls: imageUrls
        });
      } else {
        console.error(`[PROJECT] ${localProjectId} | No progressCallback to send completed event!`);
      }

      resolve({ projectId: project.id, result: { imageUrls } });
    });

    // Handle failure
    project.on('failed', (error) => {
      console.log(`[PROJECT] ${localProjectId} | failed event fired | error=${error?.message}`);
      if (projectFinished) {
        console.log(`[PROJECT] ${localProjectId} | Already finished, ignoring duplicate failed`);
        return;
      }
      projectFinished = true;

      console.error(`[PROJECT] ${localProjectId} | Sending error SSE event`);

      client.projects.off('job', jobHandler);

      if (progressCallback) {
        progressCallback({
          type: 'error',
          projectId: localProjectId || project.id,
          message: error.message || 'Generation failed'
        });
      } else {
        console.error(`[PROJECT] ${localProjectId} | No progressCallback to send error event!`);
      }

      reject(error);
    });

    // Timeout
    setTimeout(() => {
      if (!projectFinished) {
        projectFinished = true;
        client.projects.off('job', jobHandler);
        reject(new Error('Project timeout after 10 minutes'));
      }
    }, 10 * 60 * 1000);
  });
}

// Generate video transition (image-to-video)
export async function generateVideo(client, params, progressCallback, localProjectId = null) {
  console.log('[VIDEO] Starting video generation with params:', {
    model: params.selectedModel,
    frames: params.frames,
    fps: params.fps,
    width: params.width,
    height: params.height,
    shift: params.shift,
    guidance: params.promptGuidance
  });
  console.log(`[VIDEO] Output FPS: ${params.fps || 32} (post-processing interpolation)`);

  const projectOptions = {
    type: 'video',
    modelId: params.selectedModel,
    positivePrompt: params.positivePrompt || '',
    negativePrompt: params.negativePrompt || '',
    sizePreset: 'custom',
    width: params.width,
    height: params.height,
    steps: params.inferenceSteps || 4,
    shift: params.shift,                    // Motion intensity (lightx2v: 5.0, full: 8.0)
    guidance: params.promptGuidance || 5,   // Guidance scale (lightx2v: 1.0, full: 4.0)
    frames: params.frames || 49,
    fps: params.fps || 32, // Output video FPS (32fps for smooth playback)
    numberOfMedia: 1,
    numberOfPreviews: 3,
    sampler: params.sampler || 'euler',
    scheduler: params.scheduler || 'simple',
    disableNSFWFilter: true,
    outputFormat: 'mp4',
    tokenType: params.tokenType || 'spark'
  };

  // Add reference images (start and end frames)
  if (params.referenceImage) {
    const refImg = params.referenceImage instanceof Uint8Array
      ? params.referenceImage
      : new Uint8Array(params.referenceImage);
    projectOptions.referenceImage = refImg;
  }

  if (params.referenceImageEnd) {
    const refImgEnd = params.referenceImageEnd instanceof Uint8Array
      ? params.referenceImageEnd
      : new Uint8Array(params.referenceImageEnd);
    projectOptions.referenceImageEnd = refImgEnd;
  }

  // Log full project options for debugging (mask binary data)
  console.log('[VIDEO] Full project options:', JSON.stringify({
    ...projectOptions,
    referenceImage: projectOptions.referenceImage ? `[Buffer ${projectOptions.referenceImage.length} bytes]` : undefined,
    referenceImageEnd: projectOptions.referenceImageEnd ? `[Buffer ${projectOptions.referenceImageEnd.length} bytes]` : undefined
  }, null, 2));

  // Create project
  const project = await client.projects.create(projectOptions);
  console.log('[VIDEO] Project created:', project.id);

  // Send initial queued event
  if (progressCallback) {
    progressCallback({
      type: 'queued',
      projectId: localProjectId || project.id,
      queuePosition: 1
    });
  }

  return new Promise((resolve, reject) => {
    let projectFinished = false;
    const sentJobCompletions = new Set();

    // Job event handler
    const jobHandler = (event) => {
      if (event.projectId !== project.id) return;

      console.log(`[SDK-Video-Event] ${localProjectId} | type=${event.type} | step=${event.step}/${event.stepCount} | resultUrl=${!!event.resultUrl}`);

      let progressEvent = null;

      switch (event.type) {
        case 'started':
        case 'initiating':
          progressEvent = {
            type: event.type,
            jobId: event.jobId,
            projectId: localProjectId || event.projectId,
            workerName: event.workerName || 'Worker'
          };
          break;

        case 'progress':
          if (event.step && event.stepCount) {
            const progress = Math.floor(event.step / event.stepCount * 100);
            progressEvent = {
              type: 'progress',
              progress: progress / 100,
              step: event.step,
              stepCount: event.stepCount,
              jobId: event.jobId,
              projectId: localProjectId || event.projectId,
              workerName: event.workerName || 'Worker'
            };
          }
          break;

        case 'preview':
          if (event.url) {
            progressEvent = {
              type: 'preview',
              jobId: event.jobId,
              projectId: localProjectId || event.projectId,
              previewUrl: event.url,
              resultUrl: event.url
            };
          }
          break;

        case 'completed':
        case 'jobCompleted':
          console.log(`[SDK-Video-Event] ${localProjectId} | JOB COMPLETED | resultUrl=${event.resultUrl} | isNSFW=${event.isNSFW}`);
          if (event.jobId && !sentJobCompletions.has(event.jobId)) {
            sentJobCompletions.add(event.jobId);
            progressEvent = {
              type: 'jobCompleted',
              jobId: event.jobId,
              projectId: localProjectId || event.projectId,
              resultUrl: event.resultUrl,
              isNSFW: event.isNSFW,
              seed: event.seed,
              // Include SDK IDs for URL refresh capability
              sdkProjectId: event.projectId,
              sdkJobId: event.jobId
            };
          }
          break;

        default:
          console.log(`[SDK-Video-Event] ${localProjectId} | Unhandled event type: ${event.type}`);
      }

      if (progressEvent && progressCallback) {
        progressCallback(progressEvent);
      }
    };

    // Register handler
    client.projects.on('job', jobHandler);

    // Handle completion
    project.on('completed', (videoUrls) => {
      console.log(`[VIDEO] ${localProjectId} | completed event fired | videos=${videoUrls?.length} | urls=${JSON.stringify(videoUrls)}`);
      if (projectFinished) {
        console.log(`[VIDEO] ${localProjectId} | Already finished, ignoring duplicate completed`);
        return;
      }
      projectFinished = true;

      console.log(`[VIDEO] ${localProjectId} | Sending completed SSE event`);

      client.projects.off('job', jobHandler);

      if (progressCallback) {
        progressCallback({
          type: 'completed',
          projectId: localProjectId || project.id,
          imageUrls: videoUrls // The SDK returns video URLs in imageUrls field
        });
      } else {
        console.error(`[VIDEO] ${localProjectId} | No progressCallback to send completed event!`);
      }

      resolve({ projectId: project.id, result: { videoUrls } });
    });

    // Handle failure
    project.on('failed', (error) => {
      console.log(`[VIDEO] ${localProjectId} | failed event fired | error=${error?.message}`);
      if (projectFinished) {
        console.log(`[VIDEO] ${localProjectId} | Already finished, ignoring duplicate failed`);
        return;
      }
      projectFinished = true;

      console.error(`[VIDEO] ${localProjectId} | Sending error SSE event`);

      client.projects.off('job', jobHandler);

      if (progressCallback) {
        progressCallback({
          type: 'error',
          projectId: localProjectId || project.id,
          message: error.message || 'Video generation failed'
        });
      } else {
        console.error(`[VIDEO] ${localProjectId} | No progressCallback to send error event!`);
      }

      reject(error);
    });

    // Timeout (15 minutes for video generation)
    setTimeout(() => {
      if (!projectFinished) {
        projectFinished = true;
        client.projects.off('job', jobHandler);
        reject(new Error('Video project timeout after 15 minutes'));
      }
    }, 15 * 60 * 1000);
  });
}

// Cleanup
export async function cleanupSogniClient({ logout = false } = {}) {
  console.log(`[CLEANUP] Cleaning up Sogni connections (logout: ${logout})`);

  if (globalSogniClient) {
    try {
      if (logout) {
        await globalSogniClient.account.logout();
      }

      if (activeConnections.has(globalSogniClient.appId)) {
        activeConnections.delete(globalSogniClient.appId);
        connectionLastActivity.delete(globalSogniClient.appId);
      }
    } catch (error) {
      console.error('[CLEANUP] Error:', error);
    }

    if (logout) {
      globalSogniClient = null;
      clientCreationPromise = null;
    }
  }

  sessionClients.clear();
  return true;
}

// Helper functions
export function clearInvalidTokens() {
  console.log('[AUTH] Clearing global client due to invalid tokens');
  if (globalSogniClient) {
    if (activeConnections.has(globalSogniClient.appId)) {
      activeConnections.delete(globalSogniClient.appId);
      connectionLastActivity.delete(globalSogniClient.appId);
    }
    globalSogniClient = null;
    clientCreationPromise = null;
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Cleaning up before shutdown...');
  cleanupSogniClient({ logout: true })
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
});

process.on('SIGTERM', () => {
  cleanupSogniClient({ logout: true });
});
