// ─────────────────────────────────────────────────────────────
//  Game data: labels hidden from player, used internally only.
//  UI shows "Sound 1 / 2 / 3" and omits points per spec.
// ─────────────────────────────────────────────────────────────
const rounds = [
  {
    scene: "",
    songs: [
      { type: "good", points: 30, effect: "The monster shrinks! Harmony is restored." },
      { type: "chaos", points: 10, effect: "The monster grows! Chaos feeds it!" },
      { type: "medium", points: 20, effect: "The monster hesitates… Try a more powerful tune!" }
    ]
  },
  {
    scene: "",
    songs: [
      { type: "good", points: 30, effect: "The monster recoils in pain!" },
      { type: "chaos", points: 10, effect: "The monster roars with delight!" },
      { type: "medium", points: 20, effect: "The monster is confused… Choose stronger harmony!" }
    ]
  },
  {
    scene: "",
    songs: [
      { type: "good", points: 30, effect: "The monster shrivels! Rhythm defeats chaos!" },
      { type: "chaos", points: 10, effect: "The monster absorbs the noise and grows!" },
      { type: "good", points: 25, effect: "The monster weakens — bright tones pierce the dark!" }
    ]
  }
];

// ─────────────────────────────────────────────────────────────
//  Audio file paths
// ─────────────────────────────────────────────────────────────

// Scene narration (Voice + Sound Effects folder)
const sceneNarrationSrcs = [
  "Sounds/Narration/Voice + Sound Effects/Scene 1.mp3",
  "Sounds/Narration/Voice + Sound Effects/Scene 2.mp3",
  "Sounds/Narration/Voice + Sound Effects/Scene 3.mp3",
  "Sounds/Narration/Voice + Sound Effects/Scene 4.mp3"
];

// Game round sound files mapped [round][songIndex]
const gameSoundSrcs = [
  [
    "Sounds/Game/Round 1/Piano Melody.mp3",
    "Sounds/Game/Round 1/Loud Rock Music.mp3",
    "Sounds/Game/Round 1/Machine Churning.mp3"
  ],
  [
    "Sounds/Game/Round 2/Music Box.mp3",
    "Sounds/Game/Round 2/Car Horn.mp3",
    "Sounds/Game/Round 2/Temple Bells.mp3"
  ],
  [
    "Sounds/Game/Round 3/Macarena Song.mp3",
    "Sounds/Game/Round 3/Metal Music.mp3",
    "Sounds/Game/Round 3/Soda Pop Song.mp3"
  ]
];

// ─────────────────────────────────────────────────────────────
//  Runtime state
// ─────────────────────────────────────────────────────────────
const state = {
  roundIndex: 0,
  score: 0,
  playedInRound: new Set(),
  selectedInRound: false,
  revealNextTimer: null,
  storyIndex: 0,
  activeSongCardId: null
};

// Active HTMLAudioElement instances
const audioEl = {
  scene: null,   // current scene narration / ambient
  game: null    // currently playing game sound
};

// ─────────────────────────────────────────────────────────────
//  DOM refs
// ─────────────────────────────────────────────────────────────
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
  sectionNodes: Array.from(document.querySelectorAll("#landing, #scene1, #game, #ending, #bts, #team")),
  storyRestartBtn: document.getElementById("storyRestartBtn"),
};

// ─────────────────────────────────────────────────────────────
//  Story data
// ─────────────────────────────────────────────────────────────
const storyScenes = [
  { text: "For centuries, it slept… Lying dormant. Waiting. Biding its time.", className: "scene--1" },
  { text: "But the world grew louder… and harmony began to break.", className: "scene--2" },
  { text: "Because of this noise, the Sound Demon has awakened!", className: "scene--3" },
  { text: "You are a Guardian of the Earth. It is your job to protect the world from this Demon. But remember to choose wisely. Some sounds restore harmony, while other, chaotic ones, feed the monster. The fate of the world is on your shoulders.", className: "scene--4" }
];

// ─────────────────────────────────────────────────────────────
//  Audio helpers
// ─────────────────────────────────────────────────────────────

