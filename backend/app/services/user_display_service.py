from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.rbac import RoleName, ScopeType
from app.models.role_assignment import RoleAssignment
from app.models.user import User


def prepare_users_for_display(db: Session, users: list[User]) -> list[User]:
    if not users:
        return []

    global_admin_ids = set(
        db.scalars(
            select(RoleAssignment.user_id).where(
                RoleAssignment.scope_type == ScopeType.GLOBAL,
                RoleAssignment.role == RoleName.GLOBAL_ADMIN,
            )
        ).all()
    )
    return [user for user in users if user.id not in global_admin_ids]
