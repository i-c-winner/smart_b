from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.v1.deps import get_current_user
from app.db.session import get_db
from app.models.rbac import RoleName, ScopeType
from app.models.role_assignment import RoleAssignment
from app.models.user import User
from app.schemas.domain import RoleAssignmentCreate, RoleAssignmentOut
from app.services.rbac_service import check_access, validate_scope_reference

router = APIRouter(prefix="/rbac", tags=["rbac"])


@router.post("/assign-role", response_model=RoleAssignmentOut, status_code=201)
def assign_role(
    payload: RoleAssignmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RoleAssignment:
    target_user = db.get(User, payload.user_id)
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    if payload.scope_type == ScopeType.GLOBAL:
        check_access(db, current_user.id, ScopeType.GLOBAL, None, {RoleName.GLOBAL_ADMIN})
    else:
        required_roles = {RoleName.GLOBAL_ADMIN}
        if payload.scope_type == ScopeType.COMPANY:
            required_roles.add(RoleName.COMPANY_ADMIN)
        elif payload.scope_type == ScopeType.PROJECT:
            required_roles.update({RoleName.COMPANY_ADMIN, RoleName.PROJECT_MANAGER})
        elif payload.scope_type == ScopeType.TASK:
            required_roles.update({RoleName.COMPANY_ADMIN, RoleName.PROJECT_MANAGER, RoleName.TASK_MANAGER})
        elif payload.scope_type == ScopeType.SCHEDULE:
            required_roles.update(
                {RoleName.COMPANY_ADMIN, RoleName.PROJECT_MANAGER, RoleName.SCHEDULE_MANAGER}
            )
        check_access(
            db,
            current_user.id,
            payload.scope_type,
            payload.scope_id,
            required_roles,
        )

    validate_scope_reference(db, payload.scope_type, payload.scope_id)

    assignment = RoleAssignment(
        user_id=payload.user_id,
        role=payload.role,
        scope_type=payload.scope_type,
        scope_id=payload.scope_id,
    )
    db.add(assignment)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Role assignment already exists")
    db.refresh(assignment)
    return assignment
