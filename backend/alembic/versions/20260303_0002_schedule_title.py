"""rename schedule cron_expr to title

Revision ID: 20260303_0002
Revises: 20260303_0001
Create Date: 2026-03-03
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "20260303_0002"
down_revision: Union[str, Sequence[str], None] = "20260303_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("schedules", "cron_expr", new_column_name="title", existing_type=sa.String(length=255))


def downgrade() -> None:
    op.alter_column("schedules", "title", new_column_name="cron_expr", existing_type=sa.String(length=255))
