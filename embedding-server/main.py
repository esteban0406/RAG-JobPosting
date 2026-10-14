import os
from typing import Literal

import torch
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from sentence_transformers import CrossEncoder, SentenceTransformer

EMBEDDING_MODEL = os.environ.get("EMBEDDING_MODEL", "intfloat/multilingual-e5-base")
# Empty disables the /rerank endpoint (e.g. for the e5-base-v2 ablation server).
RERANKER_MODEL = os.environ.get("RERANKER_MODEL", "BAAI/bge-reranker-v2-m3")
RERANKER_MAX_LENGTH = int(os.environ.get("RERANKER_MAX_LENGTH", "512"))
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

app = FastAPI()

print(f"Loading {EMBEDDING_MODEL} on {DEVICE}...")
# fp32 on every device, so vectors do not depend on whether a GPU was used.
model = SentenceTransformer(EMBEDDING_MODEL, device=DEVICE)

reranker = None
if RERANKER_MODEL:
    print(f"Loading {RERANKER_MODEL} on {DEVICE}...")
    reranker = CrossEncoder(
        RERANKER_MODEL,
        device=DEVICE,
        max_length=RERANKER_MAX_LENGTH,
        model_kwargs={"dtype": torch.float16} if DEVICE == "cuda" else None,
    )
print("Models loaded!")


class EmbedRequest(BaseModel):
    texts: list[str]
    type: Literal["query", "passage"] = "passage"


class RerankRequest(BaseModel):
    query: str
    documents: list[str]


@app.get("/health")
def health():
    return {"embeddingModel": EMBEDDING_MODEL, "rerankerModel": RERANKER_MODEL or None, "device": DEVICE}


@app.post("/embed")
def embed(req: EmbedRequest):
    prefix = "query: " if req.type == "query" else "passage: "
    texts = [f"{prefix}{t}" for t in req.texts]
    embeddings = model.encode(texts, batch_size=16).tolist()
    return {"embeddings": embeddings, "model": EMBEDDING_MODEL}


@app.post("/rerank")
def rerank(req: RerankRequest):
    if reranker is None:
        raise HTTPException(status_code=404, detail="Reranker disabled")
    if not req.documents:
        return {"scores": [], "model": RERANKER_MODEL}
    # Sigmoid maps the relevance logit to [0, 1], so a threshold can be calibrated.
    scores = reranker.predict(
        [(req.query, doc) for doc in req.documents],
        batch_size=16,
        activation_fn=torch.nn.Sigmoid(),
    )
    return {"scores": [float(s) for s in scores], "model": RERANKER_MODEL}
