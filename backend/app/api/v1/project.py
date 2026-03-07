from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.api.v1.deps import AuthContext, get_auth_context, get_current_user
from app.db.session import get_db
from app.models.company import Company
from app.models.project import Project
from app.models.rbac import RoleName, ScopeType
from app.models.role_assignment import RoleAssignment
from app.models.schedule import Schedule
from app.models.task import Task
from app.models.user import User
from app.schemas.domain import (
    ProjectAdminAssign,
    ProjectAdminsOut,
    ProjectAdminUserOut,
    ProjectContextUserOut,
    ProjectCreate,
    ProjectOut,
    RoleAssignmentOut,
    ScopedRoleAssign,
    ScopedUserRoleOut,
)
from app.services.rbac_service import check_access, user_has_company_context
from app.services.user_display_service import prepare_users_for_display

router = APIRouter(prefix="/projects", tags=["projects"])
PROJECT_ASSIGNABLE_ROLES = {RoleName.PROJECT_VIEWER, RoleName.PROJECT_MEMBER, RoleName.PROJECT_MANAGER}


@router.get("", response_model=list[ProjectOut])
def list_projects(
    company_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    auth_ctx: AuthContext = Depends(get_auth_context),
) -> list[Project]:
    current_user = auth_ctx.user
    effective_company_id = company_id if company_id is not None else auth_ctx.company_id
    if effective_company_id is None:
        raise HTTPException(status_code=400, detail="company_id is required")

    company = db.get(Company, effective_company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    if not user_has_company_context(db, current_user.id, effective_company_id):
        raise HTTPException(status_code=403, detail="Insufficient RBAC role for context")

    return db.scalars(
        select(Project).where(Project.company_id == effective_company_id).order_by(Project.id)
    ).all()


@router.get("/admins", response_model=list[ProjectAdminsOut])
def list_project_admins(
    company_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    auth_ctx: AuthContext = Depends(get_auth_context),
) -> list[ProjectAdminsOut]:
    current_user = auth_ctx.user
    effective_company_id = company_id if company_id is not None else auth_ctx.company_id
    if effective_company_id is None:
        raise HTTPException(status_code=400, detail="company_id is required")

    company = db.get(Company, effective_company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    if not user_has_company_context(db, current_user.id, effective_company_id):
        raise HTTPException(status_code=403, detail="Insufficient RBAC role for context")

    projects = db.scalars(
        select(Project).where(Project.company_id == effective_company_id).order_by(Project.id)
    ).all()
    if not projects:
        return []

    project_ids = [project.id for project in projects]
    assignments = db.scalars(
        select(RoleAssignment).where(
            RoleAssignment.scope_type == ScopeType.PROJECT,
            RoleAssignment.role == RoleName.PROJECT_MANAGER,
            RoleAssignment.scope_id.in_(project_ids),
        )
    ).all()

    admins_by_project: dict[int, list[ProjectAdminUserOut]] = {project_id: [] for project_id in project_ids}
    user_cache: dict[int, User] = {}
    for assignment in assignments:
        if assignment.scope_id is None:
            continue
        user = user_cache.get(assignment.user_id)
        if user is None:
            user = db.get(User, assignment.user_id)
            if user:
                user_cache[assignment.user_id] = user
        if not user:
            continue
        display_users = prepare_users_for_display(db, [user])
        if not display_users:
            continue
        display_user = display_users[0]
        admins_by_project[assignment.scope_id].append(
            ProjectAdminUserOut(id=display_user.id, email=display_user.email, full_name=display_user.full_name)
        )

    return [
        ProjectAdminsOut(project_id=project.id, admins=admins_by_project.get(project.id, [])) for project in projects
    ]


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(
    project_id: int,
    db: Session = Depends(get_db),
    auth_ctx: AuthContext = Depends(get_auth_context),
) -> Project:
    current_user = auth_ctx.user
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if not user_has_company_context(db, current_user.id, project.company_id):
        raise HTTPException(status_code=403, detail="Insufficient RBAC role for context")

    return project


@router.get("/{project_id}/users", response_model=list[ProjectContextUserOut])
def list_project_context_users(
    project_id: int,
    db: Session = Depends(get_db),
    auth_ctx: AuthContext = Depends(get_auth_context),
) -> list[ProjectContextUserOut]:
    current_user = auth_ctx.user
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if not user_has_company_context(db, current_user.id, project.company_id):
        raise HTTPException(status_code=403, detail="Insufficient RBAC role for context")

    assignments = db.scalars(
        select(RoleAssignment).where(
            RoleAssignment.scope_type == ScopeType.PROJECT,
            RoleAssignment.scope_id == project_id,
        )
    ).all()
    if not assignments:
        return []

    user_ids = list({assignment.user_id for assignment in assignments})
    users = db.scalars(select(User).where(User.id.in_(user_ids)).order_by(User.id)).all()
    users = prepare_users_for_display(db, users)
    users_by_id = {user.id: user for user in users}

    result: list[ProjectContextUserOut] = []
    for assignment in assignments:
        user = users_by_id.get(assignment.user_id)
        if not user:
            continue
        result.append(
            ProjectContextUserOut(
                id=user.id,
                email=user.email,
                full_name=user.full_name,
                role=assignment.role,
            )
        )
    return result


@router.post("", response_model=ProjectOut, status_code=201)
def create_project(
    payload: ProjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Project:
    company = db.get(Company, payload.company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    check_access(
        db,
        current_user.id,
        ScopeType.COMPANY,
        payload.company_id,
        {RoleName.COMPANY_ADMIN},
    )

    project = Project(company_id=payload.company_id, name=payload.name, created_by=current_user.id)
    db.add(project)
    db.flush()

    assignment = RoleAssignment(
        user_id=current_user.id,
        role=RoleName.PROJECT_MANAGER,
        scope_type=ScopeType.PROJECT,
        scope_id=project.id,
    )
    db.add(assignment)
    db.commit()
    db.refresh(project)
    return project


@router.post("/{project_id}/assign-admin", response_model=RoleAssignmentOut, status_code=201)
def assign_project_admin(
    project_id: int,
    payload: ProjectAdminAssign,
    db: Session = Depends(get_db),
    auth_ctx: AuthContext = Depends(get_auth_context),
) -> RoleAssignment:
    current_user = auth_ctx.user
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if not db.get(User, payload.user_id):
        raise HTTPException(status_code=404, detail="User not found")

    check_access(
        db,
        current_user.id,
        ScopeType.COMPANY,
        project.company_id,
        {RoleName.COMPANY_ADMIN},
    )

    if not user_has_company_context(db, payload.user_id, project.company_id):
        raise HTTPException(status_code=400, detail="User is not in current company context")

    existing = db.scalar(
        select(RoleAssignment).where(
            RoleAssignment.user_id == payload.user_id,
            RoleAssignment.role == RoleName.PROJECT_MANAGER,
            RoleAssignment.scope_type == ScopeType.PROJECT,
            RoleAssignment.scope_id == project_id,
        )
    )
    if existing:
        return existing

    assignment = RoleAssignment(
        user_id=payload.user_id,
        role=RoleName.PROJECT_MANAGER,
        scope_type=ScopeType.PROJECT,
        scope_id=project_id,
    )
    db.add(assignment)
    db.commit()
    db.refresh(assignment)
    return assignment


@router.delete("/{project_id}/assign-admin/{user_id}", status_code=204)
def clear_project_admin(
    project_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    auth_ctx: AuthContext = Depends(get_auth_context),
) -> None:
    current_user = auth_ctx.user
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    check_access(
        db,
        current_user.id,
        ScopeType.COMPANY,
        project.company_id,
        {RoleName.COMPANY_ADMIN},
    )

    db.execute(
        delete(RoleAssignment).where(
            RoleAssignment.user_id == user_id,
            RoleAssignment.role == RoleName.PROJECT_MANAGER,
            RoleAssignment.scope_type == ScopeType.PROJECT,
            RoleAssignment.scope_id == project_id,
        )
    )
    db.commit()


@router.post("/{project_id}/assign-role", response_model=ScopedUserRoleOut, status_code=201)
def assign_project_user_role(
    project_id: int,
    payload: ScopedRoleAssign,
    db: Session = Depends(get_db),
    auth_ctx: AuthContext = Depends(get_auth_context),
) -> ScopedUserRoleOut:
    current_user = auth_ctx.user
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if payload.role not in PROJECT_ASSIGNABLE_ROLES:
        raise HTTPException(status_code=400, detail="Role is not assignable for project context")

    user = db.get(User, payload.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    check_access(
        db,
        current_user.id,
        ScopeType.PROJECT,
        project_id,
        {RoleName.COMPANY_ADMIN, RoleName.PROJECT_MANAGER},
    )

    if not user_has_company_context(db, payload.user_id, project.company_id):
        raise HTTPException(status_code=400, detail="User is not in current company context")

    db.execute(
        delete(RoleAssignment).where(
            RoleAssignment.user_id == payload.user_id,
            RoleAssignment.scope_type == ScopeType.PROJECT,
            RoleAssignment.scope_id == project_id,
        )
    )
    db.add(
        RoleAssignment(
            user_id=payload.user_id,
            role=payload.role,
            scope_type=ScopeType.PROJECT,
            scope_id=project_id,
        )
    )
    db.commit()

    return ScopedUserRoleOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=payload.role,
        scope_type=ScopeType.PROJECT,
        scope_id=project_id,
    )


@router.delete("/{project_id}/assign-role/{user_id}", status_code=204)
def clear_project_user_roles(
    project_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    auth_ctx: AuthContext = Depends(get_auth_context),
) -> None:
    current_user = auth_ctx.user
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    check_access(
        db,
        current_user.id,
        ScopeType.PROJECT,
        project_id,
        {RoleName.COMPANY_ADMIN, RoleName.PROJECT_MANAGER},
    )

    db.execute(
        delete(RoleAssignment).where(
            RoleAssignment.user_id == user_id,
            RoleAssignment.scope_type == ScopeType.PROJECT,
            RoleAssignment.scope_id == project_id,
        )
    )
    db.commit()


@router.delete("/{project_id}", status_code=204)
def delete_project(
    project_id: int,
    db: Session = Depends(get_db),
    auth_ctx: AuthContext = Depends(get_auth_context),
) -> None:
    current_user = auth_ctx.user
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    check_access(
        db,
        current_user.id,
        ScopeType.COMPANY,
        project.company_id,
        {RoleName.COMPANY_ADMIN},
    )

    task_ids = db.scalars(select(Task.id).where(Task.project_id == project_id)).all()
    schedule_ids = db.scalars(select(Schedule.id).where(Schedule.project_id == project_id)).all()

    db.execute(
        delete(RoleAssignment).where(
            RoleAssignment.scope_type == ScopeType.PROJECT,
            RoleAssignment.scope_id == project_id,
        )
    )
    if task_ids:
        db.execute(
            delete(RoleAssignment).where(
                RoleAssignment.scope_type == ScopeType.TASK,
                RoleAssignment.scope_id.in_(task_ids),
            )
        )
    if schedule_ids:
        db.execute(
            delete(RoleAssignment).where(
                RoleAssignment.scope_type == ScopeType.SCHEDULE,
                RoleAssignment.scope_id.in_(schedule_ids),
            )
        )

    db.delete(project)
    db.commit()
