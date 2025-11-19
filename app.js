let recorder, audioBlob, audioURL, wavesurfer;
let pyodideReady = false;
let pyodide;

// Pyodide 初期化
async function initPyodide() {
  pyodide = await loadPyodide();
  await pyodide.loadPackage(["numpy", "librosa"]);

  await pyodide.runPythonAsync(`
import numpy as np
import librosa

def estimate_chord(y, sr):
    chroma = librosa.feature.chroma_stft(y=y, sr=sr)
    c = np.mean(chroma, axis=1)
    notes = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"]
    return notes[int(np.argmax(c))]

def rhythm_analysis(y, sr):
    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    tempo, _ = librosa.beat.beat_track(onset_envelope=onset_env, sr=sr)
    return tempo
`);
  pyodideReady = true;
}

initPyodide();

/* ---------------------------
  WAV 変換関数（MP3/M4A対応）
--------------------------- */
async function convertToWav(arrayBuffer) {
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const decoded = await audioCtx.decodeAudioData(arrayBuffer);

  // PCM に変換
  const numChannels = decoded.numberOfChannels;
  const len = decoded.length * numChannels * 2;
  const wavBuffer = new ArrayBuffer(44 + len);
  const view = new DataView(wavBuffer);

  function writeString(view, offset, str) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  // WAV ヘッダ
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + len, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, decoded.sampleRate, true);
  view.setUint32(28, decoded.sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, len, true);

  // PCM データ書き込み
  let offset = 44;
  for (let ch = 0; ch < numChannels; ch++) {
    const data = decoded.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      const s = Math.max(-1, Math.min(1, data[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      offset += 2;
    }
  }

  return new Blob([view], { type: "audio/wav" });
}

/* ---------------------------
  WAVをロードして波形表示
--------------------------- */
function initWaveform(url) {
  if (wavesurfer) wavesurfer.destroy();
  wavesurfer = WaveSurfer.create({
    container: '#waveform',
    waveColor: '#ff7f50',
    progressColor: '#ffa07a',
    height: 150
  });
  wavesurfer.load(url);
}

/* ---------------------------
   録音
--------------------------- */
document.getElementById("recordBtn").onclick = async () => {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  recorder = new MediaRecorder(stream);

  let chunks = [];
  recorder.ondataavailable = e => chunks.push(e.data);

  recorder.onstop = async () => {
    const blob = new Blob(chunks, { type: 'audio/webm' });
    const arrayBuffer = await blob.arrayBuffer();
    audioBlob = await convertToWav(arrayBuffer);
    audioURL = URL.createObjectURL(audioBlob);
    initWaveform(audioURL);
  };

  recorder.start();
};

document.getElementById("stopBtn").onclick = () => recorder?.stop();

/* ---------------------------
   再生
--------------------------- */
document.getElementById("playBtn").onclick = () => wavesurfer?.play();

document.getElementById("slowBtn").onclick = () => {
  if (!wavesurfer) return;
  wavesurfer.setPlaybackRate(0.5);
  wavesurfer.play();
};

/* ---------------------------
   ファイルアップロード (mp3/m4a対応)
--------------------------- */
document.getElementById("fileInput").onchange = async (ev) => {
  const file = ev.target.files[0];
  const buf = await file.arrayBuffer();

  audioBlob = await convertToWav(buf);
  audioURL = URL.createObjectURL(audioBlob);
  initWaveform(audioURL);
};

/* ---------------------------
   耳コピ
--------------------------- */
document.getElementById("earBtn").onclick = async () => {
  if (!pyodideReady || !audioBlob) return alert("録音/読込を先にしてください");

  const buf = new Uint8Array(await audioBlob.arrayBuffer());
  pyodide.globals.set("audio_bytes", buf);

  const chord = await pyodide.runPythonAsync(`
import io
y, sr = librosa.load(io.BytesIO(bytes(audio_bytes)), sr=None)
estimate_chord(y, sr)
`);
  document.getElementById("result").textContent = "推定コード: " + chord;
};

/* ---------------------------
   リズム解析
--------------------------- */
document.getElementById("rhythmBtn").onclick = async () => {
  if (!pyodideReady || !audioBlob) return alert("録音/読込を先にしてください");

  const buf = new Uint8Array(await audioBlob.arrayBuffer());
  pyodide.globals.set("audio_bytes", buf);

  const tempo = await pyodide.runPythonAsync(`
import io
y, sr = librosa.load(io.BytesIO(bytes(audio_bytes)), sr=None)
rhythm_analysis(y, sr)
`);

  document.getElementById("result").textContent =
    "推定テンポ: " + tempo.toFixed(1) + " BPM";
};
