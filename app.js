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
// 楽譜表示
document.getElementById("scoreBtn").onclick = async () => {
  if(!pyodideReady || !audioBlob) return alert("音源をアップロードまたは録音してから楽譜表示してください");
  const arrayBuffer = await audioBlob.arrayBuffer();
  pyodide.globals.set("audio_bytes", new Uint8Array(arrayBuffer));
  const freqs = await pyodide.runPythonAsync(`
import io
y, sr = librosa.load(io.BytesIO(bytes(audio_bytes)), sr=None)
note_sequence(y, sr)
`);
  drawScore(freqs);
  saveLog("楽譜表示", freqs.length + " ノート");
};

// VexFlowで簡易譜面描画
function drawScore(freqs){
  document.getElementById("score").innerHTML = "";
  const VF = Vex.Flow;
  const div = document.getElementById("score");
  const renderer = new VF.Renderer(div, VF.Renderer.Backends.SVG);
  renderer.resize(500, 200);
  const context = renderer.getContext();
  const stave = new VF.Stave(10, 40, 480);
  stave.addClef("treble").setContext(context).draw();
  const notes = freqs.slice(0, 16).map(f=>{
    return new VF.StaveNote({clef:"treble", keys:["c/4"], duration:"q"});
  });
  const voice = new VF.Voice({num_beats: 4, beat_value: 4});
  voice.addTickables(notes);
  new VF.Formatter().joinVoices([voice]).format([voice], 400);
  voice.draw(context, stave);
}

// 練習ログ
function saveLog(type, value){
  const date = new Date().toLocaleString();
  logData.push({date, type, value});
  localStorage.setItem("guitar_log", JSON.stringify(logData));
  drawLogChart();
}

function drawLogChart(){
  const ctx = document.getElementById("logChart").getContext("2d");
  const labels = logData.map(d=>d.date);
  const data = logData.map(d=>d.value);
  if(window.myChart) window.myChart.destroy();
  window.myChart = new Chart(ctx, {
    type: 'line',
    data: {labels, datasets:[{label:'練習ログ', data, borderColor:'#ff6f61', fill:false}]},
    options:{responsive:true, maintainAspectRatio:false}
  });
}

// モーダル操作
const modal = document.getElementById("modal");
document.getElementById("helpBtn").onclick = () => modal.style.display = "block";
document.querySelector(".close").onclick = () => modal.style.display = "none";
window.onclick = e => { if(e.target == modal) modal.style.display = "none"; };

// PWA Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js')
  .then(()=>console.log('Service Worker registered'))
  .catch(err=>console.log('SW registration failed', err));
}

// 起動時に既存ログを読み込み
if(localStorage.getItem("guitar_log")){
  logData = JSON.parse(localStorage.getItem("guitar_log"));
  drawLogChart();
}