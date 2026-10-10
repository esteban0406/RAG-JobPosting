# Build and run from the repository root:
#   docker build -t jobai-ragas evaluation/ragas
#   docker run --rm --network host --user "$(id -u):$(id -g)" -v "$PWD":/work -w /work \
#     jobai-ragas python evaluation/ragas/ragas_eval.py <generate run dir>
FROM python:3.12.13-slim
COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt && pip freeze > /requirements.lock
ENV HOME=/tmp
WORKDIR /work
