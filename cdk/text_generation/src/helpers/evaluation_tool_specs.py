import logging
import os

logging.basicConfig(level=logging.INFO)
_logger = logging.getLogger(__name__)

SIMULATED_ROLE = os.getenv("SIMULATED_ROLE", "patient")
PRACTITIONER_ROLE = os.getenv("PRACTITIONER_ROLE", "pharmacist")

CARE_CRITERIA = [
    'making_feel_at_ease', 'letting_tell_story', 'really_listening',
    'interested_in_whole_person', 'understanding_concerns', 'showing_care_compassion',
    'being_positive', 'explaining_clearly', 'helping_take_control', 'making_plan_of_action',
]

PRISM_CRITERIA = ['prepare', 'recognise', 'interact', 'self_assess', 'master']

CARE_JUSTIFICATION_KEYS = [f"{k}_justification" for k in CARE_CRITERIA]
PRISM_JUSTIFICATION_KEYS = [f"{k}_justification" for k in PRISM_CRITERIA]

CARE_CRITERIA_LABELS = {
    'making_feel_at_ease':        '1. Making you feel at ease',
    'letting_tell_story':         '2. Letting you tell your story',
    'really_listening':           '3. Really listening',
    'interested_in_whole_person': '4. Being interested in you as a whole person',
    'understanding_concerns':     '5. Fully understanding your concerns',
    'showing_care_compassion':    '6. Showing care and compassion',
    'being_positive':             '7. Being positive',
    'explaining_clearly':         '8. Explaining things clearly',
    'helping_take_control':       '9. Helping you take control',
    'making_plan_of_action':      '10. Making a plan of action with you',
}

PRISM_CRITERIA_LABELS = {
    'prepare':     'P. Prepare — Orientation & framing',
    'recognise':   'R. Recognise — Identifying patient cues',
    'interact':    'I. Interact — Empathic engagement',
    'self_assess': 'S. Self-Assess — In-conversation monitoring',
    'master':      'M. Master — Integrated skill delivery',
}


