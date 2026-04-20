import re
from groq import AsyncGroq
from config import GROQ_API_KEY, CONVERSATION_MODEL
from prompts import (
    SYSTEM_PROMPT,
    ASSESSMENT_DIMENSIONS,
    OPENING_PROMPT,
    NEXT_MOVE_PROMPT,
    REPEAT_PROMPT,
    DONT_KNOW_PROMPT,
    WRAP_UP_PROMPT,
    ASSESS_QUALITY_PROMPT,
)

client = AsyncGroq(api_key=GROQ_API_KEY)

def create_engine(session_id: str, candidate_name: str, exchange_count: int = 0, uncovered_dimensions: list = None, messages: list = None) -> "InterviewEngine":
    return InterviewEngine(session_id, candidate_name, exchange_count, uncovered_dimensions, messages)


# ---------------------------------------------------------------
# Detection helpers
# ---------------------------------------------------------------

REPEAT_RE = re.compile(
    r"\b(repeat|again|pardon|say that again|what (was|were|did) you (ask|say)|"
    r"didn'?t (hear|catch|understand)|can you say|come again|huh|sorry\??)\b",
    re.IGNORECASE,
)

DONT_KNOW_RE = re.compile(
    r"^(i don'?t know|idk|no idea|not sure|i'?m not sure|"
    r"i have no idea|nothing|i can'?t|i cannot|i give up)[\.\!\?]*$",
    re.IGNORECASE,
)

EARLY_END_MARKER = "[Candidate chose to end interview early]"

MAX_EXCHANGES = 7   # Total candidate turns before wrap-up


