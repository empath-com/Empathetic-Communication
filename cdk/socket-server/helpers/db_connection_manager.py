"""
Adapter: provides the same get_db_cursor / get_pool_status interface as
text_generation's db_connection_manager, delegating to the socket-server's
voice_db_manager connection pool so both share a single pool.
"""
import logging
from contextlib import contextmanager

logger = logging.getLogger(__name__)


@contextmanager
def get_db_cursor():
    """Context manager yielding a cursor — mirrors text_generation's get_db_cursor."""
    from voice_db_manager import get_pg_connection, return_pg_connection
    conn = get_pg_connection()
    cursor = None
    try:
        cursor = conn.cursor()
        yield cursor
    finally:
        if cursor:
            try:
                cursor.close()
            except Exception:
                pass
        return_pg_connection(conn)


def get_pool_status():
    """Returns pool status dict — mirrors text_generation's get_pool_status."""
    try:
        from voice_db_manager import voice_db_manager
        return voice_db_manager.get_pool_status()
    except Exception as e:
        logger.warning(f"Could not get pool status: {e}")
        return {"status": "unknown"}
