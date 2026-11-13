from fastapi import FastAPI

from app.api.diagnostics import router as diagnostics_router
from app.api.auth import router as auth_router
from app.api.health import router as health_router

app = FastAPI(title="RenSeller API")

@app.get("/")
def home():
    return {"message": "backend works"}


app.include_router(diagnostics_router)
app.include_router(health_router)
app.include_router(auth_router)
