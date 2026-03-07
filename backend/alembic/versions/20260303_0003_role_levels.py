"""add scoped role levels and migrate existing role assignments

Revision ID: 20260303_0003
Revises: 20260303_0002
Create Date: 2026-03-03
"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260303_0003"
down_revision: Union[str, Sequence[str], None] = "20260303_0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # PostgreSQL requires commit before using new enum labels in DML.
    ctx = op.get_context()
    with ctx.autocommit_block():
        op.execute("ALTER TYPE role_name ADD VALUE IF NOT EXISTS 'COMPANY_MEMBER'")
        op.execute("ALTER TYPE role_name ADD VALUE IF NOT EXISTS 'COMPANY_VIEWER'")
        op.execute("ALTER TYPE role_name ADD VALUE IF NOT EXISTS 'PROJECT_VIEWER'")
        op.execute("ALTER TYPE role_name ADD VALUE IF NOT EXISTS 'TASK_MANAGER'")
        op.execute("ALTER TYPE role_name ADD VALUE IF NOT EXISTS 'TASK_MEMBER'")
        op.execute("ALTER TYPE role_name ADD VALUE IF NOT EXISTS 'TASK_VIEWER'")
        op.execute("ALTER TYPE role_name ADD VALUE IF NOT EXISTS 'SCHEDULE_MANAGER'")
        op.execute("ALTER TYPE role_name ADD VALUE IF NOT EXISTS 'SCHEDULE_MEMBER'")
        op.execute("ALTER TYPE role_name ADD VALUE IF NOT EXISTS 'SCHEDULE_VIEWER'")

    op.execute(
        """
        UPDATE role_assignments
        SET role = 'COMPANY_VIEWER'
        WHERE role = 'VIEWER' AND scope_type = 'COMPANY'
        """
    )
    op.execute(
        """
        UPDATE role_assignments
        SET role = 'PROJECT_VIEWER'
        WHERE role = 'VIEWER' AND scope_type = 'PROJECT'
        """
    )
    op.execute(
        """
        UPDATE role_assignments
        SET role = 'TASK_VIEWER'
        WHERE role = 'VIEWER' AND scope_type = 'TASK'
        """
    )
    op.execute(
        """
        UPDATE role_assignments
        SET role = 'SCHEDULE_VIEWER'
        WHERE role = 'VIEWER' AND scope_type = 'SCHEDULE'
        """
    )
    op.execute(
        """
        UPDATE role_assignments
        SET role = 'TASK_MEMBER'
        WHERE role = 'PROJECT_MEMBER' AND scope_type = 'TASK'
        """
    )
    op.execute(
        """
        UPDATE role_assignments
        SET role = 'TASK_MANAGER'
        WHERE role = 'PROJECT_MANAGER' AND scope_type = 'TASK'
        """
    )
    op.execute(
        """
        UPDATE role_assignments
        SET role = 'SCHEDULE_MEMBER'
        WHERE role = 'PROJECT_MEMBER' AND scope_type = 'SCHEDULE'
        """
    )
    op.execute(
        """
        UPDATE role_assignments
        SET role = 'SCHEDULE_MANAGER'
        WHERE role = 'PROJECT_MANAGER' AND scope_type = 'SCHEDULE'
        """
    )


def downgrade() -> None:
    # PostgreSQL enum labels are intentionally kept; rows are mapped back to legacy values.
    op.execute(
        """
        UPDATE role_assignments
        SET role = 'VIEWER'
        WHERE role IN ('COMPANY_VIEWER', 'PROJECT_VIEWER', 'TASK_VIEWER', 'SCHEDULE_VIEWER')
        """
    )
    op.execute(
        """
        UPDATE role_assignments
        SET role = 'PROJECT_MEMBER'
        WHERE role IN ('TASK_MEMBER', 'SCHEDULE_MEMBER')
        """
    )
    op.execute(
        """
        UPDATE role_assignments
        SET role = 'PROJECT_MANAGER'
        WHERE role IN ('TASK_MANAGER', 'SCHEDULE_MANAGER')
        """
    )
