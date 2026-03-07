"""add task document sections and per-section permissions

Revision ID: 20260304_0005
Revises: 20260304_0004
Create Date: 2026-03-04
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "20260304_0005"
down_revision: Union[str, Sequence[str], None] = "20260304_0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            CREATE TYPE section_permission_role AS ENUM (
                'VIEWER',
                'EDITOR',
                'MANAGER'
            );
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END $$;
        """
    )

    op.create_table(
        "task_sections",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("task_id", sa.Integer(), sa.ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("key", sa.String(length=100), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("content", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("updated_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("task_id", "key", name="uq_task_section_key"),
    )
    op.create_index("ix_task_sections_id", "task_sections", ["id"], unique=False)
    op.create_index("ix_task_sections_task_id", "task_sections", ["task_id"], unique=False)

    op.create_table(
        "task_section_permissions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("task_section_id", sa.Integer(), sa.ForeignKey("task_sections.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "role",
            postgresql.ENUM("VIEWER", "EDITOR", "MANAGER", name="section_permission_role", create_type=False),
            nullable=False,
        ),
        sa.UniqueConstraint("task_section_id", "user_id", name="uq_task_section_user"),
    )
    op.create_index("ix_task_section_permissions_id", "task_section_permissions", ["id"], unique=False)
    op.create_index(
        "ix_task_section_permissions_task_section_id", "task_section_permissions", ["task_section_id"], unique=False
    )
    op.create_index("ix_task_section_permissions_user_id", "task_section_permissions", ["user_id"], unique=False)
    op.create_index("ix_task_section_permissions_role", "task_section_permissions", ["role"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_task_section_permissions_role", table_name="task_section_permissions")
    op.drop_index("ix_task_section_permissions_user_id", table_name="task_section_permissions")
    op.drop_index("ix_task_section_permissions_task_section_id", table_name="task_section_permissions")
    op.drop_index("ix_task_section_permissions_id", table_name="task_section_permissions")
    op.drop_table("task_section_permissions")

    op.drop_index("ix_task_sections_task_id", table_name="task_sections")
    op.drop_index("ix_task_sections_id", table_name="task_sections")
    op.drop_table("task_sections")
    op.execute("DROP TYPE IF EXISTS section_permission_role")
