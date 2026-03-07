from pydantic import BaseModel, EmailStr


class UserRegister(BaseModel):
    email: EmailStr
    phone: str | None = None
    path_to_avatar: str | None = None
    full_name: str
    password: str


class UserOut(BaseModel):
    id: int
    email: EmailStr
    phone: str | None = None
    path_to_avatar: str | None = None
    full_name: str
    is_active: bool

    class Config:
        from_attributes = True


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    company_id: int | None = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    company_id: int | None = None
