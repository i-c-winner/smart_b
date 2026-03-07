from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy import delete, select, text
from sqlalchemy.orm import Session

from app.api.v1.deps import get_current_user
from app.db.session import get_db
from app.models.project import Project
from app.models.rbac import RoleName, ScopeType
from app.models.role_assignment import RoleAssignment
from app.models.schedule import Schedule
from app.models.task import Task
from app.models.task_section import SectionPermissionRole, TaskSection, TaskSectionPermission, TaskSectionStatus
from app.models.user import User
from app.schemas.domain import (
    ScheduleOut,
    ScopedRoleAssign,
    ScopedUserRoleOut,
    TaskCreate,
    TaskOut,
    TaskSectionCreate,
    TaskSectionOut,
    TaskSectionPermissionAssign,
    TaskSectionPermissionOut,
    TaskSectionStatusUpdate,
    TaskSectionUpdate,
    TaskValueUpdate,
)
from app.services.rbac_service import check_access, user_has_company_context
from app.services.user_display_service import prepare_users_for_display

router = APIRouter(prefix="/tasks", tags=["tasks"])
TASK_ASSIGNABLE_ROLES = {RoleName.TASK_VIEWER, RoleName.TASK_MEMBER, RoleName.TASK_MANAGER}


@router.get("/project/{project_id}", response_model=list[TaskOut])
def get_tasks_by_project(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Task]:
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
        return db.scalars(select(Task).where(Task.project_id == project_id).order_by(Task.id.desc())).all()
    except HTTPException as exc:
        if exc.status_code != 403:
            raise

    # Deep-access fallback: if user has role in task context, show only those tasks.
    task_scoped = db.scalars(
        select(Task.id)
        .join(
            RoleAssignment,
            (RoleAssignment.scope_type == ScopeType.TASK)
            & (RoleAssignment.scope_id == Task.id)
            & (RoleAssignment.user_id == current_user.id),
        )
        .where(Task.project_id == project_id)
    ).all()
    section_scoped = db.scalars(
        select(Task.id)
        .join(TaskSection, TaskSection.task_id == Task.id)
        .join(
            TaskSectionPermission,
            (TaskSectionPermission.task_section_id == TaskSection.id)
            & (TaskSectionPermission.user_id == current_user.id),
        )
        .where(Task.project_id == project_id)
    ).all()
    visible_ids = set(task_scoped) | set(section_scoped)
    if not visible_ids:
        return []
    return db.scalars(select(Task).where(Task.id.in_(visible_ids)).order_by(Task.id.desc())).all()


@router.get("/{task_id}", response_model=TaskOut)
def get_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Task:
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    try:
        check_access(
            db,
            current_user.id,
            ScopeType.TASK,
            task.id,
            {
                RoleName.PROJECT_MANAGER,
                RoleName.PROJECT_MEMBER,
                RoleName.PROJECT_VIEWER,
                RoleName.TASK_MANAGER,
                RoleName.TASK_MEMBER,
                RoleName.TASK_VIEWER,
            },
        )
    except HTTPException as exc:
        if exc.status_code != 403:
            raise
        has_section_perm = db.scalar(
            select(TaskSectionPermission.id)
            .join(TaskSection, TaskSection.id == TaskSectionPermission.task_section_id)
            .where(TaskSection.task_id == task.id, TaskSectionPermission.user_id == current_user.id)
        )
        if not has_section_perm:
            raise HTTPException(status_code=403, detail="Insufficient RBAC role for context")
    return task


