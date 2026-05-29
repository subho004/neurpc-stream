# CLAUDE.md — Backend Engineering Guide

> This file governs all AI-assisted development on this FastAPI project.
> Follow every rule here precisely. When in doubt, match existing patterns.

---

## Stack

- **Python 3.12** | **FastAPI 0.115+** | **Uvicorn**
- **SQLAlchemy 2.x (async)** + **asyncpg** (PostgreSQL)
- **Pydantic v2** (strict validation)
- **Alembic** (migrations)
- **pytest + pytest-asyncio + httpx** (testing)
- **Ruff** (linting) | **Mypy** (type checking)

---

## Commands

> **Always activate the virtual environment before running any command.**
> Never run project commands outside `.venv` — tool versions outside the venv may differ and produce unreliable results.

```bash
source .venv/bin/activate   # activate once per terminal session
```

```bash
# Run
uvicorn app.main:app --reload

# Test
pytest -v

# Lint + type check
ruff check . && mypy .

# Migrate
alembic upgrade head
```

For one-off commands, you can inline the activation:

```bash
source .venv/bin/activate && ruff check .
source .venv/bin/activate && pytest -v
```

---

## Project Structure

```
api/
├── routes/        # Controllers — request parsing, DI, response shaping only
├── services/      # Business logic — all domain rules live here
├── repositories/  # Database access — all queries and ORM interactions
├── schemas/       # Pydantic request/response models (DTOs)
├── models/        # SQLAlchemy ORM models
├── utils/         # Shared helpers and reusable utilities
├── core/
│   ├── config.py       # Settings via pydantic-settings
│   ├── exceptions.py   # Centralised HTTPException subclasses
│   ├── dependencies.py # Shared FastAPI Depends() providers
│   ├── logging.py      # Structured logger setup
│   └── response.py     # success_response / error_response helpers
└── main.py        # App factory (create_application)
```

### Layer responsibilities (strict — do not cross)

| Layer           | Allowed                                      | Forbidden                          |
| --------------- | -------------------------------------------- | ---------------------------------- |
| `routes/`       | Parse request, call service, return response | DB queries, raw business logic     |
| `services/`     | Orchestrate use-cases, call repositories     | HTTP types (`Request`, `Response`) |
| `repositories/` | All DB access, ORM queries                   | Business rules, HTTP concerns      |
| `schemas/`      | Pydantic input/output models                 | DB models, service imports         |
| `utils/`        | Pure, stateless helper functions             | State, DB, HTTP                    |

---

## Code Style

### General

- **Full type annotations on every function and class** — no exceptions.
- Avoid `Any`; if unavoidable, add an inline `# type: ignore` comment explaining why.
- Use descriptive names (`get_user_by_email`, not `get_user`).
- Keep functions small and single-responsibility (≤ 30 lines as a guideline).
- No `print()` anywhere — use the structured logger.
- No bare `except Exception` — always handle or re-raise with context.

### OOP & Design Patterns

- Encapsulate related data + behaviour in classes (services, repositories).
- Services and repositories are **class-based** with `__init__` accepting dependencies.
- Use **dependency injection via `Depends()`** — never instantiate services inside routes.
- Prefer **composition over inheritance**; use abstract base classes only for enforcing interfaces.
- Keep side-effect-free logic in utility functions; stateful behaviour in service/repository classes.

```python
# Good — class-based service with injected repository
class UserService:
    def __init__(self, repo: UserRepository) -> None:
        self._repo = repo

    async def get_by_email(self, email: str) -> UserResponse:
        user = await self._repo.find_by_email(email)
        if not user:
            raise UserNotFoundError(email)
        return UserResponse.model_validate(user)
```

### Helper & Utility Functions

- Extract any logic used in ≥ 2 places into `utils/`.
- Helpers must be **pure** (no side effects, no global state).
- Group helpers by concern (e.g., `utils/pagination.py`, `utils/hashing.py`).
- Always annotate input and return types.

```python
# utils/pagination.py
def build_pagination_meta(total: int, page: int, page_size: int) -> PaginationMeta:
    return PaginationMeta(
        total=total,
        page=page,
        page_size=page_size,
        total_pages=math.ceil(total / page_size),
    )
```

---

## API Standards

### Routes

Routes must only: validate input → call service → return response.

