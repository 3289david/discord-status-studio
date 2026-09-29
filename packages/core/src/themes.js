// One-click theme presets. `accent` also tints the preview card in the UI.
import { normalizePresence } from './presence.js';

const t = (id, emoji, name, description, accent, presence) => ({
  id,
  emoji,
  name,
  description,
  accent,
  presence: normalizePresence(presence),
});

export const THEMES = [
  t('developer', '🖥️', 'Developer', '개발자 기본', '#5865f2', {
    name: 'Coding Mode', details: '⚡ Building something cool', state: '⌨️ Currently coding',
    largeImage: '💻', largeText: 'Coding', smallImage: '🟢', smallText: 'Online', timestamps: { mode: 'session' },
    customStatus: { emoji: '⚡', text: 'Coding mode' },
  }),
  t('gamer', '🎮', 'Gamer', '게이머 감성', '#ed4245', {
    name: 'Gaming', details: '🎮 In the zone', state: 'Carrying the team', type: 0,
    largeImage: '🎮', largeText: 'Game on', smallImage: '🔥', smallText: 'On fire', timestamps: { mode: 'session' },
    customStatus: { emoji: '🎮', text: 'gaming, dm later' },
  }),
  t('minimal', '🌙', 'Minimal', '깔끔하고 조용하게', '#949ba4', {
    name: 'Coding', details: '⌨️ Coding', state: 'Building something', timestamps: { mode: 'none' },
    customStatus: { emoji: '', text: 'building something' },
  }),
  t('premium', '💎', 'Premium', '고급스러운 톤', '#f0b232', {
    name: 'Studio', details: '💎 Crafting quality', state: 'Detail matters', largeImage: '💎', largeText: 'Premium',
    smallImage: '✨', smallText: 'Polished', timestamps: { mode: 'session' },
    customStatus: { emoji: '💎', text: 'crafting quality' },
  }),
  t('webdev', '🌐', 'Web Developer', '웹 개발자', '#00a8fc', {
    name: 'Web Development', details: '🌐 Shipping to production', state: 'HTML · CSS · JS', largeImage: '🌐',
    largeText: 'Web', smallImage: '⚡', smallText: 'Fast', buttons: [{ label: '🌐 Website', url: 'https://example.com' }],
    timestamps: { mode: 'session' }, customStatus: { emoji: '🌐', text: 'shipping websites' },
  }),
  t('music', '🎵', 'Music', '음악 감상', '#1db954', {
    name: 'Music', type: 2, details: '🎵 Vibing to music', state: 'Lost in the sound', largeImage: '🎧',
    largeText: 'Headphones on', smallImage: '🎵', smallText: 'Now playing', timestamps: { mode: 'session' },
    customStatus: { emoji: '🎧', text: 'headphones on' },
  }),
  t('study', '📚', 'Study', '공부 모드', '#57f287', {
    name: 'Study Session', details: '📚 Studying', state: 'Focus mode on', largeImage: '📚', largeText: 'Study',
    smallImage: '🍅', smallText: 'Pomodoro', timestamps: { mode: 'countdown', minutes: 50 },
    customStatus: { emoji: '📚', text: 'studying — do not disturb' }, userStatus: 'dnd',
  }),
  t('glass', '🧊', 'Glass', '투명하고 차가운', '#a5f3fc', {
    name: 'Glass', details: '🧊 clear mind', state: 'transparent thoughts', largeImage: '🧊', largeText: 'glass',
    smallImage: '💠', smallText: 'calm', timestamps: { mode: 'none' }, customStatus: { emoji: '🧊', text: 'clear mind' },
  }),
  t('dark', '🖤', 'Dark', '어두운 감성', '#23272a', {
    name: 'Night', details: '🖤 In the dark', state: 'quiet hours', largeImage: '🖤', largeText: 'dark mode',
    smallImage: '🌑', smallText: 'new moon', timestamps: { mode: 'session' }, customStatus: { emoji: '🖤', text: 'quiet hours' },
  }),
  t('apple', '🍎', 'Apple', '애플 스타일 미니멀', '#f5f5f7', {
    name: 'Think Different', details: 'Designed with care', state: 'Simple. Beautiful.', largeImage: '🍎',
    largeText: 'Think different', timestamps: { mode: 'none' }, customStatus: { emoji: '', text: 'Designed with care.' },
  }),
  t('ai', '🤖', 'AI', 'AI/ML 개발', '#d97757', {
    name: 'AI Lab', details: '🤖 Training models', state: 'Prompting the future', largeImage: '🤖',
    largeText: 'AI', smallImage: '🧠', smallText: 'Thinking', timestamps: { mode: 'session' },
    customStatus: { emoji: '🤖', text: 'talking to AI' },
  }),
  t('cyber', '🔥', 'Cyber', '사이버펑크', '#ff2d95', {
    name: 'CYBER', details: '> SYSTEM ONLINE_', state: '[ hacking the mainframe ]', largeImage: '🔥',
    largeText: 'cyber', smallImage: '⚡', smallText: 'overclocked', timestamps: { mode: 'clock' },
    customStatus: { emoji: '🔥', text: 'system online' },
  }),
  t('afk', '💤', 'AFK', '자리 비움', '#80848e', {
    name: 'AFK', details: '💤 Away from keyboard', state: 'Back soon', largeImage: '💤', largeText: 'AFK',
    timestamps: { mode: 'session' }, userStatus: 'idle', customStatus: { emoji: '💤', text: 'afk' },
  }),
  t('sleep', '😴', 'Sleeping', '수면 중', '#4e5d94', {
    name: 'Sleeping', details: '😴 Sleeping', state: 'Recharging batteries', largeImage: '🌙', largeText: 'Good night',
    timestamps: { mode: 'session' }, userStatus: 'idle', customStatus: { emoji: '😴', text: 'sleeping' },
  }),
  t('work', '💼', 'Work', '업무 중', '#3ba55c', {
    name: 'Work', details: '💼 At work', state: 'Busy — reply later', largeImage: '💼', largeText: 'Work',
    timestamps: { mode: 'session' }, userStatus: 'dnd', customStatus: { emoji: '💼', text: 'at work' },
  }),
  t('stream', '📺', 'Streamer', '방송 중', '#9146ff', {
    name: 'Live', details: '🔴 LIVE now', state: 'Come hang out!', largeImage: '📺', largeText: 'Live',
    smallImage: '🔴', smallText: 'On air', buttons: [{ label: '📺 Watch', url: 'https://twitch.tv' }],
    timestamps: { mode: 'session' }, customStatus: { emoji: '🔴', text: 'LIVE' },
  }),
  t('design', '🎨', 'Designer', '디자인 작업', '#eb459e', {
    name: 'Design', details: '🎨 Designing', state: 'Pushing pixels', largeImage: '🎨', largeText: 'Design',
    smallImage: '✏️', smallText: 'Sketching', timestamps: { mode: 'session' }, customStatus: { emoji: '🎨', text: 'pushing pixels' },
  }),
  t('video', '🎬', 'Video Editor', '영상 편집', '#ff7a45', {
    name: 'Editing', details: '🎬 Editing a video', state: 'Rendering dreams', largeImage: '🎬', largeText: 'Editing',
    smallImage: '✂️', smallText: 'Cutting', timestamps: { mode: 'session' }, customStatus: { emoji: '🎬', text: 'editing' },
  }),
  t('gym', '💪', 'Workout', '운동 중', '#faa61a', {
    name: 'Workout', details: '💪 Working out', state: 'No pain, no gain', largeImage: '🏋️', largeText: 'Gym',
    timestamps: { mode: 'session' }, customStatus: { emoji: '💪', text: 'at the gym' },
  }),
  t('anime', '🌸', 'Anime', '애니 감상', '#ff9ecd', {
    name: 'Anime', type: 3, details: '🌸 Watching anime', state: 'One more episode…', largeImage: '🌸',
    largeText: 'Anime', timestamps: { mode: 'session' }, customStatus: { emoji: '🌸', text: 'one more episode' },
  }),
  t('lofi', '☕', 'Lo-fi', '카페 & 로파이', '#c69c6d', {
    name: 'Lo-fi', type: 2, details: '☕ lo-fi beats to relax to', state: 'rain on the window', largeImage: '☕',
    largeText: 'cozy', smallImage: '🌧️', smallText: 'rainy', timestamps: { mode: 'none' }, customStatus: { emoji: '☕', text: 'cozy mode' },
  }),
  t('latenight', '🌃', 'Late Night', '새벽 코딩', '#7289da', {
    name: 'Late Night', details: '🌙 Late night coding', state: 'One more commit…', largeImage: '🌃', largeText: '3 AM',
    smallImage: '☕', smallText: 'Coffee #4', timestamps: { mode: 'clock' }, customStatus: { emoji: '🌙', text: 'late night coding' },
  }),
];

export function getTheme(id) {
  return THEMES.find((x) => x.id === id);
}