def get_care_tool_spec() -> dict:
    _pro = PRACTITIONER_ROLE
    _role = SIMULATED_ROLE
    _J = "2-4 sentences. Quote or paraphrase transcript evidence. Explain the score. Do not merge with other criteria."
    return {
        "toolSpec": {
            "name": "submit_empathy_evaluation",
            "description": (
                f"Evaluate the {_pro} using 10 CARE criteria, each scored 1-5 "
                "(1=Emerging, 2=Developing, 3=Competent, 4=Proficient, 5=Advanced). "
                "Populate every field. Do not omit, merge, or rename any field."
            ),
            "inputSchema": {
                "json": {
                    "type": "object",
                    "properties": {
                        "making_feel_at_ease": {
                            "type": "integer", "enum": [1, 2, 3, 4, 5],
                            "description": f"Score 1-5: warmth and comfort-building toward the {_role}."
                        },
                        "letting_tell_story": {
                            "type": "integer", "enum": [1, 2, 3, 4, 5],
                            "description": f"Score 1-5: space given for {_role} self-expression."
                        },
                        "really_listening": {
                            "type": "integer", "enum": [1, 2, 3, 4, 5],
                            "description": "Score 1-5: active listening via paraphrasing, reflecting, engagement."
                        },
                        "interested_in_whole_person": {
                            "type": "integer", "enum": [1, 2, 3, 4, 5],
                            "description": f"Score 1-5: curiosity about holistic {_role} context beyond their immediate concern."
                        },
                        "understanding_concerns": {
                            "type": "integer", "enum": [1, 2, 3, 4, 5],
                            "description": f"Score 1-5: depth of understanding and validation of {_role} concerns."
                        },
                        "showing_care_compassion": {
                            "type": "integer", "enum": [1, 2, 3, 4, 5],
                            "description": f"Score 1-5: genuine empathy and emotional support shown to {_role}."
                        },
                        "being_positive": {
                            "type": "integer", "enum": [1, 2, 3, 4, 5],
                            "description": "Score 1-5: encouraging, reassuring, non-judgmental tone."
                        },
                        "explaining_clearly": {
                            "type": "integer", "enum": [1, 2, 3, 4, 5],
                            "description": "Score 1-5: clarity of explanations in plain language."
                        },
                        "helping_take_control": {
                            "type": "integer", "enum": [1, 2, 3, 4, 5],
                            "description": f"Score 1-5: {_role} empowerment and involvement in decisions."
                        },
                        "making_plan_of_action": {
                            "type": "integer", "enum": [1, 2, 3, 4, 5],
                            "description": "Score 1-5: collaborative planning and agreed next steps."
                        },
                        "judge_reasoning": {
                            "type": "object",
                            "description": "Separate justification for each criterion. Every field is required. Do not combine justifications.",
                            "properties": {
                                "making_feel_at_ease_justification":        {"type": "string", "description": _J},
                                "letting_tell_story_justification":         {"type": "string", "description": _J},
                                "really_listening_justification":           {"type": "string", "description": _J},
                                "interested_in_whole_person_justification": {"type": "string", "description": _J},
                                "understanding_concerns_justification":     {"type": "string", "description": _J},
                                "showing_care_compassion_justification":    {"type": "string", "description": _J},
                                "being_positive_justification":             {"type": "string", "description": _J},
                                "explaining_clearly_justification":         {"type": "string", "description": _J},
                                "helping_take_control_justification":       {"type": "string", "description": _J},
                                "making_plan_of_action_justification":      {"type": "string", "description": _J},
                                "overall_assessment": {
                                    "type": "string",
                                    "description": (
                                        "Brief coach summary using 'you'. "
                                        "Do not repeat individual justifications. "
                                        "Highlight the key pattern across the conversation."
                                    )
                                }
                            },
                            "required": [
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
                                "overall_assessment"
                            ]
                        },
                        "feedback": {
                            "type": "object",
                            "properties": {
                                "strengths": {
                                    "type": "array",
                                    "description": "1-2 specific strengths with transcript evidence.",
                                    "items": {"type": "string"}
                                },
                                "improvement_suggestions": {
                                    "type": "array",
                                    "description": "1-2 actionable improvement suggestions with evidence-based rationale.",
                                    "items": {"type": "string"}
                                },
                                "forward_target": {
                                    "type": "string",
                                    "description": "The single CARE criterion or skill to focus on next."
                                }
                            },
                            "required": ["strengths", "improvement_suggestions", "forward_target"]
                        }
                    },
                    "required": [
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
                        "feedback"
                    ]
                }
            }
        }
    }


