from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.api.v1.deps import get_current_user
from app.db.session import get_db
from app.models.project import Project
from app.models.rbac import RoleName, ScopeType
from app.models.role_assignment import RoleAssignment
from app.models.schedule import Schedule
from app.models.user import User
from app.schemas.domain import ScheduleCreate, ScheduleOut, ScopedRoleAssign, ScopedUserRoleOut
from app.services.rbac_service import check_access, user_has_company_context
from app.services.user_display_service import prepare_users_for_display

router = APIRouter(prefix="/schedules", tags=["schedules"])
SCHEDULE_ASSIGNABLE_ROLES = {RoleName.SCHEDULE_VIEWER, RoleName.SCHEDULE_MEMBER, RoleName.SCHEDULE_MANAGER}


@router.get("/project/{project_id}", response_model=list[ScheduleOut])
def get_schedule_by_project(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Schedule]:
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    try:
        check_access(
            db,
            current_user.id,
            ScopeType.PROJECT,
            project_id,
            {RoleName.PROJECT_MANAGER, RoleName.PROJECT_MEMBER, RoleName.PROJECT_VIEWER},
        )
        return db.scalars(select(Schedule).where(Schedule.project_id == project_id).order_by(Schedule.id.desc())).all()
    except HTTPException as exc:
        if exc.status_code != 403:
            raise

    # Deep-access fallback: if user has role in schedule context, show only those schedules.
    return db.scalars(
        select(Schedule)
        .join(
            RoleAssignment,
            (RoleAssignment.scope_type == ScopeType.SCHEDULE)
            & (RoleAssignment.scope_id == Schedule.id)
            & (RoleAssignment.user_id == current_user.id),
        )
        .where(Schedule.project_id == project_id)
        .order_by(Schedule.id.desc())
        .distinct()
    ).all()


@router.get("/{schedule_id}", response_model=ScheduleOut)
def get_schedule(
    schedule_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Schedule:
    schedule = db.get(Schedule, schedule_id)
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")

    check_access(
        db,
        current_user.id,
        ScopeType.SCHEDULE,
        schedule.id,
        {
            RoleName.PROJECT_MANAGER,
            RoleName.PROJECT_MEMBER,
            RoleName.PROJECT_VIEWER,
            RoleName.SCHEDULE_MANAGER,
            RoleName.SCHEDULE_MEMBER,
            RoleName.SCHEDULE_VIEWER,
        },
    )
    return schedule


@router.post("", response_model=ScheduleOut, status_code=201)
def create_schedule(
    payload: ScheduleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Schedule:
    project = db.get(Project, payload.project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    check_access(
        db,
        current_user.id,
        ScopeType.PROJECT,
        payload.project_id,
        {RoleName.PROJECT_MANAGER},
    )

    schedule = Schedule(
        project_id=payload.project_id,
        title=payload.title,
        description=payload.description,
        created_by=current_user.id,
    )
    db.add(schedule)
    db.commit()
    db.refresh(schedule)
    return schedule


@router.get("/{schedule_id}/users", response_model=list[ScopedUserRoleOut])
def get_schedule_users_with_roles(
    schedule_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ScopedUserRoleOut]:
    schedule = db.get(Schedule, schedule_id)
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")

    check_access(
        db,
        current_user.id,
        ScopeType.SCHEDULE,
        schedule.id,
        {
            RoleName.PROJECT_MANAGER,
            RoleName.PROJECT_MEMBER,
            RoleName.PROJECT_VIEWER,
            RoleName.SCHEDULE_MANAGER,
            RoleName.SCHEDULE_MEMBER,
            RoleName.SCHEDULE_VIEWER,
        },
    )

    assignments = db.scalars(
        select(RoleAssignment).where(
            RoleAssignment.scope_type == ScopeType.SCHEDULE,
            RoleAssignment.scope_id == schedule_id,
        )
    ).all()
    if not assignments:
        return []

    users = db.scalars(select(User).where(User.id.in_([a.user_id for a in assignments]))).all()
    users = prepare_users_for_display(db, users)
    users_by_id = {u.id: u for u in users}
    result: list[ScopedUserRoleOut] = []
    for assignment in assignments:
        user = users_by_id.get(assignment.user_id)
        if not user:
            continue
        result.append(
            ScopedUserRoleOut(
                id=user.id,
                email=user.email,
                full_name=user.full_name,
                role=assignment.role,
                scope_type=assignment.scope_type,
                scope_id=assignment.scope_id if assignment.scope_id is not None else schedule_id,
            )
        )
    return result


@router.post("/{schedule_id}/assign-role", response_model=ScopedUserRoleOut, status_code=201)
def assign_schedule_user_role(
    schedule_id: int,
    payload: ScopedRoleAssign,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ScopedUserRoleOut:
    schedule = db.get(Schedule, schedule_id)
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")

    project = db.get(Project, schedule.project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if payload.role not in SCHEDULE_ASSIGNABLE_ROLES:
        raise HTTPException(status_code=400, detail="Role is not assignable for schedule context")

    user = db.get(User, payload.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    check_access(
        db,
        current_user.id,
        ScopeType.SCHEDULE,
        schedule.id,
        {RoleName.PROJECT_MANAGER, RoleName.SCHEDULE_MANAGER},
    )

    if not user_has_company_context(db, payload.user_id, project.company_id):
        raise HTTPException(status_code=400, detail="User is not in current company context")

    existing = db.scalar(
        select(RoleAssignment).where(
            RoleAssignment.user_id == payload.user_id,
            RoleAssignment.role == payload.role,
            RoleAssignment.scope_type == ScopeType.SCHEDULE,
            RoleAssignment.scope_id == schedule_id,
        )
    )
    if not existing:
        db.add(
            RoleAssignment(
                user_id=payload.user_id,
                role=payload.role,
                scope_type=ScopeType.SCHEDULE,
                scope_id=schedule_id,
            )
        )
        db.commit()

    return ScopedUserRoleOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=payload.role,
        scope_type=ScopeType.SCHEDULE,
        scope_id=schedule_id,
    )


@router.delete("/{schedule_id}/assign-role/{user_id}", status_code=204)
def clear_schedule_user_roles(
    schedule_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    schedule = db.get(Schedule, schedule_id)
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")

    check_access(
        db,
        current_user.id,
        ScopeType.SCHEDULE,
        schedule.id,
        {RoleName.PROJECT_MANAGER, RoleName.SCHEDULE_MANAGER},
    )

    db.execute(
        delete(RoleAssignment).where(
            RoleAssignment.user_id == user_id,
            RoleAssignment.scope_type == ScopeType.SCHEDULE,
            RoleAssignment.scope_id == schedule_id,
        )
    )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/{schedule_id}", status_code=204)
def delete_schedule(
    schedule_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    schedule = db.get(Schedule, schedule_id)
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")

    check_access(
        db,
        current_user.id,
        ScopeType.PROJECT,
        schedule.project_id,
        {RoleName.PROJECT_MANAGER},
    )

    db.delete(schedule)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
