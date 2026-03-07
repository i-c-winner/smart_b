"""add path_to_avatar column to users

Revision ID: 20260306_0011
Revises: 20260306_0010
Create Date: 2026-03-06
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "20260306_0011"
down_revision: Union[str, Sequence[str], None] = "20260306_0010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("path_to_avatar", sa.String(length=512), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "path_to_avatar")
