from datetime import datetime
from enum import Enum

from sqlalchemy import DateTime, Enum as SAEnum, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class SectionPermissionRole(str, Enum):
    VIEWER = "section_viewer"
    EDITOR = "section_editor"
    MANAGER = "section_manager"


class TaskSectionStatus(str, Enum):
    NEW = "new"
    IN_PROGRESS = "in_progress"
    FINISHED = "finished"


class TaskSection(Base):
    __tablename__ = "task_sections"
    __table_args__ = (UniqueConstraint("task_id", "key", name="uq_task_section_key"),)

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), index=True)
    key: Mapped[str] = mapped_column(String(100))
    title: Mapped[str] = mapped_column(String(255))
    content: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    status: Mapped[TaskSectionStatus] = mapped_column(
        SAEnum(
            TaskSectionStatus,
            name="task_section_status",
            values_callable=lambda enum_cls: [item.value for item in enum_cls],
        ),
        nullable=False,
        default=TaskSectionStatus.NEW,
        server_default=TaskSectionStatus.NEW.value,
    )
    position: Mapped[int] = mapped_column(default=0)
    version: Mapped[int] = mapped_column(default=1)
    updated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    task = relationship("Task")
    permissions = relationship("TaskSectionPermission", cascade="all, delete-orphan", back_populates="section")


class TaskSectionPermission(Base):
    __tablename__ = "task_section_permissions"
    __table_args__ = (UniqueConstraint("task_section_id", "user_id", name="uq_task_section_user"),)

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    task_section_id: Mapped[int] = mapped_column(ForeignKey("task_sections.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    role: Mapped[SectionPermissionRole] = mapped_column(
        SAEnum(SectionPermissionRole, name="section_permission_role"), index=True
    )

    section = relationship("TaskSection", back_populates="permissions")
    user = relationship("User")