function getVolume() {
  return parseFloat(refs.volumeSlider.value);
}

/** Stop and release the current scene narration audio. */
function stopSceneAudio() {
  if (audioEl.scene) {
    audioEl.scene.pause();
    audioEl.scene.currentTime = 0;
    audioEl.scene = null;
  }
}

/** Play a scene narration MP3, looping once through. */
function playSceneAudio(src) {
  stopSceneAudio();
  if (!src) return;
  const el = new Audio(src);
  el.volume = getVolume();
  el.loop = false;
  audioEl.scene = el;
  el.play().catch(() => {
    // Autoplay blocked or file missing; fail silently
  });
}

/** Stop whatever game sound is playing and reset card UI. */
function stopGameAudio() {
  if (audioEl.game) {
    audioEl.game.pause();
    audioEl.game.currentTime = 0;
    audioEl.game = null;
  }
  if (state.activeSongCardId) {
    const card = document.getElementById(state.activeSongCardId);
    if (card) {
      card.querySelectorAll(".play-btn").forEach(b => b.classList.remove("playing"));
      const eq = card.querySelector(".equalizer");
      if (eq) eq.classList.remove("is-active");
    }
    state.activeSongCardId = null;
  }
}

/** Start a game sound MP3, looping until stopped. Returns a cleanup fn. */
function playGameSound(roundIndex, songIndex, cardId) {
  stopGameAudio();
  const src = gameSoundSrcs[roundIndex]?.[songIndex];
  if (!src) return () => { };
  const el = new Audio(src);
  el.volume = getVolume();
  el.loop = true;
  audioEl.game = el;
  state.activeSongCardId = cardId;
  el.play().catch(() => { });
  return () => stopGameAudio();
}

/** Update volume on all live audio elements when slider moves. */
function syncVolume() {
  const v = getVolume();
  if (audioEl.scene) audioEl.scene.volume = v;
  if (audioEl.game) audioEl.game.volume = v;
}

// ─────────────────────────────────────────────────────────────
//  Story rendering
// ─────────────────────────────────────────────────────────────

function renderStoryScene() {
  const scene = storyScenes[state.storyIndex];

  refs.storySceneTitle.textContent = ``;
  refs.storySceneText.textContent = scene.text;

  const isFirstScene = state.storyIndex === 0;
  const isLastScene = state.storyIndex === storyScenes.length - 1;

  if (isFirstScene) {
    refs.storyPrevBtn.classList.add("hidden");
  } else {
    refs.storyPrevBtn.classList.remove("hidden");
  }
  1212
  if (isLastScene) {
    refs.storyRestartBtn.classList.remove("hidden"); 
    refs.storyNextBtn.textContent = "Begin Your Quest";
  } else {
    refs.storyRestartBtn.classList.add("hidden");
    refs.storyNextBtn.textContent = "Next";
  }

  refs.sceneSection.classList.remove("scene--1", "scene--2", "scene--3", "scene--4");
  refs.sceneSection.classList.add(scene.className);
}

function startSceneNarration(sceneIndex) {
  const src = sceneNarrationSrcs[sceneIndex];
  if (src) playSceneAudio(src);
}

// ─────────────────────────────────────────────────────────────
//  Monster state
// ─────────────────────────────────────────────────────────────

function updateMonsterByType(type) {
  refs.monsterSvg.classList.remove(
    "monster--small", "monster--normal", "monster--large",
    "monster--defeated", "monster--victorious"
  );
  if (type === "good") refs.monsterSvg.classList.add("monster--small");
  else if (type === "chaos") refs.monsterSvg.classList.add("monster--large");
  else refs.monsterSvg.classList.add("monster--normal");
}

// ─────────────────────────────────────────────────────────────
//  Game round rendering
// ─────────────────────────────────────────────────────────────

