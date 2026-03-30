from fastapi import FastAPI
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
from typing import Literal

app = FastAPI()

print("Loading model...")
model = SentenceTransformer("intfloat/e5-base-v2")
print("Model loaded!")

class EmbedRequest(BaseModel):
    texts: list[str]
    type: Literal["query", "passage"] = "passage"

@app.post("/embed")
def embed(req: EmbedRequest):
    prefix = "query: " if req.type == "query" else "passage: "
    texts = [f"{prefix}{t}" for t in req.texts]
    embeddings = model.encode(texts, batch_size=16).tolist()
    return {"embeddings": embeddings}
