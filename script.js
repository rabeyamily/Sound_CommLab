// Core game data used to render each round UI and scoring outcome.
const rounds = [
  {
    scene: "Scene 5",
    songs: [
      { label: "Piano Soft Tune", type: "good", points: 30, effect: "The monster shrinks! Harmony is restored." },
      { label: "Loud Guitar Riff", type: "chaos", points: 10, effect: "The monster grows! Chaos feeds it!" },
      { label: "Flipping Pages", type: "medium", points: 20, effect: "The monster hesitates… Try a more powerful tune!" }
    ]
  },
  {
    scene: "Scene 6",
    songs: [
      { label: "Wind Chimes", type: "good", points: 30, effect: "The monster recoils in pain!" },
      { label: "Car Horn", type: "chaos", points: 10, effect: "The monster roars with delight!" },
      { label: "High Pitch Bells", type: "medium", points: 20, effect: "The monster is confused… Choose stronger harmony!" }
    ]
  },
  {
    scene: "Scene 7",
    songs: [
      { label: "Macarena", type: "good", points: 30, effect: "The monster shrivels! Rhythm defeats chaos!" },
      { label: "Loud Rock Music", type: "chaos", points: 10, effect: "The monster absorbs the noise and grows!" },
      { label: "Soda Pop Melody", type: "good", points: 25, effect: "The monster weakens — bright tones pierce the dark!" }
    ]
  }
];

// Runtime state: audio engine references + current game progression.
const state = {
  audioStarted: false,
  audioContext: null,
  masterGain: null,
  sceneAmbientNode: null,
  sceneAmbientCleanup: null,
  currentSceneIndex: -1,
  activeSongCleanup: null,
  activeSongCardId: null,
  roundIndex: 0,
  score: 0,
  playedInRound: new Set(),
  selectedInRound: false,
  revealNextTimer: null,
  storyIndex: 0
};

// Cached DOM references to avoid repeated lookups.
const refs = {
  orbTrigger: document.getElementById("orbTrigger"),
  volumeSlider: document.getElementById("volumeSlider"),
  sceneReplayBtn: document.getElementById("sceneReplayBtn"),
  sceneSection: document.getElementById("scene1"),
  storySceneTitle: document.getElementById("storySceneTitle"),
  storySceneText: document.getElementById("storySceneText"),
  storyPrevBtn: document.getElementById("storyPrevBtn"),
  storyNextBtn: document.getElementById("storyNextBtn"),
  songList: document.getElementById("songList"),
  effectText: document.getElementById("effectText"),
  nextRoundBtn: document.getElementById("nextRoundBtn"),
  scoreValue: document.getElementById("scoreValue"),
  roundLabel: document.getElementById("roundLabel"),
  progressBar: document.getElementById("progressBar"),
  gameSceneTitle: document.getElementById("gameSceneTitle"),
  monsterSvg: document.getElementById("monsterSvg"),
  gameOverlay: document.getElementById("gameOverlay"),
  endingTitle: document.getElementById("endingTitle"),
  endingText: document.getElementById("endingText"),
  endingCard: document.getElementById("endingCard"),
  endingSection: document.getElementById("ending"),
  tryAgainBtn: document.getElementById("tryAgainBtn"),
  navStory: document.getElementById("nav-story"),
  sectionNodes: Array.from(document.querySelectorAll("#landing, #scene1, #game, #ending, #team"))
};

const storyScenes = [
  // Single-page story mode data (scenes 1-4) with visual class mapping.
  {
    title: "Scene I",
    text: "For centuries, it slept… Lying dormant. Waiting. Biding its time.",
    className: "scene--1"
  },
  {
    title: "Scene II",
    text: "But the world grew louder… and harmony began to break.",
    className: "scene--2"
  },
  {
    title: "Scene III",
    text: "Because of this noise, the Sound Demon has awakened!",
    className: "scene--3"
  },
  {
    title: "Scene IV",
    text:
      "You are a Guardian of the Earth. It is your job to protect the world from this Demon. But remember — choose wisely. Some sounds restore harmony, while others feed the monster.",
    className: "scene--4"
  }
];

