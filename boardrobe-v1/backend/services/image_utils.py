from __future__ import annotations

import base64
from io import BytesIO
from typing import Iterable

import numpy as np
from PIL import Image


def decode_data_url(data_url: str) -> Image.Image:
    """
    Converts a browser data URL into a PIL image.

    Example input:
    data:image/png;base64,iVBORw0KGgoAAAANS...
    """
    if "," not in data_url:
        raise ValueError("Invalid image data URL.")

    _, encoded = data_url.split(",", 1)
    raw = base64.b64decode(encoded)
    image = Image.open(BytesIO(raw)).convert("RGB")

    return image


def dominant_color_vector(image: Image.Image, size: int = 64) -> list[float]:
    """
    Simple visual fingerprint for v1.

    """
    image = image.resize((size, size))
    arr = np.asarray(image).astype("float32") / 255.0

    mean_rgb = arr.mean(axis=(0, 1))
    std_rgb = arr.std(axis=(0, 1))

    hist_features = []
    for channel_index in range(3):
        hist, _ = np.histogram(arr[:, :, channel_index], bins=8, range=(0, 1), density=True)
        hist_features.extend(hist.tolist())

    vector = np.concatenate([mean_rgb, std_rgb, np.array(hist_features, dtype="float32")])
    return vector.tolist()


def average_vectors(vectors: Iterable[list[float]]) -> list[float]:
    vectors = list(vectors)

    if not vectors:
        return []

    arr = np.array(vectors, dtype="float32")
    return arr.mean(axis=0).tolist()


def cosine_similarity(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0

    a_arr = np.array(a, dtype="float32")
    b_arr = np.array(b, dtype="float32")

    denominator = float(np.linalg.norm(a_arr) * np.linalg.norm(b_arr))
    if denominator == 0:
        return 0.0

    return float(np.dot(a_arr, b_arr) / denominator)
