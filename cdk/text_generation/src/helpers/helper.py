import logging
from typing import Optional

import psycopg2
from langchain_aws import BedrockEmbeddings
from langchain_postgres import PGVector

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Cache keyed by (collection_name, host, dbname, password) so rotation naturally busts the cache
_vectorstore_cache: dict = {}

def get_vectorstore(
    collection_name: str,
    embeddings: BedrockEmbeddings,
    dbname: str,
    user: str,
    password: str,
    host: str,
    port: int
) -> Optional[PGVector]:
    """
    Initialize and return a PGVector instance, reusing a cached instance when possible.
    Cache is keyed by (collection_name, host, dbname, password) so secret rotation
    automatically creates a fresh instance.

    Args:
    collection_name (str): The name of the collection.
    embeddings (BedrockEmbeddings): The embeddings instance.
    dbname (str): The name of the database.
    user (str): The database user.
    password (str): The database password.
    host (str): The database host.
    port (int): The database port.

    Returns:
    Optional[PGVector]: The initialized PGVector instance, or None if an error occurred.
    """
    cache_key = (collection_name, host, dbname, password)
    if cache_key in _vectorstore_cache:
        logger.info(f"Reusing cached VectorStore for collection '{collection_name}'")
        cached_vs = _vectorstore_cache[cache_key]
        connection_string = f"postgresql+psycopg://{user}:{password}@{host}:{port}/{dbname}"
        return cached_vs, connection_string

    try:
        connection_string = (
            f"postgresql+psycopg://{user}:{password}@{host}:{port}/{dbname}"
        )

        logger.info(f"Initializing VectorStore for collection '{collection_name}'")
        vectorstore = PGVector(
            embeddings=embeddings,
            collection_name=collection_name,
            connection=connection_string,
            use_jsonb=True
        )

        _vectorstore_cache[cache_key] = vectorstore
        logger.info("VectorStore initialized and cached")
        return vectorstore, connection_string

    except Exception as e:
        logger.error(f"Error initializing vector store: {e}")
        return None