import json
from groq import AsyncGroq
from config import GROQ_API_KEY, ASSESSMENT_MODEL
from database import get_messages, get_session, save_assessment, complete_session
from prompts import ASSESSMENT_PROMPT

client = AsyncGroq(api_key=GROQ_API_KEY)


def _format_transcript(messages: list[dict]) -> str:
    """Format messages into a readable transcript string."""
    lines = []
    for msg in messages:
        role = "Aria (Interviewer)" if msg["role"] == "interviewer" else "Candidate"
        lines.append(f"{role}: {msg['content']}")
    return "\n\n".join(lines)


async def generate_assessment(session_id: str) -> dict:
    """
    Generate the structured assessment report for a completed session.
    Uses Qwen3-32B via Groq for evaluation.
    """
    # 1. Fetch transcript and session info
    session = await get_session(session_id)
    if not session:
        raise ValueError(f"Session {session_id} not found.")

    messages = await get_messages(session_id)
    transcript = _format_transcript(messages)
    candidate_name = session["candidate_name"]

    # 2. Build the assessment prompt
    prompt = ASSESSMENT_PROMPT.format(
        candidate_name=candidate_name,
        session_id=session_id,
        transcript=transcript,
    )

    # 3. Call Qwen3 via Groq
    response = await client.chat.completions.create(
        model=ASSESSMENT_MODEL,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=1500,
        temperature=0.3,  # Low temperature for consistent structured output
    )

    raw = response.choices[0].message.content.strip()

    # 4. Parse JSON — strip markdown code fences if present
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    report = json.loads(raw)

    # 5. Save to database
    await save_assessment(session_id, json.dumps(report))
    await complete_session(session_id)

    return report