function renderRound() {
  stopGameAudio();
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
    const cardId = `song-card-${state.roundIndex}-${songIndex}`;
    const card = document.createElement("article");
    card.id = cardId;
    card.className = "song-card";

    // Display as "Sound 1 / 2 / 3" — don't reveal the real name or points
    card.innerHTML = `
      <div class="song-head">
        <span class="song-name">Sound ${songIndex + 1}</span>
      </div>
      <div class="song-buttons">
        <button class="sound-btn play-btn"   type="button">Play</button>
        <button class="sound-btn stop-btn"   type="button">Stop</button>
        <button class="sound-btn select-btn" type="button" disabled>Select</button>
      </div>
      <div class="equalizer" aria-hidden="true">
        <span></span><span></span><span></span><span></span><span></span>
      </div>
    `;
    refs.songList.appendChild(card);

    const playBtn = card.querySelector(".play-btn");
    const stopBtn = card.querySelector(".stop-btn");
    const selectBtn = card.querySelector(".select-btn");
    const eq = card.querySelector(".equalizer");

    playBtn.addEventListener("click", () => {
      // Stop any currently playing game sound first
      stopGameAudio();

      playGameSound(state.roundIndex, songIndex, cardId);

      // Enable Select only after the player has auditioned this sound
      state.playedInRound.add(songIndex);
      card.dataset.played = "true";
      selectBtn.disabled = false;
      playBtn.classList.add("playing");
      eq.classList.add("is-active");

      // Auto-stop after 35 s (safety cap)
      window.setTimeout(() => {
        if (state.activeSongCardId === cardId) stopGameAudio();
      }, 35000);
    });

    stopBtn.addEventListener("click", () => {
      if (state.activeSongCardId === cardId) stopGameAudio();
    });

    selectBtn.addEventListener("click", () => {
      // Guard: must have played this sound; only one selection per round
      if (card.dataset.played !== "true" || state.selectedInRound) return;

      stopGameAudio();
      state.selectedInRound = true;

      // Keep score in state (not shown in UI)
      state.score += Number(song.points) || 0;

      refs.effectText.textContent = song.effect;
      updateMonsterByType(song.type);

      // Mark all buttons on every card as selected / locked
      card.querySelectorAll(".sound-btn").forEach(b => b.classList.add("selected"));
      refs.songList.querySelectorAll(".select-btn").forEach(btn => {
        btn.disabled = true;
      });

      // Short delay before showing the Next button
      state.revealNextTimer = window.setTimeout(() => {
        refs.nextRoundBtn.textContent =
          state.roundIndex === rounds.length - 1 ? "End Game" : "Next Round";
        refs.nextRoundBtn.classList.remove("hidden");
        state.revealNextTimer = null;
      }, 1500);
    });
  });
}

// ─────────────────────────────────────────────────────────────
//  End game
// ─────────────────────────────────────────────────────────────

function endGame() {
  const won = state.score >= 60;

  refs.endingSection.classList.add("is-visible");
  refs.endingSection.setAttribute("aria-hidden", "false");
  refs.endingCard.classList.remove("win", "lose");
  refs.gameOverlay.classList.remove("is-darkened");

  if (won) {
    refs.endingCard.classList.add("win");
    refs.endingTitle.textContent = "Congratulations! You have freed the world of the Sound Demon.";
    refs.endingText.textContent = "Harmony rises again across the realm.";
    refs.monsterSvg.classList.remove(
      "monster--small", "monster--normal", "monster--large", "monster--victorious"
    );
    refs.monsterSvg.classList.add("monster--defeated");
  } else {
    refs.endingCard.classList.add("lose");
    refs.endingTitle.textContent = "The world has fallen into chaos. You have lost.";
    refs.endingText.textContent = "The Sound Demon has consumed the last light.";
    refs.monsterSvg.classList.remove(
      "monster--small", "monster--normal", "monster--large", "monster--defeated"
    );
    refs.monsterSvg.classList.add("monster--victorious");
    refs.gameOverlay.classList.add("is-darkened");
  }

  window.location.hash = "#ending";
}

// ─────────────────────────────────────────────────────────────
//  Reset game
// ─────────────────────────────────────────────────────────────

