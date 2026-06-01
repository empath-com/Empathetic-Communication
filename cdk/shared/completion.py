"""Shared completion logic for text and voice generation.

The text-generation flow remains the source of truth; voice consumes the same
helpers so it mirrors the exact same completion behavior.
"""

from __future__ import annotations

import re

DEFAULT_COMPLETION_SENTENCE = " Thank you for your help. Goodbye."


def build_completion_instruction(practitioner_role: str, llm_completion: bool) -> str:
    """Build the shared completion instruction block for prompt assembly."""
    if llm_completion:
        return f"""
                Continue this process until you determine that me, the {practitioner_role}, has properly addressed your concerns.
                Do not end the consultation immediately after a single answer, dosage instruction, or partial reassurance.
                Before ending, provide a final brief in-character wrap-up that naturally closes the conversation.
                Only after that final wrap-up, include SESSION COMPLETED as the very last part of your response and then stop.
                """

    return f"""
                Once the {practitioner_role} has responded to your concern, politely end the conversation and say goodbye.
                Regardless of the outcome, do not continue the conversation further.
                """


def split_into_sentences(paragraph: str) -> list[str]:
    """Split a paragraph into sentence-like chunks."""
    sentence_endings = r"(?<!\w\.\w.)(?<![A-Z][a-z]\.)(?<=\.|\?|\!)\s"
    return re.split(sentence_endings, paragraph)


def finalize_completion_response(
    response: str,
    llm_completion: bool,
    completion_sentence: str = DEFAULT_COMPLETION_SENTENCE,
) -> dict:
    """Normalize completion output and verdict for both text and voice flows."""
    if not llm_completion:
        return {"llm_output": response, "llm_verdict": False}

    if "SESSION COMPLETED" not in response:
        return {"llm_output": response, "llm_verdict": False}

    sentences = split_into_sentences(response)
    marker_index = next((index for index, sentence in enumerate(sentences) if "SESSION COMPLETED" in sentence), None)

    if marker_index is None:
        cleaned = response.replace("SESSION COMPLETED", "").strip()
        return {"llm_output": cleaned + completion_sentence, "llm_verdict": True}

    llm_response = " ".join(sentences[:marker_index]).strip()

    if marker_index > 0 and sentences[marker_index - 1].rstrip().endswith("?"):
        return {"llm_output": llm_response, "llm_verdict": False}

    if not llm_response:
        llm_response = response.replace("SESSION COMPLETED", "").strip()

    return {"llm_output": llm_response + completion_sentence, "llm_verdict": True}
