import aiosqlite
import uuid
from datetime import datetime
from config import DATABASE_URL


async def init_db():
    """Create all tables on startup if they don't exist."""
    async with aiosqlite.connect(DATABASE_URL) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                candidate_name TEXT NOT NULL,
                start_time TEXT NOT NULL,
                end_time TEXT,
                status TEXT NOT NULL DEFAULT 'in_progress'
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES sessions(id)
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS assessments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL UNIQUE,
                report_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES sessions(id)
            )
        """)
        await db.commit()


async def create_session(candidate_name: str) -> str:
    """Create a new interview session and return its ID."""
    session_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()
    async with aiosqlite.connect(DATABASE_URL) as db:
        await db.execute(
            "INSERT INTO sessions (id, candidate_name, start_time, status) VALUES (?, ?, ?, ?)",
            (session_id, candidate_name, now, "in_progress"),
        )
        await db.commit()
    return session_id


async def get_session(session_id: str) -> dict | None:
    """Fetch a session by ID."""
    async with aiosqlite.connect(DATABASE_URL) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM sessions WHERE id = ?", (session_id,)
        ) as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else None


async def complete_session(session_id: str):
    """Mark a session as completed."""
    now = datetime.utcnow().isoformat()
    async with aiosqlite.connect(DATABASE_URL) as db:
        await db.execute(
            "UPDATE sessions SET status = 'completed', end_time = ? WHERE id = ?",
            (now, session_id),
        )
        await db.commit()


async def save_message(session_id: str, role: str, content: str):
    """Save a single message (interviewer or candidate)."""
    now = datetime.utcnow().isoformat()
    async with aiosqlite.connect(DATABASE_URL) as db:
        await db.execute(
            "INSERT INTO messages (session_id, role, content, timestamp) VALUES (?, ?, ?, ?)",
            (session_id, role, content, now),
        )
        await db.commit()


async def get_messages(session_id: str) -> list[dict]:
    """Fetch all messages for a session, ordered by time."""
    async with aiosqlite.connect(DATABASE_URL) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM messages WHERE session_id = ? ORDER BY id ASC",
            (session_id,),
        ) as cursor:
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]


async def save_assessment(session_id: str, report_json: str):
    """Save the final assessment report."""
    now = datetime.utcnow().isoformat()
    async with aiosqlite.connect(DATABASE_URL) as db:
        await db.execute(
            """INSERT INTO assessments (session_id, report_json, created_at)
               VALUES (?, ?, ?)
               ON CONFLICT(session_id) DO UPDATE SET report_json=excluded.report_json""",
            (session_id, report_json, now),
        )
        await db.commit()


async def get_assessment(session_id: str) -> dict | None:
    """Fetch the assessment report for a session."""
    import json
    async with aiosqlite.connect(DATABASE_URL) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM assessments WHERE session_id = ?", (session_id,)
        ) as cursor:
            row = await cursor.fetchone()
            if not row:
                return None
            data = dict(row)
            data["report"] = json.loads(data["report_json"])
            return data


async def get_all_sessions() -> list[dict]:
    """Fetch all sessions with their assessment scores for the dashboard."""
    import json
    async with aiosqlite.connect(DATABASE_URL) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("""
            SELECT s.id, s.candidate_name, s.start_time, s.end_time, s.status,
                   a.report_json
            FROM sessions s
            LEFT JOIN assessments a ON s.id = a.session_id
            ORDER BY s.start_time DESC
        """) as cursor:
            rows = await cursor.fetchall()
            result = []
            for row in rows:
                item = dict(row)
                if item["report_json"]:
                    report = json.loads(item["report_json"])
                    item["overall_score"] = report.get("overall_score")
                    item["recommendation"] = report.get("recommendation")
                else:
                    item["overall_score"] = None
                    item["recommendation"] = None
                del item["report_json"]
                result.append(item)
            return result