```python
@router.get("/{user_id}", response_model=ApiResponse[UserResponse])
async def get_user(
    user_id: UUID,
    service: UserService = Depends(get_user_service),
) -> ApiResponse[UserResponse]:
    user = await service.get_by_id(user_id)
    return success_response(message="User retrieved", data=user)
```

### Responses

Always use `api.core.response` helpers — never return raw dicts.

```python
return success_response(message="Created", data=response_data)
return error_response(message="Not found", status_code=404)
```

### HTTP Status Codes

| Situation        | Code |
| ---------------- | ---- |
| Created          | 201  |
| No content       | 204  |
| Bad request      | 400  |
| Unauthenticated  | 401  |
| Forbidden        | 403  |
| Not found        | 404  |
| Conflict         | 409  |
| Validation error | 422  |
| Internal error   | 500  |

### Pagination

All list endpoints **must** be paginated. Use the shared pagination utility.

```python
async def list_users(page: int = 1, page_size: int = 20) -> PaginatedResponse[UserResponse]: ...
```

---

## Error Handling

- **Centralise all HTTP exceptions** in `core/exceptions.py` as typed subclasses of `HTTPException`.
- Never expose internal error details to clients.
- Use `try/except` blocks in service and repository layers for recoverable errors.
- Always log unexpected exceptions with the full stack trace before re-raising or converting.

```python
# core/exceptions.py
class UserNotFoundError(HTTPException):
    def __init__(self, user_id: UUID | str) -> None:
        super().__init__(status_code=404, detail=f"User '{user_id}' not found")
```

```python
# Inside a service
try:
    result = await self._repo.create(data)
except IntegrityError as exc:
    logger.error("DB constraint violation: %s", exc, exc_info=True)
    raise UserAlreadyExistsError(data.email) from exc
```

---

## Database Standards

- Use `async/await` for **all** database operations — no sync DB calls.
- All ORM models use `Mapped[T]` typed columns (SQLAlchemy 2.x style).
- Use UUID primary keys unless the existing schema differs.
- Declare relationships, constraints, and indexes explicitly on models.
- Obtain sessions exclusively via `Depends()` — never create sessions manually inside services.

```python
class User(Base):
    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(default=func.now())
```

- Prefer **bulk operations** over loops for multi-row writes.
- Avoid N+1 queries — use `selectinload` / `joinedload` for relationships.

---

## Configuration

Never hardcode secrets, URLs, or environment-specific values.

```python
# core/config.py
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    DEBUG: bool = False

    class Config:
        env_file = ".env"

settings = Settings()
```

Import only via:

```python
from api.core.config import settings
```

---

## Logging

Use the structured logger from `core/logging.py`. Log start/end of important operations, execution time for jobs, and all unexpected failures with stack traces.

```python
import time
from api.core.logging import logger

async def run_sync_job() -> None:
    start = time.perf_counter()
    logger.info("Sync job started")
    try:
        await _do_work()
        logger.info("Sync job completed in %.3fs", time.perf_counter() - start)
    except Exception:
        logger.exception("Sync job failed after %.3fs", time.perf_counter() - start)
        raise
```

Rules:

- Never log secrets, tokens, or passwords.
- Use `%s`-style formatting (lazy evaluation), not f-strings.
- Use `logger.exception()` (not `logger.error()`) to auto-attach stack traces.

---

## Testing

> **Tests are optional — only write them when explicitly asked.**
> Do not generate test files, test functions, or test fixtures unless the user specifically requests it.

When tests are requested, follow these rules:

- **pytest + pytest-asyncio** for all async tests.
- Unit tests: pure service/util functions with mocked repositories.
- Integration tests: real DB (SQLite in-memory or test PostgreSQL schema).
- Minimum **80% coverage** on services and repositories.
- Override dependencies using `app.dependency_overrides` — never patch global state.

```python
@pytest.mark.asyncio
async def test_get_user_not_found(client: AsyncClient) -> None:
    response = await client.get("/users/nonexistent-id")
    assert response.status_code == 404
```

---

## Script Standards

- Use **constants** at the top of the file instead of CLI args (unless explicitly requested).
- Always add a dynamic `sys.path` import so scripts run from any working directory.
- Log start time, end time, and elapsed duration.
- Scripts must support `python path/to/script.py` direct execution.
- Always run inside `.venv`.

