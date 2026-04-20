import os
from dotenv import load_dotenv

load_dotenv()

# --- API Keys ---
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")

# --- Models ---
CONVERSATION_MODEL = os.getenv("CONVERSATION_MODEL", "llama-3.1-70b-versatile")
ASSESSMENT_MODEL = os.getenv("ASSESSMENT_MODEL", "qwen/qwen3-32b")

# --- Database ---
DATABASE_URL = os.getenv("DATABASE_URL", "./screener.db")

# --- Validation ---
if not GROQ_API_KEY:
    raise ValueError("GROQ_API_KEY is not set. Add it to your .env file.")
