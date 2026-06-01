(() => {
  function createAudioController() {
    let audioContext = null;

    function ensureAudioContext() {
      if (!audioContext) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (Ctx) {
          audioContext = new Ctx();
        }
      }

      if (audioContext && audioContext.state === "suspended") {
        audioContext.resume().catch(() => {});
      }
    }

    function scheduleTone(start, frequency, duration, waveType, gainValue) {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();

      oscillator.type = waveType;
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(gainValue, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.02);
    }

    function playSfx(kind) {
      ensureAudioContext();
      if (!audioContext) {
        return;
      }

      const now = audioContext.currentTime;
      if (kind === "hit") {
        scheduleTone(now, 420, 0.06, "square", 0.03);
      } else if (kind === "mark") {
        scheduleTone(now, 280, 0.03, "triangle", 0.015);
      } else if (kind === "miss") {
        scheduleTone(now, 170, 0.05, "triangle", 0.02);
      } else if (kind === "sunk") {
        scheduleTone(now, 520, 0.06, "sawtooth", 0.04);
        scheduleTone(now + 0.08, 420, 0.08, "sawtooth", 0.04);
      } else if (kind === "end") {
        scheduleTone(now, 300, 0.08, "triangle", 0.04);
        scheduleTone(now + 0.1, 390, 0.08, "triangle", 0.04);
        scheduleTone(now + 0.2, 520, 0.1, "triangle", 0.04);
      }
    }

    return {
      ensureAudioContext,
      playSfx,
    };
  }

  window.AppAudio = {
    createAudioController,
  };
})();
