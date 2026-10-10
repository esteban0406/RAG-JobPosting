# Pinned analysis environment. Build and run from the repository root:
#   docker build -t jobai-analysis evaluation
#   docker run --rm -v "$PWD":/work -w /work jobai-analysis \
#     python evaluation/analysis/metrics.py <run dir> --qrels <qrels file>
FROM python:3.14.4-slim
COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt
WORKDIR /work
