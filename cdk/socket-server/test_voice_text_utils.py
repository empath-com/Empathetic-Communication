import unittest

from voice_text_utils import strip_vocal_cues


class StripVocalCuesTests(unittest.TestCase):
    def test_removes_cues_without_removing_dialogue(self):
        clean, carry = strip_vocal_cues("[looks nervously around] I am worried.")

        self.assertEqual(clean, "I am worried.")
        self.assertEqual(carry, "")

    def test_removes_multiple_cues(self):
        clean, carry = strip_vocal_cues("I [pauses] need help [voice quieter] now.")

        self.assertEqual(clean, "I need help now.")
        self.assertEqual(carry, "")

    def test_carries_a_split_cue_until_the_next_chunk(self):
        first_clean, carry = strip_vocal_cues("[looks nerv", "")
        second_clean, final_carry = strip_vocal_cues("ously around] I am worried.", carry)

        self.assertEqual(first_clean, "")
        self.assertEqual(carry, "[looks nerv")
        self.assertEqual(second_clean, "I am worried.")
        self.assertEqual(final_carry, "")

    def test_leaves_dialogue_without_cues_unchanged(self):
        clean, carry = strip_vocal_cues("I have been feeling dizzy today.")

        self.assertEqual(clean, "I have been feeling dizzy today.")
        self.assertEqual(carry, "")


if __name__ == "__main__":
    unittest.main()