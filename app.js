// let recorder, audioBlob, audioURL, wavesurfer;
// let pyodideReady = false;
// let pyodide;

// // Pyodide 初期化
// async function initPyodide() {
//   pyodide = await loadPyodide();
//   await pyodide.loadPackage(["numpy", "librosa"]);

//   await pyodide.runPythonAsync(`
// import numpy as np
// import librosa

// def estimate_chord(y, sr):
//     chroma = librosa.feature.chroma_stft(y=y, sr=sr)
//     c = np.mean(chroma, axis=1)
//     notes = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"]
//     return notes[int(np.argmax(c))]

// def rhythm_analysis(y, sr):
//     onset_env = librosa.onset.onset_strength(y=y, sr=sr)
//     tempo, _ = librosa.beat.beat_track(onset_envelope=onset_env, sr=sr)
//     return tempo
// `);
//   pyodideReady = true;
// }

// initPyodide();

// /* ---------------------------
//   WAV 変換関数（MP3/M4A対応）
// --------------------------- */
// async function convertToWav(arrayBuffer) {
//   const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
//   const decoded = await audioCtx.decodeAudioData(arrayBuffer);

//   // PCM に変換
//   const numChannels = decoded.numberOfChannels;
//   const len = decoded.length * numChannels * 2;
//   const wavBuffer = new ArrayBuffer(44 + len);
//   const view = new DataView(wavBuffer);

//   function writeString(view, offset, str) {
//     for (let i = 0; i < str.length; i++) {
//       view.setUint8(offset + i, str.charCodeAt(i));
//     }
//   }

//   // WAV ヘッダ
//   writeString(view, 0, "RIFF");
//   view.setUint32(4, 36 + len, true);
//   writeString(view, 8, "WAVE");
//   writeString(view, 12, "fmt ");
//   view.setUint32(16, 16, true);
//   view.setUint16(20, 1, true);
//   view.setUint16(22, numChannels, true);
//   view.setUint32(24, decoded.sampleRate, true);
//   view.setUint32(28, decoded.sampleRate * numChannels * 2, true);
//   view.setUint16(32, numChannels * 2, true);
//   view.setUint16(34, 16, true);
//   writeString(view, 36, "data");
//   view.setUint32(40, len, true);

//   // PCM データ書き込み
//   let offset = 44;
//   for (let ch = 0; ch < numChannels; ch++) {
//     const data = decoded.getChannelData(ch);
//     for (let i = 0; i < data.length; i++) {
//       const s = Math.max(-1, Math.min(1, data[i]));
//       view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
//       offset += 2;
//     }
//   }

//   return new Blob([view], { type: "audio/wav" });
// }

// /* ---------------------------
//   WAVをロードして波形表示
// --------------------------- */
// function initWaveform(url) {
//   if (wavesurfer) wavesurfer.destroy();
//   wavesurfer = WaveSurfer.create({
//     container: '#waveform',
//     waveColor: '#ff7f50',
//     progressColor: '#ffa07a',
//     height: 150
//   });
//   wavesurfer.load(url);
// }

// /* ---------------------------
//    録音
// --------------------------- */
// document.getElementById("recordBtn").onclick = async () => {
//   const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
//   recorder = new MediaRecorder(stream);

//   let chunks = [];
//   recorder.ondataavailable = e => chunks.push(e.data);

//   recorder.onstop = async () => {
//     const blob = new Blob(chunks, { type: 'audio/webm' });
//     const arrayBuffer = await blob.arrayBuffer();
//     audioBlob = await convertToWav(arrayBuffer);
//     audioURL = URL.createObjectURL(audioBlob);
//     initWaveform(audioURL);
//   };

//   recorder.start();
// };

// document.getElementById("stopBtn").onclick = () => recorder?.stop();

// /* ---------------------------
//    再生
// --------------------------- */
// document.getElementById("playBtn").onclick = () => wavesurfer?.play();