function logState(eventName, extra = {}) {
  console.log("[SoundGuardian]", eventName, {
    round: state.roundIndex + 1,
    score: state.score,
    selectedInRound: state.selectedInRound,
    ...extra
  });
}

async function ensureAudio() {
  // AudioContext must be created from a user gesture to satisfy browser autoplay policies.
  if (state.audioStarted) return;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) {
    console.warn("Web Audio API not supported in this browser.");
    return;
  }
  state.audioContext = new AudioCtx();
  state.masterGain = state.audioContext.createGain();
  state.masterGain.gain.value = parseFloat(refs.volumeSlider.value);
  state.masterGain.connect(state.audioContext.destination);
  state.audioStarted = true;
  if (state.audioContext.state === "suspended") {
    await state.audioContext.resume();
  }
  logState("audio_initialized");
}

function random(min, max) {
  return Math.random() * (max - min) + min;
}

function createNoiseBuffer(ctx, seconds = 1.5) {
  // Utility buffer for wind/rustle/page/noise-based synthetic effects.
  const len = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

function stopCurrentSceneAmbient() {
  // Each ambient player returns a cleanup function; call it before starting another scene.
  if (state.sceneAmbientCleanup) {
    state.sceneAmbientCleanup();
    state.sceneAmbientCleanup = null;
  }
}

function stopActiveSong() {
  // Ensure only one selectable song plays at a time and reset card UI state.
  if (state.activeSongCleanup) {
    state.activeSongCleanup();
    state.activeSongCleanup = null;
  }
  if (state.activeSongCardId) {
    const card = document.getElementById(state.activeSongCardId);
    if (card) {
      card.querySelectorAll(".sound-btn.play-btn").forEach((b) => b.classList.remove("playing"));
      const eq = card.querySelector(".equalizer");
      if (eq) eq.classList.remove("is-active");
    }
  }
  state.activeSongCardId = null;
}

function playForestAmbient() {
  const ctx = state.audioContext;
  if (!ctx) return () => {};
  const out = ctx.createGain();
  out.gain.value = 0.25;
  out.connect(state.masterGain);

  // Layer 1: low wind drone.
  const drone = ctx.createOscillator();
  const droneGain = ctx.createGain();
  drone.type = "sine";
  drone.frequency.value = 62;
  droneGain.gain.value = 0.14;
  drone.connect(droneGain).connect(out);
  drone.start();

  // Slow frequency wobble to make the wind feel alive.
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.frequency.value = 0.1;
  lfoGain.gain.value = 8;
  lfo.connect(lfoGain).connect(drone.frequency);
  lfo.start();

  // Layer 2: filtered noise bed.
  const noise = ctx.createBufferSource();
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = "lowpass";
  noiseFilter.frequency.value = 520;
  noise.buffer = createNoiseBuffer(ctx, 3);
  noise.loop = true;
  noise.connect(noiseFilter).connect(out);
  noise.start();

  let rustleTimer = null;
  // Layer 3: randomized short rustles.
  const triggerRustle = () => {
    const src = ctx.createBufferSource();
    src.buffer = createNoiseBuffer(ctx, 0.23);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = random(700, 1800);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.045, ctx.currentTime + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.24);
    src.connect(bp).connect(g).connect(out);
    src.start();
    src.stop(ctx.currentTime + 0.26);
    rustleTimer = window.setTimeout(triggerRustle, random(1700, 3900));
  };
  rustleTimer = window.setTimeout(triggerRustle, 650);

  return () => {
    if (rustleTimer) window.clearTimeout(rustleTimer);
    drone.stop();
    lfo.stop();
    noise.stop();
    out.disconnect();
  };
}

