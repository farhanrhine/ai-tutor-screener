import os
from dotenv import load_dotenv

load_dotenv()

# --- API Keys ---
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")

# --- Models (all via Groq) ---
CONVERSATION_MODEL = os.getenv("CONVERSATION_MODEL", "openai/gpt-oss-120b")
ASSESSMENT_MODEL   = os.getenv("ASSESSMENT_MODEL",   "openai/gpt-oss-120b")
WHISPER_MODEL      = os.getenv("WHISPER_MODEL",       "whisper-large-v3-turbo")

# --- Database ---
DATABASE_URL = os.getenv("DATABASE_URL", "./screener.db")

# --- Validation ---
if not GROQ_API_KEY:
    raise ValueError("GROQ_API_KEY is not set. Add it to your .env file.")
