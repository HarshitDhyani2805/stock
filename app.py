"""Ledger Green Stock Portfolio Tracker.

Design reminder: this is a calm editorial finance tool. Keep calculations honest,
copy direct, and the visual system grounded in warm paper, forest ink, and fern green.
"""

from __future__ import annotations

import csv
import io
from datetime import datetime, timezone
from typing import Any

from flask import Flask, Response, jsonify, render_template, request

app = Flask(__name__)
app = Flask(__name__, template_folder=".", static_folder="static")

# Manually defined prices for this learning project.
STOCK_PRICES: dict[str, int] = {
    "AAPL": 180,
    "TSLA": 250,
    "MSFT": 420,
    "NVDA": 120,
    "AMZN": 185,
    "GOOGL": 175,
}


def calculate_portfolio(positions: list[dict[str, Any]]) -> dict[str, Any]:
    """Validate positions and calculate each holding plus the portfolio total."""
    calculated: list[dict[str, Any]] = []
    total = 0

    for index, position in enumerate(positions):
        ticker = str(position.get("ticker", "")).strip().upper()
        quantity_value = position.get("quantity")

        if ticker not in STOCK_PRICES:
            raise ValueError(
                f"Position {index + 1}: choose a supported stock symbol."
            )

        try:
            quantity = int(quantity_value)
        except (TypeError, ValueError) as exc:
            raise ValueError(
                f"Position {index + 1}: quantity must be a whole number."
            ) from exc

        if quantity <= 0:
            raise ValueError(f"Position {index + 1}: quantity must be greater than zero.")

        price = STOCK_PRICES[ticker]
        value = price * quantity
        total += value
        calculated.append(
            {
                "ticker": ticker,
                "quantity": quantity,
                "price": price,
                "value": value,
            }
        )

    return {"positions": calculated, "total": total, "position_count": len(calculated)}


def read_positions() -> list[dict[str, Any]]:
    payload = request.get_json(silent=True) or {}
    positions = payload.get("positions", [])
    if not isinstance(positions, list):
        raise ValueError("Positions must be sent as a list.")
    return positions


@app.get("/")
def index() -> str:
    return render_template("index.html", stock_prices=STOCK_PRICES)


@app.post("/api/calculate")
def calculate() -> Response:
    try:
        result = calculate_portfolio(read_positions())
        return jsonify(result)
    except ValueError as error:
        return jsonify({"error": str(error)}), 400


@app.post("/export/<file_type>")
def export_portfolio(file_type: str) -> Response:
    if file_type not in {"txt", "csv"}:
        return jsonify({"error": "Only TXT and CSV exports are supported."}), 400

    try:
        result = calculate_portfolio(read_positions())
    except ValueError as error:
        return jsonify({"error": str(error)}), 400

    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    filename = f"portfolio-summary-{datetime.now().strftime('%Y%m%d-%H%M%S')}.{file_type}"

    if file_type == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Stock", "Quantity", "Price per Share", "Investment Value"])
        for position in result["positions"]:
            writer.writerow(
                [
                    position["ticker"],
                    position["quantity"],
                    position["price"],
                    position["value"],
                ]
            )
        writer.writerow([])
        writer.writerow(["Total investment", "", "", result["total"]])
        content = output.getvalue()
        mimetype = "text/csv"
    else:
        lines = [
            "FOLIO / DESK — PORTFOLIO SUMMARY",
            f"Created: {timestamp}",
            "",
            "Stock\tQuantity\tPrice/share\tInvestment value",
        ]
        lines.extend(
            f"{position['ticker']}\t{position['quantity']}\t${position['price']:,.2f}\t${position['value']:,.2f}"
            for position in result["positions"]
        )
        lines.extend(["", f"Total investment\t\t\t${result['total']:,.2f}"])
        content = "\n".join(lines)
        mimetype = "text/plain"

    return Response(
        content,
        mimetype=mimetype,
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


if __name__ == "__main__":
    app.run(debug=True)
