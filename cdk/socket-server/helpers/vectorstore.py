import logging
from typing import Dict

from langchain_core.vectorstores import VectorStoreRetriever
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain.chains import create_history_aware_retriever

from helpers.helper import get_vectorstore

logger = logging.getLogger(__name__)

def get_vectorstore_retriever(
    llm,
    vectorstore_config_dict: Dict[str, str],
    embeddings#: BedrockEmbeddings
) -> VectorStoreRetriever:
    """
    Retrieve the vectorstore and return the history-aware retriever object.

    Args:
    llm: The language model instance used to generate the response.
    vectorstore_config_dict (Dict[str, str]): The configuration dictionary for the vectorstore, including parameters like collection name, database name, user, password, host, and port.
    embeddings (BedrockEmbeddings): The embeddings instance used to process the documents.

    Returns:
    VectorStoreRetriever: A history-aware retriever instance.
    """
    collection_name = vectorstore_config_dict['collection_name']
    host = vectorstore_config_dict['host']
    logger.info(f"🔍 VECTORSTORE: Connecting — collection={collection_name!r}, host={host!r}")
    print(f"🔍 VECTORSTORE: Connecting — collection={collection_name!r}, host={host!r}", flush=True)

    vectorstore, _ = get_vectorstore(
        collection_name=collection_name,
        embeddings=embeddings,
        dbname=vectorstore_config_dict['dbname'],
        user=vectorstore_config_dict['user'],
        password=vectorstore_config_dict['password'],
        host=host,
        port=int(vectorstore_config_dict['port'])
    )

    # Quick sanity-check: count docs in this collection so we know if retrieval will work
    try:
        test_docs = vectorstore.similarity_search("symptoms condition medical history", k=3)
        print(f"🔍 VECTORSTORE: Test search for collection={collection_name!r} → {len(test_docs)} doc(s) returned", flush=True)
        logger.info(f"🔍 VECTORSTORE: Test search found {len(test_docs)} docs for collection={collection_name!r}")
        if test_docs:
            print(f"🔍 VECTORSTORE: First doc preview: {test_docs[0].page_content[:120]!r}", flush=True)
    except Exception as vtest_e:
        print(f"❌ VECTORSTORE: Test search FAILED for collection={collection_name!r}: {vtest_e}", flush=True)
        logger.error(f"VECTORSTORE: Test search failed: {vtest_e}")

    retriever = vectorstore.as_retriever()

    # Contextualize question and create history-aware retriever
    contextualize_q_system_prompt = (
        "Given a chat history and the latest user question "
        "which might reference context in the chat history, "
        "formulate a standalone question which can be understood "
        "without the chat history. Do NOT answer the question, "
        "just reformulate it if needed and otherwise return it as is."
    )
    contextualize_q_prompt = ChatPromptTemplate.from_messages(
        [
            ("system", contextualize_q_system_prompt),
            MessagesPlaceholder("chat_history"),
            ("human", "{input}"),
        ]
    )
    history_aware_retriever = create_history_aware_retriever(
        llm, retriever, contextualize_q_prompt
    )

    return history_aware_retriever