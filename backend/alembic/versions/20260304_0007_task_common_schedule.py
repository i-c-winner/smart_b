"""add one-to-one task->schedule link and create common schedules

Revision ID: 20260304_0007
Revises: 20260304_0006
Create Date: 2026-03-04
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "20260304_0007"
down_revision: Union[str, Sequence[str], None] = "20260304_0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("schedules", sa.Column("task_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_schedules_task_id_tasks",
        "schedules",
        "tasks",
        ["task_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_schedules_task_id", "schedules", ["task_id"], unique=False)

    # Reuse existing section-linked schedules and attach one schedule per task.
    op.execute(
        """
        UPDATE schedules s
        SET task_id = ts.task_id
        FROM task_sections ts
        WHERE s.section_id = ts.id AND s.task_id IS NULL
        """
    )
    op.execute(
        """
        WITH ranked AS (
            SELECT id, task_id,
                   ROW_NUMBER() OVER (PARTITION BY task_id ORDER BY id) AS rn
            FROM schedules
            WHERE task_id IS NOT NULL
        )
        UPDATE schedules s
        SET task_id = NULL
        FROM ranked r
        WHERE s.id = r.id AND r.rn > 1
        """
    )
    op.execute(
        """
        INSERT INTO schedules (project_id, task_id, title, description, created_by)
        SELECT t.project_id, t.id, ('Schedule for ' || t.title), 'Auto schedule for task sections', t.created_by
        FROM tasks t
        LEFT JOIN schedules s ON s.task_id = t.id
        WHERE s.id IS NULL
        """
    )
    op.create_index(
        "uq_schedules_task_id_not_null",
        "schedules",
        ["task_id"],
        unique=True,
        postgresql_where=sa.text("task_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_schedules_task_id_not_null", table_name="schedules")
    op.drop_index("ix_schedules_task_id", table_name="schedules")
    op.drop_constraint("fk_schedules_task_id_tasks", "schedules", type_="foreignkey")
    op.drop_column("schedules", "task_id")
