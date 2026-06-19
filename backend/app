from flask import Flask, request, jsonify, render_template, send_from_directory
from flask_cors import CORS
from analyzer import SimplePhishingAnalyzer
from pathlib import Path
import os
import uuid

# --------------------------------------------------
# Paths
# --------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR.parent / "frontend"

# --------------------------------------------------
# Flask App
# --------------------------------------------------
app = Flask(
    __name__,
    static_folder=str(FRONTEND_DIR),
    template_folder=str(FRONTEND_DIR)
)

CORS(app)

analyzer = SimplePhishingAnalyzer()

# --------------------------------------------------
# Frontend Routes
# --------------------------------------------------
@app.route("/")
def index():
    return render_template("taskpane.html")


@app.route("/taskpane.css")
def taskpane_css():
    return send_from_directory(FRONTEND_DIR, "taskpane.css")


@app.route("/taskpane.js")
def taskpane_js():
    return send_from_directory(FRONTEND_DIR, "taskpane.js")


@app.route("/assets/<path:filename>")
def assets(filename):
    return send_from_directory(FRONTEND_DIR / "assets", filename)


@app.route("/favicon.ico")
def favicon():
    return send_from_directory(
        FRONTEND_DIR / "assets",
        "icon-32.png",
        mimetype="image/png"
    )

# --------------------------------------------------
# Analyze Endpoint
# --------------------------------------------------
@app.route("/analyze", methods=["POST"])
def analyze_email():
    try:
        data = request.get_json()

        if not data:
            return jsonify({
                "success": False,
                "error": "No JSON received"
            }), 400

        email_text = data.get("email_text", "")

        if not email_text.strip():
            return jsonify({
                "success": False,
                "error": "Email text is empty"
            }), 400

        attachments = data.get("attachments", [])

        result = analyzer.analyze(email_text, attachments)

        return jsonify({
            "success": True,
            "analysis": result
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


# --------------------------------------------------
# Report Endpoint
# --------------------------------------------------
@app.route("/report", methods=["POST"])
def report_phishing():
    try:
        data = request.get_json()

        email_text = data.get("email_text", "")
        analysis = data.get("analysis", {})

        report_id = str(uuid.uuid4())

        print("\n=== PHISHING REPORT ===")
        print("Report ID:", report_id)
        print("Sender:", analysis.get("sender"))
        print("Subject:", analysis.get("subject"))
        print("Risk Score:", analysis.get("risk_score"))
        print("=======================\n")

        return jsonify({
            "success": True,
            "report_id": report_id,
            "message": "Email reported successfully"
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


# --------------------------------------------------
# Health Check
# --------------------------------------------------
@app.route("/health")
def health():
    return jsonify({
        "status": "healthy"
    })


# --------------------------------------------------
# Startup
# --------------------------------------------------
if __name__ == "__main__":
    print("\nRoutes Loaded:")
    print(app.url_map)

    port = int(os.environ.get("PORT", 5000))

    app.run(
        host="0.0.0.0",
        port=port,
        debug=True
    )
