import os

PRACTITIONER_ROLE = os.getenv("PRACTITIONER_ROLE", "pharmacist")

SCHEMA_VARIANT_STRICT = "strict"
SCHEMA_VARIANT_RELAXED = "relaxed"

CARE_TOOL_NAME_STRICT = "submit_empathy_evaluation"
CARE_TOOL_NAME_RELAXED = "submit_empathy_evaluation_relaxed"
PRISM_TOOL_NAME_STRICT = "submit_prism_evaluation"
PRISM_TOOL_NAME_RELAXED = "submit_prism_evaluation_relaxed"

CARE_CRITERIA = [
    "making_feel_at_ease",
    "letting_tell_story",
    "really_listening",
    "interested_in_whole_person",
    "understanding_concerns",
    "showing_care_compassion",
    "being_positive",
    "explaining_clearly",
    "helping_take_control",
    "making_plan_of_action",
]

PRISM_CRITERIA = ["prepare", "recognise", "interact", "self_assess", "master"]

CARE_JUSTIFICATION_KEYS = [f"{k}_justification" for k in CARE_CRITERIA]
PRISM_JUSTIFICATION_KEYS = [f"{k}_justification" for k in PRISM_CRITERIA]

CARE_CRITERIA_LABELS = {
    "making_feel_at_ease": "1. Making you feel at ease",
    "letting_tell_story": "2. Letting you tell your story",
    "really_listening": "3. Really listening",
    "interested_in_whole_person": "4. Being interested in you as a whole person",
    "understanding_concerns": "5. Fully understanding your concerns",
    "showing_care_compassion": "6. Showing care and compassion",
    "being_positive": "7. Being positive",
    "explaining_clearly": "8. Explaining things clearly",
    "helping_take_control": "9. Helping you take control",
    "making_plan_of_action": "10. Making a plan of action with you",
}

PRISM_CRITERIA_LABELS = {
    "prepare": "P. Prepare — Orientation & framing",
    "recognise": "R. Recognise — Identifying patient cues",
    "interact": "I. Interact — Empathic engagement",
    "self_assess": "S. Self-Assess — In-conversation monitoring",
    "master": "M. Master — Integrated skill delivery",
}


def resolve_schema_variant(schema_variant: str | None = None) -> str:
    normalized = (schema_variant or os.getenv("EMPATHY_TOOL_SCHEMA_VARIANT", SCHEMA_VARIANT_STRICT)).strip().lower()
    return SCHEMA_VARIANT_RELAXED if normalized == SCHEMA_VARIANT_RELAXED else SCHEMA_VARIANT_STRICT


def get_care_tool_name(schema_variant: str | None = None) -> str:
    if resolve_schema_variant(schema_variant) == SCHEMA_VARIANT_RELAXED:
        return CARE_TOOL_NAME_RELAXED
    return CARE_TOOL_NAME_STRICT


def get_prism_tool_name(schema_variant: str | None = None) -> str:
    if resolve_schema_variant(schema_variant) == SCHEMA_VARIANT_RELAXED:
        return PRISM_TOOL_NAME_RELAXED
    return PRISM_TOOL_NAME_STRICT


def _care_base_properties() -> dict:
    return {
        "making_feel_at_ease": {"type": "integer", "minimum": 1, "maximum": 5},
        "letting_tell_story": {"type": "integer", "minimum": 1, "maximum": 5},
        "really_listening": {"type": "integer", "minimum": 1, "maximum": 5},
        "interested_in_whole_person": {"type": "integer", "minimum": 1, "maximum": 5},
        "understanding_concerns": {"type": "integer", "minimum": 1, "maximum": 5},
        "showing_care_compassion": {"type": "integer", "minimum": 1, "maximum": 5},
        "being_positive": {"type": "integer", "minimum": 1, "maximum": 5},
        "explaining_clearly": {"type": "integer", "minimum": 1, "maximum": 5},
        "helping_take_control": {"type": "integer", "minimum": 1, "maximum": 5},
        "making_plan_of_action": {"type": "integer", "minimum": 1, "maximum": 5},
        "judge_reasoning": {
            "type": "object",
            "properties": {
                "making_feel_at_ease_justification": {"type": "string"},
                "letting_tell_story_justification": {"type": "string"},
                "really_listening_justification": {"type": "string"},
                "interested_in_whole_person_justification": {"type": "string"},
                "understanding_concerns_justification": {"type": "string"},
                "showing_care_compassion_justification": {"type": "string"},
                "being_positive_justification": {"type": "string"},
                "explaining_clearly_justification": {"type": "string"},
                "helping_take_control_justification": {"type": "string"},
                "making_plan_of_action_justification": {"type": "string"},
                "overall_assessment": {"type": "string"},
            },
        },
        "feedback": {
            "type": "object",
            "properties": {
                "strengths": {"type": "array", "items": {"type": "string"}},
                "improvement_suggestions": {"type": "array", "items": {"type": "string"}},
                "forward_target": {"type": "string"},
            },
        },
    }


