import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic_settings import BaseSettings
from sqlalchemy import create_engine, select

class Settings(BaseSettings):
    api_secret_key: str = os.getenv("API_SECRET_KEY", "default-test-key-32-chars-long")
    environment: str = "production"

settings = Settings()
app = FastAPI(title="Healthy FastAPI")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://dashboard.example.com"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"status": "ok"}

