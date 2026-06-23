"""
Anomaly detector with persistent history (loaded from DB on startup),
IsolationForest trained on a schedule (not per-request), and alerts
written to the AnomalyAlert table.
"""
from datetime import datetime, timedelta, timezone
from collections import defaultdict

import numpy as np
from sklearn.ensemble import IsolationForest


class AnomalyDetector:
    def __init__(self, min_samples: int = 10):
        # FIX 1: min_samples wired in (was hardcoded as > 10)
        self.min_samples = min_samples

        # In-memory caches — populated from DB on startup via load_history()
        self.sender_history: dict = defaultdict(list)   # sender -> [(datetime, score)]
        self.domain_history: dict = defaultdict(list)   # domain  -> [(datetime, score)]
        self.risk_history:   list = []                  # [(datetime, score)]

        # FIX 2: Pre-trained model, updated by retrain() on a schedule
        self._model: IsolationForest | None = None
        self._model_trained_at: datetime | None = None

    # ------------------------------------------------------------------
    # Startup: load history from DB so restarts don't lose context
    # ------------------------------------------------------------------
    def load_history(self, app):
        """
        FIX 1: Call once at startup (inside app context) to populate
        in-memory history from the EmailAnalysis table.
        """
        with app.app_context():
            from models import EmailAnalysis
            records = EmailAnalysis.query.order_by(EmailAnalysis.timestamp).all()
            for r in records:
                ts = r.timestamp.replace(tzinfo=timezone.utc)
                self.sender_history[r.sender].append((ts, r.risk_score))
                self.domain_history[r.sender_domain].append((ts, r.risk_score))
                self.risk_history.append((ts, r.risk_score))

        # Train the model immediately if enough data exists
        if len(self.risk_history) >= self.min_samples:
            self._train_model()

    # ------------------------------------------------------------------
    # Add a new analysis result to in-memory history
    # ------------------------------------------------------------------
    def add_analysis(self, analysis: dict):
        """Add new analysis to in-memory history."""
        sender = analysis.get('sender', 'Unknown')
        domain = (
            analysis.get('sender_domain')
            or (sender.split('@')[-1] if '@' in sender else 'unknown')
        )
        risk_score = analysis.get('risk_score', 0)
        # FIX 3: Use timezone-aware datetime
        ts = datetime.now(timezone.utc)

        self.sender_history[sender].append((ts, risk_score))
        self.domain_history[domain].append((ts, risk_score))
        self.risk_history.append((ts, risk_score))

    # ------------------------------------------------------------------
    # Scheduled retraining (called by APScheduler, NOT per request)
    # ------------------------------------------------------------------
    def retrain(self):
        """
        FIX 2: Train the IsolationForest once on a schedule.
        APScheduler calls this every N minutes — not on every analyze call.
        """
        if len(self.risk_history) >= self.min_samples:
            self._train_model()

    def _train_model(self):
        scores = np.array([s[1] for s in self.risk_history]).reshape(-1, 1)
        self._model = IsolationForest(contamination=0.1, random_state=42)
        self._model.fit(scores)
        self._model_trained_at = datetime.now(timezone.utc)

    # ------------------------------------------------------------------
    # Detect anomalies — uses pre-trained model, saves alerts to DB
    # ------------------------------------------------------------------
    def detect_anomalies(self, app=None) -> list:
        """
        Detect sender surges, domain spikes, and risk anomalies.
        Pass the Flask app to enable DB persistence of alerts.
        """
        alerts = []
        now = datetime.now(timezone.utc)

        # --- Sender surge ---
        for sender, history in self.sender_history.items():
            recent = [h for h in history if h[0] > now - timedelta(hours=1)]
            if len(recent) >= 5:
                alerts.append({
                    "alert_type":  "sender_surge",
                    "severity":    "HIGH",
                    "description": f"Sudden surge from sender: {sender} ({len(recent)} emails in last hour)",
                    "metadata":    {"sender": sender, "count": len(recent)},
                })

        # --- Domain spike ---
        for domain, history in self.domain_history.items():
            recent = [h for h in history if h[0] > now - timedelta(hours=1)]
            if len(recent) >= 10:
                alerts.append({
                    "alert_type":  "domain_spike",
                    "severity":    "MEDIUM",
                    "description": f"Unusual volume from domain: {domain} ({len(recent)} emails in last hour)",
                    "metadata":    {"domain": domain, "count": len(recent)},
                })

        # --- Risk score anomaly (pre-trained model) ---
        # FIX 2: use pre-trained model, don't retrain here
        if self._model is not None and len(self.risk_history) >= self.min_samples:
            recent_scores = np.array(
                [s[1] for s in self.risk_history[-20:]]
            ).reshape(-1, 1)
            preds = self._model.predict(recent_scores)
            if -1 in preds[-5:]:
                alerts.append({
                    "alert_type":  "risk_spike",
                    "severity":    "MEDIUM",
                    "description": "Unusual spike in risk scores detected by anomaly model.",
                    "metadata":    {"recent_scores": recent_scores.flatten().tolist()},
                })

        # FIX 4: Persist alerts to AnomalyAlert table
        if alerts and app is not None:
            self._save_alerts(app, alerts)

        return alerts

    def _save_alerts(self, app, alerts: list):
        """Write new (non-duplicate) alerts to the AnomalyAlert DB table."""
        with app.app_context():
            from models import db, AnomalyAlert
            cutoff = datetime.now(timezone.utc) - timedelta(hours=1)
            for alert in alerts:
                # Avoid duplicate alerts within the last hour
                existing = AnomalyAlert.query.filter_by(
                    alert_type=alert["alert_type"],
                    acknowledged=False,
                ).filter(AnomalyAlert.timestamp >= cutoff).first()

                if not existing:
                    record = AnomalyAlert(
                        alert_type=alert["alert_type"],
                        severity=alert["severity"],
                        description=alert["description"],
                        alert_metadata=alert.get("metadata"),
                    )
                    db.session.add(record)
            db.session.commit()