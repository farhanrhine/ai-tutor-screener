/* ============================================================
   app.js — AI Tutor Screener Frontend Logic
   ============================================================ */

const BACKEND_URL = ''; // Same origin — FastAPI serves frontend
const API = (path) => `${BACKEND_URL}/api${path}`;

// --- State ---
let sessionId = null;
let isRecording = false;
let isSpeaking = false;
let isProcessing = false;
let questionCount = 0;
const MAX_QUESTIONS = 6;
let timerInterval = null;
let timerSeconds = 0;
let silenceTimer = null;
let accumulatedTranscript = '';     // Builds up full answer across speech pauses
const MIC_MAX_SECONDS = 60;          // Auto-stop mic after 60 seconds
const INTERVIEW_TOTAL_SECONDS = 420; // 7 minutes total interview

// --- Web Speech API ---
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let hasSpeechAPI = !!SpeechRecognition;
const synth = window.speechSynthesis;

// ============================================================
// INIT
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  // Show warning for non-Chrome/Edge browsers
  const isSupported = /Chrome|Chromium|Edg/.test(navigator.userAgent);
  if (!isSupported) {
    document.getElementById('chrome-warning').style.display = 'block';
  }

  // Enter key on name input
  document.getElementById('candidate-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') startInterview();
  });

  // If speech not available, show text input by default
  if (!hasSpeechAPI) {
    document.getElementById('text-fallback').classList.add('show');
    document.getElementById('mic-btn').disabled = true;
    document.getElementById('mic-label').textContent = 'Type your answer below';
  }
});

// ============================================================
// START INTERVIEW
// ============================================================

async function startInterview() {
  const nameInput = document.getElementById('candidate-name');
  const name = nameInput.value.trim();
  if (!name) {
    nameInput.focus();
    nameInput.style.borderColor = 'var(--accent-red)';
    setTimeout(() => nameInput.style.borderColor = '', 1500);
    return;
  }

  const btn = document.getElementById('start-btn');
  btn.disabled = true;
  btn.textContent = 'Starting…';

  try {
    const res = await fetch(API('/session/start'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidate_name: name }),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();

    sessionId = data.session_id;

    // Switch to interview screen
    document.getElementById('welcome-screen').style.display = 'none';
    document.getElementById('interview-screen').style.display = 'block';
    document.getElementById('nav-progress').style.display = 'flex';
    document.getElementById('nav-timer').style.display = 'block';

    startTimer();
    updateProgress(1);

    // Show opening message
    await showAriaMessage(data.opening_message, true);

  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Start Interview →';
    alert('Failed to connect. Please check your connection and try again.');
    console.error(err);
  }
}

// ============================================================
// MIC TOGGLE
// ============================================================

// MediaRecorder state (for Whisper)
let mediaRecorder = null;
let audioChunks = [];

function toggleMic() {
  if (isProcessing || isSpeaking) return;
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
}

function startRecording() {
  accumulatedTranscript = '';

  // --- Request microphone access ---
  navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    .then(stream => {
      // ── Track 1: MediaRecorder → sends audio to Whisper for accurate STT ──
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/ogg;codecs=opus';

      audioChunks = [];
      mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorder.ondataavailable = e => {
        if (e.data && e.data.size > 0) audioChunks.push(e.data);
      };
      mediaRecorder.start(250); // Collect chunks every 250ms

      // ── Track 2: Web Speech API → live preview text in input box ──
      if (hasSpeechAPI) {
        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event) => {
          let finalText = '';
          for (let i = 0; i < event.results.length; i++) {
            if (event.results[i].isFinal) finalText += event.results[i][0].transcript + ' ';
          }
          if (finalText.trim()) accumulatedTranscript = finalText.trim();

          let interimText = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            if (!event.results[i].isFinal) interimText += event.results[i][0].transcript;
          }
          const textInput = document.getElementById('text-input');
          if (textInput) textInput.value = (accumulatedTranscript + ' ' + interimText).trim();
        };

        recognition.onerror = (e) => {
          if (e.error !== 'no-speech') console.warn('Web Speech preview error:', e.error);
        };
        recognition.onend = () => {
          if (isRecording) { try { recognition.start(); } catch(e) {} }
        };
        recognition.start();
      }

      // ── UI ──
      isRecording = true;
      setStatus('listening', '🎙️ Listening…');
      document.getElementById('mic-btn').classList.add('recording');
      document.getElementById('mic-btn').innerHTML = '⏹️';
      document.getElementById('mic-label').textContent = 'Click to stop & send';
      document.getElementById('waveform').classList.add('show');
      document.getElementById('ring1').style.display = 'block';
      document.getElementById('ring2').style.display = 'block';
      document.getElementById('send-early-btn').style.display = 'inline-flex';

      // Auto-stop after 60s
      silenceTimer = setTimeout(() => { if (isRecording) stopRecording(); }, MIC_MAX_SECONDS * 1000);
    })
    .catch(err => {
      console.error('Mic access denied:', err);
      // Fallback: Web Speech only (no Whisper)
      if (hasSpeechAPI) _startWebSpeechOnly();
      else setStatus('idle', '⚠️ Mic access denied — type your answer');
    });
}