def _prism_base_properties() -> dict:
    return {
        "prepare": {"type": "integer", "minimum": 1, "maximum": 5},
        "recognise": {"type": "integer", "minimum": 1, "maximum": 5},
        "interact": {"type": "integer", "minimum": 1, "maximum": 5},
        "self_assess": {"type": "integer", "minimum": 1, "maximum": 5},
        "master": {"type": "integer", "minimum": 1, "maximum": 5},
        "judge_reasoning": {
            "type": "object",
            "properties": {
                "prepare_justification": {"type": "string"},
                "recognise_justification": {"type": "string"},
                "interact_justification": {"type": "string"},
                "self_assess_justification": {"type": "string"},
                "master_justification": {"type": "string"},
                "overall_assessment": {"type": "string"},
            },
        },
        "feedback": {
            "type": "object",
            "properties": {
                "strengths": {"type": "array", "items": {"type": "string"}},
                "improvement_suggestions": {"type": "array", "items": {"type": "string"}},
                "forward_target": {"type": "string"},
            },
        },
    }


def get_care_tool_spec(schema_variant: str | None = None) -> dict:
    _pro = PRACTITIONER_ROLE
    variant = resolve_schema_variant(schema_variant)
    strict = variant == SCHEMA_VARIANT_STRICT
    tool_name = get_care_tool_name(variant)
    schema = {
        "type": "object",
        "properties": _care_base_properties(),
    }
    if strict:
        schema["required"] = [
            "making_feel_at_ease",
            "letting_tell_story",
            "really_listening",
            "interested_in_whole_person",
            "understanding_concerns",
            "showing_care_compassion",
            "being_positive",
            "explaining_clearly",
            "helping_take_control",
            "making_plan_of_action",
            "judge_reasoning",
            "feedback",
        ]
        schema["properties"]["judge_reasoning"]["required"] = [
            "making_feel_at_ease_justification",
            "letting_tell_story_justification",
            "really_listening_justification",
            "interested_in_whole_person_justification",
            "understanding_concerns_justification",
            "showing_care_compassion_justification",
            "being_positive_justification",
            "explaining_clearly_justification",
            "helping_take_control_justification",
            "making_plan_of_action_justification",
            "overall_assessment",
        ]
        schema["properties"]["feedback"]["required"] = ["strengths", "improvement_suggestions", "forward_target"]

    description = (
        f"Evaluate the {_pro} using 10 CARE criteria and return structured scores with reasoning."
        if strict
        else f"CARE scoring schema for {_pro}."
    )
    return {"toolSpec": {"name": tool_name, "description": description, "inputSchema": {"json": schema}}}


def get_prism_tool_spec(schema_variant: str | None = None) -> dict:
    _pro = PRACTITIONER_ROLE
    variant = resolve_schema_variant(schema_variant)
    strict = variant == SCHEMA_VARIANT_STRICT
    tool_name = get_prism_tool_name(variant)
    schema = {
        "type": "object",
        "properties": _prism_base_properties(),
    }
    if strict:
        schema["required"] = ["prepare", "recognise", "interact", "self_assess", "master", "judge_reasoning", "feedback"]
        schema["properties"]["judge_reasoning"]["required"] = [
            "prepare_justification",
            "recognise_justification",
            "interact_justification",
            "self_assess_justification",
            "master_justification",
            "overall_assessment",
        ]
        schema["properties"]["feedback"]["required"] = ["strengths", "improvement_suggestions", "forward_target"]

    description = (
        f"Evaluate the {_pro} using PRISM (5 dimensions) and return structured scores with reasoning."
        if strict
        else f"PRISM scoring schema for {_pro}."
    )
    return {"toolSpec": {"name": tool_name, "description": description, "inputSchema": {"json": schema}}}