@router.post("", response_model=TaskOut, status_code=201)
def create_task(
    payload: TaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Task:
    project = db.get(Project, payload.project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    check_access(
        db,
        current_user.id,
        ScopeType.PROJECT,
        payload.project_id,
        {RoleName.PROJECT_MANAGER, RoleName.PROJECT_MEMBER},
    )

    task = Task(
        project_id=payload.project_id,
        title=payload.title,
        description=payload.description,
        value=payload.value,
        created_by=current_user.id,
    )
    db.add(task)
    db.flush()
    db.add(
        Schedule(
            project_id=payload.project_id,
            task_id=task.id,
            title=f"Schedule for {task.title}",
            description="Auto schedule for task sections",
            created_by=current_user.id,
        )
    )
    db.commit()
    db.refresh(task)
    return task


@router.patch("/{task_id}/value", response_model=TaskOut)
def update_task_value(
    task_id: int,
    payload: TaskValueUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Task:
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    check_access(
        db,
        current_user.id,
        ScopeType.TASK,
        task.id,
        {RoleName.PROJECT_MANAGER, RoleName.TASK_MANAGER},
    )

    task.value = payload.value
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def _get_section_or_404(db: Session, task_id: int, section_id: int) -> TaskSection:
    section = db.get(TaskSection, section_id)
    if not section or section.task_id != task_id:
        raise HTTPException(status_code=404, detail="Section not found")
    return section


def _can_manage_sections(db: Session, user_id: int, task_id: int) -> None:
    check_access(
        db,
        user_id,
        ScopeType.TASK,
        task_id,
        {RoleName.PROJECT_MANAGER, RoleName.TASK_MANAGER},
    )


def _can_manage_single_section(db: Session, user_id: int, task_id: int, section_id: int) -> None:
    try:
        _can_manage_sections(db, user_id, task_id)
        return
    except HTTPException as exc:
        if exc.status_code != 403:
            raise

    perm = db.scalar(
        select(TaskSectionPermission).where(
            TaskSectionPermission.task_section_id == section_id,
            TaskSectionPermission.user_id == user_id,
        )
    )
    if perm and perm.role == SectionPermissionRole.MANAGER:
        return

    raise HTTPException(status_code=403, detail="Insufficient section permissions")


def _can_view_sections(db: Session, user_id: int, task_id: int) -> None:
    check_access(
        db,
        user_id,
        ScopeType.TASK,
        task_id,
        {
            RoleName.PROJECT_MANAGER,
            RoleName.PROJECT_MEMBER,
            RoleName.PROJECT_VIEWER,
            RoleName.TASK_MANAGER,
            RoleName.TASK_MEMBER,
            RoleName.TASK_VIEWER,
        },
    )


def _can_edit_section_content(db: Session, user_id: int, task_id: int, section_id: int) -> None:
    perm = db.scalar(
        select(TaskSectionPermission).where(
            TaskSectionPermission.task_section_id == section_id,
            TaskSectionPermission.user_id == user_id,
        )
    )
    if perm and perm.role == SectionPermissionRole.EDITOR:
        return

    raise HTTPException(status_code=403, detail="Only section_editor can change section content")


def _sync_task_common_schedule_dates(db: Session, task_id: int) -> None:
    # Recompute common task schedule planned end from section schedules.
    db.execute(
        text(
            """
            UPDATE schedules common
            SET
                planned_end_at = agg.max_planned_end
            FROM (
                SELECT
                    (
                        SELECT MAX(ss.planned_end_at)
                        FROM schedules ss
                        JOIN task_sections ts ON ts.id = ss.section_id
                        WHERE ts.task_id = :task_id
                    ) AS max_planned_end
            ) AS agg
            WHERE common.task_id = :task_id
              AND common.section_id IS NULL
            """
        ),
        {"task_id": task_id},
    )


def _sync_section_schedule_dates(db: Session, task_id: int) -> None:
    # Keep section_editor_user_id in sync with assigned section_editor role.
    db.execute(
        text(
            """
            UPDATE schedules s
            SET
                section_editor_user_id = (
                    SELECT tsp.user_id
                    FROM task_section_permissions tsp
                    WHERE tsp.task_section_id = ts.id
                      AND tsp.role::text IN ('section_editor', 'EDITOR')
                    ORDER BY tsp.id
                    LIMIT 1
                )
            FROM task_sections ts
            WHERE s.section_id = ts.id
              AND ts.task_id = :task_id
            """
        ),
        {"task_id": task_id},
    )


def _get_task_common_schedule_or_404(db: Session, task_id: int) -> Schedule:
    schedule = db.scalar(
        select(Schedule).where(
            Schedule.task_id == task_id,
            Schedule.section_id.is_(None),
        )
    )
    if not schedule:
        raise HTTPException(status_code=404, detail="Task common schedule not found")
    return schedule


@router.post("/{task_id}/schedule/recalculate", response_model=ScheduleOut)
def recalculate_task_schedule(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Schedule:
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    check_access(
        db,
        current_user.id,
        ScopeType.TASK,
        task.id,
        {RoleName.PROJECT_MANAGER, RoleName.TASK_MANAGER},
    )

    _sync_section_schedule_dates(db, task_id)
    _sync_task_common_schedule_dates(db, task_id)
    db.commit()
    schedule = _get_task_common_schedule_or_404(db, task_id)
    db.refresh(schedule)
    return schedule


@router.get("/{task_id}/sections", response_model=list[TaskSectionOut])
def list_task_sections(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[TaskSection]:
    if not db.get(Task, task_id):
        raise HTTPException(status_code=404, detail="Task not found")

    try:
        _can_view_sections(db, current_user.id, task_id)
        return db.scalars(
            select(TaskSection).where(TaskSection.task_id == task_id).order_by(TaskSection.position, TaskSection.id)
        ).all()
    except HTTPException as exc:
        if exc.status_code != 403:
            raise

    return db.scalars(
        select(TaskSection)
        .join(
            TaskSectionPermission,
            (TaskSectionPermission.task_section_id == TaskSection.id)
            & (TaskSectionPermission.user_id == current_user.id),
        )
        .where(TaskSection.task_id == task_id)
        .order_by(TaskSection.position, TaskSection.id)
    ).all()


@router.post("/{task_id}/sections", response_model=TaskSectionOut, status_code=201)
def create_task_section(
    task_id: int,
    payload: TaskSectionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TaskSection:
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    _can_manage_sections(db, current_user.id, task_id)
    section = TaskSection(
        task_id=task_id,
        key=payload.key,
        title=payload.title,
        content=payload.content,
        status=TaskSectionStatus.NEW,
        position=payload.position,
        updated_by=current_user.id,
    )
    try:
        db.add(section)
        db.flush()
        db.add(
            Schedule(
                project_id=task.project_id,
                task_id=None,
                section_id=section.id,
                title=f"Schedule for section: {section.title}",
                description=f"Auto schedule for section {section.key}",
                planned_end_at=payload.planned_end_at,
                created_by=current_user.id,
            )
        )
        db.flush()
        _sync_section_schedule_dates(db, task.id)
        _sync_task_common_schedule_dates(db, task.id)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        error_text = str(exc.orig) if getattr(exc, "orig", None) else str(exc)
        if "uq_task_section_key" in error_text:
            raise HTTPException(status_code=409, detail="Section key already exists")
        raise HTTPException(status_code=409, detail="Failed to create section/schedule due to DB constraint conflict")
    db.refresh(section)
    return section


@router.patch("/{task_id}/sections/{section_id}", response_model=TaskSectionOut)
def update_task_section(
    task_id: int,
    section_id: int,
    payload: TaskSectionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TaskSection:
    section = _get_section_or_404(db, task_id, section_id)

    updates = payload.model_dump(exclude_unset=True)
    content_only = len(updates) == 1 and "content" in updates
    if content_only:
        _can_edit_section_content(db, current_user.id, task_id, section_id)
    else:
        _can_manage_sections(db, current_user.id, task_id)

    for field, value in updates.items():
        setattr(section, field, value)
    section.updated_by = current_user.id
    if content_only:
        section.version += 1

    try:
        db.add(section)
        db.flush()
        _sync_section_schedule_dates(db, task_id)
        _sync_task_common_schedule_dates(db, task_id)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Section key already exists")
    db.refresh(section)
    return section


@router.patch("/{task_id}/sections/{section_id}/status", response_model=TaskSectionOut)
def update_task_section_status(
    task_id: int,
    section_id: int,
    payload: TaskSectionStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TaskSection:
    section = _get_section_or_404(db, task_id, section_id)
    # Status change is part of section work lifecycle and is allowed for assigned editors.
    _can_edit_section_content(db, current_user.id, task_id, section_id)
    section.status = payload.status
    section.updated_by = current_user.id
    db.add(section)
    db.commit()
    db.refresh(section)
    return section


@router.delete("/{task_id}/sections/{section_id}", status_code=204)
def delete_task_section(
    task_id: int,
    section_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    section = _get_section_or_404(db, task_id, section_id)
    _can_manage_sections(db, current_user.id, task_id)
    db.delete(section)
    db.flush()
    _sync_task_common_schedule_dates(db, task_id)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{task_id}/sections/{section_id}/permissions", response_model=list[TaskSectionPermissionOut])
def list_task_section_permissions(
    task_id: int,
    section_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[TaskSectionPermissionOut]:
    _ = _get_section_or_404(db, task_id, section_id)
    try:
        _can_view_sections(db, current_user.id, task_id)
    except HTTPException as exc:
        if exc.status_code != 403:
            raise
        perm = db.scalar(
            select(TaskSectionPermission).where(
                TaskSectionPermission.task_section_id == section_id,
                TaskSectionPermission.user_id == current_user.id,
            )
        )
        if not perm:
            raise HTTPException(status_code=403, detail="Insufficient section permissions")

    perms = db.scalars(
        select(TaskSectionPermission).where(TaskSectionPermission.task_section_id == section_id).order_by(TaskSectionPermission.id)
    ).all()
    if not perms:
        return []
    users = db.scalars(select(User).where(User.id.in_([p.user_id for p in perms]))).all()
    users_by_id = {u.id: u for u in users}
    out: list[TaskSectionPermissionOut] = []
    for perm in perms:
        user = users_by_id.get(perm.user_id)
        if not user:
            continue
        out.append(
            TaskSectionPermissionOut(
                id=perm.id,
                task_section_id=perm.task_section_id,
                user_id=perm.user_id,
                role=perm.role,
                email=user.email,
                full_name=user.full_name,
            )
        )
    return out


@router.put("/{task_id}/sections/{section_id}/permissions/{user_id}", response_model=TaskSectionPermissionOut)
def assign_task_section_permission(
    task_id: int,
    section_id: int,
    user_id: int,
    payload: TaskSectionPermissionAssign,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TaskSectionPermissionOut:
    section = _get_section_or_404(db, task_id, section_id)
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if payload.role != SectionPermissionRole.EDITOR:
        raise HTTPException(status_code=400, detail="Only section_editor role can be assigned")

    _can_manage_single_section(db, current_user.id, task_id, section_id)
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    project = db.get(Project, task.project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not user_has_company_context(db, user_id, project.company_id):
        raise HTTPException(status_code=400, detail="User is not in current company context")

    perm = db.scalar(
        select(TaskSectionPermission).where(
            TaskSectionPermission.task_section_id == section.id,
            TaskSectionPermission.user_id == user_id,
        )
    )
    if perm is None:
        perm = TaskSectionPermission(task_section_id=section.id, user_id=user_id, role=payload.role)
    else:
        perm.role = payload.role

    db.add(perm)
    db.flush()
    _sync_section_schedule_dates(db, task_id)
    db.commit()
    db.refresh(perm)
    return TaskSectionPermissionOut(
        id=perm.id,
        task_section_id=perm.task_section_id,
        user_id=perm.user_id,
        role=perm.role,
        email=user.email,
        full_name=user.full_name,
    )


@router.delete("/{task_id}/sections/{section_id}/permissions/{user_id}", status_code=204)
def clear_task_section_permission(
    task_id: int,
    section_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    _ = _get_section_or_404(db, task_id, section_id)
    _can_manage_single_section(db, current_user.id, task_id, section_id)
    db.execute(
        delete(TaskSectionPermission).where(
            TaskSectionPermission.task_section_id == section_id,
            TaskSectionPermission.user_id == user_id,
        )
    )
    db.flush()
    _sync_section_schedule_dates(db, task_id)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{task_id}/users", response_model=list[ScopedUserRoleOut])
def get_task_users_with_roles(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ScopedUserRoleOut]:
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    check_access(
        db,
        current_user.id,
        ScopeType.TASK,
        task.id,
        {
            RoleName.PROJECT_MANAGER,
            RoleName.PROJECT_MEMBER,
            RoleName.PROJECT_VIEWER,
            RoleName.TASK_MANAGER,
            RoleName.TASK_MEMBER,
            RoleName.TASK_VIEWER,
        },
    )

    assignments = db.scalars(
        select(RoleAssignment).where(
            RoleAssignment.scope_type == ScopeType.TASK,
            RoleAssignment.scope_id == task_id,
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
                scope_id=assignment.scope_id if assignment.scope_id is not None else task_id,
            )
        )
    return result


@router.post("/{task_id}/assign-role", response_model=ScopedUserRoleOut, status_code=201)
def assign_task_user_role(
    task_id: int,
    payload: ScopedRoleAssign,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ScopedUserRoleOut:
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    project = db.get(Project, task.project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if payload.role not in TASK_ASSIGNABLE_ROLES:
        raise HTTPException(status_code=400, detail="Role is not assignable for task context")

    user = db.get(User, payload.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    check_access(
        db,
        current_user.id,
        ScopeType.TASK,
        task.id,
        {RoleName.PROJECT_MANAGER, RoleName.TASK_MANAGER},
    )

    if not user_has_company_context(db, payload.user_id, project.company_id):
        raise HTTPException(status_code=400, detail="User is not in current company context")

    existing = db.scalar(
        select(RoleAssignment).where(
            RoleAssignment.user_id == payload.user_id,
            RoleAssignment.role == payload.role,
            RoleAssignment.scope_type == ScopeType.TASK,
            RoleAssignment.scope_id == task_id,
        )
    )
    if not existing:
        db.add(
            RoleAssignment(
                user_id=payload.user_id,
                role=payload.role,
                scope_type=ScopeType.TASK,
                scope_id=task_id,
            )
        )
        db.commit()

    return ScopedUserRoleOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=payload.role,
        scope_type=ScopeType.TASK,
        scope_id=task_id,
    )


@router.delete("/{task_id}/assign-role/{user_id}", status_code=204)
def clear_task_user_roles(
    task_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    check_access(
        db,
        current_user.id,
        ScopeType.TASK,
        task.id,
        {RoleName.PROJECT_MANAGER, RoleName.TASK_MANAGER},
    )

    db.execute(
        delete(RoleAssignment).where(
            RoleAssignment.user_id == user_id,
            RoleAssignment.scope_type == ScopeType.TASK,
            RoleAssignment.scope_id == task_id,
        )
    )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/{task_id}", status_code=204)
def delete_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    check_access(
        db,
        current_user.id,
        ScopeType.PROJECT,
        task.project_id,
        {RoleName.PROJECT_MANAGER},
    )

    db.delete(task)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