function _startWebSpeechOnly() {
  // Fallback path — no MediaRecorder available
  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  recognition.onstart = () => {
    isRecording = true;
    setStatus('listening', '🎙️ Listening…');
    document.getElementById('mic-btn').classList.add('recording');
    document.getElementById('mic-btn').innerHTML = '⏹️';
    document.getElementById('mic-label').textContent = 'Click to stop & send';
    document.getElementById('waveform').classList.add('show');
    document.getElementById('ring1').style.display = 'block';
    document.getElementById('ring2').style.display = 'block';
    document.getElementById('send-early-btn').style.display = 'inline-flex';
    silenceTimer = setTimeout(() => { if (isRecording) stopRecording(); }, MIC_MAX_SECONDS * 1000);
  };
  recognition.onresult = (event) => {
    let finalText = '';
    for (let i = 0; i < event.results.length; i++) {
      if (event.results[i].isFinal) finalText += event.results[i][0].transcript + ' ';
    }
    if (finalText.trim()) accumulatedTranscript = finalText.trim();
    let interimText = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (!event.results[i].isFinal) interimText += event.results[i][0].transcript;
    }
    const textInput = document.getElementById('text-input');
    if (textInput) textInput.value = (accumulatedTranscript + ' ' + interimText).trim();
  };
  recognition.onerror = e => { if (e.error !== 'no-speech') console.error(e); };
  recognition.onend = () => { if (isRecording) { try { recognition.start(); } catch(e) {} } };
  recognition.start();
}

function stopRecording() {
  clearTimeout(silenceTimer);
  isRecording = false;  // Must set BEFORE stopping so onend doesn't restart

  // Stop Web Speech preview
  if (recognition) { try { recognition.stop(); } catch(e) {} recognition = null; }

  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    // ── Whisper path: collect audio blob → POST → transcribe ──
    mediaRecorder.onstop = async () => {
      const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
      audioChunks = [];
      // Release mic
      try { mediaRecorder.stream.getTracks().forEach(t => t.stop()); } catch(e) {}
      mediaRecorder = null;

      stopRecordingUI();
      await _transcribeAndSend(blob);
    };
    mediaRecorder.stop();
  } else {
    // ── Fallback: use Web Speech accumulated text ──
    mediaRecorder = null;
    stopRecordingUI();
    const fallback = accumulatedTranscript.trim();
    accumulatedTranscript = '';
    if (fallback) sendAnswer(fallback);
  }
}

