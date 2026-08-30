// Web Audio lets one MediaElementSource feed several analysers, but creating a
// second source for the same <audio> throws. Store the in-flight promise first:
// A shared source node lets visual meters subscribe without racing the audio element.
let audioContext;
const sources = new WeakMap(); // <audio> → Promise<{ context, source }>

async function runningContext() {
  if (typeof window === "undefined") return null;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  audioContext ||= new AudioContext();
  if (audioContext.state !== "running") await audioContext.resume();
  return audioContext.state === "running" ? audioContext : null;
}

async function sourceFor(audio) {
  const cached = sources.get(audio);
  if (cached) return cached;

  const pending = (async () => {
    const context = await runningContext();
    if (!context) return null;
    const source = context.createMediaElementSource(audio);
    // Route sound exactly once. Analyser branches stay output-less, so adding a
    // visualizer cannot double the signal reaching the speakers.
    source.connect(context.destination);
    return { context, source };
  })();
  sources.set(audio, pending);
  try {
    return await pending;
  } catch (error) {
    sources.delete(audio);
    throw error;
  }
}

export async function tapAudio(audio, { fftSize = 1024, smoothing = 0.6 } = {}) {
  if (!audio) return null;
  const shared = await sourceFor(audio);
  if (!shared) return null;

  const analyser = shared.context.createAnalyser();
  analyser.fftSize = fftSize;
  analyser.smoothingTimeConstant = smoothing;
  shared.source.connect(analyser);
  let released = false;

  return {
    context: shared.context,
    analyser,
    release() {
      if (released) return;
      released = true;
      try {
        shared.source.disconnect(analyser);
      } catch {}
    },
  };
}