```python
import sys
import time
import logging
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[2]
sys.path.append(str(ROOT_DIR))

logger = logging.getLogger(__name__)

def main() -> None:
    start = time.perf_counter()
    logger.info("Script started")
    # ... work ...
    logger.info("Done in %.2fs", time.perf_counter() - start)

if __name__ == "__main__":
    main()
```

---

## Import Order

1. Standard library (`os`, `sys`, `time`, …)
2. Third-party (`fastapi`, `sqlalchemy`, `pydantic`, …)
3. Internal (`api.core`, `api.services`, …)

Enforce with Ruff (`isort` rules enabled).

---

## Naming Conventions

### Python Identifiers

| Kind                | Style            | Example                       |
| ------------------- | ---------------- | ----------------------------- |
| Variables           | `snake_case`     | `user_id`, `access_token`     |
| Functions / methods | `snake_case`     | `get_user_by_email()`         |
| Classes             | `PascalCase`     | `UserService`, `TokenSchema`  |
| Constants           | `UPPER_SNAKE`    | `MAX_RETRY_COUNT`, `BASE_URL` |
| Private attributes  | `_single_prefix` | `self._repo`, `self._cache`   |
| Type aliases        | `PascalCase`     | `UserId = UUID`               |
| Async functions     | `snake_case`     | `async def fetch_profile()`   |

### Files & Modules

| Kind             | Style          | Example                            |
| ---------------- | -------------- | ---------------------------------- |
| All Python files | `snake_case`   | `user_service.py`, `auth_utils.py` |
| Route files      | plural noun    | `users.py`, `orders.py`            |
| Service files    | singular noun  | `user_service.py`                  |
| Repository files | singular noun  | `user_repository.py`               |
| Schema files     | singular noun  | `user_schema.py`                   |
| Utility files    | concern-named  | `pagination.py`, `hashing.py`      |
| Test files       | `test_` prefix | `test_user_service.py`             |

### Database

| Kind               | Style               | Example                   |
| ------------------ | ------------------- | ------------------------- |
| Table names        | `snake_case` plural | `users`, `order_items`    |
| Column names       | `snake_case`        | `created_at`, `is_active` |
| Index names        | `ix_table_column`   | `ix_users_email`          |
| Unique constraints | `uq_table_column`   | `uq_users_email`          |
| Foreign keys       | `fk_table_reftable` | `fk_orders_user_id`       |
| Primary key        | always `id`         | `id`                      |

### Pydantic Schemas

Suffix schema classes with their purpose to avoid name collisions with ORM models:

```python
class UserCreate(BaseModel): ...    # POST request body
class UserUpdate(BaseModel): ...    # PATCH request body
class UserResponse(BaseModel): ...  # outbound response
class UserInDB(BaseModel): ...      # internal / DB-mapped shape
```

### Routes & URL Paths

- **Lowercase kebab-case** for URL segments: `/user-profiles/`, not `/userProfiles/`.
- **Plural nouns** for collections: `/users/`, `/orders/`.
- **Path params** for single resource identity: `/users/{user_id}`.
- **Query params** for filters, sorting, pagination: `/users?page=1&page_size=20`.

```python
# Good
@router.get("/users/{user_id}")
@router.get("/order-items/")

# Bad
@router.get("/getUser/{user_id}")
@router.get("/OrderItems/")
```

---

## Security

- All SQL through SQLAlchemy ORM — no raw string queries.
- All external input validated through Pydantic schemas before reaching services.
- Secrets and credentials only via environment variables / `settings`.
- Never log or expose tokens, passwords, or PII.
- All `HTTPException` messages must be safe for public clients.

---

## Performance

- No blocking I/O inside `async` functions (no `time.sleep`, no sync file reads).
- Paginate all list endpoints — never return unbounded result sets.
- Use `selectinload`/`joinedload` to avoid N+1 query patterns.
- Prefer bulk inserts/updates over per-row loops.

---

## Validation Checklist (run after every file change)

> Activate `.venv` first — all commands below must run inside it.

```bash
source .venv/bin/activate

# 1. Syntax / imports
python -m py_compile path/to/file.py

# 2. Lint
ruff check .

# 3. Type check
mypy .
```

> **Steps 4 and 5 (tests) are optional — only run when the user explicitly asks.**

```bash
# 4. Tests (only when requested)
pytest -v --tb=short

# 5. Coverage (only when requested)
pytest --cov=api --cov-report=term-missing
```

Steps 1–3 must always pass cleanly before a task is considered complete.
No warnings should be silently suppressed — fix the root cause.
