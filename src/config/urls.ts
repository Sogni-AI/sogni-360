/**
 * URL configurations for different environments
 */

interface EnvironmentURLs {
  publicUrl: string;
  apiUrl: string;
}

// Production URLs
const productionUrls: EnvironmentURLs = {
  publicUrl: 'https://360.sogni.ai',
  apiUrl: 'https://360-api.sogni.ai',
};

// Staging URLs
const stagingUrls: EnvironmentURLs = {
  publicUrl: 'https://360-staging.sogni.ai',
  apiUrl: 'https://360-api-staging.sogni.ai',
};

// Local development URLs (when accessed via localhost:5180 directly)
const developmentUrls: EnvironmentURLs = {
  publicUrl: 'http://localhost:5180',
  apiUrl: 'https://360-api-local.sogni.ai',
};

// Local secure development URLs (for https://360-local.sogni.ai)
const localSecureUrls: EnvironmentURLs = {
  publicUrl: 'https://360-local.sogni.ai',
  apiUrl: 'https://360-api-local.sogni.ai',
};

// Get URLs based on environment
export const getURLs = (): EnvironmentURLs => {
  const environment = import.meta.env.MODE || 'development';

  console.log(`[Sogni 360] Loading URLs for environment: ${environment}`);

  // Special handling for secure local development
  if (typeof window !== 'undefined' &&
      window.location.hostname === '360-local.sogni.ai') {
    console.log('[Sogni 360] Using secure local development URLs');
    return localSecureUrls;
  }

  switch (environment) {
    case 'production':
      return productionUrls;
    case 'staging':
      return stagingUrls;
    case 'development':
    default:
      return developmentUrls;
  }
};

// Export convenience getters
const urls = getURLs();

export const PUBLIC_URL = urls.publicUrl;
export const API_URL = urls.apiUrl;
export const ENVIRONMENT = import.meta.env.MODE || 'development';

// API endpoints
export const ENDPOINTS = {
  status: `${API_URL}/api/sogni/status`,
  generate: `${API_URL}/api/sogni/generate`,
  generateAngle: `${API_URL}/api/sogni/generate-angle`,
  estimateCost: `${API_URL}/api/sogni/estimate-cost`,
  progress: (projectId: string, clientAppId: string) =>
    `${API_URL}/sogni/progress/${projectId}?clientAppId=${clientAppId}`,
  disconnect: `${API_URL}/api/sogni/disconnect`,
  health: `${API_URL}/health`,
};

export default urls;
