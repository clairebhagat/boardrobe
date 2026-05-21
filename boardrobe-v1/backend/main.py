from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from services.matching import MatchRequest, MatchResponse, rank_products

app = FastAPI(title="Boardrobe API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)   


@app.get("/health")
def health():
    return {"ok": True, "service": "boardrobe-api"}


@app.post("/match", response_model=MatchResponse)
def match(request: MatchRequest):
    matches = rank_products(request.inspoImages, request.products)
    return MatchResponse(matches=matches)
