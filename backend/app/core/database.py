import json
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from app.core.config import settings

engine_kwargs = {
    "pool_pre_ping": True,
    "pool_size": 20,
    "max_overflow": 10,
    "pool_recycle": 3600
}

if settings.DATABASE_PROVIDER.lower() == "oracle":
    engine_kwargs["connect_args"] = {
        "tcp_connect_timeout": 15
    }

engine = create_engine(
    settings.sqlalchemy_database_url,
    **engine_kwargs
)

if settings.DATABASE_PROVIDER.lower() == "oracle":
    engine.dialect._json_deserializer = json.loads
    engine.dialect._json_serializer = json.dumps

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

