from fastapi import APIRouter

from app.api.v1.auth import router as auth_router
from app.api.v1.company import router as company_router
from app.api.v1.project import router as project_router
from app.api.v1.rbac import router as rbac_router
from app.api.v1.schedule import router as schedule_router
from app.api.v1.task import router as task_router
from app.api.v1.user import router as user_router

api_router = APIRouter()
api_router.include_router(auth_router)
api_router.include_router(user_router)
api_router.include_router(company_router)
api_router.include_router(project_router)
api_router.include_router(task_router)
api_router.include_router(schedule_router)
api_router.include_router(rbac_router)
