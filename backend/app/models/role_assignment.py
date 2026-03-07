from sqlalchemy import Enum, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.rbac import RoleName, ScopeType


class RoleAssignment(Base):
    __tablename__ = "role_assignments"
    __table_args__ = (
        UniqueConstraint("user_id", "role", "scope_type", "scope_id", name="uq_user_role_scope"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    role: Mapped[RoleName] = mapped_column(Enum(RoleName, name="role_name"), index=True)
    scope_type: Mapped[ScopeType] = mapped_column(Enum(ScopeType, name="scope_type"), index=True)
    scope_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)

    user = relationship("User", back_populates="role_assignments")