// document.getElementById("slowBtn").onclick = () => {
//   if (!wavesurfer) return;
//   wavesurfer.setPlaybackRate(0.5);
//   wavesurfer.play();
// };

// /* ---------------------------
//    ファイルアップロード (mp3/m4a対応)
// --------------------------- */
// document.getElementById("fileInput").onchange = async (ev) => {
//   const file = ev.target.files[0];
//   const buf = await file.arrayBuffer();

//   audioBlob = await convertToWav(buf);
//   audioURL = URL.createObjectURL(audioBlob);
//   initWaveform(audioURL);
// };

// /* ---------------------------
//    耳コピ
// --------------------------- */
// document.getElementById("earBtn").onclick = async () => {
//   if (!pyodideReady || !audioBlob) return alert("録音/読込を先にしてください");

//   const buf = new Uint8Array(await audioBlob.arrayBuffer());
//   pyodide.globals.set("audio_bytes", buf);

//   const chord = await pyodide.runPythonAsync(`
// import io
// y, sr = librosa.load(io.BytesIO(bytes(audio_bytes)), sr=None)
// estimate_chord(y, sr)
// `);
//   document.getElementById("result").textContent = "推定コード: " + chord;
// };

// /* ---------------------------
//    リズム解析
// --------------------------- */
// document.getElementById("rhythmBtn").onclick = async () => {
//   if (!pyodideReady || !audioBlob) return alert("録音/読込を先にしてください");

//   const buf = new Uint8Array(await audioBlob.arrayBuffer());
//   pyodide.globals.set("audio_bytes", buf);

//   const tempo = await pyodide.runPythonAsync(`
// import io
// y, sr = librosa.load(io.BytesIO(bytes(audio_bytes)), sr=None)
// rhythm_analysis(y, sr)
// `);

//   document.getElementById("result").textContent =
//     "推定テンポ: " + tempo.toFixed(1) + " BPM";
// };
// // 楽譜表示
// document.getElementById("scoreBtn").onclick = async () => {
//   if(!pyodideReady || !audioBlob) return alert("音源をアップロードまたは録音してから楽譜表示してください");
//   const arrayBuffer = await audioBlob.arrayBuffer();
//   pyodide.globals.set("audio_bytes", new Uint8Array(arrayBuffer));
//   const freqs = await pyodide.runPythonAsync(`
// import io
// y, sr = librosa.load(io.BytesIO(bytes(audio_bytes)), sr=None)
// note_sequence(y, sr)
// `);
//   drawScore(freqs);
//   saveLog("楽譜表示", freqs.length + " ノート");
// };

// // VexFlowで簡易譜面描画
// function drawScore(freqs){
//   document.getElementById("score").innerHTML = "";
//   const VF = Vex.Flow;
//   const div = document.getElementById("score");
//   const renderer = new VF.Renderer(div, VF.Renderer.Backends.SVG);
//   renderer.resize(500, 200);
//   const context = renderer.getContext();
//   const stave = new VF.Stave(10, 40, 480);
//   stave.addClef("treble").setContext(context).draw();
//   const notes = freqs.slice(0, 16).map(f=>{
//     return new VF.StaveNote({clef:"treble", keys:["c/4"], duration:"q"});
//   });
//   const voice = new VF.Voice({num_beats: 4, beat_value: 4});
//   voice.addTickables(notes);
//   new VF.Formatter().joinVoices([voice]).format([voice], 400);
//   voice.draw(context, stave);
// }

// // 練習ログ
// function saveLog(type, value){
//   const date = new Date().toLocaleString();
//   logData.push({date, type, value});
//   localStorage.setItem("guitar_log", JSON.stringify(logData));
//   drawLogChart();
// }

// function drawLogChart(){
//   const ctx = document.getElementById("logChart").getContext("2d");
//   const labels = logData.map(d=>d.date);
//   const data = logData.map(d=>d.value);
//   if(window.myChart) window.myChart.destroy();
//   window.myChart = new Chart(ctx, {
//     type: 'line',
//     data: {labels, datasets:[{label:'練習ログ', data, borderColor:'#ff6f61', fill:false}]},
//     options:{responsive:true, maintainAspectRatio:false}
//   });
// }

