// Google Analytics utility for Sogni 360
// This file handles analytics initialization and tracking

// Extend Window interface for gtag
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * Configuration values for Google Analytics
 * These can be set in .env.local with:
 * VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX
 * VITE_GA_DOMAIN=sogni.ai
 * VITE_GA_ENABLED=true|false
 */
const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID || '';
const GA_DOMAIN = import.meta.env.VITE_GA_DOMAIN || 'auto';
const GA_ENABLED = import.meta.env.VITE_GA_ENABLED !== 'false';

// App version for version tracking
const APP_VERSION = import.meta.env.VITE_APP_VERSION || '1.0.0';

/**
 * Initialize Google Analytics
 * This function:
 * 1. Checks if GA is enabled and has a measurement ID
 * 2. Injects the gtag.js script into the document head
 * 3. Initializes the dataLayer
 * 4. Configures the GA tracker with custom parameters
 * 5. Captures UTM parameters and traffic source data
 */
export const initializeGA = (): void => {
  if (!GA_ENABLED || !GA_MEASUREMENT_ID) {
    console.log('❌ Google Analytics is disabled or measurement ID is not provided');
    return;
  }

  try {
    // Create dataLayer array before defining gtag
    window.dataLayer = window.dataLayer || [];
    const dataLayer = window.dataLayer;

    // Define gtag using a function expression
    window.gtag = function(...args: unknown[]) {
      dataLayer.push(args);
    };

    // Set initial dataLayer values
    window.gtag('js', new Date());

    // Capture traffic source parameters from URL
    const urlParams = new URLSearchParams(window.location.search);
    const trafficConfig: Record<string, unknown> = {
      cookie_domain: GA_DOMAIN,
      send_page_view: true,
      app_version: APP_VERSION,
      anonymize_ip: true,
    };

    // Capture UTM parameters if present
    const utmParams = {
      utm_source: urlParams.get('utm_source'),
      utm_medium: urlParams.get('utm_medium'),
      utm_campaign: urlParams.get('utm_campaign'),
      utm_term: urlParams.get('utm_term'),
      utm_content: urlParams.get('utm_content'),
    };

    // Send custom event with UTM parameters for additional tracking
    const hasUTM = Object.values(utmParams).some(val => val !== null);
    if (hasUTM) {
      window.gtag('event', 'campaign_visit', {
        campaign_source: utmParams.utm_source || 'direct',
        campaign_medium: utmParams.utm_medium || 'none',
        campaign_name: utmParams.utm_campaign || '(not set)',
        campaign_term: utmParams.utm_term || '(not set)',
        campaign_content: utmParams.utm_content || '(not set)',
      });
    }

    // Capture document referrer for organic search tracking
    if (document.referrer) {
      try {
        const referrerUrl = new URL(document.referrer);
        const referrerHost = referrerUrl.hostname;

        // Check if referrer is a search engine
        const searchEngines: Record<string, string[]> = {
          'google': ['google.com', 'google.co.uk', 'google.ca', 'google.com.au'],
          'bing': ['bing.com'],
          'yahoo': ['yahoo.com', 'search.yahoo.com'],
          'duckduckgo': ['duckduckgo.com'],
          'baidu': ['baidu.com'],
          'yandex': ['yandex.com', 'yandex.ru'],
        };

        let searchEngine: string | null = null;
        for (const [engine, domains] of Object.entries(searchEngines)) {
          if (domains.some(domain => referrerHost.includes(domain))) {
            searchEngine = engine;
            break;
          }
        }

        if (searchEngine) {
          // Extract search query if available (most search engines now hide this)
          const searchQuery = referrerUrl.searchParams.get('q') || // Google, Bing, DuckDuckGo
                             referrerUrl.searchParams.get('p') || // Yahoo
                             '(not provided)';

          // Track organic search visit
          window.gtag('event', 'organic_search_visit', {
            search_engine: searchEngine,
            search_query: searchQuery,
            referrer: document.referrer
          });
        }
      } catch (error) {
        console.warn('Could not parse referrer URL:', error);
      }
    }

    // Configure GA4
    window.gtag('config', GA_MEASUREMENT_ID, trafficConfig);

    // Only after gtag is defined properly, load the script
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
    document.head.appendChild(script);
  } catch (error) {
    console.error('Error initializing Google Analytics:', error);
  }
};

