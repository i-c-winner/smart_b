"""link schedules one-to-one with task sections and add schedule dates

Revision ID: 20260304_0006
Revises: 20260304_0005
Create Date: 2026-03-04
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "20260304_0006"
down_revision: Union[str, Sequence[str], None] = "20260304_0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("schedules", sa.Column("section_id", sa.Integer(), nullable=True))
    op.add_column("schedules", sa.Column("planned_start_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("schedules", sa.Column("planned_end_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("schedules", sa.Column("actual_start_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("schedules", sa.Column("actual_end_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("schedules", sa.Column("section_editor_user_id", sa.Integer(), nullable=True))

    op.create_index("ix_schedules_section_id", "schedules", ["section_id"], unique=True)
    op.create_index("ix_schedules_section_editor_user_id", "schedules", ["section_editor_user_id"], unique=False)
    op.create_foreign_key(
        "fk_schedules_section_id_task_sections",
        "schedules",
        "task_sections",
        ["section_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_schedules_section_editor_user_id_users",
        "schedules",
        "users",
        ["section_editor_user_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_schedules_section_editor_user_id_users", "schedules", type_="foreignkey")
    op.drop_constraint("fk_schedules_section_id_task_sections", "schedules", type_="foreignkey")
    op.drop_index("ix_schedules_section_editor_user_id", table_name="schedules")
    op.drop_index("ix_schedules_section_id", table_name="schedules")

    op.drop_column("schedules", "section_editor_user_id")
    op.drop_column("schedules", "actual_end_at")
    op.drop_column("schedules", "actual_start_at")
    op.drop_column("schedules", "planned_end_at")
    op.drop_column("schedules", "planned_start_at")
    op.drop_column("schedules", "section_id")
