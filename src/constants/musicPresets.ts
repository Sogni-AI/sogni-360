/**
 * Preset music tracks for transition videos
 * These are hosted on Sogni's R2 CDN
 */

// Base URL for Sogni assets
const ASSET_BASE_URL = 'https://cdn.sogni.ai';

export interface MusicTrack {
  id: string;
  title: string;
  url: string;
  duration: string;
  category: 'winter' | 'halloween';
}

// Winter tracks
const WINTER_TRACKS: MusicTrack[] = [
  {
    id: 'winter-render-riot',
    title: 'Winter Render Riot',
    url: `${ASSET_BASE_URL}/music/Winter%2005%20-%20Winter%20Render%20Riot.mp3`,
    duration: '3:30',
    category: 'winter'
  },
  {
    id: 'sogni-swing',
    title: 'Sogni Swing',
    url: `${ASSET_BASE_URL}/music/Winter%2004%20-%20Sogni%20Swing.mp3`,
    duration: '2:45',
    category: 'winter'
  },
  {
    id: 'this-season',
    title: 'This Season (Winter Theme)',
    url: `${ASSET_BASE_URL}/music/Winter%2002%20-%20This%20Season%20(Sogni%20Winter%20Theme).mp3`,
    duration: '3:24',
    category: 'winter'
  },
  {
    id: 'slothi-snowflow',
    title: 'Slothi on the Snowflow',
    url: `${ASSET_BASE_URL}/music/Winter%2001%20-%20Slothi%20on%20the%20Snowflow.mp3`,
    duration: '2:58',
    category: 'winter'
  },
  {
    id: 'trapped-photobooth',
    title: 'Trapped in the Photobooth',
    url: `${ASSET_BASE_URL}/music/Winter%2003%20-%20Trapped%20in%20the%20Photobooth%20Part%201.mp3`,
    duration: '3:12',
    category: 'winter'
  },
  {
    id: 'winter-render-things',
    title: 'My Winter Render Things',
    url: `${ASSET_BASE_URL}/music/Winter%2006%20-%20My%20Winter%20Render%20Things.mp3`,
    duration: '2:52',
    category: 'winter'
  }
];

// Halloween tracks
const HALLOWEEN_TRACKS: MusicTrack[] = [
  {
    id: 'render-bash',
    title: 'Render Bash',
    url: `${ASSET_BASE_URL}/music/10_bash_unstable_(reprise).mp3`,
    duration: '1:30',
    category: 'halloween'
  },
  {
    id: 'sogni-smash',
    title: 'Sogni Smash',
    url: `${ASSET_BASE_URL}/music/04_sogni_smash.mp3`,
    duration: '3:42',
    category: 'halloween'
  },
  {
    id: 'can-i-get-render',
    title: 'Can I Get a Render?',
    url: `${ASSET_BASE_URL}/music/02_can_i_get_a_render.mp3`,
    duration: '2:32',
    category: 'halloween'
  },
  {
    id: 'spice-must-flow',
    title: 'Spice Must Flow',
    url: `${ASSET_BASE_URL}/music/01_spice_must_flow_(acapella).mp3`,
    duration: '4:41',
    category: 'halloween'
  },
  {
    id: 'power-to-earn',
    title: 'Power to Earn',
    url: `${ASSET_BASE_URL}/music/03_Aint_No_Slop_in_My_Code.mp3`,
    duration: '4:14',
    category: 'halloween'
  },
  {
    id: 'slothi-booth',
    title: 'Slothi in the Booth',
    url: `${ASSET_BASE_URL}/music/00_Slothi_in_the_booth.mp3`,
    duration: '2:31',
    category: 'halloween'
  },
  {
    id: 'we-spark-again',
    title: 'We Spark Again',
    url: `${ASSET_BASE_URL}/music/05_we_spark_again.mp3`,
    duration: '3:01',
    category: 'halloween'
  },
  {
    id: 'decentralized',
    title: 'Decentralized',
    url: `${ASSET_BASE_URL}/music/07_decentralized.mp3`,
    duration: '2:59',
    category: 'halloween'
  },
  {
    id: '40k-sparks',
    title: '40k Sparks',
    url: `${ASSET_BASE_URL}/music/06_40k_sparks.mp3`,
    duration: '3:40',
    category: 'halloween'
  },
  {
    id: 'room-where-renders',
    title: 'In the Room Where It Renders',
    url: `${ASSET_BASE_URL}/music/08_in_the_room_where_it_renders.mp3`,
    duration: '4:21',
    category: 'halloween'
  }
];

// Combined preset list
export const MUSIC_PRESETS: MusicTrack[] = [...WINTER_TRACKS, ...HALLOWEEN_TRACKS];

// Export by category for potential future use
export { WINTER_TRACKS, HALLOWEEN_TRACKS };
