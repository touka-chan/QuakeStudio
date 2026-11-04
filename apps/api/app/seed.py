"""Seed a local database with one admin and the default content document.

Run after `alembic upgrade head` (or with QUAKESTUDIO_AUTO_CREATE_TABLES=true):

    cd apps/api
    python -m app.seed --email admin@quakestudio.local

The password is prompted for when `--password` is omitted.
"""

from __future__ import annotations

import argparse
import getpass
import json
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .config import get_settings
from .db import Base, build_engine, build_session_factory
from .models import AdminUser, ContentVersion, utcnow
from .security import hash_password
from .validation import validate_content


def ensure_admin(
    db: Session,
    *,
    email: str,
    password: str | None = None,
    display_name: str = "Administrator",
) -> tuple[AdminUser, bool]:
    normalised = email.strip().lower()
    user = db.scalar(select(AdminUser).where(AdminUser.email == normalised))
    created = user is None
    if user is None:
        if not password:
            raise ValueError("A password is required when creating the first admin.")
        user = AdminUser(
            email=normalised,
            password_hash=hash_password(password),
            display_name=display_name,
        )
        db.add(user)
        db.flush()
    else:
        user.display_name = display_name
        if password:
            user.password_hash = hash_password(password)
    return user, created


def ensure_content(
    db: Session,
    *,
    path: Path,
    actor: AdminUser | None,
    replace: bool = False,
) -> ContentVersion | None:
    existing = db.scalar(
        select(ContentVersion)
        .where(ContentVersion.status == "published")
        .order_by(ContentVersion.version.desc())
        .limit(1)
    )
    if existing is not None and not replace:
        return None

    document = json.loads(path.read_text(encoding="utf-8"))
    validate_content(document)
    document = dict(document)
    document["schemaVersion"] = 1
    document["updatedAt"] = utcnow().isoformat()

    highest = db.scalar(select(func.max(ContentVersion.version)))
    version = ContentVersion(
        version=int(highest or 0) + 1,
        status="published",
        document=document,
        note="Seed content" if existing is None else "Replaced from seed file",
        created_by_id=actor.id if actor else None,
        published_at=utcnow(),
    )
    db.add(version)
    db.flush()
    return version


def main() -> None:
    settings = get_settings()
    parser = argparse.ArgumentParser(description="Seed the local QuakeStudio database.")
    parser.add_argument("--email", default=settings.admin_email)
    parser.add_argument("--password", default=settings.admin_password or None)
    parser.add_argument("--display-name", default=settings.admin_display_name)
    parser.add_argument(
        "--content",
        type=Path,
        default=settings.seed_content_path,
        help="Path to a content document JSON file.",
    )
    parser.add_argument(
        "--replace-content",
        action="store_true",
        help="Publish the seed document as a new version even if content exists.",
    )
    args = parser.parse_args()

    password = args.password
    if password is None:
        password = getpass.getpass("Admin password: ")
        if not password:
            raise SystemExit("A password is required.")

    engine = build_engine(settings.database_url)
    if settings.auto_create_tables:
        Base.metadata.create_all(bind=engine)

    session_factory = build_session_factory(engine)
    with session_factory() as db:
        user, created = ensure_admin(
            db,
            email=args.email,
            password=password,
            display_name=args.display_name,
        )
        version = ensure_content(
            db,
            path=args.content,
            actor=user,
            replace=args.replace_content,
        )
        db.commit()
        print(f"{'Created' if created else 'Updated'} admin: {user.email}")
        if version is None:
            print("Published content already exists; left unchanged.")
        else:
            print(f"Published content version {version.version} from {args.content}.")


if __name__ == "__main__":
    main()