/**
 * Track page views
 * @param path - The path/page to track
 */
export const trackPageView = (path: string): void => {
  if (!GA_ENABLED || !GA_MEASUREMENT_ID || !window.gtag) {
    return;
  }

  try {
    window.gtag('config', GA_MEASUREMENT_ID, {
      page_path: path,
      app_version: APP_VERSION,
    });
  } catch (error) {
    console.error('Error tracking page view:', error);
  }
};

/**
 * Track events
 * @param category - Event category
 * @param action - Event action
 * @param label - Event label (optional)
 * @param value - Event value (optional)
 */
export const trackEvent = (
  category: string,
  action: string,
  label: string | null = null,
  value: number | null = null
): void => {
  if (!GA_ENABLED || !GA_MEASUREMENT_ID || !window.gtag) {
    return;
  }

  try {
    const eventParams: Record<string, unknown> = {
      event_category: category,
      app_version: APP_VERSION,
    };

    if (label !== null) {
      eventParams.event_label = label;
    }

    if (value !== null) {
      eventParams.value = value;
    }

    window.gtag('event', action, eventParams);
  } catch (error) {
    console.error('Error tracking event:', error);
  }
};

/**
 * Check if Google Analytics is properly loaded and working
 * @returns Whether GA is functioning
 */
export const isGAWorking = (): boolean => {
  return !!(GA_ENABLED && GA_MEASUREMENT_ID && window.gtag && window.dataLayer);
};

interface EcommerceItem {
  item_id: string;
  item_name: string;
  price: number;
  currency?: string;
  quantity: number;
  item_category?: string;
}

/**
 * Track ecommerce: View Item
 * Called when user views products in the purchase modal
 */
export const trackViewItem = (items: EcommerceItem[]): void => {
  if (!GA_ENABLED || !GA_MEASUREMENT_ID || !window.gtag) {
    return;
  }

  try {
    const value = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const currency = items[0]?.currency || 'USD';

    window.gtag('event', 'view_item', {
      currency: currency,
      value: value,
      items: items
    });
  } catch (error) {
    console.error('Error tracking view_item:', error);
  }
};

/**
 * Track ecommerce: Begin Checkout
 * Called when user clicks "Buy" on a specific product
 */
export const trackBeginCheckout = (item: EcommerceItem): void => {
  if (!GA_ENABLED || !GA_MEASUREMENT_ID || !window.gtag) {
    return;
  }

  try {
    const value = item.price * item.quantity;
    const currency = item.currency || 'USD';

    window.gtag('event', 'begin_checkout', {
      currency: currency,
      value: value,
      items: [item]
    });
  } catch (error) {
    console.error('Error tracking begin_checkout:', error);
  }
};

interface PurchaseData {
  transaction_id: string;
  value: number;
  currency?: string;
  items: EcommerceItem[];
  affiliation?: string;
}

/**
 * Track ecommerce: Purchase
 * Called when a purchase is successfully completed
 */
export const trackPurchase = (purchaseData: PurchaseData): void => {
  if (!GA_ENABLED || !GA_MEASUREMENT_ID || !window.gtag) {
    return;
  }

  try {
    window.gtag('event', 'purchase', {
      transaction_id: purchaseData.transaction_id,
      value: purchaseData.value,
      currency: purchaseData.currency || 'USD',
      affiliation: purchaseData.affiliation || 'Sogni 360',
      items: purchaseData.items
    });
  } catch (error) {
    console.error('Error tracking purchase:', error);
  }
};

