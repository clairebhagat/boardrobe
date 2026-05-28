from __future__ import annotations

from pydantic import BaseModel, Field

from services.image_utils import (
    average_vectors,
    cosine_similarity,
    decode_data_url,
    dominant_color_vector,
)


class Product(BaseModel):
    name: str = ""
    price: str = ""
    imageUrl: str = ""
    productImageDataUrl: str = ""
    productUrl: str = ""
    pageUrl: str = ""
    sourceHost: str = ""


class MatchRequest(BaseModel):
    inspoImages: list[str] = Field(default_factory=list)
    products: list[Product] = Field(default_factory=list)


class ProductMatch(Product):
    score: float
    reasons: list[str]


class MatchResponse(BaseModel):
    matches: list[ProductMatch]


STYLE_KEYWORDS = {
    "minimal": ["minimal", "basic", "clean", "simple", "plain", "essential"],
    "oversized": ["oversized", "relaxed", "loose", "boxy", "wide"],
    "tailored": ["tailored", "blazer", "pleated", "trouser", "structured"],
    "casual": ["tee", "t-shirt", "hoodie", "sweatshirt", "jogger", "denim"],
    "dressy": ["dress", "satin", "silk", "heel", "skirt"],
    "cozy": ["knit", "sweater", "cardigan", "fleece", "wool"],
    "summer": ["linen", "shorts", "tank", "sandal", "cotton"],
    "neutral": ["beige", "cream", "white", "black", "brown", "taupe", "grey", "gray"],
}


def text_score(product_name: str) -> tuple[float, list[str]]:
    """
    V1 placeholder text scorer.

    Will replace this with text embeddings and extracted inspo keywords.
    Rewards product names that often match Pinterest fashion boards.
    """
    lower = product_name.lower()
    hits = []

    for style, keywords in STYLE_KEYWORDS.items():
        if any(keyword in lower for keyword in keywords):
            hits.append(style)

    if not hits:
        return 0.35, ["General visual match"]

    score = min(0.35 + len(hits) * 0.08, 0.75)
    reasons = [f"Matches {style} style cues" for style in hits[:3]]

    return score, reasons


def estimate_product_visual_score(product: Product, board_color_vector: list[float]) -> tuple[float, str]:
    """
    Prefer comparing against actual product image bytes captured by the extension.

    Falls back to a lightweight heuristic when a product image could not be captured.
    """
    if product.productImageDataUrl and board_color_vector:
        try:
            image = decode_data_url(product.productImageDataUrl)
            product_vector = dominant_color_vector(image)
            similarity = cosine_similarity(board_color_vector, product_vector)
            score = clamp((similarity + 1) / 2)
            return score, "Compared product image against your inspo palette"
        except Exception:
            pass

    if not product.imageUrl:
        return 0.25, "No usable product image found"

    name = product.name.lower()
    color_bonus = 0.0

    neutral_terms = ["beige", "cream", "white", "black", "brown", "gray", "grey", "taupe"]
    if any(term in name for term in neutral_terms):
        color_bonus += 0.12

    return min(0.50 + color_bonus, 0.70), "Used product title as a visual fallback"


def clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(value, high))


def rank_products(inspo_images: list[str], products: list[Product]) -> list[ProductMatch]:
    inspo_vectors = []

    for data_url in inspo_images:
        try:
            image = decode_data_url(data_url)
            inspo_vectors.append(dominant_color_vector(image))
        except Exception:
            continue

    board_vector = average_vectors(inspo_vectors)

    matches = []

    for product in products:
        product_text_score, text_reasons = text_score(product.name)
        visual_score, visual_reason = estimate_product_visual_score(product, board_vector)

        final_score = clamp((visual_score * 0.55) + (product_text_score * 0.45))

        reasons = [visual_reason]

        reasons.extend(text_reasons)

        if product.price:
            reasons.append("Price detected on page")

        matches.append(
            ProductMatch(
                **product.model_dump(),
                score=round(final_score, 3),
                reasons=reasons[:4],
            )
        )

    matches.sort(key=lambda item: item.score, reverse=True)
    return matches