async function _transcribeAndSend(blob) {
  if (!blob || blob.size < 1000) {
    // Too short — probably silence or mic error
    setStatus('idle', 'Ready — your turn');
    return;
  }

  setStatus('processing', '🔄 Transcribing…');
  const textInput = document.getElementById('text-input');
  if (textInput) textInput.value = '⏳ Transcribing your answer…';
  setProcessing(true);

  try {
    const ext = blob.type.includes('ogg') ? 'ogg' : 'webm';
    const formData = new FormData();
    formData.append('file', blob, `answer.${ext}`);

    const res = await fetch(API('/transcribe'), { method: 'POST', body: formData });
    if (!res.ok) throw new Error(`Transcribe HTTP ${res.status}`);

    const data = await res.json();
    const text = (data.text || '').trim();

    if (text) {
      if (textInput) textInput.value = text;
      setProcessing(false);
      sendAnswer(text);
    } else {
      throw new Error('Empty transcript from Whisper');
    }
  } catch (err) {
    console.error('Whisper transcription failed:', err);
    // Fallback: use Web Speech accumulated text
    const fallback = accumulatedTranscript.trim();
    accumulatedTranscript = '';
    if (textInput) textInput.value = '';
    setProcessing(false);

    if (fallback) {
      console.log('Falling back to Web Speech transcript');
      sendAnswer(fallback);
    } else {
      setStatus('idle', '⚠️ Could not transcribe — please type your answer');
    }
  }
}

function stopRecordingUI() {
  document.getElementById('mic-btn').classList.remove('recording');
  document.getElementById('mic-btn').innerHTML = '🎙️';
  document.getElementById('mic-label').textContent = 'Click to speak';
  document.getElementById('waveform').classList.remove('show');
  document.getElementById('ring1').style.display = 'none';
  document.getElementById('ring2').style.display = 'none';
  document.getElementById('send-early-btn').style.display = 'none';
}

// ============================================================
// SEND ANSWER
// ============================================================

function sendTextAnswer() {
  const input = document.getElementById('text-input');
  const text = input.value.trim();
  if (!text || isProcessing) return;

  // --- KEY FIX: Stop mic FIRST, clear accumulated transcript ---
  // Without this, stopRecording() fires later and re-sends the old transcript
  if (isRecording) {
    clearTimeout(silenceTimer);
    isRecording = false;           // Must set false before recognition.stop() so onend doesn't restart
    if (recognition) recognition.stop();
    stopRecordingUI();
  }
  accumulatedTranscript = '';      // Discard any partial speech — user typed instead

  input.value = '';
  sendAnswer(text);
}

async function sendAnswer(text) {
  if (!sessionId || isProcessing) return;

  // Show candidate message
  addMessage(text, 'candidate');
  setProcessing(true);

  try {
    const res = await fetch(API('/session/message'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, candidate_message: text }),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();

    questionCount++;
    updateProgress(questionCount + 1);

    if (data.interview_complete) {
      await showAriaMessage(data.interviewer_response, false);
      await delay(2000);
      showGeneratingScreen();
      pollForReport();
    } else {
      await showAriaMessage(data.interviewer_response, true);
    }

  } catch (err) {
    setProcessing(false);
    setStatus('idle', 'Ready');
    addErrorMessage('Something went wrong. Please try again.');
    console.error(err);
  }
}

// ============================================================
// MESSAGES
// ============================================================

function addMessage(text, role) {
  const chat = document.getElementById('chat-messages');
  const typingWrap = document.getElementById('typing-wrap');

  const wrap = document.createElement('div');
  wrap.className = `message-wrap ${role === 'candidate' ? 'candidate' : ''}`;

  const avatar = document.createElement('div');
  avatar.className = `msg-avatar ${role === 'aria' ? 'aria-av' : 'cand-av'}`;
  avatar.textContent = role === 'aria' ? 'S' : '👤';

  const bubble = document.createElement('div');
  bubble.className = `message-bubble ${role === 'aria' ? 'aria-msg' : 'cand-msg'}`;

  const msgDiv = document.createElement('div');
  msgDiv.textContent = text;

  const timeDiv = document.createElement('div');
  timeDiv.className = 'msg-time';
  timeDiv.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  bubble.appendChild(msgDiv);
  bubble.appendChild(timeDiv);
  wrap.appendChild(avatar);
  wrap.appendChild(bubble);

  // Insert before typing indicator
  chat.insertBefore(wrap, typingWrap);
  chat.scrollTop = chat.scrollHeight;
}