// // モーダル操作
// const modal = document.getElementById("modal");
// document.getElementById("helpBtn").onclick = () => modal.style.display = "block";
// document.querySelector(".close").onclick = () => modal.style.display = "none";
// window.onclick = e => { if(e.target == modal) modal.style.display = "none"; };

// // PWA Service Worker
// if ('serviceWorker' in navigator) {
//   navigator.serviceWorker.register('sw.js')
//   .then(()=>console.log('Service Worker registered'))
//   .catch(err=>console.log('SW registration failed', err));
// }

// // 起動時に既存ログを読み込み
// if(localStorage.getItem("guitar_log")){
//   logData = JSON.parse(localStorage.getItem("guitar_log"));
//   drawLogChart();
// }
/* app.js — JS only implementation */

/* globals */
let recorder = null;
let audioBlob = null;
let audioBuffer = null; // AudioBuffer for processing
let audioURL = null;
let wavesurfer = null;
let audioCtx = null;
let isLoop = false;
let logData = [];
let myChart = null;

/* helpers */
function byId(id){ return document.getElementById(id); }
function showResult(text){ byId('result').textContent = text; }

/* initialize WaveSurfer */
function initWaveSurfer() {
  if (wavesurfer) { wavesurfer.destroy(); wavesurfer = null; }
  wavesurfer = WaveSurfer.create({
    container: '#waveform',
    waveColor: '#ff7f50',
    progressColor: '#ffa07a',
    height: 150,
    responsive: true,
    splitChannels: false
  });
  // region plugin not included by default; optional
  wavesurfer.on('finish', () => {
    if (isLoop) wavesurfer.play(0);
  });
}

