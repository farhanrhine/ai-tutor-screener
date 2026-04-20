export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function setStatus(type, label) {
  const dot = document.getElementById('status-dot');
  const lbl = document.getElementById('status-label');
  if (dot) dot.className = `status-dot ${type}`;
  if (lbl) lbl.textContent = label;
}

export function updateProgress(current, maxQuestions) {
  const safeQ = Math.min(current, maxQuestions);
  const answered = Math.max(0, safeQ - 1); 
  
  const progLabel = document.getElementById('progress-label');
  if (progLabel) progLabel.textContent = `${answered} / ${maxQuestions} Questions Answered`;
  
  const pct = Math.min((answered / maxQuestions) * 100, 100);
  const progBar = document.getElementById('progress-bar');
  if (progBar) progBar.style.width = `${pct}%`;

  const qNum = document.getElementById('ctrl-q-num');
  const ctrlProgBar = document.getElementById('ctrl-prog-bar');
  const ringFill = document.getElementById('ctrl-ring-fill');
  
  if (qNum) qNum.textContent = answered;
  if (ctrlProgBar) ctrlProgBar.style.width = `${pct}%`;
  if (ringFill) {
    const circumference = 220; 
    const offset = circumference * (1 - answered / maxQuestions);
    ringFill.style.strokeDashoffset = offset;
  }
}

export function addMessage(text, role) {
  if (!text || !text.trim()) return;
  const chat = document.getElementById('chat-messages');
  const typingWrap = document.getElementById('typing-wrap');

  const wrap = document.createElement('div');
  wrap.className = `message-wrap ${role === 'candidate' ? 'candidate' : ''}`;

  const avatar = document.createElement('div');
  avatar.className = `msg-avatar ${role === 'aria' ? 'aria-av' : 'cand-av'}`;
  avatar.textContent = role === 'aria' ? 'S' : 'C';

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

  if (typingWrap) chat.insertBefore(wrap, typingWrap);
  else chat.appendChild(wrap);
  
  chat.scrollTop = chat.scrollHeight;
}

export async function typewriter(el, text, speed = 18) {
  el.textContent = '';
  for (let i = 0; i < text.length; i++) {
    el.textContent += text[i];
    if (i % 3 === 0) await delay(speed);
  }
}

export function addErrorMessage(text) {
  const chat = document.getElementById('chat-messages');
  if (!chat) return;
  const div = document.createElement('div');
  div.style.cssText = 'text-align:center; font-size:0.82rem; color:var(--danger); padding:8px; animation:fadeIn 0.3s ease';
  div.textContent = text;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

export function setMicRecordingUI(isRecording) {
  const micBtn = document.getElementById('mic-btn');
  const micLabel = document.getElementById('mic-label');
  const waveform = document.getElementById('waveform');
  const ring1 = document.getElementById('ring1');
  const ring2 = document.getElementById('ring2');
  const sendEarlyBtn = document.getElementById('send-early-btn');

  if (!micBtn) return;

  if (isRecording) {
    micBtn.classList.add('recording');
    micBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" class="icon" style="width:32px;height:32px;"><rect x="6" y="6" width="12" height="12" rx="2" ry="2"/></svg>';
    if (micLabel) micLabel.textContent = 'Click to stop & send';
    if (waveform) waveform.classList.add('show');
    if (ring1) ring1.style.display = 'block';
    if (ring2) ring2.style.display = 'block';
    if (sendEarlyBtn) sendEarlyBtn.style.display = 'inline-flex';
  } else {
    micBtn.classList.remove('recording');
    micBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" class="icon"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5M12 19v3M8 22h8"/></svg>';
    if (micLabel) micLabel.textContent = 'Click to speak';
    if (waveform) waveform.classList.remove('show');
    if (ring1) ring1.style.display = 'none';
    if (ring2) ring2.style.display = 'none';
    if (sendEarlyBtn) sendEarlyBtn.style.display = 'none';
  }
}

export function showGeneratingScreen() {
  const screen = document.getElementById('generating-screen');
  if (screen) screen.classList.add('show');
}