/**
 * Track sign up event
 * @param method - Sign up method (e.g., 'email', 'social')
 */
export const trackSignUp = (method = 'email'): void => {
  if (!GA_ENABLED || !GA_MEASUREMENT_ID || !window.gtag) {
    return;
  }

  try {
    window.gtag('event', 'sign_up', {
      method: method
    });
  } catch (error) {
    console.error('Error tracking sign_up:', error);
  }
};

/**
 * Track login event
 * @param method - Login method (e.g., 'email', 'social')
 */
export const trackLogin = (method = 'email'): void => {
  if (!GA_ENABLED || !GA_MEASUREMENT_ID || !window.gtag) {
    return;
  }

  try {
    window.gtag('event', 'login', {
      method: method
    });
  } catch (error) {
    console.error('Error tracking login:', error);
  }
};

interface GenerateContentParams {
  content_type?: string;
  item_id?: string;
  method?: string;
  value?: number;
}

/**
 * Track when user generates AI content
 */
export const trackGenerateContent = (params: GenerateContentParams): void => {
  if (!GA_ENABLED || !GA_MEASUREMENT_ID || !window.gtag) {
    return;
  }

  try {
    window.gtag('event', 'generate_content', {
      content_type: params.content_type || 'ai_image',
      item_id: params.item_id,
      method: params.method || 'unknown',
      value: params.value || 1
    });
  } catch (error) {
    console.error('Error tracking generate_content:', error);
  }
};

/**
 * Track when user shares content
 * @param method - Share method (e.g., 'social', 'link', 'download')
 * @param contentType - Type of content shared
 * @param itemId - Optional item identifier
 */
export const trackShare = (
  method: string,
  contentType = 'ai_image',
  itemId: string | null = null
): void => {
  if (!GA_ENABLED || !GA_MEASUREMENT_ID || !window.gtag) {
    return;
  }

  try {
    const params: Record<string, unknown> = {
      method: method,
      content_type: contentType
    };

    if (itemId) {
      params.item_id = itemId;
    }

    window.gtag('event', 'share', params);
  } catch (error) {
    console.error('Error tracking share:', error);
  }
};

/**
 * Track when user selects content/style
 */
export const trackSelectContent = (contentType: string, itemId: string): void => {
  if (!GA_ENABLED || !GA_MEASUREMENT_ID || !window.gtag) {
    return;
  }

  try {
    window.gtag('event', 'select_content', {
      content_type: contentType,
      item_id: itemId
    });
  } catch (error) {
    console.error('Error tracking select_content:', error);
  }
};

/**
 * Track when user encounters out of credits (generate_lead)
 * This is a key conversion funnel entry point
 */
export const trackOutOfCredits = (trigger = 'unknown'): void => {
  if (!GA_ENABLED || !GA_MEASUREMENT_ID || !window.gtag) {
    return;
  }

  try {
    window.gtag('event', 'generate_lead', {
      value: 1,
      currency: 'USD',
      lead_source: 'out_of_credits',
      trigger: trigger
    });
  } catch (error) {
    console.error('Error tracking generate_lead:', error);
  }
};

/**
 * Track when user downloads content
 * @param count - Number of items downloaded
 * @param contentType - Type of content (image, video)
 * @param format - File format
 */
export const trackDownload = (
  count = 1,
  contentType = 'image',
  format = 'png'
): void => {
  if (!GA_ENABLED || !GA_MEASUREMENT_ID || !window.gtag) {
    return;
  }

  try {
    window.gtag('event', 'download', {
      content_type: contentType,
      item_count: count,
      file_format: format
    });
  } catch (error) {
    console.error('Error tracking download:', error);
  }
};

/**
 * Track engagement time and interaction depth
 */
