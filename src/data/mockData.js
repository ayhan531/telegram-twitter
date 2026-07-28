// Clean initial state without fake mock data as requested by user
export const INITIAL_ACCOUNTS = [];

export const INITIAL_SYNC_RULES = [];

export const INITIAL_SCHEDULED_POSTS = [];

export const INITIAL_HASHTAG_PRESETS = [
  { id: 'h-1', name: 'Genel', tags: ['#Teknoloji', '#Gündem'] }
];

export const INITIAL_LOGS = [];

// Helper to load or initialize LocalStorage
export function getStoredData(key, fallback) {
  try {
    const item = localStorage.getItem(`omnisync_${key}`);
    return item ? JSON.parse(item) : fallback;
  } catch (e) {
    console.error(`Error loading key ${key}`, e);
    return fallback;
  }
}

export function saveStoredData(key, value) {
  try {
    localStorage.setItem(`omnisync_${key}`, JSON.stringify(value));
  } catch (e) {
    console.error(`Error saving key ${key}`, e);
  }
}