function playCityAmbient() {
  const ctx = state.audioContext;
  if (!ctx) return () => {};
  const out = ctx.createGain();
  out.gain.value = 0.22;
  out.connect(state.masterGain);

  // Constant city hiss.
  const base = ctx.createBufferSource();
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 250;
  base.buffer = createNoiseBuffer(ctx, 2.7);
  base.loop = true;
  base.connect(hp).connect(out);
  base.start();

  let notifTimer = null;
  const pingNotes = [880, 988, 740, 1174];
  // Random short "notification" pings.
  const triggerPing = () => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = pingNotes[Math.floor(Math.random() * pingNotes.length)];
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.03, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.21);
    osc.connect(g).connect(out);
    osc.start();
    osc.stop(ctx.currentTime + 0.22);
    notifTimer = window.setTimeout(triggerPing, random(1300, 3200));
  };
  notifTimer = window.setTimeout(triggerPing, 400);

  let beatInterval = null;
  // Repeating kick pulse for mechanical urban rhythm.
  const kick = () => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(145, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(48, ctx.currentTime + 0.09);
    g.gain.setValueAtTime(0.11, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.11);
    osc.connect(g).connect(out);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  };
  kick();
  beatInterval = window.setInterval(kick, 700);

  return () => {
    if (notifTimer) window.clearTimeout(notifTimer);
    if (beatInterval) window.clearInterval(beatInterval);
    base.stop();
    out.disconnect();
  };
}

function playMonsterAwakenAmbient() {
  const ctx = state.audioContext;
  if (!ctx) return () => {};
  const out = ctx.createGain();
  out.gain.value = 0.3;
  out.connect(state.masterGain);

  // Sub-bass rumble that fades in.
  const rumble = ctx.createOscillator();
  const rg = ctx.createGain();
  rumble.type = "sine";
  rumble.frequency.value = 36;
  rg.gain.setValueAtTime(0.001, ctx.currentTime);
  rg.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + 2.2);
  rumble.connect(rg).connect(out);
  rumble.start();

  // One-shot descending growl sweep.
  const growl = ctx.createOscillator();
  const gg = ctx.createGain();
  growl.type = "sawtooth";
  growl.frequency.setValueAtTime(150, ctx.currentTime + 0.7);
  growl.frequency.exponentialRampToValueAtTime(45, ctx.currentTime + 2.4);
  gg.gain.setValueAtTime(0.0001, ctx.currentTime + 0.7);
  gg.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.82);
  gg.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 2.45);
  growl.connect(gg).connect(out);
  growl.start(ctx.currentTime + 0.7);
  growl.stop(ctx.currentTime + 2.5);

  return () => {
    rumble.stop();
    out.disconnect();
  };
}

function scheduleArpeggio(ctx, output, notes, startTime, beat = 0.24) {
  // Small helper used by hero/fanfare style sequences.
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq;
    const t = startTime + i * beat;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.1, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + beat * 0.95);
    osc.connect(g).connect(output);
    osc.start(t);
    osc.stop(t + beat);
  });
}

function playHeroAmbient() {
  const ctx = state.audioContext;
  if (!ctx) return () => {};
  const out = ctx.createGain();
  out.gain.value = 0.25;
  out.connect(state.masterGain);
  // Bright ascending major arpeggio loop.
  const notes = [261.63, 329.63, 392, 523.25, 659.25, 783.99];
  let loopInterval = null;
  scheduleArpeggio(ctx, out, notes, ctx.currentTime + 0.03, 0.24);
  loopInterval = window.setInterval(() => {
    scheduleArpeggio(ctx, out, notes, ctx.currentTime + 0.02, 0.24);
  }, 1600);
  return () => {
    if (loopInterval) window.clearInterval(loopInterval);
    out.disconnect();
  };
}

const sceneAmbientPlayers = [playForestAmbient, playCityAmbient, playMonsterAwakenAmbient, playHeroAmbient];

function renderStoryScene() {
  // Render the active story scene in-place (same section, no page jump).
  const scene = storyScenes[state.storyIndex];
  refs.storySceneTitle.textContent = scene.title;
  refs.storySceneText.textContent = scene.text;
  refs.storyPrevBtn.disabled = state.storyIndex === 0;
  // Last story step becomes the handoff into gameplay.
  refs.storyNextBtn.textContent = state.storyIndex === storyScenes.length - 1 ? "Begin Your Quest" : "Next";
  refs.sceneSection.classList.remove("scene--1", "scene--2", "scene--3", "scene--4");
  refs.sceneSection.classList.add(scene.className);
  if (window.location.hash === "#scene1" && state.audioStarted) {
    startAmbientForScene(state.storyIndex);
  }
  logState("story_scene_changed", { storyIndex: state.storyIndex + 1 });
}

