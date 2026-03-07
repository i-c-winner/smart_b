from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.api.v1.deps import AuthContext, get_auth_context
from app.core.security import get_password_hash
from app.db.session import get_db
from app.models.company import Company
from app.models.project import Project
from app.models.rbac import RoleName, ScopeType
from app.models.role_assignment import RoleAssignment
from app.models.schedule import Schedule
from app.models.task import Task
from app.models.user import User
from app.schemas.auth import UserOut
from app.schemas.domain import CompanyUserCreate, CompanyUserRoleUpdate
from app.services.rbac_service import check_access, get_accessible_company_ids, user_has_company_context
from app.services.user_display_service import prepare_users_for_display

router = APIRouter(prefix="/users", tags=["users"])


@router.post("", response_model=UserOut, status_code=201)
def create_user_in_company(
    payload: CompanyUserCreate,
    db: Session = Depends(get_db),
    auth_ctx: AuthContext = Depends(get_auth_context),
) -> User:
    current_user = auth_ctx.user

    if payload.role not in {RoleName.COMPANY_VIEWER, RoleName.COMPANY_MEMBER, RoleName.COMPANY_ADMIN}:
        raise HTTPException(status_code=400, detail="Only company_viewer, company_member or company_admin role is allowed")

    if auth_ctx.company_id is not None and auth_ctx.company_id != payload.company_id:
        raise HTTPException(status_code=403, detail="Token company context mismatch")

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

    existing = db.scalar(select(User).where(User.email == payload.email))
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(
        email=payload.email,
        phone=payload.phone,
        path_to_avatar=payload.path_to_avatar,
        full_name=payload.full_name,
        hashed_password=get_password_hash(payload.password),
    )
    db.add(user)
    db.flush()

    db.add(
        RoleAssignment(
            user_id=user.id,
            role=payload.role,
            scope_type=ScopeType.COMPANY,
            scope_id=payload.company_id,
        )
    )
    db.commit()
    db.refresh(user)
    return user


@router.get("", response_model=list[UserOut])
def list_users(
    company_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    auth_ctx: AuthContext = Depends(get_auth_context),
) -> list[User]:
    current_user = auth_ctx.user
    if auth_ctx.company_id is not None:
        target_company_ids = [auth_ctx.company_id]
    elif company_id is not None:
        target_company_ids = [company_id]
    else:
        target_company_ids = get_accessible_company_ids(db, current_user.id)

    if not target_company_ids:
        return []
    for cid in target_company_ids:
        if cid is not None and not user_has_company_context(db, current_user.id, cid):
            raise HTTPException(status_code=403, detail="Insufficient RBAC role for context")

    assignments = db.scalars(select(RoleAssignment)).all()
    user_ids: set[int] = set()
    for assignment in assignments:
        for company_id in target_company_ids:
            if company_id is not None and user_has_company_context(db, assignment.user_id, company_id):
                user_ids.add(assignment.user_id)
                break

    if not user_ids:
        return []
    users = db.scalars(select(User).where(User.id.in_(user_ids)).order_by(User.id)).all()
    return prepare_users_for_display(db, users)


@router.get("/global-admins", response_model=list[UserOut])
def list_global_admins(
    db: Session = Depends(get_db),
    auth_ctx: AuthContext = Depends(get_auth_context),
) -> list[User]:
    current_user = auth_ctx.user
    check_access(
        db,
        current_user.id,
        ScopeType.GLOBAL,
        None,
        {RoleName.GLOBAL_ADMIN},
    )
    global_admin_ids = db.scalars(
        select(RoleAssignment.user_id).where(
            RoleAssignment.scope_type == ScopeType.GLOBAL,
            RoleAssignment.role == RoleName.GLOBAL_ADMIN,
        )
    ).all()
    if not global_admin_ids:
        return []
    return db.scalars(select(User).where(User.id.in_(global_admin_ids)).order_by(User.id)).all()


@router.delete("/{user_id}/companies/{company_id}", status_code=204)
def remove_user_from_company_context(
    user_id: int,
    company_id: int,
    db: Session = Depends(get_db),
    auth_ctx: AuthContext = Depends(get_auth_context),
) -> None:
    current_user = auth_ctx.user
    company = db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    if not db.get(User, user_id):
        raise HTTPException(status_code=404, detail="User not found")

    if auth_ctx.company_id is not None and auth_ctx.company_id != company_id:
        raise HTTPException(status_code=403, detail="Token company context mismatch")

    check_access(
        db,
        current_user.id,
        ScopeType.COMPANY,
        company_id,
        {RoleName.COMPANY_ADMIN},
    )

    project_ids = db.scalars(select(Project.id).where(Project.company_id == company_id)).all()
    task_ids = db.scalars(select(Task.id).where(Task.project_id.in_(project_ids))).all() if project_ids else []
    schedule_ids = db.scalars(select(Schedule.id).where(Schedule.project_id.in_(project_ids))).all() if project_ids else []

    db.execute(
        delete(RoleAssignment).where(
            RoleAssignment.user_id == user_id,
            RoleAssignment.scope_type == ScopeType.COMPANY,
            RoleAssignment.scope_id == company_id,
        )
    )
    if project_ids:
        db.execute(
            delete(RoleAssignment).where(
                RoleAssignment.user_id == user_id,
                RoleAssignment.scope_type == ScopeType.PROJECT,
                RoleAssignment.scope_id.in_(project_ids),
            )
        )
    if task_ids:
        db.execute(
            delete(RoleAssignment).where(
                RoleAssignment.user_id == user_id,
                RoleAssignment.scope_type == ScopeType.TASK,
                RoleAssignment.scope_id.in_(task_ids),
            )
        )
    if schedule_ids:
        db.execute(
            delete(RoleAssignment).where(
                RoleAssignment.user_id == user_id,
                RoleAssignment.scope_type == ScopeType.SCHEDULE,
                RoleAssignment.scope_id.in_(schedule_ids),
            )
        )

    db.commit()


@router.patch("/{user_id}/companies/{company_id}/role", status_code=204)
def update_user_company_role(
    user_id: int,
    company_id: int,
    payload: CompanyUserRoleUpdate,
    db: Session = Depends(get_db),
    auth_ctx: AuthContext = Depends(get_auth_context),
) -> None:
    current_user = auth_ctx.user
    company = db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    if not db.get(User, user_id):
        raise HTTPException(status_code=404, detail="User not found")
    if payload.role not in {RoleName.COMPANY_VIEWER, RoleName.COMPANY_MEMBER, RoleName.COMPANY_ADMIN}:
        raise HTTPException(status_code=400, detail="Only company_viewer, company_member or company_admin role is allowed")

    if auth_ctx.company_id is not None and auth_ctx.company_id != company_id:
        raise HTTPException(status_code=403, detail="Token company context mismatch")

    check_access(
        db,
        current_user.id,
        ScopeType.COMPANY,
        company_id,
        {RoleName.COMPANY_ADMIN},
    )

    existing_assignment = db.scalar(
        select(RoleAssignment).where(
            RoleAssignment.user_id == user_id,
            RoleAssignment.scope_type == ScopeType.COMPANY,
            RoleAssignment.scope_id == company_id,
        )
    )
    if not existing_assignment:
        raise HTTPException(status_code=404, detail="User has no company role in this context")

    existing_assignment.role = payload.role
    db.commit()
