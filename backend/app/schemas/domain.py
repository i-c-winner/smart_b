from datetime import datetime

from pydantic import BaseModel, EmailStr

from app.models.rbac import RoleName, ScopeType
from app.models.task_section import SectionPermissionRole, TaskSectionStatus


class CompanyCreate(BaseModel):
    name: str


class CompanyOut(BaseModel):
    id: int
    name: str
    created_by: int

    class Config:
        from_attributes = True


class ProjectCreate(BaseModel):
    company_id: int
    name: str


class ProjectOut(BaseModel):
    id: int
    company_id: int
    name: str
    created_by: int

    class Config:
        from_attributes = True


class TaskCreate(BaseModel):
    project_id: int
    title: str
    description: str | None = None
    value: list[dict[str, str]] | None = None


class TaskOut(BaseModel):
    id: int
    project_id: int
    title: str
    description: str | None
    value: list[dict[str, str]] | None
    created_by: int

    class Config:
        from_attributes = True


class ScheduleCreate(BaseModel):
    project_id: int
    title: str
    description: str | None = None


class ScheduleOut(BaseModel):
    id: int
    project_id: int
    task_id: int | None = None
    section_id: int | None = None
    title: str
    description: str | None
    planned_end_at: datetime | None = None
    section_editor_user_id: int | None = None
    created_by: int

    class Config:
        from_attributes = True


class TaskValueUpdate(BaseModel):
    value: list[dict[str, str]] | None = None


class TaskSectionCreate(BaseModel):
    key: str
    title: str
    content: dict | None = None
    position: int = 0
    planned_end_at: datetime | None = None


class TaskSectionUpdate(BaseModel):
    key: str | None = None
    title: str | None = None
    content: dict | None = None
    position: int | None = None


class TaskSectionOut(BaseModel):
    id: int
    task_id: int
    key: str
    title: str
    content: dict | None
    status: TaskSectionStatus
    position: int
    version: int
    updated_by: int | None

    class Config:
        from_attributes = True


class TaskSectionPermissionOut(BaseModel):
    id: int
    task_section_id: int
    user_id: int
    role: SectionPermissionRole
    email: EmailStr
    full_name: str


class TaskSectionPermissionAssign(BaseModel):
    role: SectionPermissionRole


class TaskSectionStatusUpdate(BaseModel):
    status: TaskSectionStatus


class RoleAssignmentCreate(BaseModel):
    user_id: int
    role: RoleName
    scope_type: ScopeType
    scope_id: int | None = None


class RoleAssignmentOut(BaseModel):
    id: int
    user_id: int
    role: RoleName
    scope_type: ScopeType
    scope_id: int | None

    class Config:
        from_attributes = True


class CompanyUserCreate(BaseModel):
    company_id: int
    email: EmailStr
    phone: str | None = None
    path_to_avatar: str | None = None
    full_name: str
    password: str
    role: RoleName = RoleName.COMPANY_VIEWER


class CompanyUserRoleUpdate(BaseModel):
    role: RoleName


class ProjectAdminAssign(BaseModel):
    user_id: int


class ProjectAdminUserOut(BaseModel):
    id: int
    email: EmailStr
    full_name: str


class ProjectAdminsOut(BaseModel):
    project_id: int
    admins: list[ProjectAdminUserOut]


class ProjectContextUserOut(BaseModel):
    id: int
    email: EmailStr
    full_name: str
    role: RoleName


class ScopedRoleAssign(BaseModel):
    user_id: int
    role: RoleName


class ScopedUserRoleOut(BaseModel):
    id: int
    email: EmailStr
    full_name: str
    role: RoleName
    scope_type: ScopeType
    scope_id: int
