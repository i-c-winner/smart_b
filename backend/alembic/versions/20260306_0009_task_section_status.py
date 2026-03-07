"""add task section status enum and column

Revision ID: 20260306_0009
Revises: 20260305_0008
Create Date: 2026-03-06
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "20260306_0009"
down_revision: Union[str, Sequence[str], None] = "20260305_0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


status_enum = sa.Enum("new", "in_progress", "finished", name="task_section_status")


def upgrade() -> None:
    status_enum.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "task_sections",
        sa.Column("status", status_enum, nullable=False, server_default="new"),
    )


def downgrade() -> None:
    op.drop_column("task_sections", "status")
    status_enum.drop(op.get_bind(), checkfirst=True)
