from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.v1.router import api_router
from app.core.database import SessionLocal
from app.db.init_db import init_db
from app.core.logging import logger


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing database schemas and seeding default accounts...")
    db = SessionLocal()
    try:
        init_db(db)
        logger.info("Database initialization completed successfully.")
    except Exception as e:
        logger.error(f"Error initializing database on startup: {str(e)}")
    finally:
        db.close()
    yield


app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Enterprise Laboratory Information Management System (LIMS) for Petroleum Geochemistry datasets.",
    version="1.0.0",
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.API_V1_STR)

from app.api.v1.endpoints.dynamic import router as dynamic_router
app.include_router(dynamic_router, prefix="/api", tags=["Dynamic Geochemistry Platform"])

@app.get("/")
def root():
    return {
        "name": settings.PROJECT_NAME,
        "status": "online",
        "docs": "/docs",
        "api_v1": settings.API_V1_STR
    }
