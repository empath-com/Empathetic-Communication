import unittest

from polly_capabilities import describe_voice, fallback_engines


class FakePollyClient:
    def __init__(self, pages):
        self.pages = pages
        self.requests = []

    def describe_voices(self, **request):
        self.requests.append(request)
        return self.pages[len(self.requests) - 1]


class PollyCapabilitiesTests(unittest.TestCase):
    def test_finds_a_legacy_lowercase_voice_across_pages(self):
        client = FakePollyClient([
            {"Voices": [{"Id": "Joanna", "LanguageCode": "en-US", "SupportedEngines": ["neural"]}], "NextToken": "next"},
            {"Voices": [{"Id": "Tiffany", "LanguageCode": "en-US", "SupportedEngines": ["standard", "generative"]}]},
        ])

        voice = describe_voice(client, "tiffany")

        self.assertEqual(voice.voice_id, "Tiffany")
        self.assertEqual(voice.engines_by_preference, ("generative", "standard"))
        self.assertEqual(client.requests, [{}, {"NextToken": "next"}])

    def test_uses_standard_when_that_is_the_only_supported_engine(self):
        client = FakePollyClient([
            {"Voices": [{"Id": "Maxim", "LanguageCode": "ru-RU", "SupportedEngines": ["standard"]}]},
        ])

        voice = describe_voice(client, "MAXIM")

        self.assertEqual(voice.engines_by_preference, ("standard",))

    def test_keeps_the_configured_engine_first_when_metadata_is_unavailable(self):
        self.assertEqual(
            fallback_engines("neural"),
            ("neural", "generative", "long-form", "standard"),
        )


if __name__ == "__main__":
    unittest.main()