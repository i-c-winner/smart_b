from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.company import Company
from app.models.project import Project
from app.models.rbac import RoleName, ScopeType
from app.models.role_assignment import RoleAssignment
from app.models.schedule import Schedule
from app.models.task import Task


def _get_project_company_id(db: Session, project_id: int) -> int | None:
    project = db.get(Project, project_id)
    return project.company_id if project else None


def _get_task_ancestors(db: Session, task_id: int) -> tuple[int | None, int | None]:
    task = db.get(Task, task_id)
    if not task:
        return None, None
    company_id = _get_project_company_id(db, task.project_id)
    return task.project_id, company_id


def _get_schedule_ancestors(db: Session, schedule_id: int) -> tuple[int | None, int | None]:
    schedule = db.get(Schedule, schedule_id)
    if not schedule:
        return None, None
    company_id = _get_project_company_id(db, schedule.project_id)
    return schedule.project_id, company_id


def _user_roles_for_scopes(db: Session, user_id: int, scopes: list[tuple[ScopeType, int | None]]) -> set[RoleName]:
    stmt = select(RoleAssignment).where(RoleAssignment.user_id == user_id)
    assignments = db.scalars(stmt).all()

    valid = set()
    for assignment in assignments:
        if (assignment.scope_type, assignment.scope_id) in scopes:
            valid.add(assignment.role)
    return valid


def _build_scope_chain(db: Session, scope_type: ScopeType, scope_id: int | None) -> list[tuple[ScopeType, int | None]]:
    chain: list[tuple[ScopeType, int | None]] = [(ScopeType.GLOBAL, None)]

    if scope_type == ScopeType.GLOBAL:
        return chain

    if scope_type == ScopeType.COMPANY and scope_id is not None:
        chain.append((ScopeType.COMPANY, scope_id))
        return chain

    if scope_type == ScopeType.PROJECT and scope_id is not None:
        company_id = _get_project_company_id(db, scope_id)
        if company_id is not None:
            chain.extend([(ScopeType.COMPANY, company_id), (ScopeType.PROJECT, scope_id)])
        return chain

    if scope_type == ScopeType.TASK and scope_id is not None:
        project_id, company_id = _get_task_ancestors(db, scope_id)
        if company_id is not None and project_id is not None:
            chain.extend(
                [
                    (ScopeType.COMPANY, company_id),
                    (ScopeType.PROJECT, project_id),
                    (ScopeType.TASK, scope_id),
                ]
            )
        return chain

    if scope_type == ScopeType.SCHEDULE and scope_id is not None:
        project_id, company_id = _get_schedule_ancestors(db, scope_id)
        if company_id is not None and project_id is not None:
            chain.extend(
                [
                    (ScopeType.COMPANY, company_id),
                    (ScopeType.PROJECT, project_id),
                    (ScopeType.SCHEDULE, scope_id),
                ]
            )
        return chain

    return chain


def check_access(
    db: Session,
    user_id: int,
    scope_type: ScopeType,
    scope_id: int | None,
    required_roles: set[RoleName],
) -> None:
    chain = _build_scope_chain(db, scope_type, scope_id)
    roles = _user_roles_for_scopes(db, user_id, chain)

    if RoleName.GLOBAL_ADMIN in roles:
        return

    if roles.intersection(required_roles):
        return

    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient RBAC role for context")


def validate_scope_reference(db: Session, scope_type: ScopeType, scope_id: int | None) -> None:
    if scope_type == ScopeType.GLOBAL:
        if scope_id is not None:
            raise HTTPException(status_code=400, detail="Global scope must not have scope_id")
        return

    if scope_id is None:
        raise HTTPException(status_code=400, detail="scope_id is required for non-global scope")

    if scope_type == ScopeType.COMPANY and not db.get(Company, scope_id):
        raise HTTPException(status_code=404, detail="Company not found")
    if scope_type == ScopeType.PROJECT and not db.get(Project, scope_id):
        raise HTTPException(status_code=404, detail="Project not found")
    if scope_type == ScopeType.TASK and not db.get(Task, scope_id):
        raise HTTPException(status_code=404, detail="Task not found")
    if scope_type == ScopeType.SCHEDULE and not db.get(Schedule, scope_id):
        raise HTTPException(status_code=404, detail="Schedule not found")


def user_has_company_context(db: Session, user_id: int, company_id: int) -> bool:
    if not db.get(Company, company_id):
        return False

    assignments = db.scalars(select(RoleAssignment).where(RoleAssignment.user_id == user_id)).all()
    for assignment in assignments:
        if assignment.scope_type == ScopeType.GLOBAL and assignment.role == RoleName.GLOBAL_ADMIN:
            return True

        if assignment.scope_type == ScopeType.COMPANY and assignment.scope_id == company_id:
            return True

        if assignment.scope_type == ScopeType.PROJECT and assignment.scope_id is not None:
            if _get_project_company_id(db, assignment.scope_id) == company_id:
                return True

        if assignment.scope_type == ScopeType.TASK and assignment.scope_id is not None:
            _, task_company_id = _get_task_ancestors(db, assignment.scope_id)
            if task_company_id == company_id:
                return True

        if assignment.scope_type == ScopeType.SCHEDULE and assignment.scope_id is not None:
            _, schedule_company_id = _get_schedule_ancestors(db, assignment.scope_id)
            if schedule_company_id == company_id:
                return True

    return False


def get_accessible_company_ids(db: Session, user_id: int) -> list[int]:
    assignments = db.scalars(select(RoleAssignment).where(RoleAssignment.user_id == user_id)).all()
    has_global_admin = any(
        assignment.scope_type == ScopeType.GLOBAL and assignment.role == RoleName.GLOBAL_ADMIN
        for assignment in assignments
    )
    if has_global_admin:
        return [company.id for company in db.scalars(select(Company).order_by(Company.id)).all()]

    company_ids: set[int] = set()
    for assignment in assignments:
        if assignment.scope_type == ScopeType.COMPANY and assignment.scope_id is not None:
            company_ids.add(assignment.scope_id)
            continue

        if assignment.scope_type == ScopeType.PROJECT and assignment.scope_id is not None:
            company_id = _get_project_company_id(db, assignment.scope_id)
            if company_id is not None:
                company_ids.add(company_id)
            continue

        if assignment.scope_type == ScopeType.TASK and assignment.scope_id is not None:
            _, company_id = _get_task_ancestors(db, assignment.scope_id)
            if company_id is not None:
                company_ids.add(company_id)
            continue

        if assignment.scope_type == ScopeType.SCHEDULE and assignment.scope_id is not None:
            _, company_id = _get_schedule_ancestors(db, assignment.scope_id)
            if company_id is not None:
                company_ids.add(company_id)

    return sorted(company_ids)
