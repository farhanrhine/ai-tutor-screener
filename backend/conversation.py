import random
from groq import AsyncGroq
from config import GROQ_API_KEY, CONVERSATION_MODEL
from prompts import (
    SYSTEM_PROMPT,
    INTERVIEW_QUESTIONS,
    OPENING_PROMPT,
    ASSESS_QUALITY_PROMPT,
    FOLLOWUP_GENERATION_PROMPT,
    NEXT_QUESTION_PROMPT,
    WRAP_UP_PROMPT,
)

client = AsyncGroq(api_key=GROQ_API_KEY)

# In-memory store of active engines (keyed by session_id)
_engines: dict[str, "InterviewEngine"] = {}


def get_engine(session_id: str) -> "InterviewEngine | None":
    return _engines.get(session_id)


def create_engine(session_id: str, candidate_name: str) -> "InterviewEngine":
    engine = InterviewEngine(session_id, candidate_name)
    _engines[session_id] = engine
    return engine


def remove_engine(session_id: str):
    _engines.pop(session_id, None)


class InterviewEngine:
    """Manages the adaptive interview conversation flow."""

    def __init__(self, session_id: str, candidate_name: str):
        self.session_id = session_id
        self.candidate_name = candidate_name
        self.messages: list[dict] = []          # Full conversation history for LLM context
        self.questions_asked: list[int] = []    # Indices of questions already asked
        self.questions_asked_count: int = 0
        self.just_followed_up: bool = False     # Prevent double follow-ups
        self.interview_complete: bool = False
        self.last_question: str = ""            # Track last question for context

    async def get_opening_message(self) -> str:
        """Generate warm opening + first question."""
        first_q = INTERVIEW_QUESTIONS[0]
        self.questions_asked.append(0)
        self.questions_asked_count += 1
        self.last_question = first_q

        prompt = OPENING_PROMPT.format(
            candidate_name=self.candidate_name,
            first_question=first_q,
        )
        response = await self._call_llm(prompt, use_system=False)
        self.messages.append({"role": "assistant", "content": response})
        return response

    async def process_candidate_answer(self, answer: str) -> dict:
        """Process candidate's answer and return next interviewer response."""
        self.messages.append({"role": "user", "content": answer})

        # Edge case: very long tangent (> 200 words) — just move on
        word_count = len(answer.split())

        quality = await self._assess_answer_quality(answer)

        if quality in ("vague", "short") and not self.just_followed_up:
            response = await self._generate_followup(answer, quality)
            self.just_followed_up = True
        elif self.questions_asked_count >= 6:
            response = await self._wrap_up()
            self.interview_complete = True
        else:
            if word_count > 200:
                # Long tangent: acknowledge briefly and move on
                response = await self._ask_next_question(
                    "Thank you for sharing that in detail."
                )
            else:
                response = await self._ask_next_question(answer)
            self.just_followed_up = False

        self.messages.append({"role": "assistant", "content": response})
        return {
            "interviewer_response": response,
            "interview_complete": self.interview_complete,
        }

    async def _assess_answer_quality(self, answer: str) -> str:
        """Classify answer as strong, vague, or short."""
        # Quick check: under 15 words = automatically short
        if len(answer.split()) < 15:
            return "short"

        prompt = ASSESS_QUALITY_PROMPT.format(
            question=self.last_question,
            answer=answer,
        )
        result = await self._call_llm(prompt, use_system=False)
        result = result.strip().lower()
        if result in ("strong", "vague", "short"):
            return result
        # Fallback: if LLM gives unexpected output, treat as strong to keep flow moving
        return "strong"

    async def _generate_followup(self, answer: str, quality: str) -> str:
        """Generate natural follow-up for vague/short answers."""
        prompt = FOLLOWUP_GENERATION_PROMPT.format(answer=answer, quality=quality)
        return await self._call_llm(prompt, use_system=False)

    async def _ask_next_question(self, answer: str) -> str:
        """Pick next question and generate a natural transition."""
        # Find next unused question
        available = [
            i for i in range(len(INTERVIEW_QUESTIONS))
            if i not in self.questions_asked
        ]
        if not available:
            # All questions used — wrap up
            return await self._wrap_up()

        next_idx = available[0]
        self.questions_asked.append(next_idx)
        self.questions_asked_count += 1
        next_q = INTERVIEW_QUESTIONS[next_idx]
        self.last_question = next_q

        prompt = NEXT_QUESTION_PROMPT.format(answer=answer, next_question=next_q)
        return await self._call_llm(prompt, use_system=False)

    async def _wrap_up(self) -> str:
        """Generate warm closing message."""
        prompt = WRAP_UP_PROMPT.format(candidate_name=self.candidate_name)
        return await self._call_llm(prompt, use_system=False)

    async def _call_llm(self, prompt: str, use_system: bool = True) -> str:
        """Call Groq API."""
        messages = []
        if use_system:
            messages.append({"role": "system", "content": SYSTEM_PROMPT})
            messages.extend(self.messages)
        messages.append({"role": "user", "content": prompt})

        response = await client.chat.completions.create(
            model=CONVERSATION_MODEL,
            messages=messages,
            max_tokens=300,
            temperature=0.7,
        )
        return response.choices[0].message.content.strip()
