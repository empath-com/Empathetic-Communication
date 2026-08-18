from dataclasses import dataclass


ENGINE_PREFERENCE = ("generative", "long-form", "neural", "standard")


@dataclass(frozen=True)
class PollyVoice:
    voice_id: str
    language_code: str
    supported_engines: tuple[str, ...]

    @property
    def engines_by_preference(self) -> tuple[str, ...]:
        return tuple(
            engine for engine in ENGINE_PREFERENCE if engine in self.supported_engines
        )


def describe_voice(client, voice_id: str) -> PollyVoice | None:
    """Return the selected voice's regional capabilities, preserving Polly's ID casing."""
    next_token = None
    requested_id = voice_id.casefold()

    while True:
        request = {}
        if next_token:
            request["NextToken"] = next_token
        response = client.describe_voices(**request)

        for voice in response.get("Voices", []):
            if voice.get("Id", "").casefold() == requested_id:
                return PollyVoice(
                    voice_id=voice["Id"],
                    language_code=voice.get("LanguageCode", "en-US"),
                    supported_engines=tuple(voice.get("SupportedEngines", [])),
                )

        next_token = response.get("NextToken")
        if not next_token:
            return None


def fallback_engines(preferred_engine: str | None = None) -> tuple[str, ...]:
    if preferred_engine in ENGINE_PREFERENCE:
        return (preferred_engine,) + tuple(
            engine for engine in ENGINE_PREFERENCE if engine != preferred_engine
        )
    return ENGINE_PREFERENCE