async function showAriaMessage(text, enableMicAfter) {
  // Show typing indicator wrap
  document.getElementById('typing-wrap').classList.add('show');
  setStatus('processing', '⏳ Thinking…');
  await delay(400);
  document.getElementById('chat-messages').scrollTop = 999999;

  // Start typing
  document.getElementById('typing-wrap').classList.remove('show');

  const chat = document.getElementById('chat-messages');
  const typingWrap = document.getElementById('typing-wrap');

  const wrap = document.createElement('div');
  wrap.className = 'message-wrap';

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar aria-av';
  avatar.textContent = 'S';

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble aria-msg';

  const msgDiv = document.createElement('div');
  const timeDiv = document.createElement('div');
  timeDiv.className = 'msg-time';
  timeDiv.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  bubble.appendChild(msgDiv);
  bubble.appendChild(timeDiv);
  wrap.appendChild(avatar);
  wrap.appendChild(bubble);
  chat.insertBefore(wrap, typingWrap);

  // Typewriter
  setStatus('speaking', '🔊 Speaking…');
  speakText(text);
  await typewriter(msgDiv, text);
  chat.scrollTop = chat.scrollHeight;

  // Wait for speech to finish, then enable mic
  if (enableMicAfter) {
    setProcessing(false);
    setStatus('idle', 'Ready — your turn');
    document.getElementById('mic-btn').disabled = false;
    document.getElementById('mic-label').textContent = 'Click to speak';
  }
}