function startAmbientForScene(sceneIndex) {
  // Switch ambient tracks as sections enter view.
  if (!state.audioStarted || !sceneAmbientPlayers[sceneIndex]) return;
  stopCurrentSceneAmbient();
  state.sceneAmbientCleanup = sceneAmbientPlayers[sceneIndex]();
  state.currentSceneIndex = sceneIndex;
  logState("ambient_start", { sceneIndex: sceneIndex + 1 });
}

function buildSongEngine(roundIndex, songIndex) {
  // Builds and starts the selected song synthesizer; returns a stop function.
  const ctx = state.audioContext;
  if (!ctx) return () => {};
  const out = ctx.createGain();
  out.gain.value = 0.38;
  out.connect(state.masterGain);
  const cleanups = [];
  let timers = [];

  function addTimer(fn, delay, interval = false) {
    // Track all timers so they can be reliably stopped on song switch/end.
    const id = interval ? window.setInterval(fn, delay) : window.setTimeout(fn, delay);
    timers.push({ id, interval });
    return id;
  }

  function stopAll() {
    timers.forEach((t) => {
      if (t.interval) window.clearInterval(t.id);
      else window.clearTimeout(t.id);
    });
    timers = [];
    cleanups.forEach((fn) => fn());
    out.disconnect();
  }

  // Round 1 synth profiles.
  if (roundIndex === 0 && songIndex === 0) {
    // GOOD: soft piano-like sine melody in C major with gentle envelope.
    const melody = [261.63, 293.66, 329.63, 392, 329.63, 293.66];
    const beat = 0.52;
    const playLoop = () => {
      melody.forEach((f, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = f;
        const t = ctx.currentTime + i * beat;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.08, t + 0.08);
        g.gain.exponentialRampToValueAtTime(0.0001, t + beat - 0.02);
        osc.connect(g).connect(out);
        osc.start(t);
        osc.stop(t + beat);
      });
    };
    playLoop();
    addTimer(playLoop, melody.length * beat * 1000, true);
  } else if (roundIndex === 0 && songIndex === 1) {
    // CHAOS: sawtooth riff + waveshaper distortion for aggressive timbre.
    const ws = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i += 1) {
      const x = (i * 2) / 255 - 1;
      curve[i] = Math.tanh(x * 4.6);
    }
    ws.curve = curve;
    ws.oversample = "4x";
    // Route through distortion and then master (parallel to dry output path).
    out.connect(ws).connect(state.masterGain);
    const pattern = [110, 146.83, 123.47, 146.83];
    const run = () => {
      pattern.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.value = freq;
        const t = ctx.currentTime + i * 0.28;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
        osc.connect(g).connect(out);
        osc.start(t);
        osc.stop(t + 0.25);
      });
    };
    run();
    addTimer(run, 1200, true);
    cleanups.push(() => ws.disconnect());
  } else if (roundIndex === 0 && songIndex === 2) {
    // MEDIUM: short high-passed noise bursts to imitate page flips.
    const flip = () => {
      const src = ctx.createBufferSource();
      const bp = ctx.createBiquadFilter();
      bp.type = "highpass";
      bp.frequency.value = random(2400, 4300);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.1, ctx.currentTime + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
      src.buffer = createNoiseBuffer(ctx, 0.14);
      src.connect(bp).connect(g).connect(out);
      src.start();
      src.stop(ctx.currentTime + 0.14);
    };
    flip();
    addTimer(flip, 740, true);
  }

  // Round 2 synth profiles.
  if (roundIndex === 1 && songIndex === 0) {
    // GOOD: bell/chime pings using pentatonic notes + feedback delay tail.
    const pent = [523.25, 587.33, 659.25, 783.99, 880];
    const ping = () => {
      const osc = ctx.createOscillator();
      const delay = ctx.createDelay(0.5);
      delay.delayTime.value = 0.28;
      const feedback = ctx.createGain();
      feedback.gain.value = 0.35;
      delay.connect(feedback).connect(delay);
      const dry = ctx.createGain();
      const wet = ctx.createGain();
      dry.gain.value = 0.8;
      wet.gain.value = 0.25;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.11, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.3);
      osc.type = "sine";
      osc.frequency.value = pent[Math.floor(Math.random() * pent.length)];
      osc.connect(g);
      g.connect(dry).connect(out);
      g.connect(delay).connect(wet).connect(out);
      osc.start();
      osc.stop(ctx.currentTime + 1.3);
      cleanups.push(() => delay.disconnect());
    };
    ping();
    addTimer(ping, 650, true);
  } else if (roundIndex === 1 && songIndex === 1) {
    // CHAOS: sustained square-wave horn with low-rate vibrato.
    const horn = ctx.createOscillator();
    const g = ctx.createGain();
    const vib = ctx.createOscillator();
    const vibGain = ctx.createGain();
    horn.type = "square";
    horn.frequency.value = 400;
    vib.frequency.value = 5.6;
    vibGain.gain.value = 12;
    vib.connect(vibGain).connect(horn.frequency);
    g.gain.value = 0.14;
    horn.connect(g).connect(out);
    horn.start();
    vib.start();
    cleanups.push(() => {
      horn.stop();
      vib.stop();
    });
  } else if (roundIndex === 1 && songIndex === 2) {
    // MEDIUM: bright rhythmic triangles with slight detune for tension.
    const notes = [1108.73, 1174.66, 1244.51, 1318.51];
    const ring = () => {
      notes.forEach((f, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.value = f + (i % 2 === 0 ? 0 : 19);
        const t = ctx.currentTime + i * 0.11;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.06, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
        osc.connect(g).connect(out);
        osc.start(t);
        osc.stop(t + 0.21);
      });
    };
    ring();
    addTimer(ring, 820, true);
  }

  // Round 3 synth profiles.
  if (roundIndex === 2 && songIndex === 0) {
    // GOOD: playful bouncy melody inspired by a dance rhythm feel.
    const seq = [329.63, 392, 329.63, 293.66, 261.63, 293.66, 329.63, 261.63];
    const loop = () => {
      seq.forEach((f, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = f;
        const t = ctx.currentTime + i * 0.22;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.09, t + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
        osc.connect(g).connect(out);
        osc.start(t);
        osc.stop(t + 0.21);
      });
    };
    loop();
    addTimer(loop, 1800, true);
  } else if (roundIndex === 2 && songIndex === 1) {
    // CHAOS: rapid distorted saw chord hits for dense "rock" texture.
    const ws = ctx.createWaveShaper();
    const curve = new Float32Array(512);
    for (let i = 0; i < 512; i += 1) {
      const x = (i * 2) / 511 - 1;
      curve[i] = Math.tanh(x * 6.4);
    }
    ws.curve = curve;
    ws.oversample = "4x";
    out.connect(ws).connect(state.masterGain);
    const chord = [110, 138.59, 164.81];
    const hit = () => {
      chord.forEach((f) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.value = f;
        const t = ctx.currentTime;
        g.gain.setValueAtTime(0.001, t);
        g.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
        osc.connect(g).connect(out);
        osc.start(t);
        osc.stop(t + 0.23);
      });
    };
    hit();
    addTimer(hit, 250, true);
    cleanups.push(() => ws.disconnect());
  } else if (roundIndex === 2 && songIndex === 2) {
    // GOOD+: airy arpeggiated major tones for a bubbly synth-pop feel.
    const arp = [392, 493.88, 587.33, 783.99, 587.33, 493.88];
    const play = () => {
      arp.forEach((f, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = f;
        const t = ctx.currentTime + i * 0.18;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.1, t + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);
        osc.connect(g).connect(out);
        osc.start(t);
        osc.stop(t + 0.18);
      });
    };
    play();
    addTimer(play, 1200, true);
  }

  return stopAll;
}

