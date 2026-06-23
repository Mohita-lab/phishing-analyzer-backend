"""
Database models for storing email analysis history and AIOps analytics.

Fixes vs original:
  1. datetime.utcnow() replaced with datetime.now(timezone.utc) (Python 3.12+ safe)
  2. EmailAnalysis.report_id linked to PhishingReport via ForeignKey
"""
from datetime import datetime, timezone
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


# FIX 1: timezone-aware default factory
def _now():
    return datetime.now(timezone.utc)


class EmailAnalysis(db.Model):
    """Stores each email analysis result for historical tracking."""
    __tablename__ = 'email_analyses'

    id                        = db.Column(db.Integer, primary_key=True)
    timestamp                 = db.Column(db.DateTime(timezone=True), default=_now, nullable=False, index=True)
    sender                    = db.Column(db.String(255), nullable=False, index=True)
    sender_domain             = db.Column(db.String(255), nullable=False, index=True)
    subject                   = db.Column(db.Text, nullable=False)
    risk_score                = db.Column(db.Integer, nullable=False, index=True)
    risk_level                = db.Column(db.String(20), nullable=False)
    is_phishing               = db.Column(db.Boolean, nullable=False, index=True)
    importance                = db.Column(db.String(20))
    attachment_count          = db.Column(db.Integer, default=0)
    suspicious_attachment_count = db.Column(db.Integer, default=0)
    indicators                = db.Column(db.JSON)
    was_reported              = db.Column(db.Boolean, default=False)
    # FIX 2: ForeignKey to PhishingReport for referential integrity
    report_id                 = db.Column(
        db.String(100),
        db.ForeignKey('phishing_reports.report_id', ondelete='SET NULL'),
        unique=True,
        nullable=True,
    )

    def __repr__(self):
        return f'<EmailAnalysis {self.id}: {self.sender} - Score: {self.risk_score}>'


class PhishingReport(db.Model):
    """Stores phishing reports submitted by users."""
    __tablename__ = 'phishing_reports'

    id            = db.Column(db.Integer, primary_key=True)
    report_id     = db.Column(db.String(100), unique=True, nullable=False, index=True)
    timestamp     = db.Column(db.DateTime(timezone=True), default=_now, nullable=False, index=True)
    sender        = db.Column(db.String(255), nullable=False)
    subject       = db.Column(db.Text, nullable=False)
    risk_score    = db.Column(db.Integer, nullable=False)
    risk_level    = db.Column(db.String(20), nullable=False)
    analysis_data = db.Column(db.JSON)
    status        = db.Column(db.String(20), default='pending')  # pending, reviewed, resolved

    def __repr__(self):
        return f'<PhishingReport {self.report_id}: {self.sender}>'


class AnomalyAlert(db.Model):
    __tablename__ = 'anomaly_alerts'

    id               = db.Column(db.Integer, primary_key=True)
    timestamp        = db.Column(db.DateTime(timezone=True), default=_now, nullable=False, index=True)
    alert_type       = db.Column(db.String(50), nullable=False)
    severity         = db.Column(db.String(20), nullable=False)
    description      = db.Column(db.Text, nullable=False)
    alert_metadata   = db.Column(db.JSON)
    acknowledged     = db.Column(db.Boolean, default=False)
    acknowledged_by  = db.Column(db.String(100), nullable=True)
    acknowledged_at  = db.Column(db.DateTime(timezone=True), nullable=True)

    def __repr__(self):
        return f'<AnomalyAlert {self.id}: {self.alert_type} - {self.severity}>'