class InterviewEngine:
    """
    Dynamic interview engine.
    - No fixed question list — LLM decides what to ask based on conversation + uncovered dimensions.
    - Tracks which assessment dimensions have been adequately covered.
    - Wraps up after MAX_EXCHANGES turns or when dimensions are covered.
    """

    def __init__(self, session_id: str, candidate_name: str, exchange_count: int = 0, uncovered_dimensions: list = None, messages: list = None):
        self.session_id = session_id
        self.candidate_name = candidate_name

        self.messages = messages or []
        
        if uncovered_dimensions is None:
            self.uncovered_dimensions = list(ASSESSMENT_DIMENSIONS.keys())
        else:
            self.uncovered_dimensions = uncovered_dimensions
            
        self.covered_dimensions = []

        self.exchange_count = exchange_count
        self.follow_up_used = False
        self.dont_know_streak = 0
        self.interview_complete = False
        
        self.last_sarah_message = ""
        for m in reversed(self.messages):
            if m["role"] == "assistant":
                self.last_sarah_message = m["content"]
                break

    # ------------------------------------------------------------------
    # PUBLIC: Opening message
    # ------------------------------------------------------------------

    async def get_opening_message(self) -> str:
        prompt = OPENING_PROMPT.format(candidate_name=self.candidate_name)
        response = await self._call_simple(prompt)
        self.last_sarah_message = response
        self.messages.append({"role": "assistant", "content": response})
        return response

    # ------------------------------------------------------------------
    # PUBLIC: Process candidate answer → return Sarah's next response
    # ------------------------------------------------------------------

    async def process_candidate_answer(self, answer: str, time_remaining: str = "07:00") -> dict:

        # --- Handle early-end (Manual or System-Auto) ---
        is_termination = answer.startswith("[") and any(x in answer.lower() for x in ["end", "stop", "terminate"])
        if is_termination:
            if not self.interview_complete:
                self.interview_complete = True
                response = await self._wrap_up()
                self.messages.append({"role": "assistant", "content": response})
            else:
                response = self.last_sarah_message
            return {"interviewer_response": response, "interview_complete": True}

        self.messages.append({"role": "user", "content": answer})

        # --- Repeat request ---
        if self._is_repeat(answer):
            response = await self._repeat()
            self.messages.append({"role": "assistant", "content": response})
            return {"interviewer_response": response, "interview_complete": False}

        # --- "I don't know" streak ---
        if DONT_KNOW_RE.match(answer.strip()):
            self.dont_know_streak += 1
        else:
            self.dont_know_streak = 0

        if self.dont_know_streak >= 2:
            self.dont_know_streak = 0
            self.follow_up_used = False
            self.exchange_count += 1
            self._mark_dimension_progress()
            response = await self._graceful_move_on()
            self.messages.append({"role": "assistant", "content": response})
            return {"interviewer_response": response, "interview_complete": self.interview_complete}

        # --- Normal flow ---
        # Detect frustration or "I already told you" to force a move-on
        FRUSTRATION_RE = re.compile(r"(already (told|said|explained)|just said)", re.IGNORECASE)
        is_frustrated = bool(FRUSTRATION_RE.search(answer))

        quality = "strong"
        if not self.follow_up_used and not is_frustrated:
            quality = await self._assess_quality(answer)

        # Decide: follow-up or next question or wrap-up
        if quality in ("vague", "short") and not self.follow_up_used and not is_frustrated:
            # Use a follow-up — let LLM decide what to dig into
            response = await self._next_move(answer, time_remaining, force_followup=True)
            self.follow_up_used = True

        else:
            # Move to next exchange
            self.exchange_count += 1
            self.follow_up_used = False
            self._mark_dimension_progress()

            if self.exchange_count >= MAX_EXCHANGES or not self.uncovered_dimensions:
                self.interview_complete = True
                response = await self._wrap_up()
            else:
                response = await self._next_move(answer, time_remaining, force_followup=False)

        self.last_sarah_message = response
        self.messages.append({"role": "assistant", "content": response})
        return {"interviewer_response": response, "interview_complete": self.interview_complete}

    # ------------------------------------------------------------------
    # PRIVATE helpers
    # ------------------------------------------------------------------

    def _mark_dimension_progress(self):
        """Heuristically mark dimensions as covered as conversation progresses."""
        # Each exchange roughly covers one dimension in order
        idx = min(self.exchange_count - 1, len(self.uncovered_dimensions) - 1)
        if idx >= 0 and self.uncovered_dimensions:
            dim = self.uncovered_dimensions[0]
            self.uncovered_dimensions.remove(dim)
            self.covered_dimensions.append(dim)

    def _is_repeat(self, answer: str) -> bool:
        stripped = answer.strip().lower()
        words = stripped.split()
        # Short confused answer (≤7 words) with a repeat signal
        if len(words) <= 7 and REPEAT_RE.search(stripped):
            return True
        # Explicit repeat request in any length answer
        if re.search(r"\b(repeat|say that again|come again)\b", stripped, re.IGNORECASE):
            return True
        return False

    async def _repeat(self) -> str:
        if not self.last_sarah_message:
             return "Of course! To get us started, could you tell me a bit about yourself and your background?"
        prompt = REPEAT_PROMPT.format(last_question=self.last_sarah_message)
        response = await self._call_simple(prompt)
        if "hiccup" in response or "catch how to respond" in response:
            return f"Of course! I was asking: {self.last_sarah_message}"
        return response

    async def _graceful_move_on(self) -> str:
        if self.exchange_count >= MAX_EXCHANGES or not self.uncovered_dimensions:
            self.interview_complete = True
            return await self._wrap_up()
        next_dim = self.uncovered_dimensions[0] if self.uncovered_dimensions else "teaching approach"
        next_hint = ASSESSMENT_DIMENSIONS.get(next_dim, "their teaching approach")
        prompt = DONT_KNOW_PROMPT.format(next_dimension_hint=next_hint)
        return await self._call_with_history(prompt)

    async def _next_move(self, last_answer: str, time_remaining: str, force_followup: bool = False) -> str:
        """
        Decide what to ask next using the dynamic NEXT_MOVE_PROMPT.
        Sarah considers the full history, uncovered dimensions, and the clock.
        """
        dim_lines = "\n".join(
            f"- {dim}: {ASSESSMENT_DIMENSIONS[dim]}"
            for dim in self.uncovered_dimensions
        ) or "All dimensions covered — start wrapping up."

        prompt = NEXT_MOVE_PROMPT.format(
            candidate_name=self.candidate_name,
            exchange_count=self.exchange_count,
            uncovered_dimensions=dim_lines,
            last_answer=last_answer,
            time_remaining=time_remaining
        )

        # If forcing follow-up, add instruction
        if force_followup:
            prompt += "\n\nNOTE: Their answer was vague. Use Option A (follow-up). Be specific about what they said."

        return await self._call_with_history(prompt)

    async def _wrap_up(self) -> str:
        prompt = WRAP_UP_PROMPT.format(candidate_name=self.candidate_name)
        return await self._call_simple(prompt)

    async def _assess_quality(self, answer: str) -> str:
        """Quick quality check — strong / vague / short."""
        if len(answer.split()) < 12:
            return "short"
        prompt = ASSESS_QUALITY_PROMPT.format(
            question=self.last_sarah_message,
            answer=answer,
        )
        result = (await self._call_simple(prompt)).strip().lower()
        return result if result in ("strong", "vague", "short") else "strong"

    # ------------------------------------------------------------------
    # LLM callers
    # ------------------------------------------------------------------

    async def _call_with_history(self, prompt: str) -> str:
        """Call LLM with full conversation history as context."""
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            *self.messages,
            {"role": "user", "content": prompt},
        ]
        return await self._groq(messages)

    async def _call_simple(self, prompt: str) -> str:
        """Call LLM with just the prompt — no conversation history needed."""
        return await self._groq([{"role": "user", "content": prompt}])

    async def _groq(self, messages: list[dict]) -> str:
        try:
            response = await client.chat.completions.create(
                model=CONVERSATION_MODEL,
                messages=messages,
                max_tokens=350,
                temperature=0.8,
            )
            content = response.choices[0].message.content.strip()
            if not content:
                print("[LLM Error] Returned empty content.")
                return "I'm sorry, I didn't quite catch how to respond to that. Could we move on to the next topic?"
            return content
        except Exception as e:
            print(f"[LLM Exception] {str(e)}")
            return "I apologize, my system had a brief hiccup. Let's continue."
