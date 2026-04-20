# AI Tutor Screener — Cuemath AI Builder Challenge

An AI-powered tutor screening system that conducts natural voice interviews and generates structured assessment reports.

## What It Does

- **Candidate visits** the interview page, enters their name, clicks Start
- **Aria (AI Interviewer)** conducts a 5–7 minute adaptive voice conversation
- **Questions adapt** to the candidate's answers — vague answers trigger follow-ups, strong answers move forward
- **Assessment report** generated after 6 questions — scored across 5 dimensions with quotes as evidence
- **Dashboard** shows all past interviews with scores and recommendations

## Tech Stack

- **Backend:** FastAPI (Python) + SQLite
- **LLM (Conversation):** Groq — Llama 3.1 70B
- **LLM (Assessment):** Groq — Qwen3-32B
- **Frontend:** Vanilla HTML/CSS/JS (dark mode, glassmorphism)
- **Voice:** Web Speech API (Chrome/Edge)
- **Deployment:** Render.com (free tier)

## Local Setup

### 1. Clone & install

```bash
pip install -r backend/requirements.txt
```

### 2. Set up environment

```bash
cp backend/.env.example backend/.env
# Edit backend/.env and add your GROQ_API_KEY
```

Get a free Groq API key at https://console.groq.com

### 3. Run the server

```bash
cd backend
uvicorn main:app --reload
```

Open http://localhost:8000 in Chrome.

## Project Structure

```
ai-tutor-screener/
├── backend/
│   ├── main.py          # FastAPI routes + serves frontend
│   ├── conversation.py  # InterviewEngine — adaptive conversation
│   ├── assessment.py    # Assessment generator (Qwen3-32B)
│   ├── database.py      # SQLite operations
│   ├── prompts.py       # All LLM prompts
│   ├── config.py        # Environment config
│   └── requirements.txt
├── frontend/
│   ├── index.html       # Interview page
│   ├── report.html      # Assessment report
│   ├── dashboard.html   # Admin dashboard
│   ├── style.css        # Design system
│   └── app.js           # Frontend logic
└── render.yaml          # Deployment config
```

## Assessment Dimensions

| Dimension | Description |
|---|---|
| Communication Clarity | Clear, structured, easy to follow |
| Warmth & Patience | Genuine care, empathy for students |
| Ability to Simplify | Using analogies, child-friendly explanations |
| English Fluency | Natural, grammatically correct |
| Candidate Fit | Overall suitability for Cuemath |

## Deployment (Render.com — Free)

1. Push to GitHub
2. Create account at render.com (no credit card needed)
3. New Web Service → connect repo
4. Root directory: `backend/`
5. Add `GROQ_API_KEY` in environment variables
6. Deploy

## Notes

- Voice input requires Chrome or Edge (Web Speech API)
- Text input fallback available for other browsers
- SQLite resets on Render free tier redeploy (no persistent disk) — fine for demo
- Assessment generation runs in background (~15 seconds)
