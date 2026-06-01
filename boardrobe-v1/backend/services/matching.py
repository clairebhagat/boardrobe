from __future__ import annotations

import logging
import time
from io import BytesIO
from threading import Lock

import numpy as np
import requests
from pydantic import BaseModel, Field
from PIL import Image
import torch
from transformers import CLIPModel, CLIPProcessor

from services.image_utils import decode_data_url


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


logger = logging.getLogger(__name__)

CLIP_MODEL_NAME = "openai/clip-vit-base-patch32"
IMAGE_DOWNLOAD_TIMEOUT = (5, 15)
MIN_IMAGE_DIMENSION = 32
SKIP_IMAGE_URL_PATTERNS = (
    "bg-grey-solid-color",
    "placeholder",
    "spacer",
    "transparent",
    "sprite",
)
PRODUCT_IMAGE_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; Boardrobe/0.1; +https://boardrobe.local)"
}


class ClipImageEmbedder:
    def __init__(self) -> None:
        self._model: CLIPModel | None = None
        self._processor: CLIPProcessor | None = None
        self._model_lock = Lock()
        self._cache_lock = Lock()
        self._embedding_cache: dict[str, np.ndarray] = {}
        self._failed_urls: set[str] = set()

    def _ensure_model(self) -> tuple[CLIPModel, CLIPProcessor]:
        if self._model is not None and self._processor is not None:
            return self._model, self._processor

        with self._model_lock:
            if self._model is None or self._processor is None:
                logger.info("Loading CLIP model: %s", CLIP_MODEL_NAME)
                self._model = CLIPModel.from_pretrained(CLIP_MODEL_NAME)
                self._processor = CLIPProcessor.from_pretrained(CLIP_MODEL_NAME)
                self._model.eval()

        return self._model, self._processor

    def embed_pil_image(self, image: Image.Image) -> np.ndarray:
        model, processor = self._ensure_model()
        prepared = processor(images=image.convert("RGB"), return_tensors="pt")

        with torch.no_grad():
            outputs = model.get_image_features(**prepared)

        embedding = outputs.detach().cpu().numpy()[0].astype("float32")
        norm = np.linalg.norm(embedding)
        if norm == 0:
            raise ValueError("CLIP returned a zero-norm embedding.")

        return embedding / norm

    def embed_data_url(self, data_url: str) -> np.ndarray:
        image = decode_data_url(data_url)
        return self.embed_pil_image(image)

    def embed_product_image_url(self, image_url: str) -> np.ndarray:
        if any(pattern in image_url.lower() for pattern in SKIP_IMAGE_URL_PATTERNS):
            raise ValueError("Skipped placeholder product image URL.")

        with self._cache_lock:
            cached = self._embedding_cache.get(image_url)
            failed = image_url in self._failed_urls

        if cached is not None:
            return cached
        if failed:
            raise ValueError("Previously failed product image URL.")

        try:
            response = requests.get(
                image_url,
                headers=PRODUCT_IMAGE_HEADERS,
                timeout=IMAGE_DOWNLOAD_TIMEOUT,
            )
            response.raise_for_status()

            image = Image.open(BytesIO(response.content)).convert("RGB")
        except Exception:
            with self._cache_lock:
                self._failed_urls.add(image_url)
            raise

        if image.width < MIN_IMAGE_DIMENSION or image.height < MIN_IMAGE_DIMENSION:
            with self._cache_lock:
                self._failed_urls.add(image_url)
            raise ValueError(
                f"Product image too small for CLIP embedding: {image.width}x{image.height}"
            )

        embedding = self.embed_pil_image(image)

        with self._cache_lock:
            self._embedding_cache[image_url] = embedding

        return embedding


clip_embedder = ClipImageEmbedder()


def average_embeddings(embeddings: list[np.ndarray]) -> np.ndarray:
    if not embeddings:
        raise ValueError("At least one embedding is required.")

    stacked = np.stack(embeddings).astype("float32")
    averaged = stacked.mean(axis=0)
    norm = np.linalg.norm(averaged)
    if norm == 0:
        raise ValueError("Average embedding has zero norm.")

    return averaged / norm


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    denominator = float(np.linalg.norm(a) * np.linalg.norm(b))
    if denominator == 0:
        return 0.0

    return float(np.dot(a, b) / denominator)


def rank_products(inspo_images: list[str], products: list[Product]) -> list[ProductMatch]:
    started_at = time.perf_counter()
    inspo_embeddings: list[np.ndarray] = []
    product_images_attempted = 0
    product_images_embedded = 0

    for data_url in inspo_images:
        try:
            inspo_embeddings.append(clip_embedder.embed_data_url(data_url))
        except Exception as exc:
            logger.warning("Failed to embed inspo image: %s", exc)
            continue

    if not inspo_embeddings:
        raise ValueError("Could not embed any uploaded inspo images.")

    board_embedding = average_embeddings(inspo_embeddings)

    matches = []

    for product in products:
        score = 0.0
        reasons = ["Product image could not be embedded"]

        if product.imageUrl:
            product_images_attempted += 1

            try:
                product_embedding = clip_embedder.embed_product_image_url(product.imageUrl)
                similarity = cosine_similarity(board_embedding, product_embedding)
                score = round((similarity + 1) / 2, 4)
                product_images_embedded += 1
                reasons = ["Matched using CLIP cosine similarity against your inspo board"]
                if product.price:
                    reasons.append("Price detected on page")
            except Exception as exc:
                logger.warning("Failed to embed product image %s: %s", product.imageUrl, exc)
        else:
            reasons = ["No product image URL found on page"]

        matches.append(
            ProductMatch(
                **product.model_dump(),
                score=score,
                reasons=reasons[:3],
            )
        )

    matches.sort(key=lambda item: item.score, reverse=True)

    total_time = time.perf_counter() - started_at
    logger.info(
        "Boardrobe CLIP matching complete: inspo_embedded=%s product_attempted=%s product_embedded=%s total_time_seconds=%.2f",
        len(inspo_embeddings),
        product_images_attempted,
        product_images_embedded,
        total_time,
    )
    return matches
