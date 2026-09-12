import os, json, base64, re
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

ROOT = Path(__file__).resolve().parent.parent
FRONTEND = ROOT / "frontend"

app = FastAPI(title="Refrigerator Sealed-System Tech", version="2.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

class ResearchRequest(BaseModel):
    model: str = Field(..., min_length=2, max_length=100)
    repair: str = Field(..., min_length=2, max_length=150)
    notes: str = Field(default="", max_length=5000)
    tech_mode: bool = True

class RatingPlate(BaseModel):
    model: str = ""
    serial: str = ""
    refrigerant: str = ""
    charge_g: Optional[float] = None
    voltage: str = ""
    amps: str = ""
    frequency: str = ""
    manufacturer: str = ""
    raw_text: str = ""

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY")) if os.getenv("OPENAI_API_KEY") else None
MODEL = os.getenv("OPENAI_MODEL", "gpt-5.5")

SYSTEM_PROMPT = r"""
You are Refrigerator Sealed-System Tech, a research assistant for appliance technicians.
Your job is to research an EXACT refrigerator model and build a field procedure using verified evidence.

NON-NEGOTIABLE RULES:
1. Never invent a model-specific refrigerant, factory charge, compressor part number, drier part number, pressure, or procedure.
2. Prefer manufacturer technical manuals, service manuals, parts lists, bulletins and official documentation.
3. Use reputable parts/service sources only as secondary corroboration.
4. If sources conflict, explicitly report the conflict and mark the affected fact RED.
5. A factory charge is GREEN only when exact-model evidence is strong and unconflicted. Otherwise YELLOW or RED.
6. R600a/R290 systems are flammable. Include ignition-control, ventilation, proper tooling and exact-weight charging warnings where applicable.
7. Separate VERIFIED FACTS from TECHNICIAN INFERENCE.
8. For charging, say DO NOT CHARGE until the exact factory charge is verified.
9. Give practical step-by-step instructions, but do not pretend a generic procedure is manufacturer-specific.
10. Cite sources with title and URL when available from web research.

Return JSON only with this shape:
{
  "model":"",
  "manufacturer":"",
  "confidence":"GREEN|YELLOW|RED",
  "confidence_reason":"",
  "verified": {"refrigerant":"","charge_g":null,"compressor":"","filter_drier":"","service_port":""},
  "facts": [{"label":"","value":"","confidence":"GREEN|YELLOW|RED","evidence":""}],
  "conflicts": [{"fact":"","values":[],"explanation":""}],
  "procedure": [{"step":1,"title":"","instructions":"","warning":""}],
  "evacuation":[""],
  "charging":[""],
  "startup_checks":[""],
  "diagnostics":[""],
  "safety":[""],
  "sources":[{"title":"","url":"","type":"manufacturer|parts|service|other"}]
}
"""


def response_text(resp):
    text = getattr(resp, "output_text", None)
    if text:
        return text
    # Fallback for SDK response variants.
    try:
        return json.dumps(resp.model_dump())
    except Exception:
        return str(resp)


def parse_json(text: str):
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?", "", text).strip()
        text = re.sub(r"```$", "", text).strip()
    try:
        return json.loads(text)
    except Exception:
        start, end = text.find("{"), text.rfind("}")
        if start >= 0 and end > start:
            return json.loads(text[start:end+1])
        raise


def safe_url(url: str) -> str:
    if not url:
        return ""
    return url if url.startswith(("http://", "https://")) else ""


def offline_result(model: str, repair: str, notes: str):
    return {
        "model": model.upper().strip(), "manufacturer": "", "confidence": "RED",
        "confidence_reason": "Live research is not configured. No model-specific charge or sealed-system specification is being guessed.",
        "verified": {"refrigerant":"", "charge_g":None, "compressor":"", "filter_drier":"", "service_port":""},
        "facts": [], "conflicts": [],
        "procedure": [
            {"step":1,"title":"Identify the exact unit","instructions":"Confirm the complete model number and read the rating plate before opening the sealed system.","warning":"Do not substitute data from a similar model."},
            {"step":2,"title":"Verify specifications","instructions":"Confirm refrigerant, factory charge, compressor and drier from manufacturer documentation before charging.","warning":"DO NOT CHARGE YET."},
        ],
        "evacuation": ["Use a micron gauge and appropriate evacuation setup.", "Do not rely on manifold gauge pressure alone.", "Perform a vacuum decay/hold check before charging."],
        "charging": ["Charge by exact factory weight once verified.", "For flammable refrigerants, control ignition sources and use appropriate equipment."],
        "startup_checks": ["Verify compressor operation, condenser heat rejection, evaporator frost pattern and temperatures."],
        "diagnostics": ["Confirm symptoms and electrical operation before condemning the compressor."],
        "safety": ["Follow the appliance manufacturer's sealed-system procedure.", "Use proper PPE and ventilation.", "R600a/R290 systems require special flammability precautions."],
        "sources": []
    }


def research_model(model: str, repair: str, notes: str):
    model = model.strip().upper()
    if not client:
        return offline_result(model, repair, notes)

    prompt = f"""
Research this exact refrigerator model: {model}
Repair requested: {repair}
Technician notes: {notes or 'None'}

Search broadly enough to resolve the exact unit, but prioritize manufacturer documentation. Look for:
- exact model service/technical manual
- exact model parts list
- compressor part number
- filter-drier part number
- refrigerant type
- factory charge in grams
- service/process tube or port information
- manufacturer sealed-system replacement/evacuation instructions
- relevant service bulletins
- credible service records only as corroboration

Resolve conflicts rather than averaging them. If the exact charge is not verified, leave charge_g null and mark it RED or YELLOW.
"""
    try:
        resp = client.responses.create(
            model=MODEL,
            instructions=SYSTEM_PROMPT,
            input=prompt,
            tools=[{"type": "web_search"}],
            include=["web_search_call.action.sources"],
        )
        data = parse_json(response_text(resp))
        data["model"] = model
        data.setdefault("sources", [])
        for s in data["sources"]:
            if isinstance(s, dict):
                s["url"] = safe_url(s.get("url", ""))
        return data
    except Exception as exc:
        fallback = offline_result(model, repair, notes)
        fallback["confidence_reason"] = f"Research request failed: {type(exc).__name__}. No model-specific data was guessed."
        return fallback


@app.get("/api/health")
def health():
    return {"status":"online", "app":"Refrigerator Sealed-System Tech", "version":"2.0.0", "live_research": bool(client)}

@app.post("/api/research")
def research(request: ResearchRequest):
    return research_model(request.model, request.repair, request.notes)

@app.post("/api/analyze-rating-plate")
async def analyze_rating_plate(file: UploadFile = File(...)):
    if not client:
        raise HTTPException(503, "OPENAI_API_KEY is not configured.")
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(400, "Please upload a photo of the refrigerator rating plate.")
    raw = await file.read()
    if len(raw) > 8 * 1024 * 1024:
        raise HTTPException(413, "Image is too large. Use a photo under 8 MB.")
    mime = file.content_type
    b64 = base64.b64encode(raw).decode("utf-8")
    prompt = """
Read this refrigerator rating-plate photo. Return JSON only:
{"model":"","serial":"","refrigerant":"","charge_g":null,"voltage":"","amps":"","frequency":"","manufacturer":"","raw_text":""}
Only transcribe information that is visible. Do not infer missing values. If a value is not readable, leave it blank/null.
"""
    try:
        resp = client.responses.create(
            model=MODEL,
            input=[{"role":"user", "content":[
                {"type":"input_text", "text":prompt},
                {"type":"input_image", "image_url":f"data:{mime};base64,{b64}"}
            ]}]
        )
        return parse_json(response_text(resp))
    except Exception as exc:
        raise HTTPException(500, f"Rating plate analysis failed: {type(exc).__name__}")

if FRONTEND.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND), html=True), name="frontend")
