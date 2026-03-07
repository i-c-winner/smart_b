from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.api.v1.deps import AuthContext, get_auth_context, get_current_user
from app.db.session import get_db
from app.models.company import Company
from app.models.rbac import RoleName, ScopeType
from app.models.role_assignment import RoleAssignment
from app.models.user import User
from app.schemas.domain import CompanyCreate, CompanyOut, ProjectContextUserOut
from app.services.rbac_service import check_access, get_accessible_company_ids, user_has_company_context
from app.services.user_display_service import prepare_users_for_display

router = APIRouter(prefix="/companies", tags=["companies"])


@router.get("", response_model=list[CompanyOut])
def list_companies(
    db: Session = Depends(get_db),
    auth_ctx: AuthContext = Depends(get_auth_context),
) -> list[Company]:
    current_user = auth_ctx.user
    if auth_ctx.company_id is not None:
        if not user_has_company_context(db, current_user.id, auth_ctx.company_id):
            raise HTTPException(status_code=403, detail="Insufficient RBAC role for context")
        company = db.get(Company, auth_ctx.company_id)
        return [company] if company else []

    company_ids = get_accessible_company_ids(db, current_user.id)
    if not company_ids:
        return []
    return db.scalars(select(Company).where(Company.id.in_(company_ids)).order_by(Company.id)).all()


@router.get("/{company_id}", response_model=CompanyOut)
def get_company(
    company_id: int,
    db: Session = Depends(get_db),
    auth_ctx: AuthContext = Depends(get_auth_context),
) -> Company:
    current_user = auth_ctx.user
    company = db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    if not user_has_company_context(db, current_user.id, company_id):
        raise HTTPException(status_code=403, detail="Insufficient RBAC role for context")

    return company


@router.get("/{company_id}/users", response_model=list[ProjectContextUserOut])
def list_company_context_users(
    company_id: int,
    db: Session = Depends(get_db),
    auth_ctx: AuthContext = Depends(get_auth_context),
) -> list[ProjectContextUserOut]:
    current_user = auth_ctx.user
    company = db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    if not user_has_company_context(db, current_user.id, company_id):
        raise HTTPException(status_code=403, detail="Insufficient RBAC role for context")

    assignments = db.scalars(
        select(RoleAssignment).where(
            RoleAssignment.scope_type == ScopeType.COMPANY,
            RoleAssignment.scope_id == company_id,
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


@router.post("", response_model=CompanyOut, status_code=201)
def create_company(
    payload: CompanyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Company:
    check_access(
        db,
        current_user.id,
        ScopeType.GLOBAL,
        None,
        {RoleName.GLOBAL_ADMIN},
    )

    company = Company(name=payload.name, created_by=current_user.id)
    db.add(company)
    db.flush()

    assignment = RoleAssignment(
        user_id=current_user.id,
        role=RoleName.COMPANY_ADMIN,
        scope_type=ScopeType.COMPANY,
        scope_id=company.id,
    )
    db.add(assignment)
    db.commit()
    db.refresh(company)
    return company
