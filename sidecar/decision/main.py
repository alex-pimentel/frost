#!/usr/bin/env python3
"""
Local decision-model sidecar.

Serves typed decisions (choice / yes-no with probabilities) over loopback so the
Electron app can consult a statistical classifier without bundling Python in the
installer. The app treats every answer as an optional signal: timeouts and errors
degrade to the rule engine.

Run:
    python3 sidecar/decision/main.py --port 8765 --mock      # plumbing, no model
    python3 sidecar/decision/main.py --port 8765             # real Laya checkpoints

Contract
    POST /decide  {"state": str, "questions": [{id, kind, prompt, options?}]}
              ->  {"answers": {id: {value, confidence, distribution?}}}
    GET  /health  ->  {"ok": bool, "backend": str, "degraded": bool}

Install the model first (Apache 2.0, ~800 MB per checkpoint):
    pip install laya

IMPORTANT: the Laya Python API below is written against its documented primitives
(choice / score / noul). Verify the exact import path and call signature after
installing, then adjust `LayaAdapter.answer` only — the HTTP contract stays put.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MAX_STATE_CHARS = 1200


class MockAdapter:
    """Deterministic stand-in used to exercise the plumbing without the model."""

    backend = "mock"

    def answer(self, state: str, questions: list[dict]) -> dict:
        now = state.split("agora:")[-1].strip() if "agora:" in state else state.strip()
        lowered = now.lower()

        is_question = bool(
            now.endswith("?")
            or re.match(
                r"^(o que|que |qual|quais|quando|onde|quem|como|por que|porque|quanto|"
                r"quantos|quantas|me (diga|diz|explica|conte)|what|how|why|when|where|who)\b",
                lowered,
            )
        )

        if re.search(r"\b(implemente|corrija|refatore|rode|crie|instale|abre um pr|lista os arquivos)\b", lowered):
            intent = "code"
        elif re.search(r"\b(minhas? notas?|anotei|reuni[aã]o|lembra|hist[oó]rico|prazo|experi[eê]ncia)\b", lowered):
            intent = "knowledge"
        elif re.match(r"^(oi|ol[aá]|bom dia|boa tarde|boa noite|obrigad|valeu|quem [eé] voc)", lowered):
            intent = "smalltalk"
        elif len(lowered.split()) <= 3 and not is_question:
            intent = "clarify"
        else:
            intent = "generate"

        previous = state.split("anterior:")[-1].split("agora:")[0].strip() if "anterior:" in state else ""
        topic_shift = bool(
            previous
            and re.search(r"\b(mudando de assunto|outro assunto|agora (me )?(ajuda|fala|vamos)|voltando)\b", lowered)
        )

        answers: dict[str, dict] = {}
        for question in questions:
            kind = question.get("kind")
            qid = question.get("id")
            if qid == "is_question":
                answers[qid] = {"value": is_question, "confidence": 0.85}
            elif qid == "intent":
                options = question.get("options") or ["generate"]
                main = 0.8 if intent in options else 0.4
                rest = (1.0 - main) / max(1, len(options) - 1)
                distribution = {opt: (main if opt == intent else rest) for opt in options}
                answers[qid] = {
                    "value": intent if intent in options else options[0],
                    "confidence": main,
                    "distribution": distribution,
                }
            elif qid == "topic_shift":
                answers[qid] = {"value": topic_shift, "confidence": 0.7}
            elif kind == "score":
                answers[qid] = {"value": 0, "confidence": 0.5}
        return {"answers": answers}


class LayaAdapter:
    """Thin wrapper around Laya's typed-decision primitives."""

    backend = "laya"
    degraded = False

    def __init__(self, checkpoint: str = "laya-multilingual") -> None:
        try:
            import laya  # noqa: F401
            from laya import Decision  # type: ignore
        except Exception as exc:  # pragma: no cover - depends on the installed package
            raise RuntimeError(f"laya not available: {exc}") from exc

        self._decision = Decision
        # Force the multilingual checkpoint: the router selects by Unicode script and
        # Portuguese is Latin, which would otherwise land on the English checkpoint.
        self._model = Decision(checkpoint=checkpoint)

    def answer(self, state: str, questions: list[dict]) -> dict:
        answers: dict[str, dict] = {}
        for question in questions:
            qid = question.get("id")
            kind = question.get("kind")
            prompt = question.get("prompt", "")
            try:
                if kind == "noul":
                    result = self._model.noul(state=state, question=prompt)
                    answers[qid] = {
                        "value": bool(result.answer),
                        "confidence": float(getattr(result, "confidence", 0.0)),
                    }
                elif kind == "choice":
                    result = self._model.choice(
                        state=state, question=prompt, options=question.get("options") or []
                    )
                    answers[qid] = {
                        "value": result.answer,
                        "confidence": float(getattr(result, "confidence", 0.0)),
                        "distribution": getattr(result, "distribution", None),
                    }
                elif kind == "score":
                    result = self._model.score(
                        state=state, question=prompt, max_score=question.get("maxScore", 3)
                    )
                    answers[qid] = {
                        "value": float(result.answer),
                        "confidence": float(getattr(result, "confidence", 0.0)),
                    }
            except Exception as exc:  # keep partial answers
                self.degraded = True
                print(f"[decision-sidecar] {qid} failed: {exc}", file=sys.stderr)
        return {"answers": answers}


class Handler(BaseHTTPRequestHandler):
    adapter = None
    started_at = time.time()

    def log_message(self, fmt: str, *args) -> None:  # quiet by default
        return

    def _json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/health":
            self._json(
                200,
                {
                    "ok": True,
                    "backend": getattr(self.adapter, "backend", "unknown"),
                    "degraded": bool(getattr(self.adapter, "degraded", False)),
                    "uptimeSeconds": round(time.time() - self.started_at, 1),
                },
            )
            return
        self._json(404, {"error": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/decide":
            self._json(404, {"error": "not found"})
            return

        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > 1_000_000:
            self._json(400, {"error": "invalid body length"})
            return

        try:
            payload = json.loads(self.rfile.read(length))
        except json.JSONDecodeError as exc:
            self._json(400, {"error": f"invalid json: {exc}"})
            return

        state = str(payload.get("state", ""))[:MAX_STATE_CHARS]
        questions = payload.get("questions") or []
        if not state or not questions:
            self._json(400, {"error": "state and questions are required"})
            return

        started = time.perf_counter()
        try:
            result = self.adapter.answer(state, questions)
        except Exception as exc:
            self._json(500, {"error": str(exc)})
            return
        result["latencyMs"] = round((time.perf_counter() - started) * 1000, 1)
        self._json(200, result)


def main() -> None:
    parser = argparse.ArgumentParser(description="Frost decision-model sidecar")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--mock", action="store_true", help="use the deterministic mock")
    parser.add_argument("--checkpoint", default="laya-multilingual")
    args = parser.parse_args()

    if args.mock:
        Handler.adapter = MockAdapter()
    else:
        try:
            Handler.adapter = LayaAdapter(checkpoint=args.checkpoint)
        except Exception as exc:
            print(f"[decision-sidecar] falling back to mock: {exc}", file=sys.stderr)
            Handler.adapter = MockAdapter()

    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"[decision-sidecar] listening on http://{args.host}:{args.port} backend={Handler.adapter.backend}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
