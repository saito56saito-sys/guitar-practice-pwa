let recorder, audioBlob, audioURL, wavesurfer;
let pyodideReady = false;
let pyodide;
let logData = [];

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
    idx = int(np.argmax(c))
    return notes[idx]
def rhythm_analysis(y, sr):
    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    tempo, beats = librosa.beat.beat_track(onset_envelope=onset_env, sr=sr)
    return tempo
def note_sequence(y, sr):
    pitches, magnitudes = librosa.piptrack(y=y, sr=sr)
    note_list = []
    for i in range(pitches.shape[1]):
        idx = np.argmax(magnitudes[:,i])
        freq = pitches[idx,i]
        if freq>0:
            note_list.append(freq)
    return note_list
`);
  pyodideReady = true;
}
initPyodide();

// 録音
document.getElementById("recordBtn").onclick = async () => {
  const stream = await navigator.mediaDevices.getUserMedia({audio: true});
  recorder = new MediaRecorder(stream);
  let chunks = [];
  recorder.ondataavailable = e => chunks.push(e.data);
  recorder.onstop = e => {
    audioBlob = new Blob(chunks, {type:'audio/wav'});
    audioURL = URL.createObjectURL(audioBlob);
    initWaveform(audioURL);
  };
  recorder.start();
};
document.getElementById("stopBtn").onclick = () => { if(recorder) recorder.stop(); };

// ファイル入力
document.getElementById("audioFile").onchange = async (e) => {
  const file = e.target.files[0];
  if(!file) return;
  audioBlob = file;
  audioURL = URL.createObjectURL(file);
  initWaveform(audioURL);
};

// 再生・スロー再生
document.getElementById("playBtn").onclick = () => { if(wavesurfer) wavesurfer.play(); };
document.getElementById("slowBtn").onclick = () => { if(wavesurfer){ wavesurfer.setPlaybackRate(0.5); wavesurfer.play(); }};

// 波形初期化
function initWaveform(url){
  if(wavesurfer) wavesurfer.destroy();
  wavesurfer = WaveSurfer.create({
    container: '#waveform',
    waveColor: '#ff7f50',
    progressColor: '#ffa07a',
    height: 150
  });
  wavesurfer.load(url);
}

// 耳コピ解析
document.getElementById("earBtn").onclick = async () => {
  if(!pyodideReady || !audioBlob) return alert("音源をアップロードまたは録音してから解析してください");
  const arrayBuffer = await audioBlob.arrayBuffer();
  pyodide.globals.set("audio_bytes", new Uint8Array(arrayBuffer));
  const result = await pyodide.runPythonAsync(`
import io
y, sr = librosa.load(io.BytesIO(bytes(audio_bytes)), sr=None)
estimate_chord(y, sr)
`);
  document.getElementById("result").textContent = "推定コード: " + result;
  saveLog("コード解析", result);
};

// リズム解析
document.getElementById("rhythmBtn").onclick = async () => {
  if(!pyodideReady || !audioBlob) return alert("音源をアップロードまたは録音してから解析してください");
  const arrayBuffer = await audioBlob.arrayBuffer();
  pyodide.globals.set("audio_bytes", new Uint8Array(arrayBuffer));
  const tempo = await pyodide.runPythonAsync(`
import io
y, sr = librosa.load(io.BytesIO(bytes(audio_bytes)), sr=None)
rhythm_analysis(y, sr)
`);
  document.getElementById("result").textContent = "推定テンポ: " + tempo.toFixed(1) + " BPM";
  saveLog("リズム解析", tempo.toFixed(1) + " BPM");
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
