import os

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
    _J = (
        "1-3 short sentences. Quote or paraphrase transcript evidence when available. "
        "If evidence is insufficient (for example, very short transcript), state that explicitly and use a low score. "
        "Do not merge with other criteria."
    )
    return {
        "toolSpec": {
            "name": "submit_empathy_evaluation",
            "description": (
                f"Evaluate the {_pro} using 10 CARE criteria, each scored 1-5 "
                "(1=Emerging, 2=Developing, 3=Competent, 4=Proficient, 5=Advanced). "
                "Populate every field. Do not omit, merge, or rename any field. "
                "If the transcript is too short or lacks evidence, still return a complete object: "
                "prefer low scores (typically 1-2), concise justifications that explicitly say evidence is limited, "
                "and practical next-step feedback."
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
                            "description": (
                                "Separate justification for each criterion. Every field is required. "
                                "Do not combine justifications. If evidence is limited, explicitly write that evidence is insufficient."
                            ),
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
                                        "Highlight the key pattern across the conversation. "
                                        "If transcript is minimal, state that there is not enough evidence yet and suggest what to do next."
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
                                    "description": (
                                        "1-2 specific strengths when evidence exists. "
                                        "If transcript is minimal, provide one realistic baseline strength (for example, initiated interaction)."
                                    ),
                                    "items": {"type": "string"}
                                },
                                "improvement_suggestions": {
                                    "type": "array",
                                    "description": (
                                        "1-2 actionable improvement suggestions. "
                                        "For limited evidence, provide concrete next-turn guidance without inventing details."
                                    ),
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
    _J = (
        "1-3 short sentences. Quote or paraphrase transcript evidence when available. "
        "If evidence is insufficient (for example, very short transcript), state that explicitly and use a low score. "
        "Do not merge with other dimensions."
    )
    return {
        "toolSpec": {
            "name": "submit_prism_evaluation",
            "description": (
                f"Evaluate the {_pro} using the PRISM framework (5 dimensions), each scored 1-5 "
                "(1=Emerging, 2=Developing, 3=Competent, 4=Proficient, 5=Advanced). "
                "Populate every field. Do not omit, merge, or rename any field. "
                "If the transcript is too short or lacks evidence, still return a complete object: "
                "prefer low scores (typically 1-2), concise justifications that explicitly say evidence is limited, "
                "and practical next-step feedback."
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
                            "description": (
                                "Separate justification for each PRISM dimension. Every field is required. "
                                "Do not combine justifications. If evidence is limited, explicitly write that evidence is insufficient."
                            ),
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
                                        "Highlight the key pattern across the conversation. "
                                        "If transcript is minimal, state that there is not enough evidence yet and suggest what to do next."
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
                                    "description": (
                                        "1-2 specific strengths when evidence exists. "
                                        "If transcript is minimal, provide one realistic baseline strength (for example, initiated interaction)."
                                    ),
                                    "items": {"type": "string"}
                                },
                                "improvement_suggestions": {
                                    "type": "array",
                                    "description": (
                                        "1-2 actionable improvement suggestions. "
                                        "For limited evidence, provide concrete next-turn guidance without inventing details."
                                    ),
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