def get_prism_tool_spec() -> dict:
    _pro = PRACTITIONER_ROLE
    _role = SIMULATED_ROLE
    _J = "2-4 sentences. Quote or paraphrase transcript evidence. Explain the score. Do not merge with other dimensions."
    return {
        "toolSpec": {
            "name": "submit_prism_evaluation",
            "description": (
                f"Evaluate the {_pro} using the PRISM framework (5 dimensions), each scored 1-5 "
                "(1=Emerging, 2=Developing, 3=Competent, 4=Proficient, 5=Advanced). "
                "Populate every field. Do not omit, merge, or rename any field."
            ),
            "inputSchema": {
                "json": {
                    "type": "object",
                    "properties": {
                        "prepare": {
                            "type": "integer", "enum": [1, 2, 3, 4, 5],
                            "description": (
                                f"Score 1-5: the {_pro}'s preparation and orientation — "
                                f"does the {_pro} frame the interaction, establish context, and set a collaborative tone before diving into content? (SDT: autonomy-supportive setup)"
                            )
                        },
                        "recognise": {
                            "type": "integer", "enum": [1, 2, 3, 4, 5],
                            "description": (
                                f"Score 1-5: the {_pro}'s ability to identify and name the {_role}'s "
                                "emotional state, verbal cues, and unspoken concerns."
                            )
                        },
                        "interact": {
                            "type": "integer", "enum": [1, 2, 3, 4, 5],
                            "description": (
                                f"Score 1-5: quality of the {_pro}'s empathic interaction — "
                                f"active listening, validation, reflection, and relational warmth toward the {_role}. (SDT: relatedness)"
                            )
                        },
                        "self_assess": {
                            "type": "integer", "enum": [1, 2, 3, 4, 5],
                            "description": (
                                f"Score 1-5: the {_pro}'s in-conversation self-monitoring — "
                                "checking understanding, adjusting based on feedback, and correcting course. (SDT: competence)"
                            )
                        },
                        "master": {
                            "type": "integer", "enum": [1, 2, 3, 4, 5],
                            "description": (
                                f"Score 1-5: the {_pro}'s integrated and naturalistic delivery — "
                                "all PRISM skills applied fluidly and consistently across the conversation. (SDT: integrated autonomy)"
                            )
                        },
                        "judge_reasoning": {
                            "type": "object",
                            "description": "Separate justification for each PRISM dimension. Every field is required. Do not combine justifications.",
                            "properties": {
                                "prepare_justification":     {"type": "string", "description": _J},
                                "recognise_justification":   {"type": "string", "description": _J},
                                "interact_justification":    {"type": "string", "description": _J},
                                "self_assess_justification": {"type": "string", "description": _J},
                                "master_justification":      {"type": "string", "description": _J},
                                "overall_assessment": {
                                    "type": "string",
                                    "description": (
                                        "Brief coach summary using 'you'. "
                                        "Do not repeat individual justifications. "
                                        "Highlight the key pattern across the conversation."
                                    )
                                }
                            },
                            "required": [
                                "prepare_justification", "recognise_justification",
                                "interact_justification", "self_assess_justification",
                                "master_justification", "overall_assessment"
                            ]
                        },
                        "feedback": {
                            "type": "object",
                            "properties": {
                                "strengths": {
                                    "type": "array",
                                    "description": "1-2 specific strengths with transcript evidence.",
                                    "items": {"type": "string"}
                                },
                                "improvement_suggestions": {
                                    "type": "array",
                                    "description": "1-2 actionable improvement suggestions with evidence-based rationale.",
                                    "items": {"type": "string"}
                                },
                                "forward_target": {
                                    "type": "string",
                                    "description": "The single PRISM dimension or skill to focus on next."
                                }
                            },
                            "required": ["strengths", "improvement_suggestions", "forward_target"]
                        }
                    },
                    "required": [
                        "prepare", "recognise", "interact", "self_assess", "master",
                        "judge_reasoning", "feedback"
                    ]
                }
            }
        }
    }


def _load_tool_spec_from_db(tool_name: str) -> dict | None:
    """
    Try to load the latest tool spec configuration for *tool_name* from the
    ``evaluation_tool_configs`` database table.

    Returns the stored ``config_json`` dict on success, or ``None`` if no row
    exists or if the DB is unavailable.  Callers should fall back to the
    hard-coded defaults when ``None`` is returned.
    """
    try:
        # Late import to avoid circular dependency and to allow the module to be
        # imported in environments where the DB connection is not yet available.
        from .db_connection_manager import get_db_cursor

        with get_db_cursor() as cursor:
            cursor.execute(
                """
                SELECT config_json
                FROM evaluation_tool_configs
                WHERE tool_name = %s
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (tool_name,),
            )
            row = cursor.fetchone()

        if row and row[0]:
            _logger.info(f"✅ Loaded {tool_name} tool spec from DB")
            return row[0]

        _logger.info(f"ℹ️ No DB config found for {tool_name}, using built-in default")
        return None

    except Exception as exc:
        _logger.warning(f"⚠️ Could not load {tool_name} tool spec from DB ({exc}); using built-in default")
        return None


def get_care_tool_spec_effective() -> dict:
    """
    Return the effective CARE tool spec.  If an admin has stored a custom
    configuration in the database it takes precedence; otherwise the built-in
    default from :func:`get_care_tool_spec` is used.
    """
    db_spec = _load_tool_spec_from_db("CARE")
    if db_spec:
        return db_spec
    return get_care_tool_spec()


def get_prism_tool_spec_effective() -> dict:
    """
    Return the effective PRISM tool spec.  If an admin has stored a custom
    configuration in the database it takes precedence; otherwise the built-in
    default from :func:`get_prism_tool_spec` is used.
    """
    db_spec = _load_tool_spec_from_db("PRISM")
    if db_spec:
        return db_spec
    return get_prism_tool_spec()
