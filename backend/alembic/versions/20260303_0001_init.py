"""init schema

Revision ID: 20260303_0001
Revises: 
Create Date: 2026-03-03
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "20260303_0001"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

role_name = postgresql.ENUM(
    "GLOBAL_ADMIN",
    "COMPANY_ADMIN",
    "PROJECT_MANAGER",
    "PROJECT_MEMBER",
    "VIEWER",
    name="role_name",
    create_type=False,
)
scope_type = postgresql.ENUM(
    "GLOBAL",
    "COMPANY",
    "PROJECT",
    "TASK",
    "SCHEDULE",
    name="scope_type",
    create_type=False,
)


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            CREATE TYPE role_name AS ENUM (
                'GLOBAL_ADMIN',
                'COMPANY_ADMIN',
                'PROJECT_MANAGER',
                'PROJECT_MEMBER',
                'VIEWER'
            );
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END $$;
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            CREATE TYPE scope_type AS ENUM (
                'GLOBAL',
                'COMPANY',
                'PROJECT',
                'TASK',
                'SCHEDULE'
            );
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END $$;
        """
    )

    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("hashed_password", sa.String(length=255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.create_index("ix_users_id", "users", ["id"], unique=False)
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "companies",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
    )
    op.create_index("ix_companies_id", "companies", ["id"], unique=False)

    op.create_table(
        "projects",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("company_id", sa.Integer(), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
    )
    op.create_index("ix_projects_id", "projects", ["id"], unique=False)
    op.create_index("ix_projects_company_id", "projects", ["company_id"], unique=False)

    op.create_table(
        "tasks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
    )
    op.create_index("ix_tasks_id", "tasks", ["id"], unique=False)
    op.create_index("ix_tasks_project_id", "tasks", ["project_id"], unique=False)

    op.create_table(
        "schedules",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("cron_expr", sa.String(length=255), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=True),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
    )
    op.create_index("ix_schedules_id", "schedules", ["id"], unique=False)
    op.create_index("ix_schedules_project_id", "schedules", ["project_id"], unique=False)

    op.create_table(
        "role_assignments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", role_name, nullable=False),
        sa.Column("scope_type", scope_type, nullable=False),
        sa.Column("scope_id", sa.Integer(), nullable=True),
        sa.UniqueConstraint("user_id", "role", "scope_type", "scope_id", name="uq_user_role_scope"),
    )
    op.create_index("ix_role_assignments_id", "role_assignments", ["id"], unique=False)
    op.create_index("ix_role_assignments_user_id", "role_assignments", ["user_id"], unique=False)
    op.create_index("ix_role_assignments_role", "role_assignments", ["role"], unique=False)
    op.create_index("ix_role_assignments_scope_type", "role_assignments", ["scope_type"], unique=False)
    op.create_index("ix_role_assignments_scope_id", "role_assignments", ["scope_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_role_assignments_scope_id", table_name="role_assignments")
    op.drop_index("ix_role_assignments_scope_type", table_name="role_assignments")
    op.drop_index("ix_role_assignments_role", table_name="role_assignments")
    op.drop_index("ix_role_assignments_user_id", table_name="role_assignments")
    op.drop_index("ix_role_assignments_id", table_name="role_assignments")
    op.drop_table("role_assignments")

    op.drop_index("ix_schedules_project_id", table_name="schedules")
    op.drop_index("ix_schedules_id", table_name="schedules")
    op.drop_table("schedules")

    op.drop_index("ix_tasks_project_id", table_name="tasks")
    op.drop_index("ix_tasks_id", table_name="tasks")
    op.drop_table("tasks")

    op.drop_index("ix_projects_company_id", table_name="projects")
    op.drop_index("ix_projects_id", table_name="projects")
    op.drop_table("projects")

    op.drop_index("ix_companies_id", table_name="companies")
    op.drop_table("companies")

    op.drop_index("ix_users_email", table_name="users")
    op.drop_index("ix_users_id", table_name="users")
    op.drop_table("users")

    op.execute("DROP TYPE IF EXISTS scope_type")
    op.execute("DROP TYPE IF EXISTS role_name")