export const trackEngagement = (
  durationSeconds: number,
  engagementType = 'general'
): void => {
  if (!GA_ENABLED || !GA_MEASUREMENT_ID || !window.gtag) {
    return;
  }

  try {
    window.gtag('event', 'user_engagement', {
      engagement_time_msec: durationSeconds * 1000,
      engagement_type: engagementType
    });
  } catch (error) {
    console.error('Error tracking user_engagement:', error);
  }
};

// Session tracking utilities

const getSessionGenerationCount = (): number => {
  try {
    const count = sessionStorage.getItem('sogni360_session_generation_count');
    return count ? parseInt(count, 10) : 0;
  } catch {
    return 0;
  }
};

const incrementSessionGenerationCount = (): number => {
  try {
    const currentCount = getSessionGenerationCount();
    const newCount = currentCount + 1;
    sessionStorage.setItem('sogni360_session_generation_count', newCount.toString());
    return newCount;
  } catch {
    return 1;
  }
};

interface AngleGenerationParams {
  angle_count: number;
  preset_name?: string;
  source?: string;
  is_regeneration?: boolean;
}

/**
 * Track when user generates camera angles
 * This is specific to Sogni 360's multi-angle generation
 */
export const trackAngleGeneration = (params: AngleGenerationParams): void => {
  if (!GA_ENABLED || !GA_MEASUREMENT_ID || !window.gtag) {
    return;
  }

  try {
    const sessionGenerationCount = incrementSessionGenerationCount();

    window.gtag('event', 'generate_angles', {
      angle_count: params.angle_count || 1,
      preset_name: params.preset_name || 'custom',
      source: params.source || 'upload',
      is_regeneration: params.is_regeneration || false,
      session_generation_count: sessionGenerationCount
    });

    // Also track as standard generate_content
    trackGenerateContent({
      content_type: 'camera_angles',
      item_id: params.preset_name || 'custom',
      method: params.source || 'upload',
      value: params.angle_count || 1
    });

    // Track milestone events
    if (sessionGenerationCount === 3) {
      window.gtag('event', 'power_user_3_generations', { generation_count: 3 });
    } else if (sessionGenerationCount === 5) {
      window.gtag('event', 'power_user_5_generations', { generation_count: 5 });
    } else if (sessionGenerationCount === 10) {
      window.gtag('event', 'power_user_10_generations', { generation_count: 10 });
    }
  } catch (error) {
    console.error('Error tracking angle generation:', error);
  }
};

interface TransitionGenerationParams {
  transition_count: number;
  total_frames?: number;
}

/**
 * Track when user generates video transitions
 */
export const trackTransitionGeneration = (params: TransitionGenerationParams): void => {
  if (!GA_ENABLED || !GA_MEASUREMENT_ID || !window.gtag) {
    return;
  }

  try {
    window.gtag('event', 'generate_transitions', {
      transition_count: params.transition_count || 1,
      total_frames: params.total_frames || 0
    });
  } catch (error) {
    console.error('Error tracking transition generation:', error);
  }
};

/**
 * Track when user exports the final video
 */
export const trackVideoExport = (format = 'mp4', duration = 0): void => {
  if (!GA_ENABLED || !GA_MEASUREMENT_ID || !window.gtag) {
    return;
  }

  try {
    window.gtag('event', 'export_video', {
      file_format: format,
      duration_seconds: duration
    });
  } catch (error) {
    console.error('Error tracking video export:', error);
  }
};

/**
 * Track preset selection
 */
export const trackPresetSelection = (presetName: string): void => {
  if (!GA_ENABLED || !GA_MEASUREMENT_ID || !window.gtag) {
    return;
  }

  try {
    window.gtag('event', 'select_preset', {
      preset_name: presetName
    });
  } catch (error) {
    console.error('Error tracking preset selection:', error);
  }
};

/**
 * Get session statistics
 */
export const getSessionStats = (): { generationCount: number } => {
  return {
    generationCount: getSessionGenerationCount()
  };
};
