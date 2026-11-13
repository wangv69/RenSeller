from contextlib import closing

from fastapi import APIRouter

from app.db import get_connection

router = APIRouter(tags=["Diagnostics"])


@router.get("/database-test")
def database_diagnostic():
    try:
        with closing(get_connection()) as connection:
            with closing(connection.cursor()) as cursor:
                cursor.execute("SELECT NOW();")
                result = cursor.fetchone()

        return {
            "message": "Database connected!",
            "database_time": result[0]
        }

    except Exception as e:
        return {
            "error": str(e)
        }

