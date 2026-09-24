import json
from sqlalchemy import create_engine, Engine
from sqlalchemy.orm import sessionmaker, declarative_base
from app.core.config import settings

Base = declarative_base()


def _build_engine() -> Engine:
    db_url = settings.sqlalchemy_database_url
    if "sqlite" in db_url:
        return create_engine(
            db_url,
            connect_args={"check_same_thread": False},
        )

    engine_kwargs = {
        "pool_pre_ping": True,
        "pool_size": 20,
        "max_overflow": 10,
        "pool_recycle": 3600
    }
    if settings.DATABASE_PROVIDER.lower() == "oracle":
        engine_kwargs["connect_args"] = {
            "tcp_connect_timeout": 3,
            "retry_count": 0
        }

    eng = create_engine(
        db_url,
        **engine_kwargs
    )

    if settings.DATABASE_PROVIDER.lower() == "oracle":
        eng.dialect._json_deserializer = json.loads
        eng.dialect._json_serializer = json.dumps

    return eng



engine: Engine = _build_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def reconfigure_engine() -> Engine:
    """Disposes existing pool connections and rebuilds engine with updated settings."""
    global engine, SessionLocal
    try:
        engine.dispose()
    except Exception:
        pass

    engine = _build_engine()
    SessionLocal.configure(bind=engine)
    return engine


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
