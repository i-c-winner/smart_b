from fastapi import APIRouter, Depends, Form, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.v1.deps import get_current_user
from app.core.security import create_access_token, get_password_hash, verify_password
from app.db.session import get_db
from app.models.rbac import RoleName, ScopeType
from app.models.role_assignment import RoleAssignment
from app.models.user import User
from app.schemas.auth import LoginRequest, TokenResponse, UserOut, UserRegister
from app.services.rbac_service import user_has_company_context

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserOut, status_code=201)
def register(payload: UserRegister, db: Session = Depends(get_db)) -> User:
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

    users_count = db.scalar(select(func.count(User.id)))
    if users_count == 1:
        db.add(
            RoleAssignment(
                user_id=user.id,
                role=RoleName.GLOBAL_ADMIN,
                scope_type=ScopeType.GLOBAL,
                scope_id=None,
            )
        )

    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user = db.scalar(select(User).where(User.email == payload.email))
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if payload.company_id is not None and not user_has_company_context(db, user.id, payload.company_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User does not have access to selected company context",
        )

    return TokenResponse(
        access_token=create_access_token(str(user.id), company_id=payload.company_id),
        company_id=payload.company_id,
    )


@router.post("/token", response_model=TokenResponse)
def oauth2_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    company_id: int | None = Form(default=None),
    db: Session = Depends(get_db),
) -> TokenResponse:
    # OAuth2 password flow uses "username" field; in this app it is user email.
    user = db.scalar(select(User).where(User.email == form_data.username))
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if company_id is not None and not user_has_company_context(db, user.id, company_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User does not have access to selected company context",
        )

    return TokenResponse(
        access_token=create_access_token(str(user.id), company_id=company_id),
        company_id=company_id,
    )


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)) -> User:
    return current_user
