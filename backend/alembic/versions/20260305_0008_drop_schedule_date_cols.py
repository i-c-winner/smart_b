"""drop deprecated schedule date columns

Revision ID: 20260305_0008
Revises: 20260304_0007
Create Date: 2026-03-05
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "20260305_0008"
down_revision: Union[str, Sequence[str], None] = "20260304_0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("schedules", "actual_end_at")
    op.drop_column("schedules", "actual_start_at")
    op.drop_column("schedules", "planned_start_at")


def downgrade() -> None:
    op.add_column("schedules", sa.Column("planned_start_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("schedules", sa.Column("actual_start_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("schedules", sa.Column("actual_end_at", sa.DateTime(timezone=True), nullable=True))