function addErrorMessage(text) {
  const chat = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.style.cssText = 'text-align:center; font-size:0.82rem; color:var(--accent-red); padding:8px; animation:fadeIn 0.3s ease';
  div.textContent = `⚠️ ${text}`;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

// ============================================================
// TYPEWRITER EFFECT
// ============================================================

async function typewriter(el, text, speed = 18) {
  el.textContent = '';
  for (let i = 0; i < text.length; i++) {
    el.textContent += text[i];
    if (i % 3 === 0) await delay(speed); // batch chars for speed
  }
}

// ============================================================
// SPEECH SYNTHESIS
// ============================================================

function speakText(text) {
  if (!synth) return;
  synth.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = 1.0;
  utter.pitch = 1.05;
  utter.volume = 1;

  // Try to get a good female voice
  const voices = synth.getVoices();
  const preferred = voices.find(v =>
    v.name.includes('Samantha') || v.name.includes('Google UK English Female') ||
    v.name.includes('Microsoft Zira') || v.name.includes('Female')
  ) || voices.find(v => v.lang.startsWith('en'));
  if (preferred) utter.voice = preferred;

  utter.onstart = () => { isSpeaking = true; };
  utter.onend = () => {
    isSpeaking = false;
    setStatus('idle', 'Ready — your turn');
  };
  synth.speak(utter);
}

// ============================================================
// STATUS / PROGRESS
// ============================================================

function setStatus(type, label) {
  const dot = document.getElementById('status-dot');
  const lbl = document.getElementById('status-label');
  dot.className = `status-dot ${type}`;
  lbl.textContent = label;
}

function setProcessing(val) {
  isProcessing = val;
  const micBtn = document.getElementById('mic-btn');
  const textInput = document.getElementById('text-input');
  micBtn.disabled = val;
  if (textInput) textInput.disabled = val;
  if (val) setStatus('processing', '⏳ Processing…');
}

function updateProgress(current) {
  const safeQ = Math.min(current, MAX_QUESTIONS);
  const answered = Math.max(0, safeQ - 1); // questions fully answered
  
  // Both header and info panel now show "Answered" count for consistency
  document.getElementById('progress-label').textContent = `${answered} / ${MAX_QUESTIONS} Questions Answered`;
  const pct = Math.min((answered / MAX_QUESTIONS) * 100, 100);
  document.getElementById('progress-bar').style.width = `${pct}%`;

  // Control panel ring + number
  const qNum = document.getElementById('ctrl-q-num');
  const progBar = document.getElementById('ctrl-prog-bar');
  const ringFill = document.getElementById('ctrl-ring-fill');
  if (qNum) qNum.textContent = answered;
  if (progBar) progBar.style.width = `${(answered / MAX_QUESTIONS) * 100}%`;
  if (ringFill) {
    const circumference = 220; // stroke-dasharray
    const offset = circumference * (1 - answered / MAX_QUESTIONS);
    ringFill.style.strokeDashoffset = offset;
  }
}

function startTimer() {
  timerSeconds = 0;
  timerInterval = setInterval(() => {
    timerSeconds++;

    // --- Elapsed time ---
    const em = String(Math.floor(timerSeconds / 60)).padStart(2, '0');
    const es = String(timerSeconds % 60).padStart(2, '0');
    const elapsed = `${em}:${es}`;
    document.getElementById('nav-timer').textContent = elapsed;
    const ctrlTimer = document.getElementById('ctrl-timer');
    if (ctrlTimer) ctrlTimer.textContent = elapsed;

    // --- Countdown (7 min total) ---
    const remaining = Math.max(0, INTERVIEW_TOTAL_SECONDS - timerSeconds);
    const rm = String(Math.floor(remaining / 60)).padStart(2, '0');
    const rs = String(remaining % 60).padStart(2, '0');
    const countdown = `${rm}:${rs}`;
    const ctrlCountdown = document.getElementById('ctrl-countdown');
    if (ctrlCountdown) ctrlCountdown.textContent = countdown;

    // Warn when < 60s left — turn countdown red
    if (ctrlCountdown) {
      ctrlCountdown.style.color = remaining <= 60 ? 'var(--accent-red)' : 'var(--text-primary)';
    }

    // Fill the time progress bar
    const timePct = Math.min((timerSeconds / INTERVIEW_TOTAL_SECONDS) * 100, 100);
    const timeBar = document.getElementById('ctrl-time-bar');
    if (timeBar) timeBar.style.width = `${timePct}%`;

  }, 1000);
}

// ============================================================
// END INTERVIEW
// ============================================================

function confirmEndInterview() {
  // Stop mic first if recording
  if (isRecording) {
    clearTimeout(silenceTimer);
    isRecording = false;
    if (recognition) recognition.stop();
    stopRecordingUI();
  }
  if (confirm('End the interview early? Your assessment will be generated from answers so far.')) {
    sendAnswer('[Candidate chose to end interview early]');
  }
}

// ============================================================
// GENERATING / POLLING
// ============================================================

function showGeneratingScreen() {
  clearInterval(timerInterval);
  document.getElementById('generating-screen').classList.add('show');
}

function pollForReport() {
  const interval = setInterval(async () => {
    try {
      const res = await fetch(API(`/session/report/${sessionId}`));
      const data = await res.json();
      if (data.status === 'ready') {
        clearInterval(interval);
        window.location.href = `report.html?session_id=${sessionId}`;
      }
    } catch (err) {
      console.error('Poll error:', err);
    }
  }, 3000);
}

// ============================================================
// UTILS
// ============================================================

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


// ============================================================
// // ELEVENLABS UPGRADE
// ============================================================
// Uncomment below and add a /api/tts backend endpoint to use ElevenLabs
//
// async function speakTextElevenLabs(text) {
//   const res = await fetch(API('/tts'), {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify({ text }),
//   });
//   const blob = await res.blob();
//   const url = URL.createObjectURL(blob);
//   const audio = new Audio(url);
//   isSpeaking = true;
//   audio.onended = () => { isSpeaking = false; URL.revokeObjectURL(url); };
//   await audio.play();
// }


// ============================================================
// // WHISPER UPGRADE
// ============================================================
// Uncomment below and add a /api/transcribe backend endpoint
//
// async function recordAndTranscribe() {
//   const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
//   const recorder = new MediaRecorder(stream);
//   const chunks = [];
//   recorder.ondataavailable = e => chunks.push(e.data);
//   recorder.onstop = async () => {
//     const blob = new Blob(chunks, { type: 'audio/webm' });
//     const formData = new FormData();
//     formData.append('file', blob, 'audio.webm');
//     const res = await fetch(API('/transcribe'), { method: 'POST', body: formData });
//     const { text } = await res.json();
//     sendAnswer(text);
//   };
//   recorder.start();
//   setTimeout(() => recorder.stop(), 10000); // 10 sec max
// }
