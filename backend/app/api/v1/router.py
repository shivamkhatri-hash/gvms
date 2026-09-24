from fastapi import APIRouter
from app.api.v1.endpoints import auth, users, dashboard, reports, health, dynamic, oracle

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api_router.include_router(users.router, prefix="/users", tags=["User Management"])
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["Analytics & KPIs"])
api_router.include_router(reports.router, prefix="/reports", tags=["Reports"])
api_router.include_router(health.router, tags=["System Health & Audit"])
api_router.include_router(dynamic.router, tags=["Dynamic Geochemistry Platform"])
api_router.include_router(oracle.router, prefix="/oracle", tags=["Oracle Regional Management"])



