import re
import time
import json


def strip_vocal_cues(text: str, carry: str = "") -> tuple[str, str]:
    """
    Remove bracketed vocal cues (e.g. [sighs softly]) from text before display/DB storage.
    Handles cues split across consecutive textOutput events via a carry buffer.

    Nova Sonic uses these brackets to shape the synthesized audio — they must remain in the
    prompt/context but must not leak into the visible transcript or stored messages.

    Returns:
        (cleaned_text, new_carry)
        new_carry is any trailing incomplete bracket to prepend to the next event's text.
    """
    # Prepend any fragment carried over from the previous event
    text = carry + text

    # Carry forward an incomplete opening bracket at the end of this chunk.
    # A cue like [hesitates] can arrive as "[hes" in one event and "itates] ..." in the next.
    # We detect a trailing "[" that has no matching "]" and hold it for the next event.
    new_carry = ""
    open_pos = text.rfind("[")
    if open_pos != -1 and "]" not in text[open_pos:]:
        # Incomplete bracket at end — carry it forward, strip from text
        new_carry = text[open_pos:]
        text = text[:open_pos]

    # Remove all complete bracketed cues (non-greedy to handle multiple per event)
    cleaned = re.sub(r"\[[^\[\]]*?\]", "", text)

    # Collapse multiple spaces that may result from cue removal, preserving newlines
    cleaned = re.sub(r" {2,}", " ", cleaned).strip()

    return cleaned, new_carry


def format_vocal_cues_for_display(text: str, carry: str = "") -> tuple[str, str]:
    """
    Keep vocal cues in visible assistant text, but render them in a more readable
    parenthetical form: [hesitantly] -> (hesitantly).

    Handles cues split across consecutive textOutput events via a carry buffer.
    Returns (formatted_text, new_carry).
    """
    text = carry + text

    new_carry = ""
    open_pos = text.rfind("[")
    if open_pos != -1 and "]" not in text[open_pos:]:
        new_carry = text[open_pos:]
        text = text[:open_pos]

    def _cue_to_parenthetical(match):
        cue = (match.group(1) or "").strip()
        if not cue:
            return ""
        return f" ({cue}) "

    formatted = re.sub(r"\[([^\[\]]*?)\]", _cue_to_parenthetical, text)
    formatted = re.sub(r" {2,}", " ", formatted).strip()

    return formatted, new_carry


class VoiceTurnTimer:
    """
    Per-turn latency tracker.  Call mark() at each pipeline milestone; call emit()
    at the end of the turn to print a single structured JSON line for CloudWatch.
    """

    def __init__(self, turn_id: int):
        self._turn_id = turn_id
        self._marks: dict = {}
        self._t0 = time.monotonic()

    def mark(self, event: str) -> int:
        """Record event timestamp; return elapsed ms since timer creation."""
        elapsed_ms = round((time.monotonic() - self._t0) * 1000)
        self._marks[event] = elapsed_ms
        return elapsed_ms

    def emit(self):
        """Print structured latency event for log analysis."""
        print(json.dumps({
            "type": "voice_latency",
            "turn_id": self._turn_id,
            **self._marks,
        }), flush=True)


class SentenceAccumulator:
    """
    Accumulates streaming LLM text deltas and yields complete sentences suitable
    for Polly synthesis.  Forces a flush when the buffer grows beyond MAX_BUFFER
    characters so long unpunctuated outputs don't block TTS indefinitely.
    """

    _SENTENCE_END = re.compile(r'(?<=[.!?])\s+')
    MAX_BUFFER = 380  # chars — keep below Polly's SynthesizeSpeech billed limit

    def __init__(self):
        self._buf = ""

    def feed(self, delta: str) -> list:
        """Return list of complete sentences extracted from the buffer."""
        self._buf += delta
        sentences = []
        while True:
            m = self._SENTENCE_END.search(self._buf)
            if not m:
                break
            sentence = self._buf[:m.start() + 1].strip()
            self._buf = self._buf[m.end():]
            if sentence:
                sentences.append(sentence)
        # Force split on long unpunctuated runs to avoid starving Polly.
        if len(self._buf) > self.MAX_BUFFER:
            last_space = self._buf.rfind(" ", 0, self.MAX_BUFFER)
            if last_space > 0:
                sentences.append(self._buf[:last_space].strip())
                self._buf = self._buf[last_space + 1:]
        return sentences

    def flush(self) -> str:
        """Return remaining buffered text and clear the buffer."""
        remaining = self._buf.strip()
        self._buf = ""
        return remaining
