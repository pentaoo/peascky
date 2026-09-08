const STORAGE_KEY = "pocket-jam.project.v1";
const LEGACY_STORAGE_KEY = "piski.project.v1";

export const TRACKS = [
  { id: "kick", name: "Kick", color: "#ff9c61", key: "A" },
  { id: "snare", name: "Snare", color: "#ff69b4", key: "S" },
  { id: "hat", name: "Hat", color: "#d8fbff", key: "D" },
  { id: "bass", name: "Bass", color: "#8c79ff", key: "F" },
];

export const PRESETS = {
  minimal: {
    name: "Minimal",
    note: "A patient pocket with room to play.",
    bpm: 112,
    patterns: {
      kick: [1,0,0,0, 0,0,1,0, 1,0,0,0, 0,0,1,0],
      snare:[0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
      hat:  [.55,0,.42,0, .55,0,.42,0, .55,0,.42,0, .55,0,.42,0],
      bass: [1,0,0,0, 0,0,.65,0, 0,0,0,0, .72,0,0,0],
    },
  },
  heavy: {
    name: "Heavy",
    note: "Wide drums and a low, physical pulse.",
    bpm: 126,
    patterns: {
      kick: [1,0,0,.65, 0,0,1,0, 1,0,0,0, 0,.7,1,0],
      snare:[0,0,0,0, 1,0,0,.35, 0,0,0,0, 1,0,.35,0],
      hat:  [.65,0,.5,0, .75,0,.5,.3, .65,0,.5,0, .8,.25,.55,.25],
      bass: [1,0,0,0, 0,.5,1,0, .85,0,0,.4, 0,0,1,0],
    },
  },
  broken: {
    name: "Broken",
    note: "Crooked syncopation, still easy to hold.",
    bpm: 138,
    patterns: {
      kick: [1,0,0,0, 0,.65,0,0, 1,0,0,.7, 0,0,0,0],
      snare:[0,0,.28,0, 1,0,0,0, 0,0,0,.32, 1,0,0,.4],
      hat:  [.7,0,.4,.25, 0,.62,0,.35, .7,0,.25,.48, 0,.7,.3,0],
      bass: [1,0,0,.5, 0,0,0,0, .75,0,.45,0, 0,0,.6,0],
    },
  },
  ambient: {
    name: "Ambient",
    note: "Slow air, soft edges and a long tail.",
    bpm: 86,
    patterns: {
      kick: [.7,0,0,0, 0,0,0,0, .55,0,0,0, 0,0,0,0],
      snare:[0,0,0,0, .42,0,0,0, 0,0,0,0, .36,0,0,0],
      hat:  [.22,0,0,0, 0,0,.2,0, .22,0,0,0, 0,0,.2,0],
      bass: [.7,0,0,0, 0,0,0,0, .58,0,0,0, 0,0,0,0],
    },
  },
};

export function createProject(presetId = "minimal") {
  const preset = PRESETS[presetId];
  return {
    version: 1,
    id: crypto.randomUUID?.() || String(Date.now()),
    name: `${preset.name} sketch`,
    source: "manual",
    presetId,
    bpm: preset.bpm,
    steps: 16,
    swing: 0.08,
    updatedAt: new Date().toISOString(),
    tracks: TRACKS.map((track) => ({
      ...track,
      volume: 0.78,
      mute: false,
      pattern: [...preset.patterns[track.id]],
    })),
  };
}

export function applyPreset(project, presetId) {
  const preset = PRESETS[presetId];
  return {
    ...project,
    presetId,
    bpm: preset.bpm,
    updatedAt: new Date().toISOString(),
    tracks: project.tracks.map((track) => ({
      ...track,
      pattern: [...preset.patterns[track.id]],
    })),
  };
}

export function saveProject(project) {
  const next = { ...project, updatedAt: new Date().toISOString() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function loadProject() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    const value = JSON.parse(stored);
    if (value?.version === 1 && !localStorage.getItem(STORAGE_KEY)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    }
    return value?.version === 1 ? value : null;
  } catch {
    return null;
  }
}
