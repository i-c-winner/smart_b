from enum import Enum


class ScopeType(str, Enum):
    GLOBAL = "global"
    COMPANY = "company"
    PROJECT = "project"
    TASK = "task"
    SCHEDULE = "schedule"


class RoleName(str, Enum):
    GLOBAL_ADMIN = "global_admin"
    COMPANY_ADMIN = "company_admin"
    COMPANY_MEMBER = "company_member"
    COMPANY_VIEWER = "company_viewer"
    PROJECT_MANAGER = "project_manager"
    PROJECT_MEMBER = "project_member"
    PROJECT_VIEWER = "project_viewer"
    TASK_MANAGER = "task_manager"
    TASK_MEMBER = "task_member"
    TASK_VIEWER = "task_viewer"
    SCHEDULE_MANAGER = "schedule_manager"
    SCHEDULE_MEMBER = "schedule_member"
    SCHEDULE_VIEWER = "schedule_viewer"
