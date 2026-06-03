from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from services.matching import MatchRequest, MatchResponse, rank_products
from services.pinterest import (
    build_pinterest_authorize_url,
    exchange_code_for_tokens,
    get_user_profile,
    list_board_pins,
    list_boards,
)


class PinterestAuthStartRequest(BaseModel):
    redirectUri: str


class PinterestAuthExchangeRequest(BaseModel):
    code: str
    redirectUri: str


class PinterestAccessTokenRequest(BaseModel):
    accessToken: str

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


@app.post("/auth/pinterest/start")
def pinterest_auth_start(request: PinterestAuthStartRequest):
    return build_pinterest_authorize_url(request.redirectUri)


@app.post("/auth/pinterest/exchange")
def pinterest_auth_exchange(request: PinterestAuthExchangeRequest):
    tokens = exchange_code_for_tokens(request.code, request.redirectUri)
    profile = get_user_profile(tokens["access_token"])
    return {"tokens": tokens, "profile": profile}


@app.post("/pinterest/boards")
def pinterest_boards(request: PinterestAccessTokenRequest):
    profile = get_user_profile(request.accessToken)
    boards = list_boards(request.accessToken)
    return {"profile": profile, "boards": boards}


@app.post("/pinterest/boards/{board_id}/pins")
def pinterest_board_pins(board_id: str, request: PinterestAccessTokenRequest):
    pins = list_board_pins(request.accessToken, board_id)
    return {"pins": pins}