function updateMonsterByType(type) {
  // Visual feedback: harmony shrinks demon, chaos grows it.
  refs.monsterSvg.classList.remove("monster--small", "monster--normal", "monster--large", "monster--defeated", "monster--victorious");
  if (type === "good") refs.monsterSvg.classList.add("monster--small");
  else if (type === "chaos") refs.monsterSvg.classList.add("monster--large");
  else refs.monsterSvg.classList.add("monster--normal");
}

function renderRound() {
  // Rebuild all song cards for current round and attach handlers.
  stopActiveSong();
  if (state.revealNextTimer) {
    window.clearTimeout(state.revealNextTimer);
    state.revealNextTimer = null;
  }
  refs.songList.innerHTML = "";
  refs.effectText.textContent = "";
  refs.nextRoundBtn.classList.add("hidden");
  state.selectedInRound = false;
  state.playedInRound.clear();
  const round = rounds[state.roundIndex];
  refs.gameSceneTitle.textContent = round.scene;
  refs.roundLabel.textContent = `Round ${state.roundIndex + 1} / 3`;
  refs.progressBar.style.width = `${((state.roundIndex + 1) / 3) * 100}%`;
  updateMonsterByType("medium");

  round.songs.forEach((song, songIndex) => {
    // Unique id allows us to reset UI for only the currently playing card.
    const cardId = `song-card-${state.roundIndex}-${songIndex}`;
    const card = document.createElement("article");
    card.id = cardId;
    card.className = "song-card";
    card.innerHTML = `
      <div class="song-head">
        <span class="song-name">${song.label}</span>
        <span>${song.points} pts</span>
      </div>
      <div class="song-buttons">
        <button class="sound-btn play-btn">Play</button>
        <button class="sound-btn stop-btn">Stop</button>
        <button class="sound-btn select-btn" disabled>Select</button>
      </div>
      <div class="equalizer" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span></div>
    `;
    refs.songList.appendChild(card);

    const playBtn = card.querySelector(".play-btn");
    const stopBtn = card.querySelector(".stop-btn");
    const selectBtn = card.querySelector(".select-btn");
    const eq = card.querySelector(".equalizer");

    playBtn.addEventListener("click", async () => {
      await ensureAudio();
      stopActiveSong();
      const cleanup = buildSongEngine(state.roundIndex, songIndex);
      state.activeSongCleanup = cleanup;
      state.activeSongCardId = cardId;
      // Gate "Select" action: player must audition the sound first.
      state.playedInRound.add(songIndex);
      card.dataset.played = "true";
      selectBtn.disabled = false;
      playBtn.classList.add("playing");
      eq.classList.add("is-active");
      logState("song_play", { round: state.roundIndex + 1, song: song.label });
      // Hard cap for per-song playback duration.
      window.setTimeout(() => {
        if (state.activeSongCardId === cardId) stopActiveSong();
      }, 35000);
    });

    stopBtn.addEventListener("click", () => {
      if (state.activeSongCardId === cardId) {
        stopActiveSong();
        logState("song_stop", { round: state.roundIndex + 1, song: song.label });
      }
    });

    selectBtn.addEventListener("click", () => {
      // Selection is valid only after at least one play in this round.
      const playedThisSong = card.dataset.played === "true" || state.playedInRound.has(songIndex);
      if (!playedThisSong || state.selectedInRound) return;
      stopActiveSong();
      state.selectedInRound = true;
      const points = Number(song.points) || 0;
      state.score += points;
      refs.scoreValue.textContent = String(state.score);
      refs.effectText.textContent = song.effect;
      updateMonsterByType(song.type);
      card.querySelectorAll(".sound-btn").forEach((b) => b.classList.add("selected"));
      // Lock all select buttons after one pick to enforce one choice per round.
      refs.songList.querySelectorAll(".select-btn").forEach((btn) => {
        btn.disabled = true;
      });
      logState("song_selected", {
        round: state.roundIndex + 1,
        song: song.label,
        type: song.type,
        points
      });

      // Short pause so the player can read the effect before moving on.
      state.revealNextTimer = window.setTimeout(() => {
        refs.nextRoundBtn.textContent = state.roundIndex === rounds.length - 1 ? "End Game" : "Next Round";
        refs.nextRoundBtn.classList.remove("hidden");
        state.revealNextTimer = null;
      }, 1500);
    });
  });
}

