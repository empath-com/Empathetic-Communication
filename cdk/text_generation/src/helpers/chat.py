"""
Backwards-compatibility facade.

All business logic has been split into focused domain modules:
  - prompts.py      : prompt template functions
  - empathy.py      : empathy evaluation logic
  - streaming.py    : AppSync publishing and streaming
  - llm.py          : core LLM / Bedrock interaction
  - conversation.py : chat history, message DB ops, RAG chain orchestration

This file re-exports every public name so that existing callers
(e.g. main.py, socket-server) continue to work unchanged.
"""

from .prompts import *        # noqa: F401,F403
from .empathy import *        # noqa: F401,F403
from .streaming import *      # noqa: F401,F403
from .llm import *            # noqa: F401,F403
from .conversation import *   # noqa: F401,F403
