from fastapi import FastAPI

from app.db import get_connection
from app.api.auth import router as auth_router
from app.api.health import router as health_router
from app.api.schedule import router as schedule_router
from app.api.search import router as search_router

app = FastAPI(title="RenSeller API")

@app.get("/")
def home():
    return {"message": "backend works"}

@app.get("/database-test")
def test():
    try:
        conn = get_connection()

        cursor = conn.cursor()
        cursor.execute("SELECT NOW();")
        result = cursor.fetchone()

        cursor.close()
        conn.close()

        return {
            "message": "Database connected!",
            "database_time": result[0]
        }

    except Exception as e:
        return {
            "error": str(e)
        }

app.include_router(health_router)
app.include_router(auth_router)
app.include_router(search_router)
app.include_router(schedule_router)