function endGame() {
  // Win threshold from spec: >= 60 out of max 90.
  const won = state.score >= 60;
  refs.endingSection.classList.add("is-visible");
  refs.endingSection.setAttribute("aria-hidden", "false");
  refs.endingCard.classList.remove("win", "lose");
  refs.gameOverlay.classList.remove("is-darkened");

  if (won) {
    // Victory state: demon disappears and ending card goes gold.
    refs.endingCard.classList.add("win");
    refs.endingTitle.textContent = "Congratulations! You have freed the world of the Sound Demon.";
    refs.endingText.textContent = "Harmony rises again across the realm.";
    refs.monsterSvg.classList.remove("monster--small", "monster--normal", "monster--large", "monster--victorious");
    refs.monsterSvg.classList.add("monster--defeated");
  } else {
    // Loss state: demon dominates and game panel darkens for drama.
    refs.endingCard.classList.add("lose");
    refs.endingTitle.textContent = "The world has fallen into chaos. You have lost.";
    refs.endingText.textContent = "The Sound Demon has consumed the last light.";
    refs.monsterSvg.classList.remove("monster--small", "monster--normal", "monster--large", "monster--defeated");
    refs.monsterSvg.classList.add("monster--victorious");
    refs.gameOverlay.classList.add("is-darkened");
  }
  logState("game_end", { won });
  window.location.hash = "#ending";
}