/* convert decoded AudioBuffer -> WAV Blob (16-bit PCM) */
function audioBufferToWavBlob(buffer) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length * numChannels * 2;
  const bufferLength = 44 + length;
  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);

  function writeString(offset, s){
    for(let i=0;i<s.length;i++) view.setUint8(offset+i, s.charCodeAt(i));
  }
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + length, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // subchunk1Size
  view.setUint16(20, 1, true); // audioFormat PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, length, true);

  let offset = 44;
  const interleaved = new Float32Array(buffer.length * numChannels);
  for (let ch=0; ch<numChannels; ch++){
    const channelData = buffer.getChannelData(ch);
    for(let i=0;i<channelData.length;i++){
      // interleave by writing per channel sequentially for 16-bit (we'll write per channel)
      const sample = Math.max(-1, Math.min(1, channelData[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
  }
  return new Blob([view], { type: 'audio/wav' });
}

/* decode ArrayBuffer to AudioBuffer (AudioContext) */
async function decodeArrayBufferToAudioBuffer(arrayBuffer){
  if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return await audioCtx.decodeAudioData(arrayBuffer.slice(0));
}

/* load Blob or URL into WaveSurfer and set audioBuffer for analysis */
async function loadAudioFromBlob(blob){
  // create URL and load wavesurfer
  audioBlob = blob;
  if (audioURL) URL.revokeObjectURL(audioURL);
  audioURL = URL.createObjectURL(blob);
  initWaveSurfer();
  wavesurfer.load(audioURL);

  // decode to get AudioBuffer
  const arrayBuffer = await blob.arrayBuffer();
  audioBuffer = await decodeArrayBufferToAudioBuffer(arrayBuffer);
}

/* handle file input (mp3/m4a/wav) */
byId('fileInput').addEventListener('change', async (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  showResult('読み込み中...');
  try{
    const arrayBuffer = await file.arrayBuffer();
    // decode and convert to wav blob for wavesurfer (wavesurfer can accept blob but we unify)
    const ab = await decodeArrayBufferToAudioBuffer(arrayBuffer);
    // create wav blob from audioBuffer
    const wavBlob = audioBufferToWavBlob(ab);
    await loadAudioFromBlob(wavBlob);
    showResult('ファイル読み込み完了: ' + file.name);
  }catch(err){
    console.error(err);
    showResult('ファイルの読み込みに失敗しました');
  }
});

/* recording */
byId('recordBtn').addEventListener('click', async ()=>{
  try{
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recorder = new MediaRecorder(stream);
    const chunks = [];
    recorder.ondataavailable = e => chunks.push(e.data);
    recorder.onstop = async () => {
      const webmBlob = new Blob(chunks, { type: 'audio/webm' });
      // decode webm then create wav
      const arrayBuffer = await webmBlob.arrayBuffer();
      const ab = await decodeArrayBufferToAudioBuffer(arrayBuffer);
      const wavBlob = audioBufferToWavBlob(ab);
      await loadAudioFromBlob(wavBlob);
      showResult('録音完了');
    };
    recorder.start();
    showResult('録音中...');
  }catch(err){
    console.error(err);
    showResult('マイクアクセスに失敗しました');
  }
});

byId('stopBtn').addEventListener('click', ()=>{
  if(recorder && recorder.state === 'recording') {
    recorder.stop();
    showResult('録音停止');
  }
});

/* playback controls */
byId('playBtn').addEventListener('click', ()=> {
  if(!wavesurfer){ showResult('音声を読み込んでください'); return; }
  wavesurfer.play();
});
byId('slowBtn').addEventListener('click', ()=> {
  if(!wavesurfer){ showResult('音声を読み込んでください'); return; }
  wavesurfer.setPlaybackRate(0.5);
  wavesurfer.play();
});
byId('loopBtn').addEventListener('click', ()=> {
  isLoop = !isLoop;
  showResult('ループ: ' + (isLoop ? 'オン' : 'オフ'));
});

/* -------------------------
   Audio analysis: Chroma (for chord estimation)
   We'll use Meyda to extract chroma per frame and average.
   Meyda can take a signal buffer (frame) and extract chroma.
   ------------------------- */
function frameIterator(signal, frameSize=4096, hop=2048){
  const frames = [];
  for(let start=0; start + frameSize <= signal.length; start += hop){
    frames.push(signal.subarray(start, start + frameSize));
  }
  return frames;
}

function averageChromaFromAudioBuffer(buffer){
  // mono mix
  const channelData = buffer.numberOfChannels > 1 ? 
    (() => {
      const a = buffer.getChannelData(0).slice();
      const b = buffer.getChannelData(1);
      for(let i=0;i<b.length;i++) a[i] = (a[i] + b[i]) * 0.5;
      return a;
    })() : buffer.getChannelData(0);
  const fs = buffer.sampleRate;
  const frameSize = 4096;
  const hop = 2048;
  const frames = frameIterator(channelData, frameSize, hop);
  const chromaSum = new Array(12).fill(0);
  let count = 0;
  for(let f of frames){
    try{
      const chroma = Meyda.extract('chroma', f);
      if(chroma){
        for(let i=0;i<12;i++) chromaSum[i] += chroma[i];
        count++;
      }
    }catch(e){
      // Meyda can throw if frame size isn't proper; ignore
    }
  }
  if(count === 0) return chromaSum.map(()=>0);
  return chromaSum.map(v => v / count);
}

function estimateChordFromChroma(chroma){
  const notes = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  let idx = 0;
  for(let i=1;i<12;i++) if(chroma[i] > chroma[idx]) idx = i;
  return notes[idx];
}

/* -------------------------
   Rhythm / BPM detection
   Using spectral flux -> onset envelope -> auto-correlation
   ------------------------- */
function spectralFluxOnsetEnv(buffer){
  const channelData = buffer.numberOfChannels >1 ? buffer.getChannelData(0) : buffer.getChannelData(0);
  const frameSize = 2048;
  const hop = 512;
  const frames = frameIterator(channelData, frameSize, hop);
  const mags = [];
  let prevSpectrum = null;
  for(let frame of frames){
    // window (hann)
    const win = new Float32Array(frame.length);
    for(let i=0;i<frame.length;i++) win[i] = frame[i] * (0.5 - 0.5 * Math.cos(2*Math.PI*i/(frame.length-1)));
    // fft via Meyda: using powerSpectrum
    const spec = Meyda.extract('powerSpectrum', win);
    if(spec && prevSpectrum){
      let flux = 0;
      for(let i=0;i<spec.length;i++){
        const v = spec[i] - prevSpectrum[i];
        if(v>0) flux += v;
      }
      mags.push(flux);
    }
    prevSpectrum = spec;
  }
  // normalize
  const max = Math.max(...mags, 1);
  return mags.map(v => v / max);
}

function autoCorrelation(arr){
  const n = arr.length;
  const ac = new Array(n).fill(0);
  for(let lag = 0; lag < n; lag++){
    let sum = 0;
    for(let i=0;i < n - lag; i++){
      sum += arr[i] * arr[i+lag];
    }
    ac[lag] = sum;
  }
  return ac;
}

function estimateBPMFromOnsetEnv(onsetEnv, hopTime){
  const ac = autoCorrelation(onsetEnv);
  // ignore lag 0, find peak corresponding to period between 60-200 BPM
  const minBpm = 60, maxBpm = 200;
  const minLag = Math.floor((60 / maxBpm) / hopTime);
  const maxLag = Math.ceil((60 / minBpm) / hopTime);
  let peakLag = minLag;
  let peakVal = -Infinity;
  for(let lag = minLag; lag <= Math.min(maxLag, ac.length-1); lag++){
    if(ac[lag] > peakVal){ peakVal = ac[lag]; peakLag = lag; }
  }
  const periodSec = peakLag * hopTime;
  const bpm = 60 / periodSec;
  return bpm;
}

/* -------------------------
   Pitch detection (note sequence) using Pitchfinder (YIN)
   ------------------------- */
function frequencyToNoteName(freq){
  if(!freq || freq <= 0) return null;
  const A4 = 440;
  const midi = Math.round(12 * Math.log2(freq / A4) + 69);
  const noteNames = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  const name = noteNames[(midi+120)%12];
  const octave = Math.floor(midi / 12) - 1;
  return name + octave;
}

function detectPitchesFromAudioBuffer(buffer){
  // We'll run over the signal in frames, run YIN, and collect stable pitches
  const detector = PitchFinder.YIN({ sampleRate: buffer.sampleRate });
  const channelData = buffer.numberOfChannels > 1 ? buffer.getChannelData(0) : buffer.getChannelData(0);
  const frameSize = 2048;
  const hop = 512;
  const frames = frameIterator(channelData, frameSize, hop);
  const freqs = [];
  for(let f of frames){
    try{
      const freq = detector(f);
      if(freq && !isNaN(freq)) freqs.push(freq);
      else freqs.push(null);
    }catch(e){
      freqs.push(null);
    }
  }
  // smooth: keep runs of same note, convert to note names
  const noteSeq = [];
  let prev = null;
  let count = 0;
  for(let i=0;i<freqs.length;i++){
    const n = freqs[i] ? frequencyToNoteName(freqs[i]) : null;
    if(n === prev){ count++; }
    else {
      if(prev && count >= 2) noteSeq.push(prev); // require 2 frames
      prev = n; count = 1;
    }
  }
  // push last
  if(prev && count >= 2) noteSeq.push(prev);
  return noteSeq;
}

/* -------------------------
   Button handlers for analysis
   ------------------------- */
byId('earBtn').addEventListener('click', async ()=>{
  if(!audioBuffer) { showResult('録音/読み込みをしてください'); return; }
  showResult('解析中（コード推定）...');
  // compute chroma
  const chroma = averageChromaFromAudioBuffer(audioBuffer);
  const chord = estimateChordFromChroma(chroma);
  showResult('推定コード: ' + chord);
  saveLog('コード解析', chord);
});

byId('rhythmBtn').addEventListener('click', async ()=>{
  if(!audioBuffer) { showResult('録音/読み込みをしてください'); return; }
  showResult('解析中（BPM）...');
  // onset env
  const onsetEnv = spectralFluxOnsetEnv(audioBuffer);
  // hop time: frame hop / sampleRate
  const hop = 512;
  const hopTime = hop / audioBuffer.sampleRate;
  const bpm = estimateBPMFromOnsetEnv(onsetEnv, hopTime);
  showResult('推定テンポ: ' + (bpm?bpm.toFixed(1):'計算不可') + ' BPM');
  saveLog('リズム解析', (bpm?bpm.toFixed(1):'NaN') + ' BPM');
});

byId('scoreBtn').addEventListener('click', async ()=>{
  if(!audioBuffer) { showResult('録音/読み込みをしてください'); return; }
  showResult('解析中（楽譜生成）...');
  const notes = detectPitchesFromAudioBuffer(audioBuffer);
  if(!notes || notes.length === 0){ showResult('ノートが検出できませんでした'); return; }
  drawScoreFromNoteNames(notes);
  showResult('楽譜表示: ' + notes.length + ' ノート');
  saveLog('楽譜表示', notes.length + ' ノート');
});

/* draw simple VexFlow score from note names array like ["E4","G4",...] */
function drawScoreFromNoteNames(noteNames){
  document.getElementById('score').innerHTML = '';
  const VF = Vex.Flow;
  const div = document.getElementById("score");
  const renderer = new VF.Renderer(div, VF.Renderer.Backends.SVG);
  renderer.resize(600, 220);
  const context = renderer.getContext();
  const stave = new VF.Stave(10, 40, 580);
  stave.addClef("treble").setContext(context).draw();

  // convert note names to Vex keys like "e/4"
  const notes = noteNames.slice(0, 16).map(n => {
    // n like "A4" or "C#3"
    let m = n.match(/^([A-G]#?)(-?\d+)$/);
    if(!m) { return new VF.StaveNote({clef:"treble", keys:["c/4"], duration:"q"}); }
    const key = m[1].toLowerCase() + "/" + m[2];
    return new VF.StaveNote({clef:"treble", keys:[key], duration:"q"});
  });

  const voice = new VF.Voice({num_beats: 4, beat_value: 4});
  voice.setStrict(false);
  voice.addTickables(notes);
  new VF.Formatter().joinVoices([voice]).format([voice], 500);
  voice.draw(context, stave);
}

/* -------------------------
   Logging & Chart
   ------------------------- */
function saveLog(type, value){
  const date = new Date().toLocaleString();
  logData.push({date, type, value});
  localStorage.setItem('guitar_log', JSON.stringify(logData));
  drawLogChart();
}
function drawLogChart(){
  const ctx = document.getElementById('logChart');
  if(!ctx) return;
  const labels = logData.map(d=>d.date);
  const data = logData.map((d,i)=>i+1); // simple count per entry (for timeline)
  if(myChart) myChart.destroy();
  myChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [{ label: '活動ログ', data, borderColor:'#ff6f61', fill:false }] },
    options: { maintainAspectRatio:false }
  });
}

/* -------------------------
   Modal
   ------------------------- */
const modal = byId('modal'), helpBtn = byId('helpBtn');
helpBtn.addEventListener('click', ()=> modal.style.display = 'block');
document.querySelector('.close').addEventListener('click', ()=> modal.style.display = 'none');
window.addEventListener('click', (e)=> { if(e.target === modal) modal.style.display = 'none';});

/* -------------------------
   Load existing logs
   ------------------------- */
if(localStorage.getItem('guitar_log')) {
  logData = JSON.parse(localStorage.getItem('guitar_log'));
  setTimeout(drawLogChart, 200);
}

/* -------------------------
   ServiceWorker (if present)
   ------------------------- */
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('sw.js').then(()=> console.log('SW registered')).catch(()=>{});
}

/* -------------------------
   End of app.js
   ------------------------- */
