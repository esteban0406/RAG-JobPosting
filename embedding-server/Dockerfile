FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# torch compiles some Triton kernels at run time (Qwen3-Reranker needs them).
RUN apt-get update \
 && apt-get install -y --no-install-recommends gcc libc6-dev \
 && rm -rf /var/lib/apt/lists/*

COPY . .

ENV HF_HOME=/root/.cache/huggingface
ARG EMBEDDING_MODEL=intfloat/multilingual-e5-base
ARG RERANKER_MODEL=Qwen/Qwen3-Reranker-0.6B
ENV EMBEDDING_MODEL=${EMBEDDING_MODEL} RERANKER_MODEL=${RERANKER_MODEL}
RUN python -c "import os; from sentence_transformers import SentenceTransformer, CrossEncoder; SentenceTransformer(os.environ['EMBEDDING_MODEL']); os.environ['RERANKER_MODEL'] and CrossEncoder(os.environ['RERANKER_MODEL'])"

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