function resetGame() {
  // Reset everything needed for a clean replay from round 1.
  stopActiveSong();
  if (state.revealNextTimer) {
    window.clearTimeout(state.revealNextTimer);
    state.revealNextTimer = null;
  }
  state.roundIndex = 0;
  state.score = 0;
  refs.scoreValue.textContent = "0";
  refs.monsterSvg.classList.remove("monster--small", "monster--large", "monster--defeated", "monster--victorious");
  refs.monsterSvg.classList.add("monster--normal");
  refs.gameOverlay.classList.remove("is-darkened");
  refs.endingSection.classList.remove("is-visible");
  refs.endingSection.setAttribute("aria-hidden", "true");
  refs.endingCard.classList.remove("win", "lose");
  renderRound();
  window.location.hash = "#game";
  logState("game_reset");
}

function setupSceneObserver() {
  // Story section intersection controls nav highlight + active ambient.
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const id = entry.target.id;
        if (id === "scene1") {
          refs.navStory.classList.add("is-story-active");
          startAmbientForScene(state.storyIndex);
        } else {
          refs.navStory.classList.remove("is-story-active");
          if (id !== "game") stopCurrentSceneAmbient();
        }
      });
    },
    { threshold: 0.55 }
  );
  refs.sectionNodes.forEach((el) => observer.observe(el));
}

function setup() {
  // Landing orb initializes audio and starts story flow.
  refs.orbTrigger.addEventListener("click", async () => {
    await ensureAudio();
    window.location.hash = "#scene1";
    startAmbientForScene(0);
    logState("landing_clicked");
  });

  refs.sceneReplayBtn.addEventListener("click", async () => {
    await ensureAudio();
    startAmbientForScene(state.storyIndex);
    logState("scene_replay", { sceneIndex: state.storyIndex + 1 });
  });

  refs.storyPrevBtn.addEventListener("click", async () => {
    if (state.storyIndex <= 0) return;
    state.storyIndex -= 1;
    renderStoryScene();
    await ensureAudio();
    startAmbientForScene(state.storyIndex);
  });

  refs.storyNextBtn.addEventListener("click", async () => {
    if (state.storyIndex >= storyScenes.length - 1) {
      // On final story scene, Next becomes the transition into gameplay.
      window.location.hash = "#game";
      logState("begin_quest");
      return;
    }
    state.storyIndex += 1;
    renderStoryScene();
    await ensureAudio();
    startAmbientForScene(state.storyIndex);
  });

  // Global master volume for every synth node in the experience.
  refs.volumeSlider.addEventListener("input", () => {
    if (state.masterGain) {
      state.masterGain.gain.value = parseFloat(refs.volumeSlider.value);
    }
  });

  refs.nextRoundBtn.addEventListener("click", () => {
    refs.nextRoundBtn.classList.add("hidden");
    if (state.roundIndex >= rounds.length - 1) {
      endGame();
      return;
    }
    state.roundIndex += 1;
    renderRound();
    logState("next_round");
  });

  refs.tryAgainBtn.addEventListener("click", () => {
    resetGame();
  });

  renderStoryScene();
  renderRound();
  setupSceneObserver();
  logState("setup_complete");
}

// App bootstrap.
setup();
