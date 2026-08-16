# pyright: reportMissingTypeStubs=false
import requests  # type: ignore
import time
import logging
from typing import Dict, Any, Optional, List
from app.core.config import settings
from app.models.registry import DatasetRegistry

logger = logging.getLogger(__name__)


class MetabaseService:
    @staticmethod
    def get_status() -> Dict[str, Any]:
        """
        Check connectivity and health of Metabase service container.
        """
        try:
            resp = requests.get(f"{settings.METABASE_URL}/api/health", timeout=3)
            if resp.status_code == 200:
                return {
                    "status": "online",
                    "url": settings.METABASE_PUBLIC_URL,
                    "version": resp.json().get("version", {}).get("tag", "latest"),
                    "healthy": True
                }
            return {
                "status": "degraded",
                "url": settings.METABASE_PUBLIC_URL,
                "healthy": False,
                "error": f"Metabase responded with status code {resp.status_code}"
            }
        except Exception as e:
            return {
                "status": "offline",
                "url": settings.METABASE_PUBLIC_URL,
                "healthy": False,
                "error": f"Cannot connect to Metabase: {str(e)}"
            }

    @staticmethod
    def _get_session_headers() -> Optional[Dict[str, str]]:
        """Log in to Metabase and obtain a session token."""
        try:
            resp = requests.post(
                f"{settings.METABASE_URL}/api/session",
                json={
                    "username": settings.METABASE_ADMIN_EMAIL,
                    "password": settings.METABASE_ADMIN_PASSWORD
                },
                timeout=5
            )
            if resp.status_code == 200:
                token = resp.json().get("id")
                return {"X-Metabase-Session": token, "Content-Type": "application/json"}
            logger.error(f"Metabase login failed: {resp.text}")
            return None
        except Exception as e:
            logger.error(f"Metabase connection error during login: {str(e)}")
            return None

    @classmethod
    def get_dashboard_id_by_name(cls, name: str) -> Optional[int]:
        """Look up a Metabase dashboard ID by its name."""
        headers = cls._get_session_headers()
        if not headers:
            return None
        try:
            resp = requests.get(f"{settings.METABASE_URL}/api/dashboard", headers=headers, timeout=5)
            if resp.status_code == 200:
                dashboards = resp.json()
                for d in dashboards:
                    if d.get("name", "").strip().lower() == name.strip().lower():
                        return d.get("id")
            return None
        except Exception as e:
            logger.error(f"Failed to fetch Metabase dashboards: {str(e)}")
            return None

    @classmethod
    def sync_dataset(cls, dataset: DatasetRegistry, db: Any) -> None:
        """
        Dynamically synchronize a dataset with Metabase.
        Forces schema sync, creates a Collection, builds a Data Model, 
        creates useful analytic Cards, and lays them out on an embedded Dashboard.
        """
        headers = cls._get_session_headers()
        if not headers:
            logger.warning("Aborting Metabase synchronization: unable to authenticate.")
            return

        try:
            # 1. Retrieve Database ID in Metabase
            db_resp = requests.get(f"{settings.METABASE_URL}/api/database", headers=headers, timeout=5)
            if db_resp.status_code != 200:
                logger.error("Failed to list Metabase databases.")
                return
            
            mb_db_id = None
            for d in db_resp.json():
                details = d.get("details", {})
                if details.get("db") == settings.POSTGRES_DB or d.get("name") == "ONGC Geochem Lab DB":
                    mb_db_id = d.get("id")
                    break

            if not mb_db_id:
                logger.warning("ONGC database connection not found in Metabase configurations.")
                return

            # 2. Trigger schema sync to scan the new table immediately
            requests.post(f"{settings.METABASE_URL}/api/database/{mb_db_id}/sync_schema", headers=headers, timeout=5)
            logger.info(f"Triggered schema sync for database {mb_db_id}")
            time.sleep(3.0)  # Allow Metabase a few seconds to update its internal tables registry

            # 3. Resolve table metadata inside Metabase
            metadata_resp = requests.get(f"{settings.METABASE_URL}/api/database/{mb_db_id}/metadata", headers=headers, timeout=5)
            if metadata_resp.status_code != 200:
                logger.error("Failed to fetch database metadata from Metabase.")
                return

            table_name_lower = dataset.sql_table_name.lower() if dataset.sql_table_name else f"generic_dataset_{dataset.name}".lower()
            mb_table = None
            for t in metadata_resp.json().get("tables", []):
                if t.get("name", "").lower() == table_name_lower:
                    mb_table = t
                    break

            if not mb_table:
                logger.warning(f"Table '{table_name_lower}' not registered in Metabase metadata yet.")
                return

            mb_table_id = mb_table["id"]

            # 4. Manage Metabase Collection for the dataset
            coll_resp = requests.get(f"{settings.METABASE_URL}/api/collection", headers=headers, timeout=5)
            collection_id = None
            if coll_resp.status_code == 200:
                for c in coll_resp.json():
                    if c.get("name") == f"{dataset.display_name} Analytics":
                        collection_id = c.get("id")
                        break

            if not collection_id:
                create_coll_resp = requests.post(
                    f"{settings.METABASE_URL}/api/collection",
                    headers=headers,
                    json={
                        "name": f"{dataset.display_name} Analytics",
                        "color": "#509EE3",
                        "parent_id": None
                    },
                    timeout=5
                )
                if create_coll_resp.status_code in [200, 201]:
                    collection_id = create_coll_resp.json().get("id")
                else:
                    logger.error(f"Failed to create Metabase collection: {create_coll_resp.text}")
                    return

            # 5. Create Model (dataset card representation)
            cards_resp = requests.get(f"{settings.METABASE_URL}/api/collection/{collection_id}/items", headers=headers, timeout=5)
            model_card_id = None
            if cards_resp.status_code == 200:
                # collection items could be a list
                items = cards_resp.json()
                if isinstance(items, dict):
                    items = items.get("data", [])
                for item in items:
                    if item.get("model") == "card" and item.get("name") == f"{dataset.display_name} Model":
                        model_card_id = item.get("id")
                        break

            if not model_card_id:
                model_payload = {
                    "name": f"{dataset.display_name} Model",
                    "dataset_query": {
                        "database": mb_db_id,
                        "type": "query",
                        "query": {
                            "source-table": mb_table_id
                        }
                    },
                    "display": "table",
                    "visualization_settings": {},
                    "collection_id": collection_id,
                    "dataset": True
                }
                card_create_resp = requests.post(f"{settings.METABASE_URL}/api/card", headers=headers, json=model_payload, timeout=5)
                if card_create_resp.status_code in [200, 201]:
                    model_card_id = card_create_resp.json().get("id")
                    logger.info(f"Created Metabase Model for table ID {mb_table_id}")
                else:
                    logger.warning(f"Failed to create Model card: {card_create_resp.text}")

            # 6. Create Dynamic Analytical KPI card: Total Count
            count_card_id = None
            if cards_resp.status_code == 200:
                items = cards_resp.json()
                if isinstance(items, dict):
                    items = items.get("data", [])
                for item in items:
                    if item.get("model") == "card" and item.get("name") == f"Total {dataset.display_name} Record Count":
                        count_card_id = item.get("id")
                        break

            if not count_card_id:
                count_payload = {
                    "name": f"Total {dataset.display_name} Record Count",
                    "dataset_query": {
                        "database": mb_db_id,
                        "type": "query",
                        "query": {
                            "source-table": mb_table_id,
                            "aggregation": [["count"]]
                        }
                    },
                    "display": "scalar",
                    "visualization_settings": {},
                    "collection_id": collection_id
                }
                count_create_resp = requests.post(f"{settings.METABASE_URL}/api/card", headers=headers, json=count_payload, timeout=5)
                if count_create_resp.status_code in [200, 201]:
                    count_card_id = count_create_resp.json().get("id")

            # 7. Provision dynamic embedded Dashboard
            dash_resp = requests.get(f"{settings.METABASE_URL}/api/dashboard", headers=headers, timeout=5)
            dashboard_id = None
            if dash_resp.status_code == 200:
                for d in dash_resp.json():
                    if d.get("name") == f"{dataset.display_name} Dashboard" and d.get("collection_id") == collection_id:
                        dashboard_id = d.get("id")
                        break

            if not dashboard_id:
                dash_payload = {
                    "name": f"{dataset.display_name} Dashboard",
                    "collection_id": collection_id
                }
                dash_create_resp = requests.post(f"{settings.METABASE_URL}/api/dashboard", headers=headers, json=dash_payload, timeout=5)
                if dash_create_resp.status_code in [200, 201]:
                    dashboard_id = dash_create_resp.json().get("id")
                    
                    # Enable embedding on this dashboard
                    requests.put(f"{settings.METABASE_URL}/api/dashboard/{dashboard_id}", headers=headers, json={"enable_embedding": True}, timeout=5)
                    logger.info(f"Created & unlocked Metabase Dashboard ID {dashboard_id} for {dataset.display_name}")
                else:
                    logger.error(f"Failed to create dashboard: {dash_create_resp.text}")
                    return

            # 8. Add Cards to Dashboard (if dashboard is empty)
            dash_details_resp = requests.get(f"{settings.METABASE_URL}/api/dashboard/{dashboard_id}", headers=headers, timeout=5)
            if dash_details_resp.status_code == 200:
                dash_cards = dash_details_resp.json().get("ordered_cards", [])
                if not dash_cards:
                    # Add Count Card
                    if count_card_id:
                        requests.post(
                            f"{settings.METABASE_URL}/api/dashboard/{dashboard_id}/cards",
                            headers=headers,
                            json={
                                "cardId": count_card_id,
                                "size_x": 4,
                                "size_y": 4,
                                "row": 0,
                                "col": 0
                            },
                            timeout=5
                        )
                    # Add Model Table Card
                    if model_card_id:
                        requests.post(
                            f"{settings.METABASE_URL}/api/dashboard/{dashboard_id}/cards",
                            headers=headers,
                            json={
                                "cardId": model_card_id,
                                "size_x": 12,
                                "size_y": 8,
                                "row": 4,
                                "col": 0
                            },
                            timeout=5
                        )
                    logger.info(f"Populated Metabase Dashboard ID {dashboard_id} cards list.")

        except Exception as e:
            logger.error(f"Metabase automatic synchronization failure: {str(e)}")


metabase_service = MetabaseService()