function resetGame() {
  stopGameAudio();
  if (state.revealNextTimer) {
    window.clearTimeout(state.revealNextTimer);
    state.revealNextTimer = null;
  }
  state.roundIndex = 0;
  state.score = 0;

  refs.monsterSvg.classList.remove(
    "monster--small", "monster--large", "monster--defeated", "monster--victorious"
  );
  refs.monsterSvg.classList.add("monster--normal");
  refs.gameOverlay.classList.remove("is-darkened");
  refs.endingSection.classList.remove("is-visible");
  refs.endingSection.setAttribute("aria-hidden", "true");
  refs.endingCard.classList.remove("win", "lose");

  renderRound();
  window.location.hash = "#game";
}

// ─────────────────────────────────────────────────────────────
//  IntersectionObserver: ambient / nav highlight
// ─────────────────────────────────────────────────────────────

function setupSceneObserver() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const id = entry.target.id;

        if (id === "scene1") {
          refs.navStory.classList.add("is-story-active");
          // Play narration for the currently displayed story scene
          startSceneNarration(state.storyIndex);
        } else {
          refs.navStory.classList.remove("is-story-active");
          // Stop scene narration when leaving the story section
          if (id !== "scene1") stopSceneAudio();
        }
      });
    },
    { threshold: 0.55 }
  );
  refs.sectionNodes.forEach(el => observer.observe(el));
}

// ─────────────────────────────────────────────────────────────
//  Bootstrap
// ─────────────────────────────────────────────────────────────

function setup() {

  // ── Orb: init audio + navigate to story ──
  refs.orbTrigger.addEventListener("click", () => {
    window.location.hash = "#scene1";
    startSceneNarration(0);
  });

  // ── Scene replay button ──
  refs.sceneReplayBtn.addEventListener("click", () => {
    startSceneNarration(state.storyIndex);
  });

  // ── Story prev / next ──
  refs.storyPrevBtn.addEventListener("click", () => {
    if (state.storyIndex <= 0) return;
    state.storyIndex -= 1;
    renderStoryScene();
    startSceneNarration(state.storyIndex);
  });

  refs.storyNextBtn.addEventListener("click", () => {

    if (state.storyIndex >= storyScenes.length - 1) {
      stopSceneAudio();
      const gameSection = document.getElementById("game");
      if (gameSection) {
        
        gameSection.scrollIntoView({ behavior: "smooth" });
        
        window.location.hash = "#game";
      }
      return;
    }
    state.storyIndex += 1;
    renderStoryScene();
    startSceneNarration(state.storyIndex);
  });

  refs.storyRestartBtn.addEventListener("click", () => {
    state.storyIndex = 0;
    renderStoryScene();
    startSceneNarration(0);
  });

  // ── Volume slider ──
  refs.volumeSlider.addEventListener("input", syncVolume);

  // ── Next round / end game ──
  refs.nextRoundBtn.addEventListener("click", () => {
    refs.nextRoundBtn.classList.add("hidden");
    if (state.roundIndex >= rounds.length - 1) {
      endGame();
      return;
    }
    state.roundIndex += 1;
    renderRound();
  });

  // ── Try again ──
  refs.tryAgainBtn.addEventListener("click", resetGame);

  // ── Initial render ──
  renderStoryScene();
  renderRound();
  setupSceneObserver();

  // ── Landing orb fade-in: appear after title animation completes ──
  // Title takes ~3 s (0.2s delay + 2.8s duration). Orb appears at ~2.4s.
  window.setTimeout(() => {
    refs.orbTrigger.classList.add("is-visible");
  }, 2400);
}

// App bootstrap
setup();


// BTS Buttons

const carousel = document.querySelector('.bts-gallery-carousel');
const nextBtn = document.querySelector('.carousel-btn.next');
const prevBtn = document.querySelector('.carousel-btn.prev');

if (carousel && nextBtn && prevBtn) {
  nextBtn.addEventListener('click', () => {
    carousel.scrollBy({ left: carousel.offsetWidth / 2, behavior: 'smooth' });
  });

  prevBtn.addEventListener('click', () => {
    carousel.scrollBy({ left: -(carousel.offsetWidth / 2), behavior: 'smooth' });
  });
}
