# AI Tutor Screener — Cuemath AI Builder Challenge

> A fully voice-driven AI interviewer that conducts adaptive tutor screening conversations and generates structured assessment reports — built for the Cuemath AI Builder Challenge.

---

## What It Does

A candidate visits the interview page, enters their name, and has a **5–7 minute voice conversation** with **Sarah**, Cuemath's AI Interviewer. Sarah listens, adapts her questions based on what the candidate says, and produces a detailed assessment report at the end.

- 🎙️ **Voice-first** — speak naturally; Whisper transcribes accurately
- 🧠 **Fully adaptive** — no scripted question list; LLM decides what to ask next based on the conversation
- 📊 **Structured assessment** — scored across 5 dimensions with direct quotes as evidence
- 🏁 **End early** — candidate can end any time and still get a full report
- 📋 **Admin dashboard** — all sessions, scores, pass rates at a glance

---

## Demo Flow

```
Candidate enters name → Sarah introduces herself
        ↓
Candidate speaks → MediaRecorder captures audio
        ↓
Audio → Groq Whisper large-v3-turbo → accurate transcript
        ↓
Transcript → LLM (openai/gpt-oss-120b via Groq) → adaptive response
     (LLM sees full conversation history + uncovered assessment dimensions)
        ↓
After ~6 exchanges → background assessment generation
        ↓
Assessment report with scores, quotes, recommendation
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | FastAPI (Python 3.11) + SQLite via aiosqlite |
| **Package Manager** | `uv` |
| **Conversation LLM** | `openai/gpt-oss-120b` via Groq |
| **Assessment LLM** | `openai/gpt-oss-120b` via Groq |
| **Voice Transcription** | Groq Whisper `whisper-large-v3-turbo` |
| **Live Preview STT** | Web Speech API (Chrome/Edge, runs in parallel) |
| **Frontend** | Vanilla HTML + CSS + JS (dark mode, glassmorphism) |
| **Deployment** | Render.com (free tier, single service) |

---

## Assessment Dimensions

| Dimension | What It Measures |
|---|---|
| **Communication Clarity** | Clear, structured, easy to follow |
| **Warmth & Patience** | Genuine care and empathy for students |
| **Ability to Simplify** | Child-friendly analogies and explanations |
| **English Fluency** | Natural, grammatically correct speech |
| **Candidate Fit** | Overall suitability for Cuemath tutoring |

Each dimension gets a score (1–10), a one-sentence justification, and a **direct quote** from the transcript as evidence.

**Recommendation:** `Move to next round` / `Consider with reservations` / `Do not move forward`

---

## Project Structure

```
ai-tutor-screener/
├── backend/
│   ├── main.py           # FastAPI routes + /api/transcribe (Whisper) + serves frontend
│   ├── conversation.py   # Dynamic InterviewEngine — LLM-driven, dimension-tracking
│   ├── assessment.py     # Structured assessment generator with transcript cleaning
│   ├── database.py       # SQLite operations (sessions, messages, assessments)
│   ├── prompts.py        # All LLM prompts (no hardcoded questions)
│   └── config.py         # Environment config
├── frontend/
│   ├── index.html        # Interview page (progress ring, dual timer, mic UI)
│   ├── report.html       # Assessment report (print-ready PDF)
│   ├── dashboard.html    # Admin dashboard (auto-refreshes every 30s)
│   ├── style.css         # Design system (dark mode, glassmorphism)
│   └── app.js            # Voice logic (MediaRecorder + Whisper + Web Speech preview)
├── render.yaml           # One-click Render deployment config
└── pyproject.toml        # uv project config (Python 3.11)
```

---

## Local Setup

### Prerequisites
- Python 3.11+
- [`uv`](https://docs.astral.sh/uv/) — fast Python package manager
- A free [Groq API key](https://console.groq.com)

### 1. Install dependencies

```bash
uv sync
```

### 2. Configure environment

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env`:

```env
GROQ_API_KEY=your_groq_api_key_here

# All three models are served via Groq — one API key handles everything
CONVERSATION_MODEL=openai/gpt-oss-120b
ASSESSMENT_MODEL=openai/gpt-oss-120b
WHISPER_MODEL=whisper-large-v3-turbo

DATABASE_URL=./screener.db
```

### 3. Run

```bash
cd backend
uv run uvicorn main:app --reload
```

Open **http://localhost:8000** in Chrome or Edge.

---

## Deployment (Render.com — Free)

1. Push to GitHub
2. Sign up at [render.com](https://render.com) — no credit card needed
3. **New Web Service** → connect your repo
4. Root directory: `backend/`
5. Build command: `uv sync`
6. Start command: `uv run uvicorn main:app --host 0.0.0.0 --port $PORT`
7. Add environment variable: `GROQ_API_KEY=your_key`
8. Deploy ✅

> The `render.yaml` in the repo handles all of this automatically via Infrastructure as Code.

---

## Key Design Decisions

### No hardcoded question list
Instead of a fixed list like "Q1: tell me about yourself, Q2: explain fractions...", the LLM receives:
- Full conversation history
- List of uncovered assessment dimensions
- What the candidate just said

It then decides **what to ask next** and **how to phrase it** based on the candidate's actual context (their background, analogies they used, experiences they mentioned).

### Dual-track voice recording
Two things run in parallel when you click the mic:
1. **MediaRecorder** — captures raw audio → sent to Groq Whisper for accurate transcription
2. **Web Speech API** — provides live preview text in the input box

Whisper result takes precedence. Web Speech text is the fallback if transcription fails.

### Assessment transcript cleaning
Before sending to the assessment LLM, the transcript is cleaned:
- `[Candidate chose to end interview early]` markers removed
- Repeat requests (`"can you repeat that?"`) filtered out
- Only substantive candidate answers go to the evaluator

---

## Edge Cases Handled

| Situation | How It's Handled |
|---|---|
| "Can you repeat that?" | Sarah warmly repeats the last question exactly |
| "I don't know" (repeated) | After 2 in a row, Sarah moves on gracefully without pressure |
| Candidate ends early | Immediate wrap-up + report generated from partial interview |
| Very short answer (< 12 words) | Classified as `short` → follow-up question triggered |
| Whisper transcription fails | Falls back to Web Speech accumulated text |
| Server restart mid-session | Engine state rebuilt from DB on reconnect |
| Non-Chrome browser | Warning banner shown; text input always available as fallback |

---

## Notes

- Voice transcription requires mic permission in the browser
- Best experience: **Chrome or Edge** (Web Speech API for live preview)
- Firefox/Safari: Whisper transcription still works; no live preview
- SQLite resets on Render free tier redeploy — expected for demo use
- Assessment generation runs in background (~10–15 seconds after interview ends)
