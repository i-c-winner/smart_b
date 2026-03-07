from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


class TokenError(Exception):
    pass


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(subject: str, company_id: int | None = None) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {"sub": subject, "exp": expire}
    if company_id is not None:
        payload["company_id"] = company_id
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def decode_access_token(token: str) -> tuple[str, int | None]:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        subject = payload.get("sub")
        if not subject:
            raise TokenError("Token subject missing")
        company_id_raw = payload.get("company_id")
        company_id = int(company_id_raw) if company_id_raw is not None else None
        return str(subject), company_id
    except JWTError as exc:
        raise TokenError("Invalid token") from exc
    except (TypeError, ValueError) as exc:
        raise TokenError("Invalid token payload") from exc
