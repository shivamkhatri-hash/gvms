from typing import List, Union
from pydantic import AnyHttpUrl, validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    PROJECT_NAME: str = "GVMS"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = "production"
    
    SECRET_KEY: str = "ongc_lab_super_secret_jwt_key_32bytes_min_length_2026"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480  # 8 hours
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # CORS Origins
    BACKEND_CORS_ORIGINS: List[str] = [
        "http://localhost",
        "http://localhost:3000",
        "http://localhost:8000",
        "http://localhost:3001",
        "http://localhost:8001",
        "http://localhost:8080",
        "http://127.0.0.1",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://127.0.0.1:8001",
        "http://127.0.0.1:8080",
        "*"
    ]

    # Database
    POSTGRES_SERVER: str = "postgres"
    POSTGRES_PORT: str = "5432"
    POSTGRES_USER: str = "ongc_admin"
    POSTGRES_PASSWORD: str = "ONGC_Lab_Secure_Pass2026!"
    POSTGRES_DB: str = "ongc_lab"
    DATABASE_URL: str = "postgresql://ongc_admin:ONGC_Lab_Secure_Pass2026!@postgres:5432/ongc_lab"

    # Initial Superuser
    FIRST_SUPERUSER: str = "admin@ongc.co.in"
    FIRST_SUPERUSER_PASSWORD: str = "Admin@123456"
    FIRST_SUPERUSER_NAME: str = "GVMS Chief Geochemist"

    # Metabase Integration
    METABASE_URL: str = "http://metabase:3000"
    METABASE_PUBLIC_URL: str = "http://localhost/metabase"
    METABASE_ADMIN_EMAIL: str = "admin@ongc.co.in"
    METABASE_ADMIN_PASSWORD: str = "Admin@123456"
    METABASE_EMBED_SECRET_KEY: str = "23485ab9403816ca3de0927df8b461b3690d5fcd715456209be3cd1ef381da23"
    METABASE_DASHBOARD_ID: int = 1

    # Database Provider Configuration
    DATABASE_PROVIDER: str = "postgres"  # "postgres" or "oracle"
    
    # Oracle Database Settings
    ORACLE_USER: str = "ongc_user"
    ORACLE_PASSWORD: str = "ONGC_Oracle_Pass2026!"
    ORACLE_HOST: str = "oracle_host"
    ORACLE_PORT: str = "1521"
    ORACLE_SERVICE_NAME: str = "ORCL"
    
    # Enterprise Authentication Settings
    ENTERPRISE_AUTH_ENABLED: bool = False

    @property
    def sqlalchemy_database_url(self) -> str:
        if self.DATABASE_PROVIDER.lower() == "oracle":
            return f"oracle+oracledb://{self.ORACLE_USER}:{self.ORACLE_PASSWORD}@{self.ORACLE_HOST}:{self.ORACLE_PORT}/?service_name={self.ORACLE_SERVICE_NAME}"
        return self.DATABASE_URL

    # Dynamic Column Mappings for CSV/Excel Ingestion Engine
    LIMS_COLUMN_MAPPING: dict = {
        "sample_type": ["sample_type", "sample type", "sampletype", "type", "rock_type", "lithology"],
        "well_name": ["well_name", "well name", "well", "wellid", "well_id", "borehole"],
        "depth_from": ["depth_from", "depth from", "depth", "depth_m", "depth (m)", "md", "top_depth"],
        "depth_interval": ["depth_interval", "depth interval", "interval", "thickness", "step", "sample_interval"],
        "toc": ["toc", "toc%", "toc (wt%)", "toc_wt%", "total_organic_carbon", "toc%"],
        "s2": ["s2", "s2 (mg/g)", "s2_mg_g", "pyrolysis_s2", "s2_peak"]
    }

    class Config:
        case_sensitive = True
        env_file = ".env"
        extra = "allow"


settings = Settings()
