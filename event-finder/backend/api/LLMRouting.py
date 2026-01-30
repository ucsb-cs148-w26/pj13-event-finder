# llm_router.py
import os
import json
from openai import OpenAI

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# ----------------------------
# Tool definitions
# ----------------------------

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "search_ticketmaster",
            "description": (
                "Use for official ticketed events such as concerts, "
                "sports games, festivals, and large venues."
            ),
            "strict": True,
            "parameters": {
                "type": "object",
                "properties": {
                    "location": {"type": "string"},
                    "start_date": {"type": ["string", "null"]},
                    "end_date": {"type": ["string", "null"]},
                    "category": {"type": ["string", "null"]},
                },
                "required": ["location", "start_date", "end_date", "category"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_reddit",
            "description": (
                "Use for local community events, meetups, informal happenings, "
                "and 'things to do this weekend' queries."
            ),
            "strict": True,
            "parameters": {
                "type": "object",
                "properties": {
                    "location": {"type": "string"},
                    "query": {"type": ["string", "null"]},
                },
                "required": ["location", "query"],
                "additionalProperties": False,
            },
        },
    },
]

# ----------------------------
# Router prompt
# ----------------------------

ROUTER_PROMPT = """
You are an event-routing assistant for a web app.

Rules:
- Community, local, informal, or meetup-style events → search_reddit
- Concerts, sports, ticketed, or major venue events → search_ticketmaster
- If the request is broad or ambiguous → call both
- Do NOT invent events
- Prefer precision over coverage
"""

# ----------------------------
# Public function your API calls
# ----------------------------

def route_event_query(
    *,
    query: str | None,
    location: str,
    start_date: str | None,
    end_date: str | None,
    category: str | None,
):
    """
    Returns a list of tool calls the backend should execute.
    """

    user_input = f"""
Query: {query}
Location: {location}
Start date: {start_date}
End date: {end_date}
Category: {category}
"""

    response = client.responses.create(
        model="gpt-5-mini",
        input=[
            {"role": "developer", "content": ROUTER_PROMPT},
            {"role": "user", "content": user_input},
        ],
        tools=TOOLS,
    )

    # Extract tool calls
    tool_calls = []
    for item in response.output:
        if item.type == "function_call":
            tool_calls.append({
                "name": item.name,
                "arguments": json.loads(item.arguments),
                "call_id": item.call_id,
            })

    return tool_calls
