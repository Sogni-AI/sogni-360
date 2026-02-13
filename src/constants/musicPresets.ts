/**
 * Preset music tracks for transition videos
 * These are hosted on Sogni's R2 CDN
 */

// Base URL for Sogni assets
const ASSET_BASE_URL = 'https://cdn.sogni.ai';
const S2V_ASSET_BASE_URL = 'https://cdn.sogni.ai';

export interface MusicTrack {
  id: string;
  title: string;
  url: string;
  duration: string;
  category: 's2v' | 'winter' | 'halloween';
  emoji?: string;
}

// Sound-to-Video sample tracks (from Photobooth S2V workflow)
const S2V_TRACKS: MusicTrack[] = [
  {
    id: 'grandpa-on-retro',
    title: 'Grandpa on Retro',
    emoji: '🎸',
    url: `${S2V_ASSET_BASE_URL}/audio-samples/grandpa-on-retro.m4a`,
    duration: '0:35',
    category: 's2v'
  },
  {
    id: 'hank-hill-hotdog',
    title: 'Hank Hill Hotdog',
    emoji: '🌭',
    url: `${S2V_ASSET_BASE_URL}/audio-samples/hank-hill-hotdog.m4a`,
    duration: '0:42',
    category: 's2v'
  },
  {
    id: 'ylvis-the-fox',
    title: 'Ylvis The Fox',
    emoji: '🦊',
    url: `${S2V_ASSET_BASE_URL}/audio-samples/ylvis-the-fox.m4a`,
    duration: '0:32',
    category: 's2v'
  },
  {
    id: 'look-at-that-cat',
    title: 'Look at That Cat',
    emoji: '🐱',
    url: `${S2V_ASSET_BASE_URL}/audio-samples/look-at-that-cat.m4a`,
    duration: '0:45',
    category: 's2v'
  },
  {
    id: 'im-a-snake',
    title: "I'm a Snake",
    emoji: '🐍',
    url: `${S2V_ASSET_BASE_URL}/audio-samples/im-a-snake.m4a`,
    duration: '1:03',
    category: 's2v'
  },
  {
    id: 'mii-theme-trap-remix',
    title: 'Mii Theme Trap Remix',
    emoji: '🎮',
    url: `${S2V_ASSET_BASE_URL}/audio-samples/mii-theme-trap-remix.m4a`,
    duration: '0:31',
    category: 's2v'
  },
  {
    id: 'have-you-ever-had-a-dream',
    title: 'Have You Ever Had a Dream',
    emoji: '💭',
    url: `${S2V_ASSET_BASE_URL}/audio-samples/have-you-ever-had-a-dream.m4a`,
    duration: '0:19',
    category: 's2v'
  },
  {
    id: 'louis-theroux-jiggle-giggle',
    title: 'Louis Theroux Jiggle Giggle',
    emoji: '🕺',
    url: `${S2V_ASSET_BASE_URL}/audio-samples/louis-theroux-jiggle-giggle.m4a`,
    duration: '0:22',
    category: 's2v'
  },
  {
    id: 'jet-2-holiday-jingle',
    title: 'Jet 2 Holiday Jingle',
    emoji: '✈️',
    url: `${S2V_ASSET_BASE_URL}/audio-samples/jet-2-holiday-jingle.m4a`,
    duration: '0:13',
    category: 's2v'
  },
  {
    id: 'beez-in-the-trap',
    title: 'Beez in the Trap',
    emoji: '🐝',
    url: `${S2V_ASSET_BASE_URL}/audio-samples/beez-in-the-trap.m4a`,
    duration: '0:22',
    category: 's2v'
  },
  {
    id: 'about-you',
    title: 'About You',
    emoji: '💕',
    url: `${S2V_ASSET_BASE_URL}/audio-samples/about-you.m4a`,
    duration: '1:17',
    category: 's2v'
  },
  {
    id: 'all-eyes-on-me',
    title: 'All Eyes on Me',
    emoji: '👀',
    url: `${S2V_ASSET_BASE_URL}/audio-samples/all-eyes-on-me.m4a`,
    duration: '0:32',
    category: 's2v'
  },
  {
    id: 'eclipse-philosophy',
    title: 'Eclipse Philosophy',
    emoji: '🌑',
    url: `${S2V_ASSET_BASE_URL}/audio-samples/eclipse-philosophy.m4a`,
    duration: '0:45',
    category: 's2v'
  },
  {
    id: 'big-bad-john',
    title: 'Big Bad John',
    emoji: '💪',
    url: `${S2V_ASSET_BASE_URL}/audio-samples/big-bad-john.m4a`,
    duration: '0:58',
    category: 's2v'
  },
  {
    id: 'brutus',
    title: 'Brutus',
    emoji: '🗡️',
    url: `${S2V_ASSET_BASE_URL}/audio-samples/brutus.m4a`,
    duration: '1:07',
    category: 's2v'
  },
  {
    id: 'mic-check',
    title: 'Mic Check',
    emoji: '🎤',
    url: `${S2V_ASSET_BASE_URL}/audio-samples/mic-check.m4a`,
    duration: '1:01',
    category: 's2v'
  },
  {
    id: 'down-with-the-sickness',
    title: 'Down with the Sickness',
    emoji: '🤘',
    url: `${S2V_ASSET_BASE_URL}/audio-samples/down-with-the-sickness.m4a`,
    duration: '0:59',
    category: 's2v'
  },
  {
    id: 'dtmf',
    title: 'DTMF',
    emoji: '📞',
    url: `${S2V_ASSET_BASE_URL}/audio-samples/dtmf.m4a`,
    duration: '0:33',
    category: 's2v'
  },
  {
    id: 'good-places',
    title: 'Good Places',
    emoji: '🌴',
    url: `${S2V_ASSET_BASE_URL}/audio-samples/good-places.m4a`,
    duration: '0:59',
    category: 's2v'
  },
  {
    id: 'hitchhiker-11',
    title: 'Hitchhiker 11',
    emoji: '👽',
    url: `${S2V_ASSET_BASE_URL}/audio-samples/hitchhiker-11.m4a`,
    duration: '1:02',
    category: 's2v'
  },
  {
    id: 'kill-jill',
    title: 'Kill Jill',
    emoji: '🔥',
    url: `${S2V_ASSET_BASE_URL}/audio-samples/kill-jill.m4a`,
    duration: '0:28',
    category: 's2v'
  },
  {
    id: 'once-in-a-lifetime',
    title: 'Once in a Lifetime',
    emoji: '🌊',
    url: `${S2V_ASSET_BASE_URL}/audio-samples/once-in-a-lifetime.m4a`,
    duration: '0:41',
    category: 's2v'
  },
  {
    id: 'panda',
    title: 'Panda',
    emoji: '🐼',
    url: `${S2V_ASSET_BASE_URL}/audio-samples/panda.m4a`,
    duration: '0:44',
    category: 's2v'
  },
  {
    id: 'peter-pan',
    title: 'Peter Pan',
    emoji: '🧚',
    url: `${S2V_ASSET_BASE_URL}/audio-samples/peter-pan.m4a`,
    duration: '0:51',
    category: 's2v'
  },
  {
    id: 'suff-gucci',
    title: 'Suff Gucci',
    emoji: '💰',
    url: `${S2V_ASSET_BASE_URL}/audio-samples/suff-gucci.m4a`,
    duration: '0:23',
    category: 's2v'
  },
  {
    id: 'terrorize-my-heart',
    title: 'Terrorize My Heart',
    emoji: '💔',
    url: `${S2V_ASSET_BASE_URL}/audio-samples/terrorize-my-heart.m4a`,
    duration: '1:06',
    category: 's2v'
  },
  {
    id: 'thats-all-right',
    title: "That's All Right",
    emoji: '👍',
    url: `${S2V_ASSET_BASE_URL}/audio-samples/thats-all-right.m4a`,
    duration: '0:48',
    category: 's2v'
  },
  {
    id: 'trouble',
    title: 'Trouble',
    emoji: '😈',
    url: `${S2V_ASSET_BASE_URL}/audio-samples/trouble.m4a`,
    duration: '0:45',
    category: 's2v'
  },
  {
    id: 'turn-it-down-for-what',
    title: 'Turn It Down for What',
    emoji: '🔊',
    url: `${S2V_ASSET_BASE_URL}/audio-samples/turn-it-down-for-what.m4a`,
    duration: '0:39',
    category: 's2v'
  },
  {
    id: 'welcome-to-derry',
    title: 'Welcome to Derry',
    emoji: '🎈',
    url: `${S2V_ASSET_BASE_URL}/audio-samples/welcome-to-derry.m4a`,
    duration: '1:05',
    category: 's2v'
  },
  {
    id: 'who-put-the-bomb',
    title: 'Who Put the Bomb',
    emoji: '💣',
    url: `${S2V_ASSET_BASE_URL}/audio-samples/who-put-the-bomb.m4a`,
    duration: '0:48',
    category: 's2v'
  },
  {
    id: 'tokyo-drift',
    title: 'Tokyo Drift',
    emoji: '🏎️',
    url: `${S2V_ASSET_BASE_URL}/audio-samples/tokyo-drift.m4a`,
    duration: '0:42',
    category: 's2v'
  },
  {
    id: '6-feet',
    title: '6 Feet',
    emoji: '🎵',
    url: `${S2V_ASSET_BASE_URL}/audio-samples/6-feet.m4a`,
    duration: '0:28',
    category: 's2v'
  },
  {
    id: '8-ball',
    title: '8 Ball',
    emoji: '🎱',
    url: `${S2V_ASSET_BASE_URL}/audio-samples/8-ball.m4a`,
    duration: '0:21',
    category: 's2v'
  },
  {
    id: 'fast-as-f',
    title: 'Fast as F',
    emoji: '⚡',
    url: `${S2V_ASSET_BASE_URL}/audio-samples/fast-as-f.m4a`,
    duration: '0:16',
    category: 's2v'
  },
  {
    id: 'hoist-the-colors',
    title: 'Hoist the Colors',
    emoji: '🏴‍☠️',
    url: `${S2V_ASSET_BASE_URL}/audio-samples/hoist-the-colors.m4a`,
    duration: '0:29',
    category: 's2v'
  },
  {
    id: 'hurricane-katrina',
    title: 'Hurricane Katrina',
    emoji: '🌀',
    url: `${S2V_ASSET_BASE_URL}/audio-samples/hurrican-katrina.m4a`,
    duration: '0:24',
    category: 's2v'
  },
  {
    id: 'kitty-bed',
    title: 'Kitty Bed',
    emoji: '🐱',
    url: `${S2V_ASSET_BASE_URL}/audio-samples/kitty-bed.m4a`,
    duration: '0:18',
    category: 's2v'
  },
  {
    id: 'listen-to-me-now',
    title: 'Listen to Me Now',
    emoji: '👂',
    url: `${S2V_ASSET_BASE_URL}/audio-samples/listen-to-me-now.m4a`,
    duration: '0:10',
    category: 's2v'
  },
  {
    id: 'n-95',
    title: 'N-95',
    emoji: '😷',
    url: `${S2V_ASSET_BASE_URL}/audio-samples/n-95.m4a`,
    duration: '0:17',
    category: 's2v'
  },
  {
    id: 'noone-is-going-to-know',
    title: 'No One is Going to Know',
    emoji: '🤫',
    url: `${S2V_ASSET_BASE_URL}/audio-samples/noone-is-going-to-know.m4a`,
    duration: '0:24',
    category: 's2v'
  },
  {
    id: 'o-fortuna',
    title: 'O Fortuna',
    emoji: '🎭',
    url: `${S2V_ASSET_BASE_URL}/audio-samples/o-fortuna.m4a`,
    duration: '0:31',
    category: 's2v'
  },
  {
    id: 'peter-axel-f',
    title: 'Peter Axel F',
    emoji: '🎹',
    url: `${S2V_ASSET_BASE_URL}/audio-samples/peter-axel-f.m4a`,
    duration: '0:09',
    category: 's2v'
  },
  {
    id: 'priceless',
    title: 'Priceless',
    emoji: '💎',
    url: `${S2V_ASSET_BASE_URL}/audio-samples/priceless.m4a`,
    duration: '0:14',
    category: 's2v'
  },
  {
    id: 'runnin-through-the-6',
    title: 'Runnin Through the 6',
    emoji: '🏃',
    url: `${S2V_ASSET_BASE_URL}/audio-samples/runnin-through-the-6.m4a`,
    duration: '0:16',
    category: 's2v'
  },
  {
    id: 'runnin-up-that-hill',
    title: 'Runnin Up That Hill',
    emoji: '⛰️',
    url: `${S2V_ASSET_BASE_URL}/audio-samples/runnin-up-that-hill.m4a`,
    duration: '1:10',
    category: 's2v'
  },
  {
    id: 'spider-man-2099',
    title: 'Spider-Man 2099',
    emoji: '🕷️',
    url: `${S2V_ASSET_BASE_URL}/audio-samples/spider-man-2099.m4a`,
    duration: '0:29',
    category: 's2v'
  },
  {
    id: 'surround-sound',
    title: 'Surround Sound',
    emoji: '🔊',
    url: `${S2V_ASSET_BASE_URL}/audio-samples/surrond-sound.m4a`,
    duration: '0:24',
    category: 's2v'
  }
];

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

// Combined preset list - S2V samples first, then batch transition music
export const MUSIC_PRESETS: MusicTrack[] = [...S2V_TRACKS, ...WINTER_TRACKS, ...HALLOWEEN_TRACKS];

// Export by category for potential future use
export { S2V_TRACKS, WINTER_TRACKS, HALLOWEEN_TRACKS };
