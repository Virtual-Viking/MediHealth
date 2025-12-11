"""
MediLink Admin Panel - Main Application
FastAPI backend for admin panel with comprehensive security and monitoring
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import os

# Import routers (to be implemented)
# from app.routers import (
#     admin_auth_routes,
#     admin_user_routes,
#     admin_monitoring_routes,
#     admin_grievance_routes,
#     admin_finance_routes,
# )

# Import middleware (to be implemented)
# from app.middleware.admin_auth_middleware import AdminAuthMiddleware
# from app.middleware.audit_logging_middleware import AuditLoggingMiddleware

# Import services
# from app.services.database_service import init_db, close_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifecycle manager for startup and shutdown events
    """
    # Startup
    print("🚀 Starting MediLink Admin Panel...")
    # await init_db()
    print("✅ Admin Panel ready!")
    
    yield
    
    # Shutdown
    print("🛑 Shutting down Admin Panel...")
    # await close_db()
    print("✅ Cleanup complete")


# Create FastAPI application
app = FastAPI(
    title="MediLink Admin Panel API",
    description="Comprehensive admin panel for managing MediLink healthcare platform",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# CORS Configuration
ADMIN_CORS_ORIGINS = os.getenv("ADMIN_CORS_ORIGINS", "http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ADMIN_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    max_age=3600,
)

# Add custom middleware
# app.add_middleware(AdminAuthMiddleware)
# app.add_middleware(AuditLoggingMiddleware)


# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "admin-panel",
        "version": "1.0.0"
    }


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "MediLink Admin Panel API",
        "version": "1.0.0",
        "docs": "/docs"
    }


# Include routers (uncomment as you implement them)
# app.include_router(admin_auth_routes.router, prefix="/admin/auth", tags=["admin-auth"])
# app.include_router(admin_user_routes.router, prefix="/admin/users", tags=["admin-users"])
# app.include_router(admin_monitoring_routes.router, prefix="/admin/monitoring", tags=["admin-monitoring"])
# app.include_router(admin_grievance_routes.router, prefix="/admin/grievances", tags=["admin-grievances"])
# app.include_router(admin_finance_routes.router, prefix="/admin/finance", tags=["admin-finance"])


if __name__ == "__main__":
    import uvicorn
    
    port = int(os.getenv("ADMIN_PORT", "8001"))
    
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=port,
        reload=True
    )

